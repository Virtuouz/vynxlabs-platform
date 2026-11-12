import { createHash } from "node:crypto";
import type { Bundle, BundleAsset } from "@vynxlabs/manifest";
import type { Db, Trx } from "../audit.js";
import { badRequest, HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";

/** The largest single file of an app. */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

const keyOf = (tenantId: string, sha256: string) => `assets/${tenantId}/${sha256}`;

/**
 * Keeps one file of an app, named by its checksum. The same bytes uploaded
 * again are already there: nothing is written.
 */
export async function storeAsset(
  kernel: Kernel,
  db: Db | Trx,
  tenantId: string,
  sha256: string,
  content: Buffer,
): Promise<{ created: boolean }> {
  if (content.length > MAX_ASSET_BYTES) {
    throw new HttpError(
      413,
      "payload_too_large",
      `A file of an app can be at most ${MAX_ASSET_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (createHash("sha256").update(content).digest("hex") !== sha256) {
    throw badRequest("The file's bytes do not have the checksum in the address.");
  }
  const existing = await db
    .selectFrom("bundle_asset")
    .select("sha256")
    .where("tenant_id", "=", tenantId)
    .where("sha256", "=", sha256)
    .executeTakeFirst();
  if (existing) return { created: false };
  const key = keyOf(tenantId, sha256);
  await kernel.storage.put(key, content, "application/octet-stream");
  await db
    .insertInto("bundle_asset")
    .values({ tenant_id: tenantId, sha256, size_bytes: content.length, storage_key: key })
    .onConflict((conflict) => conflict.columns(["tenant_id", "sha256"]).doNothing())
    .execute();
  return { created: true };
}

/** The files a bundle lists that the tenant does not have yet, or has at another size. */
export async function missingAssets(
  db: Db | Trx,
  tenantId: string,
  assets: BundleAsset[],
): Promise<BundleAsset[]> {
  if (assets.length === 0) return [];
  const wanted = [...new Set(assets.map((asset) => asset.sha256))];
  const have = new Map<string, number>();
  for (let from = 0; from < wanted.length; from += 500) {
    const rows = await db
      .selectFrom("bundle_asset")
      .select(["sha256", "size_bytes"])
      .where("tenant_id", "=", tenantId)
      .where("sha256", "in", wanted.slice(from, from + 500))
      .execute();
    for (const row of rows) have.set(row.sha256, row.size_bytes);
  }
  return assets.filter((asset) => have.get(asset.sha256) !== asset.size);
}

// App files never change once stored, so recently served ones are kept in memory.
const CACHE_BYTES = 64 * 1024 * 1024;
const cached = new Map<string, Buffer>();
let cachedBytes = 0;

/** The bytes of one stored file. */
export async function readAsset(kernel: Kernel, tenantId: string, sha256: string): Promise<Buffer> {
  const key = keyOf(tenantId, sha256);
  const known = cached.get(key);
  if (known) {
    // Moved to the end: the least recently used is the first to go.
    cached.delete(key);
    cached.set(key, known);
    return known;
  }
  const content = await kernel.storage.get(key);
  if (content.length <= CACHE_BYTES / 8) {
    cached.set(key, content);
    cachedBytes += content.length;
    while (cachedBytes > CACHE_BYTES) {
      const [oldest, bytes] = cached.entries().next().value as [string, Buffer];
      cached.delete(oldest);
      cachedBytes -= bytes.length;
    }
  }
  return content;
}

/** The files of one app in a bundle, by their path inside the app. */
export function appFiles(bundle: Bundle, appPath: string): Map<string, BundleAsset> {
  return new Map(
    (bundle.assets ?? [])
      .filter((asset) => asset.app === appPath)
      .map((asset) => [asset.path, asset]),
  );
}
