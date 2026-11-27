import { endSessions } from "./administer.js";
import type { Audit, Principal, Trx } from "./audit.js";
import { holdsInstanceAccess, memberPasswordRefusedBy } from "./sso/people.js";

/** Why an account's earlier sign-ins were ended. Written in the entry. */
export type SignInsEnded =
  | "password_reset"
  | "operator_recovered"
  | "single_sign_on_tie"
  | "last_membership_removed"
  | "gained_a_place";

/**
 * Ends what could sign in as an account before now: every session (the console's and the apps'),
 * the API keys that act as the person (a key of a service account belongs to its tenant, not to
 * a person, and is left alone), and their recovery codes. With `password`, the password too.
 * The product has no passkeys or other second factors.
 *
 * It is for the moments when someone who proved they own the account, or an operator, chooses
 * how it is entered from now on: whatever was made under the old way of entering it must not
 * carry over. An entry in the log of each tenant the account belongs to says what was ended.
 */
export async function endEarlierSignIns(
  trx: Trx,
  audit: Audit,
  memberId: string,
  why: SignInsEnded,
  options: {
    password?: boolean;
    /** Tenants to write the entry in besides those the account belongs to (it was just removed from one). */
    alsoTenants?: readonly string[];
  } = {},
): Promise<{ apiKeys: number; recoveryCodes: number }> {
  await endSessions(trx, memberId, { console: true });
  const keys = await trx
    .updateTable("api_key")
    .set({ revoked_at: new Date() })
    .where("owner_type", "=", "member")
    .where("owner_id", "=", memberId)
    .where("revoked_at", "is", null)
    .returning("id")
    .execute();
  const codes = await trx
    .deleteFrom("member_recovery_code")
    .where("member_id", "=", memberId)
    .returning("id")
    .execute();
  if (options.password) {
    await trx
      .deleteFrom("member_account" as never)
      .where("member_id" as never, "=", memberId as never)
      .where("provider_id" as never, "=", "credential" as never)
      .execute();
    // That password is gone, and so is the record of who chose it.
    await trx
      .updateTable("member")
      .set({ password_set_by_type: null, password_set_by_id: null })
      .where("id", "=", memberId)
      .execute();
  }
  const tenants = new Set([
    ...(
      await trx
        .selectFrom("tenant_member")
        .select("tenant_id")
        .where("member_id", "=", memberId)
        .execute()
    ).map((row) => row.tenant_id),
    ...(options.alsoTenants ?? []),
  ]);
  const details = {
    reason: why,
    apiKeysEnded: keys.length,
    recoveryCodesEnded: codes.length,
    ...(options.password ? { passwordEnded: true } : {}),
  };
  for (const tenantId of tenants.size > 0 ? tenants : [undefined]) {
    await audit({
      action: "member.sign_ins_ended",
      targetType: "member",
      targetId: memberId,
      ...(tenantId !== undefined ? { tenantId } : {}),
      details,
    });
  }
  return { apiKeys: keys.length, recoveryCodes: codes.length };
}

/**
 * An account that belongs to no tenant any more, and holds nothing at the instance, keeps
 * nothing that can sign in: the next tenant to add that email starts from an account that
 * nobody can enter until its owner sets a password through a link. The account itself is
 * kept, as it is everywhere else (no route deletes one, and a directory only turns it off).
 */
export async function stripIfNoMembership(
  trx: Trx,
  audit: Audit,
  memberId: string,
  removedFrom: readonly string[] = [],
): Promise<boolean> {
  const left = await trx
    .selectFrom("tenant_member")
    .select("tenant_id")
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  if (left || (await holdsInstanceAccess(trx, memberId))) return false;
  await endEarlierSignIns(trx, audit, memberId, "last_membership_removed", {
    password: true,
    alsoTenants: removedFrom,
  });
  return true;
}

/**
 * Called when an account has just been tied to a single sign-on identity. The first tie of an
 * account ends what could sign in as it before (sessions, personal keys, recovery codes): whoever
 * made the account, with a password of their own, must not keep a way in once the person's own
 * provider has vouched for them. Where a provider that is required covers the person's email, the
 * password goes too (an operator keeps theirs, as everywhere); where it is not required, the
 * password stays beside single sign-on.
 */
