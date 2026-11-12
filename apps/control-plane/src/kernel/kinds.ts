import { newId } from "@vynxlabs/db";
import type { KindRegistry } from "@vynxlabs/manifest";
import type { Trx } from "./audit.js";
import { PERMISSION_PATTERN } from "./authorize.js";
import { badRequest } from "./errors.js";

export interface AppliedResource {
  id: string;
  tenantId: string;
  workspaceId: string;
  path: string;
  body: Record<string, unknown>;
}

/**
 * Runs in the same transaction as a resource write, so a stored manifest takes
 * effect atomically. Removal needs no hook: projections reference the resource
 * and are deleted with it.
 */
export interface KindHook {
  apply(trx: Trx, resource: AppliedResource): Promise<void>;
}

export const INSTANCE_ONLY_ROLE = "operator_admin";

const roleKind = {
  kind: "role",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      name: { type: "string", pattern: "^[a-z][a-z0-9_]*$", maxLength: 63 },
      description: { type: "string", maxLength: 500 },
      permissions: {
        type: "array",
        items: { type: "string", pattern: PERMISSION_PATTERN },
        minItems: 1,
        uniqueItems: true,
      },
    },
    required: ["name", "permissions"],
    additionalProperties: false,
  },
};

const bindingKind = {
  kind: "binding",
  schemaVersion: 1,
  body: {
    type: "object",
    properties: {
      role: { type: "string", description: "The name of a role visible in this workspace." },
      principal: {
        oneOf: [
          {
            type: "object",
            properties: { type: { const: "member" }, email: { type: "string" } },
            required: ["type", "email"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              type: { enum: ["group", "service_account"] },
              name: { type: "string" },
            },
            required: ["type", "name"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: { type: { const: "anonymous" } },
            required: ["type"],
            additionalProperties: false,
          },
        ],
      },
      resource: {
        type: "string",
        description: "Path of one resource to bind at. Omit to bind at the workspace.",
      },
    },
    required: ["role", "principal"],
    additionalProperties: false,
  },
};

const roleHook: KindHook = {
  async apply(trx, resource) {
    const body = resource.body as { name: string; description?: string; permissions: string[] };
    const values = {
      name: body.name,
      description: body.description ?? "",
      permissions: body.permissions,
    };
    const existing = await trx
      .selectFrom("role")
      .select("id")
      .where("source_resource_id", "=", resource.id)
      .executeTakeFirst();
    if (existing) {
      await trx.updateTable("role").set(values).where("id", "=", existing.id).execute();
    } else {
      await trx
        .insertInto("role")
        .values({
          id: newId(),
          tenant_id: resource.tenantId,
          workspace_id: resource.workspaceId,
          source_resource_id: resource.id,
          ...values,
        })
        .execute();
    }
  },
};

type PrincipalRef =
  | { type: "member"; email: string }
  | { type: "group" | "service_account"; name: string }
  | { type: "anonymous" };

const bindingHook: KindHook = {
  async apply(trx, resource) {
    const body = resource.body as { role: string; principal: PrincipalRef; resource?: string };
    const fail = (path: string, message: string) =>
      badRequest("The binding refers to something that does not exist.", [{ path, message }]);

    // The most specific role with that name wins: workspace, then tenant, then built-in.
    const role = await trx
      .selectFrom("role")
      .select(["id", "workspace_id", "tenant_id"])
      .where("name", "=", body.role)
      .where((eb) =>
        eb.or([
          eb("workspace_id", "=", resource.workspaceId),
          eb.and([eb("tenant_id", "=", resource.tenantId), eb("workspace_id", "is", null)]),
          eb("tenant_id", "is", null),
        ]),
      )
      .orderBy("workspace_id", (ob) => ob.asc().nullsLast())
      .orderBy("tenant_id", (ob) => ob.asc().nullsLast())
      .executeTakeFirst();
    if (!role || body.role === INSTANCE_ONLY_ROLE) {
      throw fail("/body/role", `no role named "${body.role}" can be bound in this workspace`);
    }

    let principalId: string | null = null;
    const principal = body.principal;
    if (principal.type === "member") {
      const member = await trx
        .selectFrom("member")
        .innerJoin("tenant_member", "tenant_member.member_id", "member.id")
        .select("member.id")
        .where("member.email", "=", principal.email.toLowerCase())
        .where("tenant_member.tenant_id", "=", resource.tenantId)
        .executeTakeFirst();
      if (!member) throw fail("/body/principal/email", "no member of this tenant has that email");
      principalId = member.id;
    } else if (principal.type !== "anonymous") {
      const table = principal.type === "group" ? "principal_group" : "service_account";
      const found = await trx
        .selectFrom(table)
        .select("id")
        .where("tenant_id", "=", resource.tenantId)
        .where("name", "=", principal.name)
        .executeTakeFirst();
      if (!found) throw fail("/body/principal/name", `no ${principal.type} has that name`);
      principalId = found.id;
    }

    let resourceId: string | null = null;
    if (body.resource !== undefined) {
      const target = await trx
        .selectFrom("resource")
        .select("id")
        .where("workspace_id", "=", resource.workspaceId)
        .where("path", "=", body.resource)
        .executeTakeFirst();
      if (!target) throw fail("/body/resource", "no resource has that path in this workspace");
      resourceId = target.id;
    }

    await trx.deleteFrom("binding").where("source_resource_id", "=", resource.id).execute();
    await trx
      .insertInto("binding")
      .values({
        id: newId(),
        scope_type: resourceId ? "resource" : "workspace",
        tenant_id: resource.tenantId,
        workspace_id: resource.workspaceId,
        resource_id: resourceId,
        principal_type: principal.type,
        principal_id: principalId,
        role_id: role.id,
        source_resource_id: resource.id,
      })
      .execute();
  },
};

export function registerKernelKinds(kinds: KindRegistry, hooks: Map<string, KindHook>) {
  kinds.register(roleKind).register(bindingKind);
  hooks.set("role", roleHook);
  hooks.set("binding", bindingHook);
}
