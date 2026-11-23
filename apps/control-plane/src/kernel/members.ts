import { newId } from "@volvel/db";
import {
  endOperatorGrantsIfNoLonger,
  endSessions,
  keepingAnAdmin,
  keepingAnOperator,
} from "./administer.js";
import type { Audit, Trx } from "./audit.js";
import { conflict, notFound } from "./errors.js";
import type { Kernel } from "./kernel.js";

export interface NewMember {
  email: string;
  name: string;
  password: string;
}

/** Creates a member identity with a password. The email must be unused. */
export async function createMember(kernel: Kernel, trx: Trx, audit: Audit, input: NewMember) {
  const email = input.email.trim().toLowerCase();
  const taken = await trx
    .selectFrom("member")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();
  if (taken) throw conflict("A member with that email already exists.");

  const id = newId();
  const now = new Date();
  const passwordHash = await (await kernel.auth.$context).password.hash(input.password);
  await trx
    .insertInto("member")
    .values({ id, email, name: input.name, email_verified: true, created_at: now, updated_at: now })
    .execute();
  // The authentication library keeps the password hash in its account table.
  await trx
    .insertInto("member_account" as never)
    .values({
      id: newId(),
      member_id: id,
      account_id: id,
      provider_id: "credential",
      password: passwordHash,
      created_at: now,
      updated_at: now,
    } as never)
    .execute();
  await audit({ action: "member.created", targetType: "member", targetId: id, details: { email } });
  return { id, email, name: input.name, created_at: now };
}

/**
 * Turns a member's account off, or on again. Off, it ends every sign-in they have (the console's
 * and the tenants' apps'), and their open operator access grants, and it is refused when it would
 * leave the instance with no operator who can sign in, or a tenant with nobody who can administer.
 * One place, for the route and for the instance's identity provider.
 */
export async function setMemberDisabled(
  trx: Trx,
  audit: Audit,
  memberId: string,
  disabled: boolean,
  revokedBy: string | null,
) {
  const change = async () => {
    const member = await trx
      .updateTable("member")
      .set({ disabled_at: disabled ? new Date() : null })
      .where("id", "=", memberId)
      .returning(["id", "name", "email", "created_at", "disabled_at"])
      .executeTakeFirst();
    if (!member) throw notFound("The member");
    if (disabled) {
      await endSessions(trx, member.id);
      await endOperatorGrantsIfNoLonger(trx, audit, member.id, revokedBy);
    }
    await audit({
      action: disabled ? "member.disabled" : "member.enabled",
      targetType: "member",
      targetId: member.id,
      details: { email: member.email },
    });
    return member;
  };
  // Every tenant where they may administer must keep another who can.
  const tenants = disabled
    ? (
        await trx
          .selectFrom("tenant_member")
          .select("tenant_id")
          .where("member_id", "=", memberId)
          .orderBy("tenant_id")
          .execute()
      ).map((row) => row.tenant_id)
    : [];
  const inTenants = tenants.reduceRight<() => ReturnType<typeof change>>(
    (next, tenantId) => () =>
      keepingAnAdmin(
        trx,
        tenantId,
        next,
        "That account is the only one who can administer a tenant. Give someone else the tenant admin role there first.",
      ),
    change,
  );
  return keepingAnOperator(trx, inTenants);
}
