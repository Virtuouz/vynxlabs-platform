import { type Action, parseGroupPath } from "@volvel/manifest";
import { HttpError } from "../errors.js";
import type { RequestContext } from "../http.js";
import type { Kernel } from "../kernel.js";

/** "A", "A and B", "A, B and C". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The keys of the groups the caller is in: a member's groups, or an end user's. */
export async function callerGroupKeys(
  kernel: Kernel,
  tenantId: string,
  principal: { type: string; id: string | null },
): Promise<{ member: Set<string>; endUser: Set<string> }> {
  const out = { member: new Set<string>(), endUser: new Set<string>() };
  if (!principal.id) return out;
  if (principal.type === "member") {
    const rows = await kernel.db
      .selectFrom("group_member")
      .innerJoin("principal_group", "principal_group.id", "group_member.group_id")
      .select("principal_group.key")
      .where("group_member.member_id", "=", principal.id)
      .where("principal_group.tenant_id", "=", tenantId)
      .execute();
    for (const row of rows) out.member.add(row.key);
  } else if (principal.type === "end_user") {
    const rows = await kernel.db
      .selectFrom("end_user_group_member")
      .innerJoin("end_user_group", "end_user_group.id", "end_user_group_member.group_id")
      .select("end_user_group.key")
      .where("end_user_group_member.end_user_id", "=", principal.id)
      .where("end_user_group.tenant_id", "=", tenantId)
      .execute();
    for (const row of rows) out.endUser.add(row.key);
  }
  return out;
}

/** What each group path is called now: its title, or the key when the group is gone. */
async function groupTitles(
  kernel: Kernel,
  tenantId: string,
  paths: readonly string[],
): Promise<string[]> {
  const keys = paths.map((path) => parseGroupPath(path).key);
  const [members, endUsers] = await Promise.all([
    kernel.db
      .selectFrom("principal_group")
      .select(["key", "name"])
      .where("tenant_id", "=", tenantId)
      .where("key", "in", keys)
      .execute(),
    kernel.db
      .selectFrom("end_user_group")
      .select(["key", "name"])
      .where("tenant_id", "=", tenantId)
      .where("key", "in", keys)
      .execute(),
  ]);
  return paths.map((path) => {
    const { key, kind } = parseGroupPath(path);
    const pool = kind === "end_user" ? [endUsers, members] : [members, endUsers];
    for (const rows of pool) {
      const found = rows.find((row) => row.key === key);
      if (found) return found.name;
    }
    return key;
  });
}

/** Whether the caller is in one of the groups, named by their paths. A group that is gone matches nobody. */
export async function inGroups(
  kernel: Kernel,
  tenantId: string,
  principal: { type: string; id: string | null },
  paths: readonly string[],
): Promise<boolean> {
  const mine = await callerGroupKeys(kernel, tenantId, principal);
  return paths.some((path) => {
    const { key, kind } = parseGroupPath(path);
    if (kind === "member") return mine.member.has(key);
    if (kind === "end_user") return mine.endUser.has(key);
    return mine.member.has(key) || mine.endUser.has(key);
  });
}

/**
 * "Who can run it" (phase 28, decision 2): an action that names groups is run only by those who
 * are in one of them, a call made straight to the API too. It only narrows what the grant gives.
 */
export async function checkRunBy(
  kernel: Kernel,
  ctx: RequestContext,
  tenantId: string,
  action: Action,
): Promise<void> {
  const groups = action.runBy?.groups;
  if (!groups || groups.length === 0) return;
  if (await inGroups(kernel, tenantId, ctx.principal, groups)) return;
  const titles = await groupTitles(kernel, tenantId, groups);
  throw new HttpError(403, "forbidden", `Only ${listWords(titles)} can do this.`);
}

/** The signed-in person's email, for a row that is their own. */
export async function principalEmail(
  kernel: Kernel,
  tenantId: string,
  principal: { type: string; id: string | null; email?: string | undefined },
): Promise<string | undefined> {
  if (principal.email) return principal.email;
  if (!principal.id) return undefined;
  if (principal.type === "end_user") {
    const row = await kernel.db
      .selectFrom("end_user")
      .select("email")
      .where("id", "=", principal.id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    return row?.email;
  }
  if (principal.type === "member") {
    const row = await kernel.db
      .selectFrom("member")
      .select("email")
      .where("id", "=", principal.id)
      .executeTakeFirst();
    return row?.email;
  }
  return undefined;
}
