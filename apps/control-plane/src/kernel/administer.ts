import { sql } from "@volvel/db";
import type { Audit, Db, Trx } from "./audit.js";
import { grants } from "./authorize.js";
import { conflict } from "./errors.js";
import { INSTANCE_ONLY_ROLE } from "./kinds.js";
import { endStreamsOf } from "./stream.js";

/**
 * The guard for "someone can still administer". A change that would leave a tenant
 * with nobody who can change its access, or an instance with no operator who can
 * sign in, is refused whole: every route, SCIM and the releases go through these
 * two, so that the rule is in one place.
 *
 * Each runs the change between two counts, under a lock that two requests at once
 * must take in turn, so that two people who remove each other cannot both succeed.
 * A tenant or instance that has nobody before the change (an operator's grant is
 * all it has) is not blocked from a change: the guard only refuses to take the last.
 */

/** The permission that lets someone put access right again. */
const ADMINISTER = "binding:write";

/** Members who can change a tenant's access: enabled, not suspended there, bound directly or through a group. */
export const tenantAdmins = (db: Db | Trx, tenantId: string) =>
  tenantHolders(db, tenantId, ADMINISTER);

/**
 * Members who hold a permission at the tenant's scope as `check()` would let them: enabled,
 * not suspended in the tenant, bound directly or through a group.
 */
export async function tenantHolders(
  db: Db | Trx,
  tenantId: string,
  permission: string,
): Promise<string[]> {
  const rows = await sql<{ member_id: string; permissions: string[] }>`
    select m.id as member_id, r.permissions
    from binding b
    join role r on r.id = b.role_id
    join member m on (
      (b.principal_type = 'member' and m.id = b.principal_id)
      or (b.principal_type = 'group' and m.id in (
        select gm.member_id from group_member gm where gm.group_id = b.principal_id
      ))
    )
    join tenant_member tm on tm.tenant_id = b.tenant_id and tm.member_id = m.id
    where b.tenant_id = ${tenantId} and b.scope_type = 'tenant'
      and m.disabled_at is null and tm.suspended_at is null
  `.execute(db);
  return [
    ...new Set(
      rows.rows.filter((row) => grants(row.permissions, permission)).map((row) => row.member_id),
    ),
  ];
}

/** Runs `change`, and refuses it when it takes a tenant's last person who can administer. */
export async function keepingAnAdmin<T>(
  trx: Trx,
  tenantId: string,
  change: () => Promise<T>,
  refusal = "That would leave the tenant with nobody who can change its access. Give someone else the tenant admin role first.",
): Promise<T> {
  await sql`select id from tenant where id = ${tenantId} for update`.execute(trx);
  const before = (await tenantAdmins(trx, tenantId)).length;
  const result = await change();
  if (before > 0 && (await tenantAdmins(trx, tenantId)).length === 0) throw conflict(refusal);
  return result;
}

/** Members who can sign in and are bound `operator_admin` at the instance. */
export async function operators(db: Db | Trx): Promise<string[]> {
  const rows = await sql<{ id: string }>`
    select distinct m.id
    from binding b
    join role r on r.id = b.role_id
    join member m on m.id = b.principal_id
    where b.scope_type = 'instance' and b.principal_type = 'member'
      and r.name = ${INSTANCE_ONLY_ROLE} and m.disabled_at is null
  `.execute(db);
  return rows.rows.map((row) => row.id);
}

/** Of these members, those who are operators: enabled and `operator_admin`, not merely bound to something at the instance. */
export async function operatorsAmong(
  db: Db | Trx,
  memberIds: readonly string[],
): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const all = new Set(await operators(db));
  return memberIds.filter((id) => all.has(id));
}

export const isOperator = async (db: Db | Trx, memberId: string) =>
  (await operatorsAmong(db, [memberId])).length > 0;

/** Runs `change`, and refuses it when it leaves the instance with no operator who can sign in. */
export async function keepingAnOperator<T>(
  trx: Trx,
  change: () => Promise<T>,
  refusal = "That would leave the instance with no operator who can sign in. Make someone else an operator first.",
): Promise<T> {
  await sql`select pg_advisory_xact_lock(hashtext('volvel:operators'))`.execute(trx);
  const before = (await operators(trx)).length;
  const result = await change();
  if (before > 0 && (await operators(trx)).length === 0) throw conflict(refusal);
  return result;
}

/**
 * Ends what a person's sign-in held: console sessions (only when the account itself is
 * disabled), sign-ins to a tenant's apps and their pending hand-offs. With `tenantId`, only
 * that tenant's. One place that says a disabled or removed person's sign-ins have ended.
 */
export async function endSessions(
  trx: Trx,
  memberId: string,
  scope: { tenantId?: string; console?: boolean } = {},
): Promise<void> {
  if (scope.console ?? scope.tenantId === undefined) {
    await trx.deleteFrom("member_session").where("member_id", "=", memberId).execute();
  }
  let sessions = trx
    .deleteFrom("app_session")
    .where("principal_type", "=", "member")
    .where("principal_id", "=", memberId);
  let handoffs = trx.deleteFrom("app_handoff").where("member_id", "=", memberId);
  if (scope.tenantId !== undefined) {
    sessions = sessions.where("tenant_id", "=", scope.tenantId);
    handoffs = handoffs.where("tenant_id", "=", scope.tenantId);
  }
  await sessions.execute();
  await handoffs.execute();
  if (scope.tenantId === undefined) {
    // A sign-in through a provider that was started and not finished must not finish.
    await trx
      .deleteFrom("sso_state")
      .where("principal_id", "=", memberId)
      .where("finished_at", "is", null)
      .execute();
  }
  await endStreamsOf(trx, `member:${memberId}`, scope.tenantId);
}

/**
 * Ends an end user's sign-ins to the tenant's apps, the sign-ins through a provider they started
 * and did not finish, and their open event streams, on every replica. For disabling them, by
 * hand or by a directory.
 */
export async function endEndUserSignIns(trx: Trx, endUserId: string): Promise<void> {
  await trx
    .deleteFrom("app_session")
    .where("principal_type", "=", "end_user")
    .where("principal_id", "=", endUserId)
    .execute();
  await trx
    .deleteFrom("sso_state")
    .where("principal_id", "=", endUserId)
    .where("finished_at", "is", null)
    .execute();
  await endStreamsOf(trx, `end_user:${endUserId}`);
}

/**
 * Ends a member's open operator access grants when they are no longer an operator who can
 * open them, in each tenant, audited. Called wherever an operator's standing can end.
 */
export async function endOperatorGrantsIfNoLonger(
  trx: Trx,
  audit: Audit,
  memberId: string,
  revokedBy: string | null,
): Promise<number> {
  if (await isOperator(trx, memberId)) return 0;
  const ended = await trx
    .updateTable("access_grant")
    .set({ revoked_at: new Date(), revoked_by: revokedBy })
    .where("member_id", "=", memberId)
    .where("revoked_at", "is", null)
    .where("expires_at", ">", new Date())
    .returning(["id", "tenant_id"])
    .execute();
  for (const grant of ended) {
    await audit({
      action: "access_grant.revoked",
      targetType: "access_grant",
      targetId: grant.id,
      tenantId: grant.tenant_id,
      details: { reason: "The person is no longer an operator." },
    });
  }
  return ended.length;
}