export async function endSignInsOnFirstTie(
  trx: Trx,
  audit: Audit,
  memberId: string,
  email: string,
): Promise<boolean> {
  const links = await trx
    .selectFrom("identity_link")
    .select("id")
    .where("principal_type", "=", "member")
    .where("principal_id", "=", memberId)
    .execute();
  if (links.length !== 1) return false;
  const required = await memberPasswordRefusedBy(trx, email);
  await endEarlierSignIns(trx, audit, memberId, "single_sign_on_tie", {
    password: required !== undefined,
  });
  return true;
}

/**
 * Records that the person the account is for has shown it is theirs (`member.proved_at`): they
 * set the password through a link mailed to its address, signed in through single sign-on from
 * a domain that was proved, or it is the instance's first operator. Never set because an admin
 * typed a password, and never by an archive. It is only ever set once; later calls change nothing.
 */
export async function markProved(trx: Trx, memberId: string): Promise<void> {
  await trx
    .updateTable("member")
    .set({ proved_at: new Date() })
    .where("id", "=", memberId)
    .where("proved_at", "is", null)
    .execute();
}

/** Whether the account has a place anywhere: it belongs to a tenant, or holds access at the instance. */
export async function holdsAnyPlace(trx: Trx, memberId: string): Promise<boolean> {
  const tenant = await trx
    .selectFrom("tenant_member")
    .select("tenant_id")
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  return tenant !== undefined || (await holdsInstanceAccess(trx, memberId));
}

/**
 * Whether the account holds a way in besides its password: a session, a personal key or a
 * recovery code. A password alone, on an account that has no place anywhere, is what an operator
 * leaves when they make an account for someone at the instance (a tenant's admin cannot make one
 * without giving it a place, and losing the last place deletes the password). That is the
 * operator's own act and is not ended by giving the account its first place.
 */
async function holdsAWayInBesidesAPassword(trx: Trx, memberId: string): Promise<boolean> {
  const session = await trx
    .selectFrom("member_session")
    .select("member_id")
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  const key = await trx
    .selectFrom("api_key")
    .select("id")
    .where("owner_type", "=", "member")
    .where("owner_id", "=", memberId)
    .where("revoked_at", "is", null)
    .executeTakeFirst();
  const code = await trx
    .selectFrom("member_recovery_code")
    .select("id")
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  return session !== undefined || key !== undefined || code !== undefined;
}

/**
 * The rule for an account that gains a place it did not have (someone adds it to a tenant, or it
 * is given access at the instance). Call it after the place is added, with `hadAPlace` read
 * before. An account whose owner has proved it (`member.proved_at`) is left exactly as it is: its
 * owner's password, keys and codes are theirs. An account nobody has proved may have a password
 * that whoever made it chose, so where it already had a place elsewhere, or holds a way in besides
 * its password (a password alone, on an account with no place, is an operator's own doing and does
 * not count), all of that ends (password included), an entry says so in each tenant it belongs to,
 * and it stays not proved until its owner sets a password through a link mailed to them.
 *
 * Where the account's password was chosen by the very principal adding it (`actor`; see
 * `member.password_set_by_*`), nothing is ended. Returns whether anything was ended.
 */
export async function startOverIfUnproved(
  trx: Trx,
  audit: Audit,
  memberId: string,
  hadAPlace: boolean,
  actor?: Principal,
): Promise<boolean> {
  const member = await trx
    .selectFrom("member")
    .select(["proved_at", "password_set_by_type", "password_set_by_id"])
    .where("id", "=", memberId)
    .executeTakeFirst();
  if (!member || member.proved_at) return false;
  // The one who chose the password this account has now adding it to one more place exposes it to
  // nobody new: they could already sign in as it. Anyone else adding it starts it again.
  if (
    actor?.id &&
    member.password_set_by_id === actor.id &&
    member.password_set_by_type === actor.type
  ) {
    return false;
  }
  if (!hadAPlace && !(await holdsAWayInBesidesAPassword(trx, memberId))) return false;
  await endEarlierSignIns(trx, audit, memberId, "gained_a_place", { password: true });
  return true;
}
