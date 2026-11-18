import { sql } from "@vynxlabs/db";
import type { Db, Trx } from "../audit.js";

export interface Approvers {
  /** As the flow names them: a group by its key, or by what it was called when the flow was written. */
  groups?: string[];
  roles?: string[];
  /**
   * Who that was when the step began to wait, by ID. A step that has these is
   * matched by them alone, so a group can be renamed while the step waits. A
   * step that began to wait before they were kept is matched by name.
   */
  ids?: {
    groups: string[];
    roles: string[];
    /**
     * Those that were not there to be found when the step began to wait: a group
     * made afterwards, say. They are still looked for, by key or by name.
     */
    later?: { groups: string[]; roles: string[] };
  };
}

/**
 * Who a step's approvers are, by ID, as the tenant is now. A group is named by
 * its key, or by what it is called. A role is every role of that name the
 * workspace can see: its own, the tenant's, and the one every tenant has.
 */
export async function resolveApprovers(
  db: Db | Trx,
  at: { tenantId: string; workspaceId: string },
  approvers: Approvers,
): Promise<{
  groups: string[];
  roles: string[];
  later: { groups: string[]; roles: string[] };
  unknown: string[];
}> {
  const groups: string[] = [];
  const unknown: string[] = [];
  const later = { groups: [] as string[], roles: [] as string[] };
  for (const named of approvers.groups ?? []) {
    const found = await db
      .selectFrom("principal_group")
      .select(["id", "key"])
      .where("tenant_id", "=", at.tenantId)
      .where((eb) => eb.or([eb("key", "=", named), eb("name", "=", named)]))
      .execute();
    // A key wins over another group that happens to be called the same.
    const group = found.find((one) => one.key === named) ?? found[0];
    if (group) groups.push(group.id);
    else {
      later.groups.push(named);
      unknown.push(`the group "${named}"`);
    }
  }
  const roles: string[] = [];
  for (const named of approvers.roles ?? []) {
    const found = await db
      .selectFrom("role")
      .select("id")
      .where("name", "=", named)
      .where((eb) =>
        eb.or([
          eb("workspace_id", "=", at.workspaceId),
          eb.and([eb("tenant_id", "=", at.tenantId), eb("workspace_id", "is", null)]),
          eb("tenant_id", "is", null),
        ]),
      )
      .execute();
    if (found.length > 0) roles.push(...found.map((one) => one.id));
    else {
      later.roles.push(named);
      unknown.push(`the role "${named}"`);
    }
  }
  return { groups: [...new Set(groups)], roles: [...new Set(roles)], later, unknown };
}

/** What each of a step's groups is called now, for saying who may decide it. */
export async function approverTitles(
  db: Db | Trx,
  approvers: Approvers | undefined,
): Promise<string[] | undefined> {
  const ids = approvers?.ids?.groups ?? [];
  if (!approvers?.ids) return undefined;
  const later = approvers.ids.later?.groups ?? [];
  if (ids.length === 0) return later.length > 0 ? later : undefined;
  const rows = await db
    .selectFrom("principal_group")
    .select(["id", "name"])
    .where("id", "in", ids)
    .execute();
  return [
    ...ids.map((id) => rows.find((row) => row.id === id)?.name ?? "a deleted group"),
    ...later,
  ];
}

/** The approvers a waiting step names, read from what the engine kept on it. */
export function approversOf(detail: Record<string, unknown>): Approvers | undefined {
  const named = detail.approvers as Approvers | undefined;
  if (!named) return undefined;
  const groups = (named.groups ?? []).filter((name) => typeof name === "string");
  const roles = (named.roles ?? []).filter((name) => typeof name === "string");
  if (groups.length + roles.length === 0) return undefined;
  const ids = detail.approverIds as Approvers["ids"] | undefined;
  return {
    groups,
    roles,
    ...(ids && Array.isArray(ids.groups) && Array.isArray(ids.roles) ? { ids } : {}),
  };
}

/**
 * Whether a member is among a step's approvers: in one of its groups, or bound
 * to one of its roles over the tenant or this workspace, directly or through a
 * group. A step that names nobody is open to anyone holding the permission, so
 * the answer for it is yes.
 */
