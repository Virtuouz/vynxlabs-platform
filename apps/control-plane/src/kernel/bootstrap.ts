import { newId } from "@vynxlabs/db";
import type { FastifyBaseLogger } from "fastify";
import { mutate, SYSTEM } from "./audit.js";
import type { Kernel } from "./kernel.js";
import { INSTANCE_ONLY_ROLE } from "./kinds.js";
import { createMember } from "./members.js";

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
