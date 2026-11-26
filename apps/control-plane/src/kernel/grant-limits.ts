import type { Db, Principal, Trx } from "./audit.js";
import { check, grants, holdingsIn, type Place, refusedToGive } from "./authorize.js";
import { forbiddenBecause } from "./errors.js";

/**
 * "Nobody gives what they do not hold", for the doors that give by way of someone else: a
 * person put in a group, or handed a key of a service account, holds what that group or account
 * is given. The comparison itself is `holdingsIn` in `authorize.ts`; this reads what the group or
 * account is given, at each place, and asks it once for all of them.
 */

/** Who can be given a role, and so can be handed to someone. */
type Holder = "group" | "end_user_group" | "service_account";

/**
 * Throws 403 naming the first permission that `by` does not hold, at the place it is given, of
 * everything the group or service account is given. A group or an account that is given nothing
 * hands over nothing.
 */
export async function requireToHandOver(
  db: Db | Trx,
  by: Principal,
  tenantId: string,
  holder: Holder,
  holderId: string,
): Promise<void> {
  const rows = await db
    .selectFrom("binding")
    .innerJoin("role", "role.id", "binding.role_id")
    .select(["role.permissions", "binding.workspace_id", "binding.resource_id"])
    .where("binding.tenant_id", "=", tenantId)
    .where("binding.principal_type", "=", holder)
    .where("binding.principal_id", "=", holderId)
    .execute();
  if (rows.length === 0) return;
  const holds = await holdingsIn(db, by, tenantId);
  for (const row of rows) {
    const place: Place = { workspaceId: row.workspace_id, resourceId: row.resource_id };
    const lacking = holds.lacking(row.permissions, place);
    if (lacking !== undefined) throw refusedToGive(lacking, place);
  }
}

/**
 * Throws 403 naming the first permission of a role that `by` does not hold across the tenant.
 * For a role that will be given to whoever a rule names, such as an identity provider's
 * default role. A role that does not exist is left to the one who looks it up.
 */
export async function requireToGiveRole(
  db: Db | Trx,
  by: Principal,
  tenantId: string,
  roleId: string,
): Promise<void> {
  const role = await db
    .selectFrom("role")
    .select("permissions")
    .where("id", "=", roleId)
    .executeTakeFirst();
  if (!role) return;
  const lacking = (await holdingsIn(db, by, tenantId)).lacking(role.permissions);
  if (lacking !== undefined) throw refusedToGive(lacking);
}

/** A role or a binding, as a workspace's resource says it, being written or deployed. */
export interface AccessResourceChange {
  kind: "role" | "binding";
  /** What it is to be. Left out for one that is removed. */
  body?: unknown;
  /** What it is now, when it is there. */
  before?: unknown;
  /** Where it is, for the refusal to say. */
  path: string;
}

export const isAccessKind = (kind: string): kind is "role" | "binding" =>
  kind === "role" || kind === "binding";

/**
 * Nobody gives what they do not hold, for roles and bindings written as a workspace's
 * resources, by hand or by a deploy: a role may hold only what the writer holds in the
 * workspace (a change is held to what it adds), and a binding may give only a role whose every
 * permission the writer holds there. A binding to one resource is held at the workspace, which
 * is the wider place. A role named by the same change is read as that change writes it. Taking
 * away asks no more than it did. Throws 403 naming the first permission they lack.
 */
export async function requireToGiveByResources(
  db: Db | Trx,
  by: Principal,
  workspace: { id: string; tenantId: string },
  changes: readonly AccessResourceChange[],
): Promise<void> {
  if (by.type === "system") return;
  const place: Place = { workspaceId: workspace.id };
  const holds = await holdingsIn(db, by, workspace.tenantId);
  const permissionsOf = (body: unknown) =>
    ((body as { permissions?: string[] } | undefined)?.permissions ?? []) as string[];
  const written = new Map<string, string[]>();
  for (const change of changes) {
    if (change.kind === "role" && change.body !== undefined) {
      written.set((change.body as { name: string }).name, permissionsOf(change.body));
    }
  }
  for (const change of changes) {
    if (change.body === undefined) continue;
    if (change.kind === "role") {
      const had = permissionsOf(change.before);
      const added = permissionsOf(change.body).filter((one) => !grants(had, one));
      const lacking = holds.lacking(added, place);
      if (lacking !== undefined) throw refusedToGive(lacking, place);
      continue;
    }
    const name = (change.body as { role: string }).role;
    let permissions = written.get(name);
    if (permissions === undefined) {
      // The most specific role with that name wins, as the binding finds it: the workspace's, the tenant's, then the built-in.
      const found = await db
        .selectFrom("role")
        .select("permissions")
        .where("name", "=", name)
        .where((eb) =>
          eb.or([
            eb("workspace_id", "=", workspace.id),
            eb.and([eb("tenant_id", "=", workspace.tenantId), eb("workspace_id", "is", null)]),
            eb("tenant_id", "is", null),
          ]),
        )
        .orderBy("workspace_id", (ob) => ob.asc().nullsLast())
        .orderBy("tenant_id", (ob) => ob.asc().nullsLast())
        .executeTakeFirst();
      permissions = found?.permissions ?? [];
    }
    const lacking = holds.lacking(permissions, place);
    if (lacking !== undefined) throw refusedToGive(lacking, place);
  }
}

/**
 * A deploy that changes who holds what needs the permission to say so: `role:write` for a role
 * added, changed or removed, and `binding:write` for a binding, as the workspace holds them.
 * A deploy that leaves roles and bindings as they are needs neither, so code ships every day
 * by an account that may only deploy. What it adds or changes is also held to "nobody gives
 * what they do not hold". Throws 403 naming the resource and the permission.
 */
export async function requireToChangeAccessByDeploy(
  db: Db | Trx,
  by: Principal,
  workspace: { id: string; tenantId: string },
  changes: readonly (AccessResourceChange & { change: "added" | "changed" | "removed" })[],
): Promise<void> {
  if (by.type === "system" || changes.length === 0) return;
  for (const kind of ["role", "binding"] as const) {
    const first = changes.find((one) => one.kind === kind);
    if (!first) continue;
    const permission = `${kind}:write`;
    const decision = await check(db, by, permission, {
      tenantId: workspace.tenantId,
      workspaceId: workspace.id,
    });
    if (!decision.allowed) {
      throw forbiddenBecause(
        `This deploy ${first.change === "added" ? "adds" : first.change === "removed" ? "removes" : "changes"} the ${kind} ${first.path}, which changes who holds what in this workspace. That needs ${permission}, which you do not hold here. Deploy it as someone who may, or leave roles and bindings as they are.`,
      );
    }
  }
  await requireToGiveByResources(db, by, workspace, changes);
}
