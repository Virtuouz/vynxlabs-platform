import { sql } from "@vynxlabs/db";
import { APP_FACING_KINDS } from "@vynxlabs/manifest";
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

/** Whether a role's permission list grants `kind:verb`. */
export function grants(permissions: readonly string[], permission: string): boolean {
  const [kind, verb] = permission.split(":");
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
const appFacing = (permission: string) => APP_FACING.has(permission.split(":")[0] as string);

interface Held {
  permissions: string[];
  scope_type: string;
  access_grant_id: string | null;
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

  const principalMatch =
    principal.type === "member"
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
