import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Environment } from "@marcbachmann/cel-js";
import { ComposeError, composeBundle, coreNodesFor } from "@volvel/compose";
import { checkWorkspaceDocs, workspaceDocsWarnings } from "@volvel/docs-engine";
import {
  type Bundle,
  type BundleManifest,
  type BundleSources,
  bundleDigest,
  bundleExpressions,
  checkBundleAssets,
  checkBundleManifests,
  docsRoots,
  EXPRESSION_ROOTS,
  formatFor,
  ignoredFolder,
  isResourceFile,
  keyOf,
  MAX_BUNDLE_SOURCE,
  parseRepositoryConfig,
  parseRepositoryFiles,
  platformKinds,
  REPOSITORY_CONFIG,
  RESOURCE_FOLDER,
  type RepositoryConfig,
  type ResourceFile,
  resolveKeyReferences,
} from "@volvel/manifest";
import { build as esbuild } from "esbuild";
import { type AppSource, type BuiltApps, buildApps, contentTypeOf } from "./apps.js";
import { BuildError } from "./errors.js";

export { BuildError };

interface Definition {
  kind: string;
  path: string;
  toManifest(entry: string): BundleManifest;
}

/** Where the SDK notes what the repository's code defines. The SDK names it the same way. */
const DEFINITIONS = Symbol.for("volvel.definitions");

const isDefinition = (value: unknown): value is Definition =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<string, unknown>).__volvelResource === true;

export interface BuildOptions {
  /** The tenant repository. */
  directory: string;
  /** The file that exports every resource. Default `src/index.ts`. */
  entry?: string;
  /** The folder of resources managed in the console. Default `platform`. */
  resources?: string;
  /**
   * Read the manifests and the pictures of docs apps, and build no app from source: for what
   * is drawn locally from the files (`volvel dev`). The bundle's digest and assets are not a deploy's.
   */
  withoutAppSources?: boolean;
}

/**
 * The repository's resource files, wherever it keeps them: every file named for
 * a kind, in any folder that is the repository's own. Paths are from the
 * repository's root.
 */
async function resourceFiles(
  directory: string,
  config: RepositoryConfig,
  /** The folders of pages: a Markdown file under one is a page of documentation. */
  docs: readonly string[],
): Promise<ResourceFile[]> {
  const files: ResourceFile[] = [];
  const walk = async (folder: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(folder, entry.name);
      const name = relative(directory, path).split(sep).join("/");
      if (entry.isDirectory()) {
        if (!ignoredFolder(name, config)) await walk(path);
      } else if (entry.isFile() && isResourceFile(name, WORKSPACE_KINDS, docs)) {
        files.push({ path: name, content: await readFile(path, "utf8") });
      }
    }
  };
  await walk(directory);
  return files;
}

const PICTURE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/**
 * The pictures of each docs app: every picture in a folder of pages whose
 * place puts it under the app's own folder. `handbook/support/chart.png` in a
 * folder of pages is `support/chart.png` of the app that serves `handbook`.
 */
