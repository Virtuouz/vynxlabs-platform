import type { BundleManifest } from "@volvel/manifest";
import type { Db, Trx } from "../audit.js";
import type { Kernel } from "../kernel.js";
import { loadBundle } from "./bundles.js";

/**
 * What the next promotion into a workspace brings: the resources of the active
 * bundles of the workspaces linked to it. A production workspace has to be set
 * up for these before the promotion, which refuses what is not bound, and none
 * of them is deployed there yet, so nothing else says what they are.
 */
export async function arrivingManifests(
  kernel: Kernel,
  db: Db | Trx,
  workspaceId: string,
): Promise<BundleManifest[]> {
  const bundles = await db
    .selectFrom("workspace")
    .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
    .select(["bundle.id", "bundle.storage_key"])
    .where("workspace.linked_workspace_id", "=", workspaceId)
    .execute();
  const seen = new Set<string>();
  const manifests: BundleManifest[] = [];
  for (const stored of bundles) {
    for (const manifest of (await loadBundle(kernel, stored)).manifests) {
      const id = `${manifest.kind}:${manifest.path}`;
      if (seen.has(id)) continue;
      seen.add(id);
      manifests.push(manifest);
    }
  }
  return manifests;
}
