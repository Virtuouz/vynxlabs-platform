import { createHash } from "node:crypto";
import { type Static, Type } from "typebox";
import { KIND_PATTERN, PATH_PATTERN } from "./envelope.js";

const VERSION_PATTERN = "^\\d+\\.\\d+\\.\\d+$";

/**
 * A manifest as a bundle carries it: no workspace. Up to format 2 every one is
 * code-managed. From format 3 a bundle also carries the resources managed in
 * the console, marked `ui`, so that one bundle is everything a workspace runs.
 */
export const BundleManifest = Type.Object(
  {
    kind: Type.String({ pattern: KIND_PATTERN, maxLength: 63 }),
    schemaVersion: Type.Integer({ minimum: 1 }),
    path: Type.String({ pattern: PATH_PATTERN, maxLength: 255 }),
    ownership: Type.Union([Type.Literal("code"), Type.Literal("ui")]),
    body: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);
export type BundleManifest = Static<typeof BundleManifest>;

/** The longest path of a file inside an app, and what it may be made of. */
export const ASSET_PATH_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._@~-]*(/[A-Za-z0-9][A-Za-z0-9._@~-]*)*$";

/**
 * One file of an app. The bundle names it by checksum. The bytes are stored
 * apart, once per tenant, so a bundle stays small and moving it to another
 * workspace moves no files.
 */
export const BundleAsset = Type.Object(
  {
    app: Type.String({
      pattern: PATH_PATTERN,
      maxLength: 255,
      description: "The path of the app resource the file belongs to.",
    }),
    path: Type.String({
      pattern: ASSET_PATH_PATTERN,
      maxLength: 500,
      description: "The file's path inside the app, for example assets/index-3f9a.js.",
    }),
    sha256: Type.String({ pattern: "^[0-9a-f]{64}$" }),
    size: Type.Integer({ minimum: 0 }),
    contentType: Type.String({ maxLength: 100 }),
  },
  { additionalProperties: false },
);
export type BundleAsset = Static<typeof BundleAsset>;

/** The most files one bundle may list. */
export const MAX_BUNDLE_ASSETS = 5000;

/** The most source text one bundle carries, in characters. Beyond it, sources are left out. */
export const MAX_BUNDLE_SOURCE = 4 * 1024 * 1024;

/**
 * The repository's own TypeScript, beside the code built from it, so that the
 * console can show a repository script's source and point a failure at its
 * line. Never a dependency's files: those are only named in the map.
 */
export const BundleSources = Type.Object(
  {
    files: Type.Array(
      Type.Object(
        {
          path: Type.String({ maxLength: 500, description: "Relative to the repository root." }),
          content: Type.String(),
        },
        { additionalProperties: false },
      ),
      { maxItems: 2000 },
    ),
    map: Type.String({
      description: "A source map (version 3) from `code` to the files, without their contents.",
    }),
  },
  { additionalProperties: false },
);
export type BundleSources = Static<typeof BundleSources>;

/** The unit of deploy: one workspace's manifests and code, immutable once built. */
export const Bundle = Type.Object(
  {
    formatVersion: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)], {
      description:
        "2 adds `assets`. 3 lets a manifest be console-managed, and then speaks for every " +
        "console-managed resource of the workspace. A bundle with neither is still written as 1.",
    }),
    sdkVersion: Type.String({ pattern: VERSION_PATTERN }),
    core: Type.Object(
      {
        min: Type.String({
          pattern: VERSION_PATTERN,
          description: "Lowest core version it runs on.",
        }),
        below: Type.String({
          pattern: VERSION_PATTERN,
          description: "First core version it does not run on.",
        }),
      },
      { additionalProperties: false },
    ),
    manifests: Type.Array(BundleManifest),
    code: Type.String({ description: "One ES module exporting every code-backed resource." }),
    assets: Type.Optional(
      Type.Array(BundleAsset, {
        maxItems: MAX_BUNDLE_ASSETS,
        description: "The files of the bundle's apps. Format 2 only.",
      }),
    ),
    sources: Type.Optional(BundleSources),
    digest: Type.String({
      pattern: "^[0-9a-f]{64}$",
      description: "SHA-256 over the other fields.",
    }),
  },
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "bundle.schema.json",
    title: "Bundle",
    description: "An immutable package of one workspace's manifests and code.",
    additionalProperties: false,
  },
);
export type Bundle = Static<typeof Bundle>;

/** Key order must not change the digest, so objects are written with sorted keys. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function bundleDigest(bundle: Omit<Bundle, "digest">): string {
  const { formatVersion, sdkVersion, core, manifests, code } = bundle;
  // A format 1 bundle is hashed exactly as it always was, so its digest does not change.
  // Sources count only when they are there, so a bundle without them hashes as before.
  const hashed = {
    ...(formatVersion === 1
      ? { formatVersion, sdkVersion, core, manifests, code }
      : { formatVersion, sdkVersion, core, manifests, code, assets: bundle.assets ?? [] }),
    ...(bundle.sources ? { sources: bundle.sources } : {}),
  };
  return createHash("sha256").update(canonical(hashed)).digest("hex");
}

function parts(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  return [major, minor, patch];
}

export function compareVersions(a: string, b: string): number {
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] as number) - (right[index] as number);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Whether a core at `coreVersion` can run a bundle built for `range`. */
export function coreInRange(coreVersion: string, range: { min: string; below: string }): boolean {
  return (
    compareVersions(coreVersion, range.min) >= 0 && compareVersions(coreVersion, range.below) < 0
  );
}

/**
 * Whether a core can run a bundle, and if not, which of the two is behind.
 *
 * A bundle states the range of cores its SDK knew about. A newer core is
 * outside that range by definition, but it knows something the bundle could
 * not: which older bundles it still runs. So a core at or past the range's
 * end accepts the bundle as long as the bundle was built for a core no older
 * than `oldestSupported`. That is what lets an instance be upgraded without
 * every tenant rebuilding at once.
 */
export function bundleCompatibility(
  coreVersion: string,
  range: { min: string; below: string },
  oldestSupported: string,
): "ok" | "core_too_old" | "bundle_too_old" {
  if (compareVersions(coreVersion, range.min) < 0) return "core_too_old";
  if (compareVersions(coreVersion, range.below) < 0) return "ok";
  return compareVersions(range.min, oldestSupported) >= 0 ? "ok" : "bundle_too_old";
}
