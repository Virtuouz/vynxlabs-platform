import { sql } from "@vynxlabs/db";
import { APP_FACING_KINDS, isExplicitKind } from "@vynxlabs/manifest";
import type { Db, Principal, Trx } from "./audit.js";

export { PERMISSION_PATTERN } from "@vynxlabs/manifest";

export interface Target {
  tenantId?: string | undefined;
  workspaceId?: string | undefined;
  resourceId?: string | undefined;
  /**
   * Also accept an instance-scope binding. Only for records the operator
   * manages, such as the tenant record itself. Never for tenant data.
   */
  orInstance?: boolean;
}

export interface Decision {
  allowed: boolean;
  /** Set when access came through an operator access grant. */
  accessGrantId?: string;
  /**
   * Whether the principal has any standing in the tenant at all. When false,
   * the caller should answer as if the tenant did not exist.
   */
  related: boolean;
}

/**
 * Whether a role's permission list grants `kind:verb`. A permission marked
 * explicit is granted only by its own name: no `*` reaches it, so nobody holds
 * it by having been given everything.
 */
export function grants(permissions: readonly string[], permission: string): boolean {
  const [kind, verb] = permission.split(":");
  if (isExplicitKind(kind ?? "")) return permissions.includes(permission);
  return permissions.some((held) => {
    const [heldKind, heldVerb] = held.split(":");
    return (heldKind === "*" || heldKind === kind) && (heldVerb === "*" || heldVerb === verb);
  });
}

/**
 * The kinds of permission an app needs. An end user, and a member signed in to a
 * tenant's apps only, hold nothing outside this list whatever role they are bound to:
 * a binding made too wide cannot hand a portal user the tenant's settings or secrets.
 */
const APP_FACING = new Set(APP_FACING_KINDS);
export const appFacing = (permission: string) => APP_FACING.has(permission.split(":")[0] as string);

interface Held {
  permissions: string[];
  scope_type: string;
  access_grant_id: string | null;
}

/** The bindings that name `principal`, directly, through a group, or as anyone. `b` is the binding. */
function matchPrincipal(principal: Principal) {
  const id = principal.id;
  return principal.type === "member"
    ? sql`(
        (b.principal_type = 'member' and b.principal_id = ${id})
        or (b.principal_type = 'group' and b.principal_id in (
          select group_id from group_member where member_id = ${id}
        ))
        or b.principal_type = 'anonymous'
      )`
    : principal.type === "service_account"
      ? sql`(
          (b.principal_type = 'service_account' and b.principal_id = ${id})
          or b.principal_type = 'anonymous'
        )`
      : principal.type === "end_user"
        ? sql`(
            (b.principal_type = 'end_user' and b.principal_id = ${id})
            or (b.principal_type = 'end_user_group' and b.principal_id in (
              select group_id from end_user_group_member where end_user_id = ${id}
            ))
            or b.principal_type in ('end_users', 'anonymous')
          )`
        : sql`b.principal_type = 'anonymous'`;
}

/**
 * Whether `principal` is bound to anything in a workspace by itself: a script or
 * a flow there, but not the workspace. Such a binding lets an agent reach that
 * workspace's MCP server for the tools it was given, without reading the rest.
 */
export async function boundInside(
  db: Db | Trx,
  principal: Principal,
  tenantId: string,
  workspaceId: string,
): Promise<boolean> {
  if (principal.type !== "member" && principal.type !== "service_account") return false;
  if (principal.type === "service_account" && principal.tenantId !== tenantId) return false;
  if (principal.appTenantId !== undefined) return false;
  const found = await sql`
    select 1 from binding b
    join resource r on r.id = b.resource_id
    where b.scope_type = 'resource' and b.tenant_id = ${tenantId} and r.workspace_id = ${workspaceId}
      and b.principal_type <> 'anonymous' and ${matchPrincipal(principal)}
      and not exists (
        select 1 from tenant_member m
        where m.tenant_id = ${tenantId} and m.member_id = ${principal.id}
          and m.suspended_at is not null
      )
    limit 1
  `.execute(db);
  return found.rows.length > 0;
}

/**
 * The one authorization check. Every route goes through it.
 *
 * Inside a tenant, a principal's bindings count at tenant scope, at the
 * target's workspace and at the target's resource. An instance-scope binding
 * never reaches inside a tenant. An operator gets in only through an active
 * access grant.
 */
