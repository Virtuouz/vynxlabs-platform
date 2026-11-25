import { createHash } from "node:crypto";
import type { Bundle } from "./bundle.js";

/**
 * A bundle's digest, in a file that loads nothing else. A worker needs only this of the
 * package, and loading the whole of it, with every schema, cost each worker 70 MB (STR-02 of
 * phase 35): `@volvel/manifest/digest` is what a worker loads.
 */

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
    ...(bundle.consoleSources ? { consoleSources: bundle.consoleSources } : {}),
  };
  return createHash("sha256").update(canonical(hashed)).digest("hex");
}
