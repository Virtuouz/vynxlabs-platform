import { newId } from "@vynxlabs/db";
import { type Actor, type Audit, type Db, mutate, type Principal, type Trx } from "../audit.js";
import { conflict, HttpError } from "../errors.js";
import type { WorkspaceRef } from "../http.js";
import type { Kernel } from "../kernel.js";
import { deployBundle } from "./deploy.js";

/**
 * Makes a bundle of one workspace available in another, as that workspace's
 * next version. The content is the same, byte for byte: nothing is rebuilt.
 * A workspace that already has the bundle keeps the one it has.
 */
export async function adoptBundle(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  sourceBundleId: string,
  target: WorkspaceRef,
  principal: Principal,
  options: { dryRun?: boolean } = {},
) {
  const source = await trx
    .selectFrom("bundle")
    .selectAll()
    .where("id", "=", sourceBundleId)
    .where("tenant_id", "=", target.tenantId)
    .executeTakeFirstOrThrow();
  const existing = await trx
    .selectFrom("bundle")
    .selectAll()
    .where("workspace_id", "=", target.id)
    .where("digest", "=", source.digest)
    .executeTakeFirst();
  if (existing) return existing;

  // Serializes version numbers within the workspace.
  await trx.selectFrom("workspace").select("id").where("id", "=", target.id).forUpdate().execute();
  const latest = await trx
    .selectFrom("bundle")
    .select((eb) => eb.fn.max("version").as("version"))
    .where("workspace_id", "=", target.id)
    .executeTakeFirst();
  const id = newId();
  // Each workspace keeps its own copy, so deleting one never takes a bundle from another.
  let storageKey = source.storage_key;
  if (!options.dryRun) {
    storageKey = `bundles/${target.tenantId}/${target.id}/${id}.json`;
    await kernel.storage.put(
      storageKey,
      await kernel.storage.get(source.storage_key),
      "application/json",
    );
  }
  const row = await trx
    .insertInto("bundle")
    .values({
      id,
      tenant_id: target.tenantId,
      workspace_id: target.id,
      version: (latest?.version ?? 0) + 1,
      digest: source.digest,
      sdk_version: source.sdk_version,
      core_min: source.core_min,
      core_below: source.core_below,
      storage_key: storageKey,
      size_bytes: source.size_bytes,
      manifest_count: source.manifest_count,
      created_by_type: principal.type,
      created_by_id: principal.id,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await audit({
    action: "bundle.promoted",
    targetType: "bundle",
    targetId: id,
    tenantId: target.tenantId,
    workspaceId: target.id,
    details: { version: row.version, digest: row.digest, fromWorkspaceId: source.workspace_id },
  });
  return row;
}

/** The workspace a dev workspace promotes to, and the bundle it would send. */
export async function promotionOf(db: Db | Trx, source: WorkspaceRef) {
  const row = await db
    .selectFrom("workspace as source")
    .leftJoin("workspace as target", "target.id", "source.linked_workspace_id")
    .leftJoin("bundle", "bundle.id", "source.active_bundle_id")
    .select([
      "source.active_bundle_id",
      "target.id as target_id",
      "target.slug as target_slug",
      "target.name as target_name",
      "target.type as target_type",
      "target.active_bundle_id as target_bundle_id",
      "bundle.digest",
      "bundle.version",
    ])
    .where("source.id", "=", source.id)
    .executeTakeFirstOrThrow();
  if (!row.target_id || !row.target_slug) {
    throw conflict(
      "This workspace is not linked to another one. Link it to the workspace it promotes to first.",
    );
  }
  if (!row.active_bundle_id || !row.digest) {
    throw conflict("This workspace has nothing deployed, so there is nothing to promote.");
  }
  return {
    bundleId: row.active_bundle_id,
    digest: row.digest,
    version: row.version as number,
    target: { id: row.target_id, tenantId: source.tenantId, slug: row.target_slug },
    targetName: row.target_name as string,
    targetType: row.target_type as string,
    targetBundleId: row.target_bundle_id,
  };
}

/**
 * Activates, in the linked workspace, the same bundle that is active here.
 * It is an ordinary deploy there: bindings are checked and tables changed.
 */
export async function promote(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  source: WorkspaceRef,
  principal: Principal,
  options: { dryRun?: boolean } = {},
) {
  const promotion = await promotionOf(trx, source);
  const bundle = await adoptBundle(
    kernel,
    trx,
    audit,
    promotion.bundleId,
    promotion.target,
    principal,
    options,
  );
  const result = await deployBundle(kernel, trx, audit, promotion.target, principal, bundle.id, {
    promotedFrom: source.id,
  });
  return { ...result, target: promotion.target };
}

class DryRun extends Error {}

/**
 * What promoting would do, found by doing it and taking it all back. The
 * answer is therefore exactly what the promotion would then do, including
 * every refusal.
 */
export async function previewPromotion(kernel: Kernel, actor: Actor, source: WorkspaceRef) {
  const promotion = await promotionOf(kernel.db, source);
  const about = {
    target: {
      id: promotion.target.id,
      slug: promotion.target.slug,
      name: promotion.targetName,
      type: promotion.targetType,
    },
    bundle: { digest: promotion.digest, version: promotion.version },
  };
  let summary: Awaited<ReturnType<typeof deployBundle>>["summary"] | undefined;
  try {
    await mutate(kernel.db, actor, async (trx, audit) => {
      summary = (await promote(kernel, trx, audit, source, actor.principal, { dryRun: true }))
        .summary;
      throw new DryRun();
    });
  } catch (error) {
    if (error instanceof HttpError && error.statusCode < 500) {
      return {
        ...about,
        possible: false,
        refusal: { code: error.problemCode, detail: error.message, errors: error.issues ?? [] },
        summary: null,
      };
    }
    if (!(error instanceof DryRun)) throw error;
  }
  return { ...about, possible: true, refusal: null, summary: summary ?? null };
}