export async function check(
  db: Db | Trx,
  principal: Principal,
  permission: string,
  target: Target,
): Promise<Decision> {
  if (principal.type === "system") return { allowed: true, related: true };

  const { tenantId = null, workspaceId = null, resourceId = null } = target;
  const instanceCounts = tenantId === null || target.orInstance === true;
  const id = principal.id;
  // A service account has no standing outside its own tenant. Nor has an end user.
  if (
    (principal.type === "service_account" || principal.type === "end_user") &&
    principal.tenantId !== tenantId
  ) {
    return { allowed: false, related: false };
  }
  const appOnly = principal.type === "end_user" || principal.appTenantId !== undefined;
  if (principal.appTenantId !== undefined && principal.appTenantId !== tenantId) {
    return { allowed: false, related: false };
  }
  if (appOnly && !appFacing(permission)) return { allowed: false, related: true };
  // A member suspended in a tenant holds nothing there, by any binding or group, until resumed.
  // An operator's access grant is not membership, and is ended by itself.
  let suspended = false;
  if (principal.type === "member" && tenantId !== null) {
    const membership = await sql<{ suspended: boolean }>`
      select suspended_at is not null as suspended from tenant_member
      where tenant_id = ${tenantId} and member_id = ${id}
    `.execute(db);
    suspended = membership.rows[0]?.suspended === true;
  }

  const principalMatch = matchPrincipal(principal);

  const held = await sql<Held>`
    select r.permissions, b.scope_type, null::uuid as access_grant_id
    from binding b
    join role r on r.id = b.role_id
    where ${principalMatch}
      and (
        (b.scope_type = 'instance' and ${instanceCounts})
        or (
          ${tenantId}::uuid is not null and b.tenant_id = ${tenantId}
          and (
            b.scope_type = 'tenant'
            or (b.scope_type = 'workspace' and b.workspace_id = ${workspaceId})
            or (b.scope_type = 'resource' and b.resource_id = ${resourceId})
          )
        )
      )
    union all
    select r.permissions, 'tenant' as scope_type, g.id as access_grant_id
    from access_grant g
    join role r on r.id = g.role_id
    where ${principal.type === "member" && !appOnly}
      and g.member_id = ${id}
      and g.tenant_id = ${tenantId}
      and g.revoked_at is null
      and g.expires_at > now()
  `.execute(db);

  const granting = held.rows.filter(
    (row) =>
      grants(row.permissions, permission) &&
      !(suspended && row.access_grant_id === null && row.scope_type !== "instance"),
  );
  // Prefer a standing binding over a grant, so ordinary access is not logged as operator access.
  const standing = granting.find((row) => row.access_grant_id === null);
  const viaGrant = granting.find((row) => row.access_grant_id !== null);

  let related = held.rows.some((row) => row.scope_type !== "instance");
  if (!related && tenantId !== null) {
    if (principal.type === "service_account" || principal.type === "end_user") {
      related = true;
    } else if (principal.type === "member") {
      const membership = await sql`
        select 1 from tenant_member where tenant_id = ${tenantId} and member_id = ${id}
        union all
        select 1 from binding b where b.tenant_id = ${tenantId} and ${principalMatch}
        limit 1
      `.execute(db);
      related = membership.rows.length > 0;
    }
  }
  if (tenantId === null) related = true;

  if (standing) return { allowed: true, related: true };
  if (viaGrant?.access_grant_id) {
    return { allowed: true, related: true, accessGrantId: viaGrant.access_grant_id };
  }
  return { allowed: false, related };
}

/** One thing that gives a principal permissions in a tenant, as `explainAccess` finds it. */
export interface AccessSource {
  source: "binding" | "access_grant";
  /** The binding's id, or the access grant's. */
  id: string;
  role: { id: string; name: string; permissions: string[] };
  scope:
    | { type: "tenant" }
    | { type: "workspace"; workspaceId: string; workspaceName: string }
    | {
        type: "resource";
        resourceId: string;
        workspaceId: string;
        workspaceName: string;
        kind: string;
        path: string;
      };
  /** How the binding names the principal: directly, through a group, or as anyone. */
  through: { type: "direct" } | { type: "group"; id: string; name: string } | { type: "anyone" };
  /** When an access grant ends. */
  expiresAt: Date | null;
  /** False for a suspended member's bindings: `check()` does not count them. */
  counts: boolean;
}

