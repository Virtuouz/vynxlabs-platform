import { sql } from "@vynxlabs/db";
import type { Db, Trx } from "../audit.js";

export interface Approvers {
  groups?: string[];
  roles?: string[];
}

/** The approvers a waiting step names, read from what the engine kept on it. */
export function approversOf(detail: Record<string, unknown>): Approvers | undefined {
  const named = detail.approvers as Approvers | undefined;
  if (!named) return undefined;
  const groups = (named.groups ?? []).filter((name) => typeof name === "string");
  const roles = (named.roles ?? []).filter((name) => typeof name === "string");
  return groups.length + roles.length > 0 ? { groups, roles } : undefined;
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
          and g.name in (${sql.join(groups)})
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
export function describeApprovers(approvers: Approvers | undefined): string | null {
  if (!approvers) return null;
  const parts = [
    ...(approvers.groups ?? []).map((name) => `the ${name} group`),
    ...(approvers.roles ?? []).map((name) => `the ${name} role`),
  ];
  if (parts.length === 0) return null;
  return parts.length === 1
    ? (parts[0] as string)
    : `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`;
}
