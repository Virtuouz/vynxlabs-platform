import { newId } from "@vynxlabs/db";
import {
  Bundle,
  type BundleManifest,
  bundleDigest,
  bundleExpressions,
  checkBundleAssets,
  checkBundleManifests,
  validateJson,
} from "@vynxlabs/manifest";
import { missingAssets } from "../apps/assets.js";
import type { Audit, Principal, Trx } from "../audit.js";
import { badRequest, HttpError } from "../errors.js";
import { ExpressionError } from "../flows/expressions.js";
import type { WorkspaceRef } from "../http.js";
import type { Kernel } from "../kernel.js";

/** The largest bundle the control plane accepts. */
export const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;

const loaded = new Map<string, Bundle>();
const CACHE_SIZE = 32;

/** Reads a stored bundle. Bundles never change, so recent ones are kept in memory. */
export async function loadBundle(
  kernel: Kernel,
  bundle: { id: string; storage_key: string },
): Promise<Bundle> {
  const cached = loaded.get(bundle.id);
  if (cached) return cached;
  const parsed = JSON.parse(
    (await kernel.storage.get(bundle.storage_key)).toString("utf8"),
  ) as Bundle;
  loaded.set(bundle.id, parsed);
  if (loaded.size > CACHE_SIZE) loaded.delete(loaded.keys().next().value as string);
  return parsed;
}

/** One manifest of a stored bundle, by kind and path. */
export async function bundleManifest(
  kernel: Kernel,
  bundle: { id: string; storage_key: string },
  kind: string,
  path: string,
): Promise<BundleManifest | undefined> {
  const content = await loadBundle(kernel, bundle);
  return content.manifests.find((manifest) => manifest.kind === kind && manifest.path === path);
}

/**
 * Stores an uploaded bundle as the workspace's next version. Uploading a
 * bundle the workspace already has returns the existing one.
 */
