import { createHash } from "node:crypto";
import { type Static, Type } from "typebox";
import { KIND_PATTERN, PATH_PATTERN } from "./envelope.js";

const VERSION_PATTERN = "^\\d+\\.\\d+\\.\\d+$";

/** A manifest as a bundle carries it: no workspace, always code-managed. */
export const BundleManifest = Type.Object(
  {
    kind: Type.String({ pattern: KIND_PATTERN, maxLength: 63 }),
    schemaVersion: Type.Integer({ minimum: 1 }),
    path: Type.String({ pattern: PATH_PATTERN, maxLength: 255 }),
    ownership: Type.Literal("code"),
    body: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);
export type BundleManifest = Static<typeof BundleManifest>;

/** The unit of deploy: one workspace's manifests and code, immutable once built. */
export const Bundle = Type.Object(
  {
    formatVersion: Type.Literal(1),
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
  return createHash("sha256")
    .update(canonical({ formatVersion, sdkVersion, core, manifests, code }))
    .digest("hex");
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
