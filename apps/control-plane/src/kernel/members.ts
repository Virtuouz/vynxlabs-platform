import { newId } from "@vynxlabs/db";
import type { Audit, Trx } from "./audit.js";
import { conflict } from "./errors.js";
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
