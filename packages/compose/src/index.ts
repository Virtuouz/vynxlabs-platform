import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Bundle,
  type BundleManifest,
  bundleDigest,
  CORE_PREFIX,
  type ConsoleSources,
  entryFor,
  type FlowBody,
  flowReferences,
  formatFor,
  keyOf,
  MAX_SOURCE_LENGTH,
  resolveKeyReferences,
} from "@volvel/manifest";
import { CORE_NODES, coreManifest } from "@volvel/nodes";
import { build, type Plugin, transform } from "esbuild";

/**
 * Joins code written in the console to a bundle.
 *
 * A bundle's code is one ES module that exports every code-backed resource.
 * Console-written source is compiled apart from it and appended after a
 * marker line, as one more export per resource. A worker loads the result as
 * it loads any bundle, so a worker that predates this needs no change. On the
 * next compose everything after the marker is dropped and built again, and the
 * repository's own code is never compiled a second time.
 *
 * The compiler never executes what it compiles, and it reads nothing from
 * disk on the source's behalf: console source may import `@volvel/sdk` and
 * `node:` modules, and nothing else.
 */

/** Everything after this line of a bundle's code is console-managed and rebuilt on each compose. */
export const CONSOLE_MARKER = "\n// ---- vx:console-managed ----\n";

/** What a kind's default export becomes in the bundle: the name the worker calls it by. */
const EXPORT_SHAPE: Record<string, string> = {
  script: "execute",
  connector: "create",
  trigger_source: "execute",
};

/** Where a connector's own `test` is kept beside its `create` while the section is built. */
const testKey = (entry: string) => `${entry}:test`;

/** The kinds whose console-managed manifests carry source. */
export const SOURCE_KINDS: readonly string[] = Object.keys(EXPORT_SHAPE);

/** Something wrong with console-written source. Each problem names its file and line. */
/** The map esbuild wrote, with its sources named as the console names them: `<path>.<kind>.ts`. */
function consoleMap(text: string): string {
  const parsed = JSON.parse(text) as { sources?: string[] };
  parsed.sources = (parsed.sources ?? []).map((source) => source.replace(/^(\.\.\/)*vx:/, ""));
  return JSON.stringify(parsed);
}

export class ComposeError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
    this.name = "ComposeError";
  }
}

export interface ComposeOptions {
  /**
   * The file `@volvel/sdk` resolves to. The CLI passes the one installed in
   * the repository, the control plane its own.
   */
  sdkEntry: string;
}

interface Source {
  kind: string;
  path: string;
  /** The name errors use, and the file the source has in a repository. */
  file: string;
  entry: string;
  code: string;
}

function sourcesOf(manifests: readonly BundleManifest[]): Source[] {
  const problems: string[] = [];
  const sources: Source[] = [];
  for (const manifest of manifests) {
    if (manifest.ownership !== "ui" || !(manifest.kind in EXPORT_SHAPE)) continue;
    const file = `${manifest.path}.${manifest.kind}.ts`;
    const source = manifest.body.source as { language?: string; code?: unknown } | undefined;
    if (!source || typeof source.code !== "string") {
      problems.push(`${file}: has no source.`);
      continue;
    }
    if (source.code.length > MAX_SOURCE_LENGTH) {
      problems.push(`${file}: is longer than ${MAX_SOURCE_LENGTH} characters.`);
      continue;
    }
    // By the key, as the manifest's own `entry` is: a rename leaves the name as it was.
    const entry = entryFor(manifest.kind, keyOf(manifest));
    if (manifest.body.entry !== entry) {
      problems.push(`${file}: its entry must be ${entry}.`);
      continue;
    }
    sources.push({ kind: manifest.kind, path: manifest.path, file, entry, code: source.code });
  }
  if (problems.length > 0) throw new ComposeError(problems);
  return sources;
}

/**
 * The entry's `__vx_describe(entry)`: a script's `input` and `output` exports as
 * JSON Schema, made with the zod the bundle was built with. The control plane
 * never loads a bundle; a worker calls this, in a process of its own, for a
 * `describe` task (decision 0001).
 */
function describer(sources: Source[]): string {
  const declared = sources
    .map((source, index) =>
      source.kind === "script" ? `${JSON.stringify(source.entry)}: m${index}` : undefined,
    )
    .filter(Boolean)
    .join(", ");
  return `import { z as __vx_z } from "@volvel/sdk";
const __vx_declared = { ${declared} };
exports.__vx_describe = (entry) => {
  const declared = Object.hasOwn(__vx_declared, entry) ? __vx_declared[entry] : undefined;
  const schema = (value, io) =>
    value && typeof value === "object" && typeof value.safeParse === "function"
      ? __vx_z.toJSONSchema(value, { io, unrepresentable: "any" })
      : undefined;
  const found = {};
  const input = schema(declared?.input, "input");
  const output = schema(declared?.output, "output");
  if (input) found.input = input;
  if (output) found.output = output;
  return found;
};`;
}

