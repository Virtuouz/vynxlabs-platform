import { randomBytes } from "node:crypto";
import { newId } from "@volvel/db";
import type { FastifyBaseLogger } from "fastify";
import { mutate, SYSTEM } from "./audit.js";
import { badRequest } from "./errors.js";
import type { Kernel } from "./kernel.js";
import { INSTANCE_ONLY_ROLE } from "./kinds.js";
import { createMember } from "./members.js";
import { endEarlierSignIns, markProved } from "./sign-ins.js";

/**
 * Creates the first operator admin from configuration, once, when the
 * instance has no members at all. Does nothing on every later start.
 */
export async function bootstrapAdmin(kernel: Kernel, log: FastifyBaseLogger): Promise<void> {
  const admin = kernel.config.bootstrapAdmin;
  const anyMember = await kernel.db.selectFrom("member").select("id").limit(1).executeTakeFirst();
  if (anyMember) return;
  if (!admin) {
    log.warn(
      "The instance has no members. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD and restart to create the first operator admin.",
    );
    return;
  }
  await mutate(kernel.db, { principal: SYSTEM }, async (trx, audit) => {
    const member = await createMember(kernel, trx, audit, {
      email: admin.email,
      name: "Operator admin",
      password: admin.password,
    });
    // The first operator is set by whoever runs the instance: that is proof enough.
    await markProved(trx, member.id);
    const role = await trx
      .selectFrom("role")
      .select("id")
      .where("name", "=", INSTANCE_ONLY_ROLE)
      .where("builtin", "=", true)
      .executeTakeFirstOrThrow();
    const bindingId = newId();
    await trx
      .insertInto("binding")
      .values({
        id: bindingId,
        scope_type: "instance",
        tenant_id: null,
        workspace_id: null,
        resource_id: null,
        principal_type: "member",
        principal_id: member.id,
        role_id: role.id,
        source_resource_id: null,
      })
      .execute();
    await audit({
      action: "binding.created",
      targetType: "binding",
      targetId: bindingId,
      details: { scope: "instance", memberId: member.id, role: INSTANCE_ONLY_ROLE },
    });
  });
  log.info({ email: admin.email }, "created the first operator admin");
}

/**
 * The way back for an instance with no operator who can sign in, run on the machine:
 * `node dist/main.js recover-operator <email>`. Enables the account, gives it the operator
 * admin role, ends its sign-ins and sets a new random password, which is returned once to be
 * printed. Audited. Nothing over the network can do this: whoever can run it holds the instance.
 */
export async function recoverOperator(kernel: Kernel, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const password = randomBytes(18).toString("base64url");
  const hash = await (await kernel.auth.$context).password.hash(password);
  return mutate(kernel.db, { principal: SYSTEM }, async (trx, audit) => {
    const member = await trx
      .selectFrom("member")
      .select(["id", "disabled_at"])
      .where("email", "=", email)
      .executeTakeFirst();
    if (!member) throw badRequest(`No account on this instance has the email ${email}.`);
    const role = await trx
      .selectFrom("role")
      .select("id")
      .where("name", "=", INSTANCE_ONLY_ROLE)
      .where("builtin", "=", true)
      .executeTakeFirstOrThrow();
    await trx
      .updateTable("member")
      .set({ disabled_at: null, disabled_by: null, proved_at: new Date() })
      .where("id", "=", member.id)
      .execute();
    const bound = await trx
      .selectFrom("binding")
      .select("id")
      .where("scope_type", "=", "instance")
      .where("principal_type", "=", "member")
      .where("principal_id", "=", member.id)
      .where("role_id", "=", role.id)
      .executeTakeFirst();
    if (!bound) {
      await trx
        .insertInto("binding")
        .values({
          id: newId(),
          scope_type: "instance",
          tenant_id: null,
          workspace_id: null,
          resource_id: null,
          principal_type: "member",
          principal_id: member.id,
          role_id: role.id,
          source_resource_id: null,
        })
        .execute();
    }
    const account = await trx
      .updateTable("member_account" as never)
      .set({ password: hash, updated_at: new Date() } as never)
      .where("member_id" as never, "=", member.id as never)
      .where("provider_id" as never, "=", "credential" as never)
      .executeTakeFirst();
    if (Number(account.numUpdatedRows) === 0) {
      await trx
        .insertInto("member_account" as never)
        .values({
          id: newId(),
          member_id: member.id,
          account_id: member.id,
          provider_id: "credential",
          password: hash,
          created_at: new Date(),
          updated_at: new Date(),
        } as never)
        .execute();
    }
    await endEarlierSignIns(trx, audit, member.id, "operator_recovered");
    await audit({
      action: "operator.recovered",
      targetType: "member",
      targetId: member.id,
      details: { email, how: "the recover-operator command, run on the machine" },
    });
    return { email, password };
  });
}