export async function isApprover(
  db: Db | Trx,
  at: { tenantId: string; workspaceId: string },
  memberId: string | null,
  approvers: Approvers | undefined,
): Promise<boolean> {
  if (!approvers) return true;
  if (!memberId) return false;
  if (approvers.ids) {
    const { groups: groupIds, roles: roleIds } = approvers.ids;
    const byId = await sql<{ yes: boolean }>`
      select (
        ${
          groupIds.length > 0
            ? sql`exists (
          select 1 from group_member m
          where m.member_id = ${memberId} and m.group_id in (${sql.join(groupIds)})
        )`
            : sql`false`
        }
        or
        ${
          roleIds.length > 0
            ? sql`exists (
          select 1 from binding b
          where b.role_id in (${sql.join(roleIds)})
            and b.tenant_id = ${at.tenantId}
            and (b.scope_type = 'tenant' or (b.scope_type = 'workspace' and b.workspace_id = ${at.workspaceId}))
            and (
              (b.principal_type = 'member' and b.principal_id = ${memberId})
              or (b.principal_type = 'group' and b.principal_id in (
                select group_id from group_member where member_id = ${memberId}
              ))
            )
        )`
            : sql`false`
        }
      ) as yes
    `.execute(db);
    if (byId.rows[0]?.yes) return true;
    const later = approvers.ids.later;
    if (!later || later.groups.length + later.roles.length === 0) return false;
    // What was not there when the step began to wait is looked for now, as it was named.
    return isApprover(db, at, memberId, { groups: later.groups, roles: later.roles });
  }
  const groups = approvers.groups ?? [];
  const roles = approvers.roles ?? [];
  const found = await sql<{ yes: boolean }>`
    select (
      ${
        groups.length > 0
          ? sql`exists (
        select 1 from principal_group g
        join group_member m on m.group_id = g.id
        where g.tenant_id = ${at.tenantId} and m.member_id = ${memberId}
          and (g.key in (${sql.join(groups)}) or g.name in (${sql.join(groups)}))
      )`
          : sql`false`
      }
      or
      ${
        roles.length > 0
          ? sql`exists (
        select 1 from binding b
        join role r on r.id = b.role_id
        where r.name in (${sql.join(roles)})
          and b.tenant_id = ${at.tenantId}
          and (b.scope_type = 'tenant' or (b.scope_type = 'workspace' and b.workspace_id = ${at.workspaceId}))
          and (
            (b.principal_type = 'member' and b.principal_id = ${memberId})
            or (b.principal_type = 'group' and b.principal_id in (
              select group_id from group_member where member_id = ${memberId}
            ))
          )
      )`
          : sql`false`
      }
    ) as yes
  `.execute(db);
  return Boolean(found.rows[0]?.yes);
}

/** "the Finance group or the approver role": the approvers in words. */
export function describeApprovers(
  approvers: Approvers | undefined,
  /** What the groups are called now, from `approverTitles`. Without it, as the flow names them. */
  titles?: string[],
): string | null {
  if (!approvers) return null;
  const parts = [
    ...(titles ?? approvers.groups ?? []).map((name) => `the ${name} group`),
    ...(approvers.roles ?? []).map((name) => `the ${name} role`),
  ];
  if (parts.length === 0) return null;
  return parts.length === 1
    ? (parts[0] as string)
    : `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`;
}

/** The most approvers one step's mail goes to. */
export const MAX_ASKED = 50;

/**
 * The members who may decide a step now, with where to write to them: those
 * the approve route would let decide it. Members of the tenant who are not
 * suspended or disabled, who hold `approval:write` in the workspace and, when
 * the step names approvers, are among them. At most `MAX_ASKED`.
 */
export async function approverMembers(
  db: Db | Trx,
  at: { tenantId: string; workspaceId: string },
  approvers: Approvers | undefined,
): Promise<{ members: { id: string; name: string; email: string }[]; more: boolean }> {
  const { check } = await import("../authorize.js");
  const candidates = await db
    .selectFrom("tenant_member")
    .innerJoin("member", "member.id", "tenant_member.member_id")
    .select(["member.id", "member.name", "member.email"])
    .where("tenant_member.tenant_id", "=", at.tenantId)
    .where("tenant_member.suspended_at", "is", null)
    .where("member.disabled_at", "is", null)
    .orderBy("member.email")
    .limit(2000)
    .execute();
  const members: { id: string; name: string; email: string }[] = [];
  let more = false;
  for (const candidate of candidates) {
    const may = await check(db, { type: "member", id: candidate.id }, "approval:write", at);
    if (!may.allowed || may.accessGrantId) continue;
    if (!(await isApprover(db, at, candidate.id, approvers))) continue;
    if (members.length >= MAX_ASKED) {
      more = true;
      break;
    }
    members.push({
      id: candidate.id,
      name: candidate.name || candidate.email,
      email: candidate.email,
    });
  }
  return { members, more };
}
