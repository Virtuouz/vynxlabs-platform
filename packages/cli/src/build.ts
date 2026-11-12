import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type Bundle,
  type BundleManifest,
  bundleDigest,
  KindRegistry,
  registerPlatformKinds,
} from "@vynxlabs/manifest";
import { build as esbuild } from "esbuild";

/** A build that failed for a reason the developer can fix. */
export class BuildError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(problems.join("\n"));
    this.name = "BuildError";
    this.problems = problems;
  }
}

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
}

/** Deploy order: what others refer to comes first. */
const KIND_ORDER = ["role", "connection", "variable", "script", "schedule", "trigger", "binding"];

/** Compiles a tenant repository into one bundle: its manifests and its code. */
export async function buildBundle(options: BuildOptions): Promise<Bundle> {
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

  const sdk = await import(
    pathToFileURL(createRequire(join(directory, "package.json")).resolve("@vynxlabs/sdk")).href
  ).catch(() => {
    throw new BuildError(["@vynxlabs/sdk is not installed in this repository."]);
  });

  const manifests = Object.entries(exported)
    .filter((pair): pair is [string, Definition] => isDefinition(pair[1]))
    .map(([name, definition]) => definition.toManifest(name))
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.path < b.path ? -1 : 1),
    );
  if (manifests.length === 0) {
    throw new BuildError([`${entry} exports no resources. Export what you define with the SDK.`]);
  }

  const problems = check(manifests);
  if (problems.length > 0) throw new BuildError(problems);

  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: sdk.SDK_VERSION as string,
    core: sdk.CORE_RANGE as { min: string; below: string },
    manifests,
    code,
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

/** Everything wrong with a set of manifests, each problem naming the resource and field. */
export function check(manifests: BundleManifest[]): string[] {
  const registry = registerPlatformKinds(new KindRegistry());
  const problems: string[] = [];
  const byPath = new Map<string, BundleManifest>();

  for (const manifest of manifests) {
    const existing = byPath.get(manifest.path);
    if (existing) {
      problems.push(
        `${manifest.path}: used by both a ${existing.kind} and a ${manifest.kind}. Paths must be unique.`,
      );
    }
    byPath.set(manifest.path, manifest);
    const result = registry.validateManifest(manifest);
    if (!result.ok) {
      for (const issue of result.issues) {
        problems.push(`${manifest.path} (${manifest.kind}): ${issue.path} ${issue.message}`);
      }
    }
  }

  const expect = (from: BundleManifest, field: string, path: unknown, kind: string) => {
    if (typeof path !== "string") return;
    const target = byPath.get(path);
    if (target?.kind !== kind) {
      problems.push(
        `${from.path} (${from.kind}): ${field} refers to "${path}", which is not a ${kind} in this repository.`,
      );
    }
  };
  for (const manifest of manifests) {
    const body = manifest.body as {
      script?: string;
      uses?: { connections?: string[]; variables?: string[] };
      onFailure?: { script?: string; notify?: string };
    };
    if (manifest.kind === "schedule" || manifest.kind === "trigger") {
      expect(manifest, "script", body.script, "script");
    }
    if (manifest.kind === "script") {
      for (const path of body.uses?.connections ?? [])
        expect(manifest, "connections", path, "connection");
      for (const path of body.uses?.variables ?? [])
        expect(manifest, "variables", path, "variable");
      expect(manifest, "onFailure.script", body.onFailure?.script, "script");
      expect(manifest, "onFailure.notify", body.onFailure?.notify, "connection");
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
    ...bundle.manifests.map((manifest) => `  ${manifest.kind.padEnd(10)} ${manifest.path}`),
  ];
}
