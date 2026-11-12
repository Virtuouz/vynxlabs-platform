import { newId } from "@vynxlabs/db";
import {
  Bundle,
  type BundleManifest,
  bundleDigest,
  bundleExpressions,
  checkBundleManifests,
  validateJson,
} from "@vynxlabs/manifest";
import type { Audit, Principal, Trx } from "../audit.js";
import { badRequest } from "../errors.js";
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
) {
  const issues = validateJson(Bundle, input, "/body");
  if (issues.length > 0) throw badRequest("That is not a bundle.", issues);
  const bundle = input as Bundle;
  if (bundleDigest(bundle) !== bundle.digest) {
    throw badRequest("The bundle's digest does not match its contents. Build it again.");
  }
  // The build runs these same checks. The control plane does not take its word for it.
  const problems = checkBundleManifests(bundle.manifests);
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

  const existing = await trx
    .selectFrom("bundle")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .where("digest", "=", bundle.digest)
    .executeTakeFirst();
  if (existing) {
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
      created_by_type: principal.type,
      created_by_id: principal.id,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  loaded.set(id, bundle);
  await audit({
    action: "bundle.uploaded",
    targetType: "bundle",
    targetId: id,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    details: { version: row.version, digest: bundle.digest, manifests: bundle.manifests.length },
  });
  return { created: true, bundle: row };
}
