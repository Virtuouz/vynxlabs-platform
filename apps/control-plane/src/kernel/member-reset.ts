import { createHash, randomBytes } from "node:crypto";
import { newId } from "@volvel/db";
import { endSessions, isOperator } from "./administer.js";
import type { Audit, Db, Principal, Trx } from "./audit.js";
import { explainAccess, grants } from "./authorize.js";
import { checkPassword } from "./endusers.js";
import { badRequest, conflict, forbiddenBecause, HttpError, notFound } from "./errors.js";
import type { Kernel } from "./kernel.js";
import { memberPasswordRefusedBy } from "./sso/people.js";

/** How long a member's reset link works. The same as an end user's. */
export const MEMBER_RESET_HOURS = 2;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const gone = () =>
  new HttpError(
    410,
    "link_expired",
    "This link has been used or has run out. Ask the person who gave it to you for a new one.",
  );

/**
 * Makes the one-time link that lets a member choose a new password. A link made earlier and not
 * used stops working. Nobody sees the password: whoever opens the link chooses it.
 *
 * `tenantId` is the tenant an admin acts in. An admin may reset only a person who belongs to
 * their tenant and to no other, and who holds nothing at the instance: otherwise the link would
 * hand them a way into places they do not run, and an operator makes it.
 */
export async function makeMemberResetLink(
  trx: Trx,
  audit: Audit,
  input: { memberId: string; caller: Principal; tenantId?: string },
): Promise<{
  member: { id: string; email: string; name: string };
  token: string;
  expiresAt: Date;
}> {
  const member = await trx
    .selectFrom("member")
    .select(["id", "email", "name", "disabled_at"])
    .where("id", "=", input.memberId)
    .forUpdate()
    .executeTakeFirst();
  if (!member) throw notFound("The member");
  if (input.tenantId !== undefined) {
    const inTenant = await trx
      .selectFrom("tenant_member")
      .select("member_id")
      .where("tenant_id", "=", input.tenantId)
      .where("member_id", "=", member.id)
      .executeTakeFirst();
    if (!inTenant) throw notFound("The member");
  }
  if (member.id === input.caller.id) {
    throw badRequest("Change your own password on your Account screen.");
  }
  if (member.disabled_at) throw badRequest("This account is disabled. Enable it first.");
  if (input.tenantId !== undefined) {
    const elsewhere = await trx
      .selectFrom("tenant_member")
      .select("tenant_id")
      .where("member_id", "=", member.id)
      .where("tenant_id", "!=", input.tenantId)
      .executeTakeFirst();
    const atInstance = await trx
      .selectFrom("binding")
      .select("id")
      .where("scope_type", "=", "instance")
      .where("principal_type", "=", "member")
      .where("principal_id", "=", member.id)
      .executeTakeFirst();
    if (elsewhere || atInstance) {
      throw conflict(
        `${member.email} also belongs to another tenant or runs the instance, so only an operator can make a password link for them.`,
      );
    }
  }
  const tenants = (
    await trx
      .selectFrom("tenant_member")
      .select("tenant_id")
      .where("member_id", "=", member.id)
      .execute()
  ).map((row) => row.tenant_id);
  await mayMakeLinkFor(trx, input.caller, member.id, tenants, input.tenantId);
  const refusedBy = await memberPasswordRefusedBy(trx, member.email);
  if (refusedBy) {
    throw conflict(
      `${member.email} signs in with ${refusedBy.name}, and passwords are turned off for them. There is no password to reset.`,
    );
  }
  await trx
    .deleteFrom("member_password_token")
    .where("member_id", "=", member.id)
    .where("used_at", "is", null)
    .execute();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MEMBER_RESET_HOURS * 3_600_000);
  await trx
    .insertInto("member_password_token")
    .values({ id: newId(), member_id: member.id, token_hash: hash(token), expires_at: expiresAt })
    .execute();
  // Who made it (the entry names the caller), and for whom. Never the token. Each tenant the
  // member belongs to has the entry in its own log: the link is a way into all of them.
  for (const tenantId of tenants.length > 0 ? tenants : [undefined]) {
    await audit({
      action: "member.password_link_created",
      targetType: "member",
      targetId: member.id,
      ...(tenantId !== undefined ? { tenantId } : {}),
      details: { email: member.email },
    });
  }
  return { member, token, expiresAt };
}

