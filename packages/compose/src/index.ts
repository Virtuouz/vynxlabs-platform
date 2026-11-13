import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Bundle,
  type BundleManifest,
  bundleDigest,
  CORE_PREFIX,
  entryFor,
  type FlowBody,
  flowReferences,
  MAX_SOURCE_LENGTH,
} from "@vynxlabs/manifest";
import { CORE_NODES, coreManifest } from "@vynxlabs/nodes";
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
 * disk on the source's behalf: console source may import `@vynxlabs/sdk` and
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

/** The kinds whose console-managed manifests carry source. */
export const SOURCE_KINDS: readonly string[] = Object.keys(EXPORT_SHAPE);

/** Something wrong with console-written source. Each problem names its file and line. */
export class ComposeError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("\n"));
    this.name = "ComposeError";
  }
}

export interface ComposeOptions {
  /**
   * The file `@vynxlabs/sdk` resolves to. The CLI passes the one installed in
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
    const entry = entryFor(manifest.kind, manifest.path);
    if (manifest.body.entry !== entry) {
      problems.push(`${file}: its entry must be ${entry}.`);
      continue;
    }
    sources.push({ kind: manifest.kind, path: manifest.path, file, entry, code: source.code });
  }
  if (problems.length > 0) throw new ComposeError(problems);
  return sources;
}

/** Answers every import the compiler meets. Nothing reaches the disk unless this allows it. */
function lockdown(sources: Source[], sdkEntry: string): Plugin {
  const byFile = new Map(sources.map((source) => [source.file, source]));
  const entry = sources
    .map(
      (source, index) =>
        `import s${index} from ${JSON.stringify(`vx-source:${source.file}`)};\n` +
        `exports[${JSON.stringify(source.entry)}] = s${index};`,
    )
    .join("\n");
  // Files the SDK itself is made of, found by following its own imports.
  const trusted = new Set<string>();
  return {
    name: "vx-lockdown",
    setup(context) {
      context.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData?.inner) return undefined;
        if (args.kind === "entry-point") return { path: "entry", namespace: "vx" };
        if (args.namespace === "vx" && args.importer === "entry") {
          return { path: args.path.slice("vx-source:".length), namespace: "vx" };
        }
        if (args.path.startsWith("node:")) return { path: args.path, external: true };
        if (args.namespace === "vx" && args.path === "@vynxlabs/sdk") {
          trusted.add(sdkEntry);
          return { path: sdkEntry };
        }
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
              text: `Code written in the console may import only @vynxlabs/sdk and node: modules, not "${args.path}". Put shared code and packages in the repository.`,
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
  const base = baseCode.split(CONSOLE_MARKER)[0] as string;
  const sources = sourcesOf(manifests);
  if (sources.length === 0) return base;

  // An empty directory of its own: the compiler looks for nothing beside the sources.
  const scratch = await mkdtemp(join(tmpdir(), "vx-compose-"));
  let compiled: string;
  try {
    const result = await build({
      absWorkingDir: scratch,
      entryPoints: ["entry"],
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "node24",
      write: false,
      logLevel: "silent",
      // No tsconfig.json is looked for or honoured.
      tsconfigRaw: {},
      plugins: [lockdown(sources, options.sdkEntry)],
    });
    compiled = result.outputFiles[0]?.text ?? "";
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
          `export const ${source.entry} = { ${EXPORT_SHAPE[source.kind]}: __vx_console[${JSON.stringify(source.entry)}] };\n`,
      )
      .join("");
  const code = base + CONSOLE_MARKER + section;
  // The whole module must still parse: an export of the repository's own could clash with one of these.
  try {
    await transform(code, { loader: "js", format: "esm", logLevel: "silent" });
  } catch (error) {
    const failures = (error as EsbuildFailure).errors;
    throw new ComposeError([
      `The bundle's code and the console-managed code do not fit together: ${failures?.[0]?.text ?? (error as Error).message}`,
    ]);
  }
  return code;
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
  const taken = new Set(consoleManaged.map((manifest) => manifest.path));
  const manifests = [
    ...base.manifests.filter(
      (manifest) => manifest.ownership === "code" && !taken.has(manifest.path),
    ),
    ...consoleManaged,
  ];
  const code = await composeCode(base.code, consoleManaged, options);
  const unsigned: UnsignedBundle =
    consoleManaged.length === 0
      ? { ...base, manifests, code }
      : { ...base, formatVersion: 3, manifests, code, assets: base.assets ?? [] };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