async function docPictures(
  directory: string,
  docs: readonly string[],
  manifests: readonly BundleManifest[],
): Promise<BuiltApps> {
  const found: BuiltApps = { assets: [], files: new Map() };
  const apps = manifests.flatMap((manifest) => {
    const serves = (manifest.body as { docs?: unknown }).docs;
    return manifest.kind === "app" && typeof serves === "string"
      ? [{ path: manifest.path, prefix: `${serves}/` }]
      : [];
  });
  if (apps.length === 0) return found;
  const walk = async (folder: string, under: string): Promise<void> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const name = under === "" ? entry.name : `${under}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(folder, entry.name), name);
      else if (entry.isFile() && PICTURE.test(entry.name)) {
        const app = apps.find((one) => name.startsWith(one.prefix));
        if (!app) continue;
        const content = await readFile(join(folder, entry.name));
        const sha256 = createHash("sha256").update(content).digest("hex");
        const path = name.slice(app.prefix.length);
        if (found.assets.some((asset) => asset.app === app.path && asset.path === path)) continue;
        found.assets.push({
          app: app.path,
          path,
          sha256,
          size: content.length,
          contentType: contentTypeOf(path),
        });
        found.files.set(sha256, content);
      }
    }
  };
  for (const root of docs) await walk(join(directory, root), "");
  return found;
}

/** The kinds a workspace's resources have. A file named for another kind is not one of them. */
const WORKSPACE_KINDS: ReadonlySet<string> = new Set(platformKinds.map((kind) => kind.kind));

/** Deploy order: what others refer to comes first. */
const KIND_ORDER = [
  "role",
  "connector",
  "connection",
  "connection_group",
  "variable",
  "table",
  "query",
  "data_source",
  "event",
  "script",
  "trigger_source",
  "schedule",
  "trigger",
  "flow",
  "theme",
  "widget",
  "interface",
  // After the tables and queries a dashboard asks, and the resources a page is about.
  "dashboard",
  "doc",
  "app",
  "binding",
];

/** A built repository: the bundle, and the bytes of the files its apps are made of. */
export interface Built {
  bundle: Bundle;
  /** What the build did that whoever builds should know, and that stopped nothing. */
  notes: string[];
  /** What the documentation could be better at: shown, and never a reason to stop. */
  warnings: string[];
  /** By checksum. Each is uploaded before the bundle that lists it. */
  files: Map<string, Buffer>;
}

/** Compiles a tenant repository into one bundle: its manifests and its code. */
export async function buildBundle(options: BuildOptions): Promise<Bundle> {
  return (await buildRepository(options)).bundle;
}

/** The apps made of files among a repository's definitions, with where each one's source is. */
function appSourcesOf(definitions: readonly (readonly [string, Definition])[]): AppSource[] {
  return (
    definitions
      .map(([, definition]) => definition)
      .filter((definition) => definition.kind === "app")
      // An app that serves an interface has no files of its own to build.
      .filter((definition) => typeof (definition as { source?: unknown }).source === "string")
      .map((definition) => {
        const title = (definition.toManifest(definition.path).body as { title?: unknown }).title;
        return {
          path: definition.path,
          title: typeof title === "string" && title !== "" ? title : definition.path,
          source: (definition as unknown as { source: string }).source,
        };
      })
  );
}

/** The apps a repository defines, with where each one's source is. */
export async function appSources(options: BuildOptions): Promise<AppSource[]> {
  const { entry, resources } = await placesOf(options);
  const { definitions } = await loadDefinitions({ ...options, entry, resources });
  return appSourcesOf(definitions);
}

/** Compiles a tenant repository: its manifests, its code, and its apps. */
/** The repository's `volvel.yaml`, or a build that fails naming what is wrong in it. A build and a pull read it the same way. */
export async function readRepositoryConfig(directory: string) {
  const said = parseRepositoryConfig(
    await readFile(join(resolve(directory), REPOSITORY_CONFIG), "utf8").catch(() => undefined),
  );
  if (said.problems.length > 0) throw new BuildError(said.problems);
  return said.config;
}

/**
 * The entry file and the console's folder of a repository: a flag of the command, else
 * the `entry` and `resources` of `volvel.yaml`, else `src/index.ts` and `platform`.
 */
export async function placesOf(options: BuildOptions) {
  const config = await readRepositoryConfig(options.directory);
  return {
    config,
    entry: options.entry ?? config.entry ?? "src/index.ts",
    resources: options.resources ?? config.resources ?? RESOURCE_FOLDER,
  };
}

export async function buildRepository(given: BuildOptions): Promise<Built> {
  const directory = resolve(given.directory);
  const { config, entry, resources } = await placesOf(given);
  const options = { ...given, entry, resources };
  const { code, sources, definitions, sdk, sdkEntry } = await loadDefinitions(options);

  const inOrder = (a: BundleManifest, b: BundleManifest) =>
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.path < b.path ? -1 : 1);
  const authored = definitions.map(([name, definition]) => definition.toManifest(name));
  // Resources written as files, by the console or by hand, wherever the repository keeps
  // them. `folder` is where the console writes, and is always read.
  const folder = resources;
  const docs = docsRoots(config, folder);
  const parsed = parseRepositoryFiles(await resourceFiles(directory, config, docs), {
    folder,
    roots: config.roots,
    kinds: WORKSPACE_KINDS,
    docs,
  });
  if (parsed.problems.length > 0) throw new BuildError(parsed.problems);
  // A reference written as text may name a resource by its key: it is built as the path.
  const resolved = resolveKeyReferences([...authored, ...parsed.manifests]);
  const fromCode = resolved.manifests.slice(0, authored.length);
  const fromFiles = { manifests: resolved.manifests.slice(authored.length) };
  // One resource, by its path or by its key, is defined once: in the code or in a file.
  const defined = new Map(
    fromCode.flatMap((manifest) => [
      [manifest.path, manifest],
      [keyOf(manifest), manifest],
    ]),
  );
  const twice = fromFiles.manifests.filter(
    (manifest) => defined.has(manifest.path) || defined.has(keyOf(manifest)),
  );
  if (twice.length > 0) {
    throw new BuildError(
      twice.map(
        (manifest) =>
          `${manifest.path} is defined in ${entry} and again in ${parsed.files.get(keyOf(manifest)) ?? `${folder}/${manifest.path}.${manifest.kind}.yaml`}. Keep one. A resource taken over in the console is removed from the code.`,
      ),
    );
  }
  const manifests = [...fromCode, ...fromFiles.manifests].sort(inOrder);
  if (manifests.length === 0) {
    throw new BuildError([`${entry} exports no resources. Export what you define with the SDK.`]);
  }
  // The core nodes the flows use are added when the bundle is composed. They are checked with
  // the rest here, so that a step that names one is not told it does not exist.
  const present = new Set(manifests.map((manifest) => manifest.path));
  const problems = check([
    ...manifests,
    ...coreNodesFor(manifests).filter((node) => !present.has(node.path)),
  ]);
  if (problems.length > 0) throw new BuildError(problems);

  const apps = appSourcesOf(definitions);

  const built: BuiltApps = given.withoutAppSources
    ? { assets: [], files: new Map() }
    : await buildApps(directory, apps);
  // A docs app's own files are the pictures kept beside its pages.
  const pictures = await docPictures(directory, docs, manifests);
  built.assets.push(...pictures.assets);
  for (const [sha256, content] of pictures.files) built.files.set(sha256, content);

  const common = {
    sdkVersion: sdk.SDK_VERSION as string,
    core: sdk.CORE_RANGE as { min: string; below: string },
    manifests: fromCode.sort(inOrder),
    code,
    ...(sources ? { sources } : {}),
  };
  // A repository without apps is still written as format 1, so that it keeps deploying
  // to an instance that has not been upgraded yet.
  const unsigned = !manifests.some((manifest) => manifest.kind === "app")
    ? { formatVersion: formatFor(1, common.manifests), ...common }
    : { formatVersion: formatFor(2, common.manifests), ...common, assets: built.assets };
  const assetProblems = given.withoutAppSources ? [] : checkBundleAssets(unsigned);
  if (assetProblems.length > 0) throw new BuildError(assetProblems);
  if (fromFiles.manifests.length === 0 && coreNodesFor(unsigned.manifests).length === 0) {
    return {
      bundle: { ...unsigned, digest: bundleDigest(unsigned) },
      files: built.files,
      notes: resolved.rewritten,
      warnings: workspaceDocsWarnings(manifests),
    };
  }
  // Console-managed code is compiled and joined on exactly as the control plane does it.
  try {
    const composed = await composeBundle(unsigned, fromFiles.manifests, { sdkEntry });
    const sorted = { ...composed, manifests: [...composed.manifests].sort(inOrder) };
    const { digest: _stale, ...rest } = sorted;
    return {
      bundle: { ...rest, digest: bundleDigest(rest) },
      files: built.files,
      notes: resolved.rewritten,
      warnings: workspaceDocsWarnings(manifests),
    };
  } catch (error) {
    if (error instanceof ComposeError) {
      // A problem in a resource's code names it by path. Whoever builds needs the file.
      throw new BuildError(
        error.problems.map((problem) => {
          const named = /^(.+)\.([a-z][a-z0-9_]*)\.ts(?=:)/.exec(problem);
          const manifest = named
            ? fromFiles.manifests.find((one) => one.path === named[1] && one.kind === named[2])
            : undefined;
          const file = manifest ? parsed.files.get(keyOf(manifest)) : undefined;
          return named && file
            ? `${file.replace(/\.yaml$/, ".ts")}${problem.slice(named[0].length)}`
            : `${folder}/${problem}`;
        }),
      );
    }
    throw error;
  }
}

/** Bundles the repository's code and loads it once, to read what it defines. */
async function loadDefinitions(options: BuildOptions) {
  const directory = resolve(options.directory);
  const entry = options.entry ?? "src/index.ts";

  let code: string;
  let map = "";
  try {
    const result = await esbuild({
      absWorkingDir: directory,
      entryPoints: [entry],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node24",
      write: false,
      logLevel: "silent",
      // A map back to the repository's TypeScript, so a failure can name its line. The
      // sources travel apart, and only the repository's own.
      outfile: "bundle.mjs",
      sourcemap: "external",
      sourcesContent: false,
      // Lets bundled CommonJS dependencies call require.
      banner: {
        js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);',
      },
    });
    code = (result.outputFiles.find((file) => file.path.endsWith(".mjs"))?.text ?? "").replace(
      /\n\/\/# sourceMappingURL=[^\n]*\n?$/,
      "\n",
    );
    map = result.outputFiles.find((file) => file.path.endsWith(".map"))?.text ?? "";
  } catch (error) {
    const failures = (
      error as { errors?: { text: string; location?: { file: string; line: number } }[] }
    ).errors;
    throw new BuildError(
      failures?.map((failure) =>
        failure.location
          ? `${failure.location.file}:${failure.location.line}: ${failure.text}`
          : failure.text,
      ) ?? [(error as Error).message],
    );
  }

  // Load the built code once, here, to read the definitions. The control plane never runs it.
  const scratch = join(directory, ".platform");
  await mkdir(scratch, { recursive: true });
  const file = join(scratch, `build-${process.pid}-${Date.now()}.mjs`);
  await writeFile(file, code);
  let exported: Record<string, unknown>;
  // The SDK inside the built code notes each definition here as it is made.
  const scope = globalThis as Record<symbol, unknown>;
  const defined: { kind: string; path: string }[] = [];
  scope[DEFINITIONS] = defined;
  try {
    exported = await import(pathToFileURL(file).href);
  } catch (error) {
    throw new BuildError([`${entry} could not be loaded: ${(error as Error).message}`]);
  } finally {
    delete scope[DEFINITIONS];
    await rm(file, { force: true });
  }

  let sdkEntry: string;
  try {
    sdkEntry = createRequire(join(directory, "package.json")).resolve("@volvel/sdk");
  } catch {
    throw new BuildError(["@volvel/sdk is not installed in this repository."]);
  }
  const sdk = await import(pathToFileURL(sdkEntry).href).catch(() => {
    throw new BuildError(["@volvel/sdk is not installed in this repository."]);
  });

  const definitions = Object.entries(exported).filter((pair): pair is [string, Definition] =>
    isDefinition(pair[1]),
  );
  const unexported = notExported(
    defined,
    definitions.map(([, definition]) => definition),
  );
  if (unexported.length > 0) {
    throw new BuildError(
      unexported.map(
        ({ kind, path }) =>
          `${path} (${kind}) is defined, but ${entry} does not export it, so it would not be deployed. Export it from ${entry}. Two files that export the same name through "export *" cancel each other out: export each by name.`,
      ),
    );
  }
  return {
    code,
    sources: await repositorySources(directory, map),
    definitions,
    sdk: sdk as { SDK_VERSION: string; CORE_RANGE: object },
    sdkEntry,
  };
}

/**
 * What the code defined and the entry file did not export. Counted, since a
 * definition is a new object each time: two made at one path with one exported
 * leaves one missing. An SDK from before definitions were noted reports none.
 */
function notExported(
  defined: { kind: string; path: string }[],
  exported: { kind: string; path: string }[],
): { kind: string; path: string }[] {
  const left = new Map<string, number>();
  const name = (item: { kind: string; path: string }) => `${item.kind} ${item.path}`;
  for (const item of exported) left.set(name(item), (left.get(name(item)) ?? 0) + 1);
  const missing = new Map<string, { kind: string; path: string }>();
  for (const item of defined) {
    const count = left.get(name(item)) ?? 0;
    if (count > 0) left.set(name(item), count - 1);
    else missing.set(name(item), item);
  }
  return [...missing.values()];
}

/**
 * The repository's own files that went into the code, with the map back to them.
 * A dependency's files are named in the map and never carried. When the
 * repository's own source is too large, none is carried: the bundle still runs,
 * and the console says it has no source to show.
 */
async function repositorySources(
  directory: string,
  map: string,
): Promise<BundleSources | undefined> {
  if (!map) return undefined;
  const parsed = JSON.parse(map) as { sources?: string[] };
  const files: { path: string; content: string }[] = [];
  let total = 0;
  for (const source of parsed.sources ?? []) {
    if (source.includes("node_modules") || source.startsWith("..") || isAbsolute(source)) continue;
    const content = await readFile(join(directory, source), "utf8").catch(() => undefined);
    if (content === undefined) continue;
    total += content.length;
    if (total > MAX_BUNDLE_SOURCE) return undefined;
    files.push({ path: source.split(sep).join("/"), content });
  }
  return files.length > 0 ? { files, map } : undefined;
}

/** Everything wrong with a set of manifests, each problem naming the resource and field. */
export function check(manifests: BundleManifest[]): string[] {
  const problems = [
    ...checkBundleManifests(manifests),
    // The instance checks pages against the product's own terms too, which a build does not know.
    ...checkWorkspaceDocs(manifests),
  ];
  for (const { where, expression } of bundleExpressions(manifests)) {
    try {
      // The names an expression reads are checked too: `input` is never one.
      const checked = strict.check(expression);
      if (!checked.valid) throw checked.error;
      cel.parse(expression);
    } catch (error) {
      const reason = ((error as Error).message.split("\n")[0] ?? "").trim();
      problems.push(`${where} is not a valid expression: ${reason}`);
    }
  }
  return problems;
}

/** A few lines saying what a bundle contains. */
export function describeBundle(bundle: Bundle): string[] {
  const counts = new Map<string, number>();
  for (const manifest of bundle.manifests)
    counts.set(manifest.kind, (counts.get(manifest.kind) ?? 0) + 1);
  return [
    `Bundle ${bundle.digest.slice(0, 12)}, ${(bundle.code.length / 1024).toFixed(0)} KB of code, SDK ${bundle.sdkVersion}`,
    ...bundle.manifests.map((manifest) => {
      const files = (bundle.assets ?? []).filter((asset) => asset.app === manifest.path);
      const size = files.reduce((sum, file) => sum + file.size, 0);
      const detail =
        manifest.kind === "app" ? `  (${files.length} files, ${(size / 1024).toFixed(0)} KB)` : "";
      return `  ${manifest.kind.padEnd(10)} ${manifest.path}${detail}`;
    }),
  ];
}

const strict = new Environment({
  unlistedVariablesAreDyn: false,
  homogeneousAggregateLiterals: false,
}).registerFunction("string(google.protobuf.Timestamp): string", (time: Date) =>
  time.toISOString(),
);
for (const name of EXPRESSION_ROOTS) strict.registerVariable(name, "dyn");

const cel = new Environment({
  unlistedVariablesAreDyn: true,
  homogeneousAggregateLiterals: false,
  limits: {
    maxAstNodes: 2000,
    maxDepth: 64,
    maxListElements: 200,
    maxMapEntries: 200,
    maxCallArguments: 16,
  },
});
