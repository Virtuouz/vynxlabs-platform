import { sql } from "@vynxlabs/db";
import type { Audit, Trx } from "../audit.js";
import { workspaceSchema } from "../data/apply.js";
import { conflict } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { deleteOwned, storedKeys } from "./tables.js";

/** Work still going on. Deleting underneath it would leave a worker holding a run that no longer exists. */
async function refuseWhileBusy(trx: Trx, scope: { tenantId: string } | { workspaceId: string }) {
  const [column, id] =
    "tenantId" in scope
      ? (["tenant_id", scope.tenantId] as const)
      : (["workspace_id", scope.workspaceId] as const);
  const runs = await trx
    .selectFrom("run")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where(column, "=", id)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirstOrThrow();
  const flows = await trx
    .selectFrom("flow_run")
    .select((eb) => eb.fn.countAll<string>().as("n"))
    .where(column, "=", id)
    .where("status", "=", "running")
    .executeTakeFirstOrThrow();
  const busy = Number(runs.n) + Number(flows.n);
  if (busy > 0) {
    throw conflict(
      `${Number(runs.n)} runs and ${Number(flows.n)} flow runs are still in progress. Pause the triggers, let them finish or cancel them, then try again.`,
    );
  }
}

/** Drops the custom tables of some workspaces, wherever the tenant keeps them. */
async function dropTables(kernel: Kernel, trx: Trx, tenantId: string, workspaceIds: string[]) {
  if (workspaceIds.length === 0) return 0;
  const { db } = await kernel.data.within(trx, tenantId);
  for (const id of workspaceIds) {
    await sql`drop schema if exists ${sql.id(workspaceSchema(id))} cascade`.execute(db);
  }
  const gone = await db
    .deleteFrom("data_table")
    .where("workspace_id", "in", workspaceIds)
    .executeTakeFirst();
  return Number(gone.numDeletedRows);
}

/** Removes objects from the store once the rows that pointed at them are gone for good. */
export async function removeStored(kernel: Kernel, keys: string[]) {
  for (const key of keys) {
    await kernel.storage
      .remove(key)
      .catch((error) =>
        kernel.log.warn({ err: error, key }, "a stored object could not be removed"),
      );
  }
}

/**
 * Deletes a dev workspace: its resources, bindings, secrets, history, custom
 * tables and files. Returns the stored objects to remove after the commit.
 */
export async function deleteWorkspace(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  workspace: { id: string; tenantId: string; slug: string },
) {
  const row = await trx
    .selectFrom("workspace")
    .select(["type", "name"])
    .where("id", "=", workspace.id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (row.type !== "dev") {
    throw conflict(
      "A production workspace cannot be deleted by itself. It goes when its tenant is deleted.",
    );
  }
  await refuseWhileBusy(trx, { workspaceId: workspace.id });
  const keys = await storedKeys(trx, { workspaceId: workspace.id });
  const tables = await dropTables(kernel, trx, workspace.tenantId, [workspace.id]);

  // Workspaces that promoted to this one are left without a link.
  await trx
    .updateTable("workspace")
    .set({ linked_workspace_id: null })
    .where("linked_workspace_id", "=", workspace.id)
    .execute();
  await trx
    .updateTable("workspace")
    .set({ active_bundle_id: null })
    .where("id", "=", workspace.id)
    .execute();
  const counts = await deleteOwned(trx, { workspaceId: workspace.id });
  await audit({
    action: "workspace.deleted",
    targetType: "workspace",
    targetId: workspace.id,
    tenantId: workspace.tenantId,
    // The workspace is gone, so the entry belongs to the tenant.
    details: { slug: workspace.slug, name: row.name, tables, files: counts.file ?? 0 },
  });
  return keys;
}

/**
 * Deletes a tenant and everything it owns on this instance. Its audit entries
 * stay, and so do its members' accounts, which belong to the instance.
 */
export async function deleteTenant(kernel: Kernel, trx: Trx, audit: Audit, tenantId: string) {
  const tenant = await trx
    .selectFrom("tenant")
    .select(["slug", "name"])
    .where("id", "=", tenantId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  await refuseWhileBusy(trx, { tenantId });
  const keys = await storedKeys(trx, { tenantId });
  const workspaces = await trx
    .selectFrom("workspace")
    .select("id")
    .where("tenant_id", "=", tenantId)
    .execute();
  const tables = await dropTables(
    kernel,
    trx,
    tenantId,
    workspaces.map((workspace) => workspace.id),
  );
  await trx
    .updateTable("workspace")
    .set({ linked_workspace_id: null, active_bundle_id: null })
    .where("tenant_id", "=", tenantId)
    .execute();
  const counts = await deleteOwned(trx, { tenantId });
  await trx.deleteFrom("tenant").where("id", "=", tenantId).execute();
  // Recorded for the instance: the tenant has no log of its own any more.
  await audit({
    action: "tenant.deleted",
    targetType: "tenant",
    targetId: tenantId,
    details: {
      slug: tenant.slug,
      name: tenant.name,
      workspaces: workspaces.length,
      tables,
      files: counts.file ?? 0,
    },
  });
  return keys;
}
