import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Environment } from "@marcbachmann/cel-js";
import { ComposeError, composeBundle, coreNodesFor } from "@vynxlabs/compose";
import {
  type Bundle,
  type BundleManifest,
  bundleDigest,
  bundleExpressions,
  checkBundleAssets,
  checkBundleManifests,
  parseResourceFiles,
  RESOURCE_FOLDER,
  type ResourceFile,
} from "@vynxlabs/manifest";
import { build as esbuild } from "esbuild";
import { type AppSource, buildApps } from "./apps.js";
import { BuildError } from "./errors.js";

export { BuildError };

interface Definition {
  kind: string;
  path: string;
  toManifest(entry: string): BundleManifest;
}

const isDefinition = (value: unknown): value is Definition =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<string, unknown>).__vynxlabsResource === true;

export interface BuildOptions {
  /** The tenant repository. */
  directory: string;
  /** The file that exports every resource. Default `src/index.ts`. */
  entry?: string;
  /** The folder of resources managed in the console. Default `platform`. */
  resources?: string;
}

/** Every YAML and TypeScript file under the folder of console-managed resources. None if there is no folder. */
async function resourceFiles(folder: string): Promise<ResourceFile[]> {
  const files: ResourceFile[] = [];
  const walk = async (directory: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(yaml|ts)$/.test(entry.name)) {
        files.push({
          path: relative(folder, path).split(sep).join("/"),
          content: await readFile(path, "utf8"),
        });
      }
    }
  };
  await walk(folder);
  return files;
}

/** Deploy order: what others refer to comes first. */
const KIND_ORDER = [
  "role",
  "connector",
  "connection",
  "connection_group",
  "variable",
  "table",
  "data_source",
  "event",
  "script",
  "trigger_source",
  "schedule",
  "trigger",
  "flow",
  "theme",
  "interface",
  "app",
  "binding",
];

/** A built repository: the bundle, and the bytes of the files its apps are made of. */
export interface Built {
  bundle: Bundle;
  /** By checksum. Each is uploaded before the bundle that lists it. */
  files: Map<string, Buffer>;
}

/** Compiles a tenant repository into one bundle: its manifests and its code. */
export async function buildBundle(options: BuildOptions): Promise<Bundle> {
  return (await buildRepository(options)).bundle;
}

/** The apps a repository defines, with where each one's source is. */
export async function appSources(options: BuildOptions): Promise<AppSource[]> {
  const { definitions } = await loadDefinitions(options);
  return (
    definitions
      .map(([, definition]) => definition)
      .filter((definition) => definition.kind === "app")
      // An app that serves an interface has no files of its own to build.
      .filter((definition) => typeof (definition as { source?: unknown }).source === "string")
      .map((definition) => ({
        path: definition.path,
        source: (definition as unknown as { source: string }).source,
      }))
  );
}

/** Compiles a tenant repository: its manifests, its code, and its apps. */
export async function buildRepository(options: BuildOptions): Promise<Built> {
  const directory = resolve(options.directory);
  const entry = options.entry ?? "src/index.ts";
  const { code, definitions, sdk, sdkEntry } = await loadDefinitions(options);

  const inOrder = (a: BundleManifest, b: BundleManifest) =>
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.path < b.path ? -1 : 1);
  const fromCode = definitions.map(([name, definition]) => definition.toManifest(name));
  // Resources managed in the console are files in a reserved folder, not code.
  const folder = options.resources ?? RESOURCE_FOLDER;
  const fromFiles = parseResourceFiles(await resourceFiles(join(directory, folder)));
  if (fromFiles.problems.length > 0) {
    throw new BuildError(fromFiles.problems.map((problem) => `${folder}/${problem}`));
  }
  const defined = new Map(fromCode.map((manifest) => [manifest.path, manifest]));
  const twice = fromFiles.manifests.filter((manifest) => defined.has(manifest.path));
  if (twice.length > 0) {
    throw new BuildError(
      twice.map(
        (manifest) =>
          `${manifest.path} is defined in ${entry} and again in ${folder}/${manifest.path}.${manifest.kind}.yaml. Keep one. A resource taken over in the console is removed from the code.`,
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

  const apps = definitions
    .map(([, definition]) => definition)
    .filter((definition) => definition.kind === "app")
    // An app that serves an interface has no files of its own to build.
    .filter((definition) => typeof (definition as { source?: unknown }).source === "string")
    .map((definition) => ({
      path: definition.path,
      source: (definition as unknown as { source: string }).source,
    }));
  const built = await buildApps(directory, apps);

  const common = {
    sdkVersion: sdk.SDK_VERSION as string,
    core: sdk.CORE_RANGE as { min: string; below: string },
    manifests: fromCode.sort(inOrder),
    code,
  };
  // A repository without apps is still written as format 1, so that it keeps deploying
  // to an instance that has not been upgraded yet.
  const unsigned = !manifests.some((manifest) => manifest.kind === "app")
    ? { formatVersion: 1 as const, ...common }
    : { formatVersion: 2 as const, ...common, assets: built.assets };
  const assetProblems = checkBundleAssets(unsigned);
  if (assetProblems.length > 0) throw new BuildError(assetProblems);
  if (fromFiles.manifests.length === 0 && coreNodesFor(unsigned.manifests).length === 0) {
    return { bundle: { ...unsigned, digest: bundleDigest(unsigned) }, files: built.files };
  }
  // Console-managed code is compiled and joined on exactly as the control plane does it.
  try {
    const composed = await composeBundle(unsigned, fromFiles.manifests, { sdkEntry });
    const sorted = { ...composed, manifests: [...composed.manifests].sort(inOrder) };
    const { digest: _stale, ...rest } = sorted;
    return { bundle: { ...rest, digest: bundleDigest(rest) }, files: built.files };
  } catch (error) {
    if (error instanceof ComposeError) {
      throw new BuildError(error.problems.map((problem) => `${folder}/${problem}`));
    }
    throw error;
  }
}

/** Bundles the repository's code and loads it once, to read what it defines. */
async function loadDefinitions(options: BuildOptions) {
  const directory = resolve(options.directory);
  const entry = options.entry ?? "src/index.ts";

  let code: string;
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
      // Lets bundled CommonJS dependencies call require.
      banner: {
        js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);',
      },
    });
    code = result.outputFiles[0]?.text ?? "";
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
  try {
    exported = await import(pathToFileURL(file).href);
  } catch (error) {
    throw new BuildError([`${entry} could not be loaded: ${(error as Error).message}`]);
  } finally {
    await rm(file, { force: true });
  }

  let sdkEntry: string;
  try {
    sdkEntry = createRequire(join(directory, "package.json")).resolve("@vynxlabs/sdk");
  } catch {
    throw new BuildError(["@vynxlabs/sdk is not installed in this repository."]);
  }
  const sdk = await import(pathToFileURL(sdkEntry).href).catch(() => {
    throw new BuildError(["@vynxlabs/sdk is not installed in this repository."]);
  });

  const definitions = Object.entries(exported).filter((pair): pair is [string, Definition] =>
    isDefinition(pair[1]),
  );
  return {
    code,
    definitions,
    sdk: sdk as { SDK_VERSION: string; CORE_RANGE: object },
    sdkEntry,
  };
}

/** Everything wrong with a set of manifests, each problem naming the resource and field. */
export function check(manifests: BundleManifest[]): string[] {
  const problems = checkBundleManifests(manifests);
  for (const { where, expression } of bundleExpressions(manifests)) {
    try {
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
