import { newId, type Ownership, type ResourceMeta } from "@volvel/db";
import type { Audit, Db, Trx } from "./audit.js";
import { badRequest, conflict, HttpError, notFound } from "./errors.js";
import type { WorkspaceRef } from "./http.js";
import type { Kernel } from "./kernel.js";
import type { KindHook } from "./kinds.js";
import { renamePathState } from "./rename.js";
import { dropAlias, leaveAlias } from "./resolve.js";

export interface ResourceInput {
  path: string;
  kind: string;
  schemaVersion: number;
  ownership: Ownership;
  body: Record<string, unknown>;
  /**
   * Its identity, for one that is new. The path, when it is not given. A resource
   * that is there keeps the key it has: a key never changes.
   */
  key?: string | undefined;
  /** What people read. Left as it is when not given. */
  title?: string | null | undefined;
  /** What a bundle says about it beside its body. Left as it is when not given. */
  meta?: ResourceMeta | undefined;
  /** Move the resource at this path to `path`, keeping its ID. */
  renameFrom?: string | undefined;
  /**
   * The version the caller read. When it is not the one there now, someone has saved since,
   * and nothing is replaced.
   */
  expectedVersion?: number | undefined;
  /**
   * The resource this is, when the caller has matched it already, as a deploy does by
   * key. Its path may be another: that is a rename.
   */
  match?: { id: string } | undefined;
  /** The path the matched resource had before the caller moved it aside to free that path. */
  movedFrom?: string | undefined;
  /**
   * Lets the resource change between code-managed and console-managed. Only a
   * deploy passes it: a bundle is the one thing that may say who manages what.
   */
  switchOwnership?: boolean;
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
    .$if(input.match !== undefined, (query) => query.where("id", "=", input.match?.id as string))
    .$if(input.match === undefined, (query) => query.where("path", "=", lookupPath))
    .forUpdate()
    .executeTakeFirst();
  if (input.match !== undefined && !existing) throw notFound("The resource");
  if (input.renameFrom !== undefined && !existing) {
    throw notFound(`The resource at ${input.renameFrom}`);
  }
  const before = existing ? (input.movedFrom ?? existing.path) : undefined;
  const renamedFrom = before !== undefined && before !== input.path ? before : undefined;
  if (renamedFrom !== undefined) {
    const occupant = await trx
      .selectFrom("resource")
      .select(["kind", "key"])
      .where("workspace_id", "=", workspace.id)
      .where("path", "=", input.path)
      .executeTakeFirst();
    if (occupant) {
      throw new HttpError(
        409,
        "path_taken",
        `${renamedFrom} cannot be renamed to ${input.path}: that is the path of ${/^[aeiou]/.test(occupant.kind) ? "an" : "a"} ${occupant.kind.replaceAll("_", " ")}${occupant.key === input.path ? "" : ` (key ${occupant.key})`}. Rename or remove that one first.`,
      );
    }
  }
  if (
    existing &&
    input.expectedVersion !== undefined &&
    existing.version !== input.expectedVersion
  ) {
    throw new HttpError(
      409,
      "draft_changed",
      `Someone else saved ${existing.path} after you opened it. Reload it, then make your change again.`,
    );
  }
  if (existing && existing.kind !== input.kind) {
    throw conflict(`${existing.path} is a ${existing.kind}. A resource cannot change kind.`);
  }
  if (existing && existing.ownership !== input.ownership && !input.switchOwnership) {
    throw conflict(
      `${existing.path} is ${existing.ownership}-managed. A resource is code-managed or UI-managed, never both.`,
    );
  }

  const id = existing?.id ?? newId();
  const version = (existing?.version ?? 0) + 1;
  const body = JSON.stringify(input.body);
  const columns = {
    kind: input.kind,
    schema_version: input.schemaVersion,
    key: existing?.key ?? input.key ?? input.path,
    path: input.path,
    title: input.title !== undefined ? input.title : (existing?.title ?? null),
    meta: JSON.stringify(input.meta ?? existing?.meta ?? {}),
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

  // What the workspace keeps under the old path comes along, before the kind's hook looks for it.
  const warnings =
    existing && renamedFrom !== undefined
      ? await renamePathState(
          trx,
          (await kernel.data.within(trx, workspace.tenantId)).db,
          workspace.id,
          existing,
          existing.path,
          input.path,
          renamedFrom,
        )
      : [];

  await kernel.hooks.get(input.kind)?.apply(trx, {
    id,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    path: input.path,
    body: input.body,
  });

  // The path it had keeps answering for a while. An alias at the path it has now is over.
  const aliasRemoved =
    existing && renamedFrom !== undefined
      ? await leaveAlias(trx, existing, renamedFrom, input.path)
      : existing
        ? false
        : await dropAlias(trx, workspace.id, input.path);

  await audit({
    action: !existing
      ? "resource.created"
      : renamedFrom !== undefined
        ? "resource.renamed"
        : "resource.updated",
    targetType: "resource",
    targetId: id,
    tenantId: workspace.tenantId,
    workspaceId: workspace.id,
    details: {
      kind: input.kind,
      path: input.path,
      version,
      ...(existing ? { key: existing.key } : {}),
      ...(renamedFrom !== undefined ? { renamedFrom } : {}),
    },
  });

  return {
    created: !existing,
    renamedFrom,
    /** Whether an alias at this path, of a resource renamed away from it, was ended by this. */
    aliasRemoved,
    warnings,
    resource: await findResource(trx, workspace.id, input.path),
  };
}

export async function deleteResource(
  trx: Trx,
  audit: Audit,
  workspace: WorkspaceRef,
  path: string,
  hooks?: Map<string, KindHook>,
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
      key: existing.key,
      path: existing.path,
      title: existing.title,
      meta: JSON.stringify(existing.meta),
      ownership: existing.ownership,
      body: null,
      deleted: true,
    })
    .execute();
  await hooks?.get(existing.kind)?.remove?.(trx, {
    id: existing.id,
    tenantId: existing.tenant_id,
    workspaceId: existing.workspace_id,
    path: existing.path,
    body: existing.body,
  });
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
