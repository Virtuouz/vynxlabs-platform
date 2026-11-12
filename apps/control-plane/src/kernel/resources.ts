import { newId, type Ownership } from "@vynxlabs/db";
import type { Audit, Db, Trx } from "./audit.js";
import { badRequest, conflict, notFound } from "./errors.js";
import type { WorkspaceRef } from "./http.js";
import type { Kernel } from "./kernel.js";

export interface ResourceInput {
  path: string;
  kind: string;
  schemaVersion: number;
  ownership: Ownership;
  body: Record<string, unknown>;
  /** Move the resource at this path to `path`, keeping its ID. */
  renameFrom?: string | undefined;
}

export function findResource(db: Db | Trx, workspaceId: string, path: string) {
  return db
    .selectFrom("resource")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .where("path", "=", path)
    .executeTakeFirst();
}

/** Creates or updates the resource at a path, records the version and runs the kind's hook. */
export async function putResource(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  input: ResourceInput,
) {
  const validation = kernel.kinds.validateManifest({
    kind: input.kind,
    schemaVersion: input.schemaVersion,
    path: input.path,
    workspace: workspace.slug,
    ownership: input.ownership,
    body: input.body,
  });
  if (!validation.ok) {
    throw badRequest("The manifest is not valid.", validation.issues);
  }

  const lookupPath = input.renameFrom ?? input.path;
  const existing = await trx
    .selectFrom("resource")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .where("path", "=", lookupPath)
    .forUpdate()
    .executeTakeFirst();
  if (input.renameFrom !== undefined && !existing) {
    throw notFound(`The resource at ${input.renameFrom}`);
  }
  if (existing && existing.kind !== input.kind) {
    throw conflict(`${lookupPath} is a ${existing.kind}. A resource cannot change kind.`);
  }
  if (existing && existing.ownership !== input.ownership) {
    throw conflict(
      `${lookupPath} is ${existing.ownership}-managed. A resource is code-managed or UI-managed, never both.`,
    );
  }

  const id = existing?.id ?? newId();
  const version = (existing?.version ?? 0) + 1;
  const body = JSON.stringify(input.body);
  const columns = {
    kind: input.kind,
    schema_version: input.schemaVersion,
    path: input.path,
    ownership: input.ownership,
  };
  if (existing) {
    await trx
      .updateTable("resource")
      .set({ ...columns, version, body, updated_at: new Date() })
      .where("id", "=", id)
      .execute();
  } else {
    await trx
      .insertInto("resource")
      .values({
        id,
        tenant_id: workspace.tenantId,
        workspace_id: workspace.id,
        ...columns,
        version,
        body,
        updated_at: new Date(),
      })
      .execute();
  }
  await trx
    .insertInto("resource_version")
    .values({
      resource_id: id,
      version,
      tenant_id: workspace.tenantId,
      workspace_id: workspace.id,
      ...columns,
      body,
    })
    .execute();

  await kernel.hooks.get(input.kind)?.apply(trx, {
    id,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    path: input.path,
    body: input.body,
  });

  await audit({
    action: existing ? "resource.updated" : "resource.created",
    targetType: "resource",
    targetId: id,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    details: {
      kind: input.kind,
      path: input.path,
      version,
      ...(input.renameFrom !== undefined && input.renameFrom !== input.path
        ? { renamedFrom: input.renameFrom }
        : {}),
    },
  });

  return { created: !existing, resource: await findResource(trx, workspace.id, input.path) };
}

export async function deleteResource(
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  path: string,
) {
  const existing = await trx
    .selectFrom("resource")
    .selectAll()
    .where("workspace_id", "=", workspace.id)
    .where("path", "=", path)
    .forUpdate()
    .executeTakeFirst();
  if (!existing) throw notFound(`The resource at ${path}`);

  await trx
    .insertInto("resource_version")
    .values({
      resource_id: existing.id,
      version: existing.version + 1,
      tenant_id: existing.tenant_id,
      workspace_id: existing.workspace_id,
      kind: existing.kind,
      schema_version: existing.schema_version,
      path: existing.path,
      ownership: existing.ownership,
      body: null,
      deleted: true,
    })
    .execute();
  // Roles and bindings projected from this resource go with it.
  await trx.deleteFrom("resource").where("id", "=", existing.id).execute();
  await audit({
    action: "resource.deleted",
    targetType: "resource",
    targetId: existing.id,
    tenantId: existing.tenant_id,
    workspaceId: existing.workspace_id,
    details: { kind: existing.kind, path: existing.path },
  });
}
