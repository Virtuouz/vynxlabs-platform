import { createHash } from "node:crypto";
import { sql } from "@volvel/db";
import type { Bundle, BundleAsset } from "@volvel/manifest";
import type { Db, Trx } from "../audit.js";
import { badRequest, HttpError } from "../errors.js";
import { loadBundle } from "../execution/bundles.js";
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

/** A bundle naming files that were stored a while ago makes them young again, so they are not swept under it. */
export async function touchAssets(db: Db | Trx, tenantId: string, assets: BundleAsset[]) {
  const wanted = [...new Set(assets.map((asset) => asset.sha256))];
  const stale = new Date(Date.now() - 86_400_000);
  for (let from = 0; from < wanted.length; from += 500) {
    await db
      .updateTable("bundle_asset")
      .set({ created_at: new Date() })
      .where("tenant_id", "=", tenantId)
      .where("sha256", "in", wanted.slice(from, from + 500))
      .where("created_at", "<", stale)
      .execute();
  }
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

/** A file nothing names is kept this long, and so is a bundle that names it: time to deploy it. */
export const APP_FILE_GRACE_DAYS = 7;
const SWEEP_BATCH = 500;
/** Tenants that deployed since the last sweep. */
const due = new Set<string>();

/** Notes that a tenant deployed, so that the files its apps no longer name are looked at. */
export function appFilesDue(tenantId: string) {
  due.add(tenantId);
}

/**
 * Removes the files of a tenant's apps that no bundle that can still be deployed names: the
 * active bundle of each workspace, and every bundle of the last `APP_FILE_GRACE_DAYS` days.
 * A file uploaded or named by an uploaded bundle within those days is kept too, since a build
 * uploads its files before its bundle. Returns how many files went.
 */
export async function sweepAppFiles(
  kernel: Kernel,
  tenantId: string,
  /** For tests: runs inside the sweep's transaction once it has listed what is named. */
  afterListing?: () => Promise<void>,
): Promise<number> {
  const before = new Date(Date.now() - APP_FILE_GRACE_DAYS * 86_400_000);
  // Listing and deleting happen under the lock a bundle's store takes too, so that a bundle
  // is either seen by the sweep or sees the file gone, and never names a file being deleted.
  const keys = await kernel.db.transaction().execute(async (trx) => {
    await lockAppFiles(trx, tenantId);
    const stale = await trx
      .selectFrom("bundle_asset")
      .select(["sha256", "storage_key"])
      .where("tenant_id", "=", tenantId)
      .where("created_at", "<", before)
      .orderBy("created_at")
      .limit(SWEEP_BATCH)
      .execute();
    if (stale.length === 0) return [];
    const named = new Set<string>();
    const bundles = await trx
      .selectFrom("bundle")
      .select(["id", "storage_key"])
      .where("tenant_id", "=", tenantId)
      .where((eb) =>
        eb.or([
          eb("created_at", ">=", before),
          eb(
            "id",
            "in",
            eb
              .selectFrom("workspace")
              .select("active_bundle_id")
              .where("tenant_id", "=", tenantId)
              .where("active_bundle_id", "is not", null),
          ),
        ]),
      )
      .execute();
    for (const bundle of bundles) {
      for (const asset of (await loadBundle(kernel, bundle)).assets ?? []) named.add(asset.sha256);
    }
    // A version of a widget a page was placed with is kept, whichever bundle first carried it.
    const versions = await trx
      .selectFrom("widget_version")
      .select("files")
      .where("tenant_id", "=", tenantId)
      .execute();
    for (const version of versions) for (const file of version.files) named.add(file.sha256);
    await afterListing?.();
    const gone: string[] = [];
    for (const file of stale) {
      if (named.has(file.sha256)) continue;
      await trx
        .deleteFrom("bundle_asset")
        .where("tenant_id", "=", tenantId)
        .where("sha256", "=", file.sha256)
        .execute();
      gone.push(file.storage_key);
    }
    return gone;
  });
  // Objects go only once the rows are gone for good: a row that names a missing object is
  // worse than an object nothing names.
  for (const key of keys) await kernel.storage.remove(key).catch(() => {});
  return keys.length;
}

/** Serializes a tenant's sweep of app files with the storing of its bundles. */
export async function lockAppFiles(trx: Trx, tenantId: string) {
  await sql`select pg_advisory_xact_lock(hashtext(${`app-files:${tenantId}`}))`.execute(trx);
}

/** Looks at the tenants that deployed since the last time. One that fails is tried at its next deploy. */
export async function sweepDueAppFiles(kernel: Kernel) {
  for (const tenantId of [...due]) {
    due.delete(tenantId);
    try {
      const removed = await sweepAppFiles(kernel, tenantId);
      if (removed > 0) kernel.log.info({ tenantId, removed }, "files no app names were removed");
    } catch (error) {
      kernel.log.warn({ err: error, tenantId }, "the files no app names could not be swept");
    }
  }
}