/** Whether this operator holds an open access grant on each of these tenants. */
async function holdsGrantOn(trx: Trx, operatorId: string, tenants: readonly string[]) {
  if (tenants.length === 0 || !operatorId || !(await isOperator(trx, operatorId))) return false;
  const open = await trx
    .selectFrom("access_grant")
    .select("tenant_id")
    .where("member_id", "=", operatorId)
    .where("tenant_id", "in", [...tenants])
    .where("revoked_at", "is", null)
    .where("expires_at", ">", new Date())
    .execute();
  return new Set(open.map((row) => row.tenant_id)).size === tenants.length;
}

/**
 * A link is a way to sign in as the member, so it follows the rules for reaching their data.
 * An operator needs an open access grant on every tenant the member belongs to, as for any
 * other read or change there. In a tenant, whoever makes it must hold at least what the member
 * holds there (an operator under a grant is the exception, as the grant is its own rule), so
 * that a person who may manage members cannot take over the tenant's admin.
 */
async function mayMakeLinkFor(
  trx: Trx,
  caller: Principal,
  memberId: string,
  tenants: readonly string[],
  tenantId: string | undefined,
) {
  if (tenantId === undefined) {
    if (tenants.length > 0 && !(await holdsGrantOn(trx, caller.id ?? "", tenants))) {
      throw notFound("The member");
    }
    return;
  }
  if (await holdsGrantOn(trx, caller.id ?? "", [tenantId])) return;
  const permissionsOf = async (who: Principal) =>
    (await explainAccess(trx, who, tenantId))
      .filter((source) => source.counts)
      .flatMap((source) => source.role.permissions);
  const mine = await permissionsOf(caller);
  const theirs = await permissionsOf({ type: "member", id: memberId });
  if (theirs.some((held) => !grants(mine, held))) {
    throw forbiddenBecause(
      "That member holds more in this tenant than you do, so only someone who holds as much, or an operator with access to the tenant, can make their password link.",
    );
  }
}

/** Whose a link is, while it is still good. For showing the page. */
export async function readMemberResetToken(db: Db | Trx, token: string) {
  const found = await db
    .selectFrom("member_password_token")
    .innerJoin("member", "member.id", "member_password_token.member_id")
    .select(["member.email", "member.name", "member_password_token.expires_at"])
    .where("member_password_token.token_hash", "=", hash(token))
    .where("member_password_token.used_at", "is", null)
    .where("member_password_token.expires_at", ">", new Date())
    .where("member.disabled_at", "is", null)
    .executeTakeFirst();
  if (!found) throw gone();
  return found;
}

/**
 * Sets the password from a link, once. Every sign-in the member had ends, the console's and the
 * apps': a reset is what is done when someone else may know the old password.
 */
export async function setMemberPasswordWithToken(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  input: { token: string; password: string },
) {
  checkPassword(input.password);
  const taken = await trx
    .updateTable("member_password_token")
    .set({ used_at: new Date() })
    .where("token_hash", "=", hash(input.token))
    .where("used_at", "is", null)
    .where("expires_at", ">", new Date())
    .returning("member_id")
    .executeTakeFirst();
  if (!taken) throw gone();
  const member = await trx
    .selectFrom("member")
    .select(["id", "email", "disabled_at"])
    .where("id", "=", taken.member_id)
    .executeTakeFirst();
  if (!member || member.disabled_at) throw gone();
  const refusedBy = await memberPasswordRefusedBy(trx, member.email);
  if (refusedBy) {
    throw new HttpError(
      403,
      "sso_required",
      `Sign in with ${refusedBy.name}. Passwords are turned off for you.`,
    );
  }
  const passwordHash = await (await kernel.auth.$context).password.hash(input.password);
  const now = new Date();
  const updated = await trx
    .updateTable("member_account" as never)
    .set({ password: passwordHash, updated_at: now } as never)
    .where("member_id" as never, "=", member.id as never)
    .where("provider_id" as never, "=", "credential" as never)
    .returning("id" as never)
    .executeTakeFirst();
  // A member imported without a password has no credential account yet.
  if (!updated) {
    await trx
      .insertInto("member_account" as never)
      .values({
        id: newId(),
        member_id: member.id,
        account_id: member.id,
        provider_id: "credential",
        password: passwordHash,
        created_at: now,
        updated_at: now,
      } as never)
      .execute();
  }
  await trx
    .deleteFrom("member_password_token")
    .where("member_id", "=", member.id)
    .where("used_at", "is", null)
    .execute();
  await endSessions(trx, member.id, { console: true });
  await audit({ action: "member.password_reset", targetType: "member", targetId: member.id });
}
