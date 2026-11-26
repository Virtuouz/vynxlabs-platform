import { sql } from "@volvel/db";
import { APP_FACING_KINDS, grants, isExplicitKind } from "@volvel/manifest";
import type { Db, Principal, Trx } from "./audit.js";
import { forbiddenBecause } from "./errors.js";

export { grants, PERMISSION_PATTERN } from "@volvel/manifest";

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
 * The kinds of permission an app needs. An end user, and a member signed in to a
 * tenant's apps only, hold nothing outside this list whatever role they are bound to:
 * a binding made too wide cannot hand a portal user the tenant's settings or secrets.
 */
const APP_FACING = new Set(APP_FACING_KINDS);
export const appFacing = (permission: string) => APP_FACING.has(permission.split(":")[0] as string);

/**
 * Whether a role gives anything an app uses. Someone signed in as nobody, or as every end
 * user, holds nothing else, so a binding of a role without it to them gives nothing.
 */
export const holdsAppFacing = (permissions: readonly string[]) =>
  permissions.some((one) => one.startsWith("*:") || appFacing(one));

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
 * a flow there, but not the workspace. With no workspace: anywhere in the tenant. Such a binding lets an agent reach that
 * workspace's MCP server for the tools it was given, without reading the rest.
 */
export async function boundInside(
  db: Db | Trx,
  principal: Principal,
  tenantId: string,
  workspaceId?: string,
): Promise<boolean> {
  if (principal.type !== "member" && principal.type !== "service_account") return false;
  if (principal.type === "service_account" && principal.tenantId !== tenantId) return false;
  if (principal.appTenantId !== undefined) return false;
  const found = await sql`
    select 1 from binding b
    join resource r on r.id = b.resource_id
    where b.scope_type = 'resource' and b.tenant_id = ${tenantId}
      and ${workspaceId === undefined ? sql`true` : sql`r.workspace_id = ${workspaceId}`}
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
/**
 * What one request has already read to decide on a target. Neither read depends on the
 * permission asked, so a request that asks a dozen permissions at one place reads once.
 * It lives only as long as a request that changes nothing: a request that changes a binding
 * must see it changed.
 */
export type StandingMemo = Map<string, Promise<unknown>>;

function once<T>(memo: StandingMemo | undefined, key: string, read: () => Promise<T>): Promise<T> {
  if (!memo) return read();
  let known = memo.get(key) as Promise<T> | undefined;
  if (!known) {
    known = read();
    memo.set(key, known);
    // A read that failed is not kept: the next ask reads again.
    known.catch(() => memo.delete(key));
  }
  return known;
}

/** What `decide` needs of a row held at a place. */
interface Held {
  permissions: string[];
  principal_type: string | null;
  scope_type: string;
  access_grant_id: string | null;
}

/** The answer that needs no read, or nothing when the database has to be asked. */
function answerWithoutReading(
  principal: Principal,
  permission: string,
  target: Target,
): Decision | undefined {
  if (principal.type === "system") return { allowed: true, related: true };
  const tenantId = target.tenantId ?? null;
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
  return undefined;
}

/** Whether an access grant can count for this principal: an operator's, not one signed in to an app. */
const mayHoldGrant = (principal: Principal) =>
  principal.type === "member" && principal.appTenantId === undefined;

/**
 * The rules, once, for `check()` and `checkMany()`: what a principal is let do at a target,
 * given what is held there and whether they are suspended in its tenant. Reads nothing. For a
 * member refused with nothing held in a tenant, `askMembership` is set: whether they have any
 * standing there is for the caller to read, and `decision.related` is false until it has.
 */
function decide(
  principal: Principal,
  permission: string,
  target: Target,
  suspended: boolean,
  rows: readonly Held[],
): { decision: Decision; askMembership: boolean } {
  const tenantId = target.tenantId ?? null;
  const granting = rows.filter(
    (row) =>
      grants(row.permissions, permission) &&
      // A binding to anyone is for apps: whoever is calling, it gives nothing outside them.
      !(row.principal_type === "anonymous" && !appFacing(permission)) &&
      !(suspended && row.access_grant_id === null && row.scope_type !== "instance"),
  );
  // Prefer a standing binding over a grant, so ordinary access is not logged as operator access.
  const standing = granting.find((row) => row.access_grant_id === null);
  const viaGrant = granting.find((row) => row.access_grant_id !== null);

  let related = rows.some((row) => row.scope_type !== "instance");
  let askMembership = false;
  if (!related && tenantId !== null) {
    if (principal.type === "service_account" || principal.type === "end_user") {
      related = true;
    } else if (principal.type === "member") {
      askMembership = true;
    }
  }
  if (tenantId === null) related = true;

  if (standing) return { decision: { allowed: true, related: true }, askMembership: false };
  if (viaGrant?.access_grant_id) {
    return {
      decision: { allowed: true, related: true, accessGrantId: viaGrant.access_grant_id },
      askMembership: false,
    };
  }
  return { decision: { allowed: false, related }, askMembership };
}

export async function check(
  db: Db | Trx,
  principal: Principal,
  permission: string,
  target: Target,
  memo?: StandingMemo,
): Promise<Decision> {
  const early = answerWithoutReading(principal, permission, target);
  if (early) return early;

  const { tenantId = null, workspaceId = null, resourceId = null } = target;
  const instanceCounts = tenantId === null || target.orInstance === true;
  const id = principal.id;
  const appOnly = principal.type === "end_user" || principal.appTenantId !== undefined;
  // A member suspended in a tenant holds nothing there, by any binding or group, until resumed.
  // An operator's access grant is not membership, and is ended by itself.
  const place = JSON.stringify([tenantId, workspaceId, resourceId, instanceCounts]);
  let suspended = false;
  if (principal.type === "member" && tenantId !== null) {
    const membership = await once(memo, `suspended:${tenantId}`, () =>
      sql<{ suspended: boolean }>`
        select suspended_at is not null as suspended from tenant_member
        where tenant_id = ${tenantId} and member_id = ${id}
      `.execute(db),
    );
    suspended = membership.rows[0]?.suspended === true;
  }

  const principalMatch = matchPrincipal(principal);

  const held = await once(memo, `held:${place}`, () =>
    sql<Held>`
    select r.permissions, b.principal_type, b.scope_type, null::uuid as access_grant_id
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
    select r.permissions, null::text as principal_type, 'tenant' as scope_type, g.id as access_grant_id
    from access_grant g
    join role r on r.id = g.role_id
    where ${principal.type === "member" && !appOnly}
      and g.member_id = ${id}
      and g.tenant_id = ${tenantId}
      and g.revoked_at is null
      and g.expires_at > now()
      -- A grant is the operator's, and ends with being one: removed or disabled, it holds nothing.
      and exists (
        select 1 from binding ib
        join role ir on ir.id = ib.role_id
        join member im on im.id = ib.principal_id
        where ib.scope_type = 'instance' and ib.principal_type = 'member'
          and ib.principal_id = g.member_id and ir.name = 'operator_admin'
          and im.disabled_at is null
      )
  `.execute(db),
  );

  const { decision, askMembership } = decide(principal, permission, target, suspended, held.rows);
  if (!askMembership || tenantId === null) return decision;
  const membership = await once(memo, `related:${tenantId}`, () =>
    sql`
          select 1 from tenant_member where tenant_id = ${tenantId} and member_id = ${id}
          union all
          select 1 from binding b where b.tenant_id = ${tenantId} and ${principalMatch}
          limit 1
        `.execute(db),
  );
  return { ...decision, related: membership.rows.length > 0 };
}

/** A list of ids for an `in (...)`, or null, which matches nothing. */
const idList = (list: readonly string[]) =>
  list.length > 0 ? sql.join(list.map((one) => sql`${one}`)) : sql`null`;

/**
 * `check()` for many targets at once, one permission: the same answers, in a bounded number
 * of statements however many targets there are (one for suspension, one for what is held, one
 * for standing where nothing is held). Both go through `decide`, so the rules are written once.
 * For a list that says, row by row, what the caller may do. It keeps nothing between calls.
 */
export async function checkMany(
  db: Db | Trx,
  principal: Principal,
  permission: string,
  targets: readonly Target[],
): Promise<Decision[]> {
  const answers: (Decision | undefined)[] = targets.map((target) =>
    answerWithoutReading(principal, permission, target),
  );
  const pending = targets.flatMap((target, index) => (answers[index] ? [] : [{ target, index }]));
  if (pending.length === 0) return answers as Decision[];

  const id = principal.id;
  const named = (pick: (target: Target) => string | undefined) => [
    ...new Set(pending.flatMap(({ target }) => pick(target) ?? [])),
  ];
  const tenantIds = named((target) => target.tenantId);
  const workspaceIds = named((target) => target.workspaceId);
  const resourceIds = named((target) => target.resourceId);
  const anyInstance = pending.some(
    ({ target }) => (target.tenantId ?? null) === null || target.orInstance === true,
  );

  const suspendedIn = new Set<string>();
  if (principal.type === "member" && tenantIds.length > 0) {
    const rows = await sql<{ tenant_id: string; suspended: boolean }>`
      select tenant_id, suspended_at is not null as suspended from tenant_member
      where tenant_id in (${idList(tenantIds)}) and member_id = ${id}
    `.execute(db);
    for (const row of rows.rows) if (row.suspended) suspendedIn.add(row.tenant_id);
  }

  interface HeldAt extends Held {
    tenant_id: string | null;
    workspace_id: string | null;
    resource_id: string | null;
  }
  let heldRows: HeldAt[] = [];
  if (anyInstance || tenantIds.length > 0) {
    heldRows = (
      await sql<HeldAt>`
    select r.permissions, b.principal_type, b.scope_type, null::uuid as access_grant_id,
      b.tenant_id, b.workspace_id, b.resource_id
    from binding b
    join role r on r.id = b.role_id
    where ${matchPrincipal(principal)}
      and (
        (b.scope_type = 'instance' and ${anyInstance})
        or (
          b.tenant_id in (${idList(tenantIds)})
          and (
            b.scope_type = 'tenant'
            or (b.scope_type = 'workspace' and b.workspace_id in (${idList(workspaceIds)}))
            or (b.scope_type = 'resource' and b.resource_id in (${idList(resourceIds)}))
          )
        )
      )
    union all
    select r.permissions, null::text as principal_type, 'tenant' as scope_type, g.id as access_grant_id,
      g.tenant_id, null::uuid as workspace_id, null::uuid as resource_id
    from access_grant g
    join role r on r.id = g.role_id
    where ${mayHoldGrant(principal)}
      and g.member_id = ${id}
      and g.tenant_id in (${idList(tenantIds)})
      and g.revoked_at is null
      and g.expires_at > now()
      -- A grant is the operator's, and ends with being one: removed or disabled, it holds nothing.
      and exists (
        select 1 from binding ib
        join role ir on ir.id = ib.role_id
        join member im on im.id = ib.principal_id
        where ib.scope_type = 'instance' and ib.principal_type = 'member'
          and ib.principal_id = g.member_id and ir.name = 'operator_admin'
          and im.disabled_at is null
      )
  `.execute(db)
    ).rows;
  }

  const decided = pending.map(({ target, index }) => {
    const { tenantId = null, workspaceId = null, resourceId = null } = target;
    const instanceCounts = tenantId === null || target.orInstance === true;
    const rows = heldRows.filter((row) =>
      row.access_grant_id !== null
        ? tenantId !== null && row.tenant_id === tenantId
        : (row.scope_type === "instance" && instanceCounts) ||
          (tenantId !== null &&
            row.tenant_id === tenantId &&
            (row.scope_type === "tenant" ||
              (row.scope_type === "workspace" &&
                workspaceId !== null &&
                row.workspace_id === workspaceId) ||
              (row.scope_type === "resource" &&
                resourceId !== null &&
                row.resource_id === resourceId))),
    );
    const suspended = tenantId !== null && suspendedIn.has(tenantId);
    return { index, tenantId, ...decide(principal, permission, target, suspended, rows) };
  });

  const toAsk = [
    ...new Set(decided.flatMap((one) => (one.askMembership && one.tenantId ? one.tenantId : []))),
  ];
  const standingIn = new Set<string>();
  if (toAsk.length > 0) {
    const rows = await sql<{ tenant_id: string }>`
      select tenant_id from tenant_member
      where tenant_id in (${idList(toAsk)}) and member_id = ${id}
      union
      select b.tenant_id from binding b
      where b.tenant_id in (${idList(toAsk)}) and ${matchPrincipal(principal)}
    `.execute(db);
    for (const row of rows.rows) standingIn.add(row.tenant_id);
  }
  for (const one of decided) {
    answers[one.index] =
      one.askMembership && one.tenantId !== null
        ? { ...one.decision, related: standingIn.has(one.tenantId) }
        : one.decision;
  }
  return answers as Decision[];
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
        and exists (
          select 1 from binding ib
          join role ir on ir.id = ib.role_id
          join member im on im.id = ib.principal_id
          where ib.scope_type = 'instance' and ib.principal_type = 'member'
            and ib.principal_id = g.member_id and ir.name = 'operator_admin'
            and im.disabled_at is null
        )
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

/** Where inside a tenant something is given: the tenant when neither is set, else a workspace or one resource of it. */
export interface Place {
  workspaceId?: string | null | undefined;
  resourceId?: string | null | undefined;
}

/**
 * What a principal holds in a tenant, to answer, for a list of permissions at a place, which is
 * the first they do not hold. It is the one comparison behind "nobody gives what they do not
 * hold": a binding, a role, a group's members, a service account's key and a deploy that
 * changes who holds what are all held to it. What is held at a place is what the principal's
 * bindings and an operator's open access grant give there, at the tenant, the workspace or the
 * resource, the way `explainAccess` and `check()` read them. A wildcard counts as what it
 * covers and nothing more (`grants`): `*:*` does not give a permission that is only given by
 * its own name, and `binding:write` does not give `binding:*`. The system holds everything.
 * Reads once, then answers as often as asked.
 */
export async function holdingsIn(db: Db | Trx, principal: Principal, tenantId: string) {
  if (principal.type === "system") {
    return {
      lacking: (_wanted: readonly string[], _place?: Place): string | undefined => undefined,
    };
  }
  const appOnly = principal.type === "end_user" || principal.appTenantId !== undefined;
  const sources = (await explainAccess(db, principal, tenantId)).filter((source) => source.counts);
  return {
    lacking(wanted: readonly string[], place: Place = {}): string | undefined {
      const target: Target = {
        tenantId,
        workspaceId: place.workspaceId ?? undefined,
        resourceId: place.resourceId ?? undefined,
      };
      const held = sources
        .filter((source) => reaches(source, target))
        .flatMap((source) => source.role.permissions);
      // Someone signed in to apps only holds only what apps use, whatever they are bound to.
      // A permission that only its own name gives (production workspaces, SQL) is one nobody
      // holds by holding everything. Someone has to be able to give it all the same, and that is
      // whoever holds everything there: they could write the role that names it.
      const mayGive = (one: string) =>
        grants(held, one) || (isExplicitKind(one.split(":")[0] ?? "") && held.includes("*:*"));
      return wanted.find((one) => (appOnly && !appFacing(one)) || !mayGive(one));
    },
  };
}

/** Throws 403 naming the first of `wanted` that `principal` does not hold at `place`. */
export async function requireToGive(
  db: Db | Trx,
  principal: Principal,
  tenantId: string,
  wanted: readonly string[],
  place: Place = {},
): Promise<void> {
  const lacking = (await holdingsIn(db, principal, tenantId)).lacking(wanted, place);
  if (lacking !== undefined) throw refusedToGive(lacking, place);
}

/** The refusal for giving what one does not hold. */
export const refusedToGive = (permission: string, place: Place = {}) =>
  forbiddenBecause(
    `You do not hold ${permission} ${place.resourceId ? "on that resource" : place.workspaceId ? "in that workspace" : "in this tenant"}, so you cannot give it. A role, and a binding to one, gives only what the person who makes it holds.`,
  );