/** Answers every import the compiler meets. Nothing reaches the disk unless this allows it. */
function lockdown(sources: Source[], sdkEntry: string): Plugin {
  const byFile = new Map(sources.map((source) => [source.file, source]));
  const scripts = sources.filter((source) => source.kind === "script");
  const entry =
    sources
      .map(
        (source, index) =>
          `import s${index}, * as m${index} from ${JSON.stringify(`vx-source:${source.file}`)};\n` +
          `exports[${JSON.stringify(source.entry)}] = s${index};` +
          // A connector may also export `test`: what its connections' Test button runs.
          (source.kind === "connector"
            ? `\nexports[${JSON.stringify(testKey(source.entry))}] = typeof m${index}.test === "function" ? m${index}.test : undefined;`
            : ""),
      )
      .join("\n") + (scripts.length > 0 ? `\n${describer(sources)}` : "");
  // Files the SDK itself is made of, found by following its own imports.
  const trusted = new Set<string>();
  return {
    name: "vx-lockdown",
    setup(context) {
      context.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData?.inner) return undefined;
        if (args.kind === "entry-point") return { path: "entry", namespace: "vx" };
        if (args.namespace === "vx" && args.path === "@volvel/sdk") {
          trusted.add(sdkEntry);
          return { path: sdkEntry };
        }
        if (args.namespace === "vx" && args.importer === "entry") {
          return { path: args.path.slice("vx-source:".length), namespace: "vx" };
        }
        if (args.path.startsWith("node:")) return { path: args.path, external: true };
        if (args.namespace === "file" && trusted.has(args.importer)) {
          const found = await context.resolve(args.path, {
            resolveDir: args.resolveDir,
            kind: args.kind,
            importer: args.importer,
            pluginData: { inner: true },
          });
          if (found.errors.length === 0 && !found.external) trusted.add(found.path);
          return found;
        }
        return {
          errors: [
            {
              text: `Code written in the console may import only @volvel/sdk and node: modules, not "${args.path}". Put shared code and packages in the repository.`,
            },
          ],
        };
      });
      context.onLoad({ filter: /.*/, namespace: "vx" }, (args) =>
        args.path === "entry"
          ? { contents: entry, loader: "js" }
          : { contents: byFile.get(args.path)?.code ?? "", loader: "ts" },
      );
    },
  };
}

interface EsbuildFailure {
  errors?: { text: string; location?: { file: string; line: number } | null }[];
}

/**
 * The code of a bundle with the console-managed section for `manifests`
 * appended, replacing any section it already had. With no console source the
 * result is the repository's code alone.
 */
export async function composeCode(
  baseCode: string,
  manifests: readonly BundleManifest[],
  options: ComposeOptions,
): Promise<string> {
  return (await composeWithSources(baseCode, manifests, options)).code;
}

/** The section's lines before the compiled code: the import, the wrapper, `exports`. */
const SECTION_HEAD_LINES = 3;

/**
 * As `composeCode`, with the console's sources and a map from the compiled code
 * back to them, so a failure in console-written code can be pointed at its line.
 */