export async function storeBundle(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  principal: Principal,
  input: unknown,
  /** `compose` and `preview` are bundles the control plane made itself. */
  origin: "upload" | "compose" | "preview" = "upload",
) {
  const issues = validateJson(Bundle, input, "/body");
  if (issues.length > 0) throw badRequest("That is not a bundle.", issues);
  const bundle = input as Bundle;
  if (bundleDigest(bundle) !== bundle.digest) {
    throw badRequest("The bundle's digest does not match its contents. Build it again.");
  }
  // The build runs these same checks. The control plane does not take its word for it.
  const problems = [...checkBundleManifests(bundle.manifests), ...checkBundleAssets(bundle)];
  for (const { where, expression } of bundleExpressions(bundle.manifests)) {
    await kernel.expressions.check(expression).catch((error) => {
      if (!(error instanceof ExpressionError)) throw error;
      problems.push(`${where} is not a valid expression: ${error.message}`);
    });
  }
  if (problems.length > 0) {
    throw badRequest(
      "The bundle's manifests are not valid.",
      problems.map((problem) => {
        const [where, ...rest] = problem.split(": ");
        return { path: where ?? "", message: rest.join(": ") };
      }),
    );
  }

  // A bundle names its apps' files by checksum. Each must already be here, or the
  // bundle could be deployed and then have nothing to serve.
  const absent = await missingAssets(trx, workspace.tenantId, bundle.assets ?? []);
  if (absent.length > 0) {
    throw new HttpError(
      409,
      "assets_missing",
      "Some files of the bundle's apps have not been uploaded. Upload them, then upload the bundle again.",
      absent.slice(0, 100).map((asset) => ({
        path: `${asset.app}/${asset.path}`,
        message: `sha256 ${asset.sha256}`,
      })),
    );
  }

  const existing = await trx
    .selectFrom("bundle")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .where("digest", "=", bundle.digest)
    .executeTakeFirst();
  if (existing) {
    // A bundle first made to try a draft out, and now deployed or uploaded, is no longer a preview.
    if (existing.origin === "preview" && origin !== "preview") {
      await trx.updateTable("bundle").set({ origin }).where("id", "=", existing.id).execute();
      existing.origin = origin;
    }
    await audit({
      action: "bundle.uploaded",
      targetType: "bundle",
      targetId: existing.id,
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
      details: { version: existing.version, digest: bundle.digest, alreadyStored: true },
    });
    return { created: false, bundle: existing };
  }

  // Serializes version numbers within the workspace.
  await trx
    .selectFrom("workspace")
    .select("id")
    .where("id", "=", workspace.id)
    .forUpdate()
    .execute();
  const latest = await trx
    .selectFrom("bundle")
    .select((eb) => eb.fn.max("version").as("version"))
    .where("workspace_id", "=", workspace.id)
    .executeTakeFirst();
  const id = newId();
  const text = JSON.stringify(bundle);
  const storageKey = `bundles/${workspace.tenantId}/${workspace.id}/${id}.json`;
  await kernel.storage.put(storageKey, text, "application/json");
  const row = await trx
    .insertInto("bundle")
    .values({
      id,
      tenant_id: workspace.tenantId,
      workspace_id: workspace.id,
      version: (latest?.version ?? 0) + 1,
      digest: bundle.digest,
      sdk_version: bundle.sdkVersion,
      core_min: bundle.core.min,
      core_below: bundle.core.below,
      storage_key: storageKey,
      size_bytes: Buffer.byteLength(text),
      manifest_count: bundle.manifests.length,
      origin,
      created_by_type: principal.type,
      created_by_id: principal.id,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  loaded.set(id, bundle);
  await audit({
    action: origin === "upload" ? "bundle.uploaded" : "bundle.composed",
    targetType: "bundle",
    targetId: id,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    details: {
      version: row.version,
      digest: bundle.digest,
      manifests: bundle.manifests.length,
      ...(origin === "upload" ? {} : { origin }),
    },
  });
  return { created: true, bundle: row };
}

/** A bundle made to try a draft out is kept this long after it was made. */
export const PREVIEW_DAYS = 7;

/**
 * Removes the bundles that were made only to try a draft out, once they are
 * old, with the test runs that ran on them. A bundle that was since deployed
 * or uploaded is no longer a preview and is left. One with a run still in
 * progress waits for the next sweep.
 */
export async function removeOldPreviews(kernel: Kernel, olderThanDays = PREVIEW_DAYS) {
  const before = new Date(Date.now() - olderThanDays * 86_400_000);
  const old = await kernel.db
    .selectFrom("bundle")
    .select(["id", "storage_key"])
    .where("origin", "=", "preview")
    .where("created_at", "<", before)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("run")
            .select("run.id")
            .whereRef("run.bundle_id", "=", "bundle.id")
            .where("run.status", "in", ["queued", "running"]),
        ),
      ),
    )
    .limit(50)
    .execute();
  let removed = 0;
  for (const bundle of old) {
    try {
      const stored = await kernel.db.transaction().execute(async (trx) => {
        const runs = await trx
          .deleteFrom("run")
          .where("bundle_id", "=", bundle.id)
          .returning(["input_ref", "output_ref"])
          .execute();
        await trx
          .deleteFrom("bundle")
          .where("id", "=", bundle.id)
          .where("origin", "=", "preview")
          .execute();
        return runs.flatMap((run) => [run.input_ref, run.output_ref]);
      });
      // What was kept in the object store goes last: a row that names a missing object is worse
      // than an object nothing names.
      for (const key of [bundle.storage_key, ...stored]) {
        if (key) await kernel.storage.remove(key).catch(() => {});
      }
      removed += 1;
    } catch (error) {
      // Something else came to refer to it, such as a flow run. It is left for a person to see.
      kernel.log.debug({ err: error, bundle: bundle.id }, "a preview bundle could not be removed");
    }
  }
  return removed;
}