/**
 * Everything that gives a member or service account permissions inside a
 * tenant, and how: the rows `check()` reads, with what they are. The same
 * match, so what this shows and what `check()` allows cannot part ways.
 */
export async function explainAccess(
  db: Db | Trx,
  principal: Principal,
  tenantId: string,
): Promise<AccessSource[]> {
  if (principal.type !== "member" && principal.type !== "service_account") return [];
  if (principal.type === "service_account" && principal.tenantId !== tenantId) return [];
  let suspended = false;
  if (principal.type === "member") {
    const membership = await sql<{ suspended: boolean }>`
      select suspended_at is not null as suspended from tenant_member
      where tenant_id = ${tenantId} and member_id = ${principal.id}
    `.execute(db);
    suspended = membership.rows[0]?.suspended === true;
  }
  const bindings = await sql<{
    id: string;
    role_id: string;
    role_name: string;
    permissions: string[];
    scope_type: "tenant" | "workspace" | "resource";
    workspace_id: string | null;
    workspace_name: string | null;
    resource_id: string | null;
    resource_kind: string | null;
    resource_path: string | null;
    resource_workspace_id: string | null;
    resource_workspace_name: string | null;
    principal_type: string;
    principal_id: string | null;
    group_name: string | null;
  }>`
    select b.id, b.role_id, r.name as role_name, r.permissions, b.scope_type,
      b.workspace_id, w.name as workspace_name,
      b.resource_id, res.kind as resource_kind, res.path as resource_path,
      res.workspace_id as resource_workspace_id, rw.name as resource_workspace_name,
      b.principal_type, b.principal_id, g.name as group_name
    from binding b
    join role r on r.id = b.role_id
    left join workspace w on w.id = b.workspace_id
    left join resource res on res.id = b.resource_id
    left join workspace rw on rw.id = res.workspace_id
    left join principal_group g on b.principal_type = 'group' and g.id = b.principal_id
    where ${matchPrincipal(principal)}
      and b.tenant_id = ${tenantId}
      and b.scope_type in ('tenant', 'workspace', 'resource')
    order by b.scope_type, r.name, b.created_at
  `.execute(db);
  const sources: AccessSource[] = bindings.rows.map((row) => ({
    source: "binding",
    id: row.id,
    role: { id: row.role_id, name: row.role_name, permissions: row.permissions },
    scope:
      row.scope_type === "tenant"
        ? { type: "tenant" }
        : row.scope_type === "workspace"
          ? {
              type: "workspace",
              workspaceId: row.workspace_id as string,
              workspaceName: row.workspace_name ?? "",
            }
          : {
              type: "resource",
              resourceId: row.resource_id as string,
              workspaceId: row.resource_workspace_id ?? "",
              workspaceName: row.resource_workspace_name ?? "",
              kind: row.resource_kind ?? "",
              path: row.resource_path ?? "",
            },
    through:
      row.principal_type === "group"
        ? { type: "group", id: row.principal_id as string, name: row.group_name ?? "" }
        : row.principal_type === "anonymous"
          ? { type: "anyone" }
          : { type: "direct" },
    expiresAt: null,
    counts: !suspended,
  }));
  if (principal.type === "member" && principal.appTenantId === undefined) {
    const granted = await sql<{
      id: string;
      role_id: string;
      role_name: string;
      permissions: string[];
      expires_at: Date;
    }>`
      select g.id, g.role_id, r.name as role_name, r.permissions, g.expires_at
      from access_grant g
      join role r on r.id = g.role_id
      where g.member_id = ${principal.id} and g.tenant_id = ${tenantId}
        and g.revoked_at is null and g.expires_at > now()
    `.execute(db);
    for (const row of granted.rows) {
      sources.push({
        source: "access_grant",
        id: row.id,
        role: { id: row.role_id, name: row.role_name, permissions: row.permissions },
        scope: { type: "tenant" },
        through: { type: "direct" },
        expiresAt: row.expires_at,
        // An operator's access grant is not membership, and holds while the member is suspended.
        counts: true,
      });
    }
  }
  return sources;
}

/** Whether a source reaches a target: a tenant binding everywhere in it, others where they are. */
export function reaches(source: AccessSource, target: Target): boolean {
  if (source.scope.type === "tenant") return true;
  if (source.scope.type === "workspace") return source.scope.workspaceId === target.workspaceId;
  return source.scope.resourceId === target.resourceId;
}