export async function composeWithSources(
  baseCode: string,
  manifests: readonly BundleManifest[],
  options: ComposeOptions,
): Promise<{ code: string; consoleSources?: ConsoleSources }> {
  const base = baseCode.split(CONSOLE_MARKER)[0] as string;
  const sources = sourcesOf(manifests);
  if (sources.length === 0) return { code: base };

  // An empty directory of its own: the compiler looks for nothing beside the sources.
  const scratch = await mkdtemp(join(tmpdir(), "vx-compose-"));
  let compiled: string;
  let map = "";
  try {
    const result = await build({
      absWorkingDir: scratch,
      entryPoints: ["entry"],
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "node24",
      write: false,
      outfile: "out.js",
      sourcemap: "external",
      sourcesContent: false,
      logLevel: "silent",
      // No tsconfig.json is looked for or honored.
      tsconfigRaw: {},
      plugins: [lockdown(sources, options.sdkEntry)],
    });
    compiled = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text ?? "";
    map = result.outputFiles.find((file) => file.path.endsWith(".map"))?.text ?? "";
    // The compiled code names its map; nothing reads it there, and it would point nowhere.
    compiled = compiled.replace(/\n\/\/# sourceMappingURL=.*\n?$/, "\n");
  } catch (error) {
    const failures = (error as EsbuildFailure).errors;
    throw new ComposeError(
      failures?.map((failure) => {
        const file = failure.location?.file.replace(/^vx:/, "");
        // A source with no default export fails where the entry imports it.
        if (file === "entry") {
          const named = /"vx:([^"]+)"/.exec(failure.text)?.[1];
          return `${named ?? "A source"}: needs a default export. That is what runs.`;
        }
        return file ? `${file}:${failure.location?.line}: ${failure.text}` : failure.text;
      }) ?? [(error as Error).message],
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  const section =
    'import { createRequire as __vx_createRequire } from "node:module";\n' +
    "const __vx_console = ((require, module) => {\n" +
    "const exports = module.exports;\n" +
    `${compiled}\n` +
    "return module.exports;\n" +
    "})(__vx_createRequire(import.meta.url), { exports: {} });\n" +
    sources
      .map(
        (source) =>
          `export const ${source.entry} = { ${EXPORT_SHAPE[source.kind]}: __vx_console[${JSON.stringify(source.entry)}]${
            source.kind === "connector"
              ? `, ...(__vx_console[${JSON.stringify(testKey(source.entry))}] ? { test: __vx_console[${JSON.stringify(testKey(source.entry))}] } : {})`
              : ""
          } };\n`,
      )
      .join("") +
    (sources.some((source) => source.kind === "script")
      ? "export const __vx_describe = __vx_console.__vx_describe;\n"
      : "");
  const code = base + CONSOLE_MARKER + section;
  const line = (base + CONSOLE_MARKER).split("\n").length - 1 + SECTION_HEAD_LINES;
  // The whole module must still parse: an export of the repository's own could clash with one of these.
  try {
    await transform(code, { loader: "js", format: "esm", logLevel: "silent" });
  } catch (error) {
    const failures = (error as EsbuildFailure).errors;
    throw new ComposeError([
      `The bundle's code and the console-managed code do not fit together: ${failures?.[0]?.text ?? (error as Error).message}`,
    ]);
  }
  return {
    code,
    ...(map
      ? {
          consoleSources: {
            files: sources.map((source) => ({ path: source.file, content: source.code })),
            line,
            map: consoleMap(map),
          },
        }
      : {}),
  };
}

/**
 * The core nodes the flows among `manifests` use, as scripts to compose in.
 * A bundle carries the nodes its flows use and no others, in the version the
 * platform had when it was composed, so a run keeps the node it was deployed with.
 */
export function coreNodesFor(manifests: readonly BundleManifest[]): BundleManifest[] {
  const used = new Set<string>();
  for (const manifest of manifests) {
    if (manifest.kind !== "flow") continue;
    const body = manifest.body as unknown as FlowBody;
    if (typeof body?.nodes !== "object" || body.nodes === null) continue;
    for (const reference of flowReferences(body)) {
      if (reference.kind === "script" && reference.target.startsWith(CORE_PREFIX)) {
        used.add(reference.target);
      }
    }
  }
  return CORE_NODES.filter((node) => used.has(node.path)).map(coreManifest);
}

/** A bundle before its digest is known. */
export type UnsignedBundle = Omit<Bundle, "digest">;

/**
 * A bundle made of a base bundle's repository-managed resources and the given
 * console-managed ones. A console-managed resource takes the place of a
 * repository-managed one at the same path. The result is format 3 when it
 * holds anything console-managed, and otherwise keeps the base's format.
 *
 * The core nodes the result's flows use are composed in with them, and any
 * the base carried are dropped and added again as the platform now has them.
 */
export async function composeBundle(
  base: UnsignedBundle,
  given: readonly BundleManifest[],
  options: ComposeOptions,
): Promise<Bundle> {
  const own = given.filter((manifest) => !manifest.path.startsWith(CORE_PREFIX));
  const consoleManaged = [
    ...own,
    ...coreNodesFor([
      ...base.manifests.filter((manifest) => manifest.ownership === "code"),
      ...own,
    ]),
  ];
  const wrong = consoleManaged.filter((manifest) => manifest.ownership !== "ui");
  if (wrong.length > 0) {
    throw new ComposeError(
      wrong.map((manifest) => `${manifest.path} (${manifest.kind}) is not console-managed.`),
    );
  }
  // A resource is the console's by its key, wherever it is now, or by its path.
  const taken = new Set(consoleManaged.flatMap((manifest) => [manifest.path, keyOf(manifest)]));
  // What refers to a renamed resource by the path it had, which is its key, is built as the
  // path it has now: a flow drawn before a script moved still finds it.
  const { manifests } = resolveKeyReferences([
    ...base.manifests.filter(
      (manifest) =>
        manifest.ownership === "code" && !taken.has(manifest.path) && !taken.has(keyOf(manifest)),
    ),
    ...consoleManaged,
  ]);
  const { code, consoleSources } = await composeWithSources(base.code, consoleManaged, options);
  // A base composed before carries the console's old sources; these replace them.
  const { consoleSources: _old, ...rest } = base;
  const unsigned: UnsignedBundle =
    consoleManaged.length === 0
      ? { ...rest, formatVersion: formatFor(rest.formatVersion, manifests), manifests, code }
      : {
          ...rest,
          formatVersion: formatFor(3, manifests),
          manifests,
          code,
          assets: base.assets ?? [],
          ...(consoleSources ? { consoleSources } : {}),
        };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
