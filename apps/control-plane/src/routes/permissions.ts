import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { Type } from "typebox";
import type { Trx } from "../kernel/audit.js";
import { PERMISSION_PATTERN } from "../kernel/authorize.js";
import { badRequest, conflict, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { INSTANCE_ONLY_ROLE } from "../kernel/kinds.js";
import { pageOf } from "../pagination.js";
import { AuditEntry, AuditQuery, auditPage } from "./identity.js";
import {
  Id,
  iso,
  isoOrNull,
  NoContent,
  NullableId,
  NullableTime,
  TenantParams,
  Time,
} from "./shared.js";

const Permissions = Type.Array(Type.String({ pattern: PERMISSION_PATTERN }), {
  minItems: 1,
  uniqueItems: true,
});
const RoleName = Type.String({ pattern: "^[a-z][a-z0-9_]*$", maxLength: 63 });

const Role = Type.Object({
  id: Id,
  tenantId: NullableId,
  workspaceId: NullableId,
  name: Type.String(),
  description: Type.String(),
  permissions: Type.Array(Type.String()),
  builtin: Type.Boolean(),
  managedByResource: Type.Boolean({
    description: "True when the role comes from a resource and is read-only here.",
  }),
});
interface RoleRow {
  id: string;
  tenant_id: string | null;
  workspace_id: string | null;
  name: string;
  description: string;
  permissions: string[];
  builtin: boolean;
  source_resource_id: string | null;
}
const toRole = (row: RoleRow) => ({
  id: row.id,
  tenantId: row.tenant_id,
  workspaceId: row.workspace_id,
  name: row.name,
  description: row.description,
  permissions: row.permissions,
  builtin: row.builtin,
  managedByResource: row.source_resource_id !== null,
});

const PrincipalType = Type.Union([
  Type.Literal("member"),
  Type.Literal("group"),
  Type.Literal("service_account"),
  Type.Literal("anonymous"),
]);
const Binding = Type.Object({
  id: Id,
  scopeType: Type.Union([
    Type.Literal("tenant"),
    Type.Literal("workspace"),
    Type.Literal("resource"),
  ]),
  workspaceId: NullableId,
  resourceId: NullableId,
  principalType: Type.String(),
  principalId: NullableId,
  principalLabel: Type.String({ description: "The member's email, or the group or account name." }),
  roleId: Id,
  roleName: Type.String(),
  managedByResource: Type.Boolean(),
  createdAt: Time,
});

const AccessGrant = Type.Object({
  id: Id,
  tenantId: Id,
  memberId: Id,
  memberEmail: Type.String(),
  roleId: Id,
  roleName: Type.String(),
  reason: Type.String(),
  createdAt: Time,
  expiresAt: Time,
  revokedAt: NullableTime,
  active: Type.Boolean(),
});

const MAX_GRANT_MINUTES = 24 * 60;

export function permissionRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    // ----- Roles -----

    app.get(
      "/tenants/:t/roles",
      {
        config: { access: access.tenant("role:read") },
        schema: {
          summary: "Roles usable in a tenant: built-in and custom",
          tags: ["permissions"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(Role) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("role")
          .selectAll()
          .where((eb) => eb.or([eb("tenant_id", "=", params.t), eb("tenant_id", "is", null)]))
          .where("name", "!=", INSTANCE_ONLY_ROLE)
          .orderBy("builtin", "desc")
          .orderBy("name")
          .execute();
        return { items: rows.map(toRole) };
      },
    );

    app.post(
      "/tenants/:t/roles",
      {
        config: { access: access.tenant("role:write") },
        schema: {
          summary: "Create a custom role for the tenant",
          tags: ["permissions"],
          params: TenantParams,
          body: Type.Object({
            name: RoleName,
            description: Type.Optional(Type.String({ maxLength: 500 })),
            permissions: Permissions,
          }),
          response: { 201: Role },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const role = await ctx.mutate(async (trx, audit) => {
          const row = await trx
            .insertInto("role")
            .values({
              id: newId(),
              tenant_id: params.t,
              workspace_id: null,
              name: body.name,
              description: body.description ?? "",
              permissions: body.permissions,
              source_resource_id: null,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "role.created",
            targetType: "role",
            targetId: row.id,
            tenantId: params.t,
            details: { name: row.name, permissions: row.permissions },
          });
          return row;
        });
        return reply.code(201).send(toRole(role));
      },
    );

    const editableRole = async (trx: Trx, tenantId: string, id: string) => {
      const role = await trx
        .selectFrom("role")
        .selectAll()
        .where("id", "=", id)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (!role) throw notFound("The role");
      if (role.source_resource_id) {
        throw conflict("This role comes from a resource. Change the resource instead.");
      }
      return role;
    };

    app.patch(
      "/tenants/:t/roles/:id",
      {
        config: { access: access.tenant("role:write") },
        schema: {
          summary: "Change a custom role",
          tags: ["permissions"],
          params: Type.Object({ t: Id, id: Id }),
          body: Type.Object({
            description: Type.Optional(Type.String({ maxLength: 500 })),
            permissions: Type.Optional(Permissions),
          }),
          response: { 200: Role },
        },
      },
      async ({ ctx, params, body }) => {
        const role = await ctx.mutate(async (trx, audit) => {
          const current = await editableRole(trx, params.t, params.id);
          const row = await trx
            .updateTable("role")
            .set({
              description: body.description ?? current.description,
              permissions: body.permissions ?? current.permissions,
            })
            .where("id", "=", params.id)
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "role.updated",
            targetType: "role",
            targetId: row.id,
            tenantId: params.t,
            details: { name: row.name, permissions: row.permissions },
          });
          return row;
        });
        return toRole(role);
      },
    );

    app.delete(
      "/tenants/:t/roles/:id",
      {
        config: { access: access.tenant("role:write") },
        schema: {
          summary: "Delete a custom role that no binding uses",
          tags: ["permissions"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const role = await editableRole(trx, params.t, params.id);
          const used = await trx
            .selectFrom("binding")
            .select("id")
            .where("role_id", "=", role.id)
            .executeTakeFirst();
          if (used) throw conflict("The role is still bound. Remove its bindings first.");
          await trx.deleteFrom("role").where("id", "=", role.id).execute();
          await audit({
            action: "role.deleted",
            targetType: "role",
            targetId: role.id,
            tenantId: params.t,
            details: { name: role.name },
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Bindings -----

    app.get(
      "/tenants/:t/bindings",
      {
        config: { access: access.custom },
        schema: {
          summary: "Bindings in a tenant",
          description:
            "All of the tenant's bindings, or with `workspaceId` only those at that workspace " +
            "and its resources. Needs `binding:read` at the scope asked for.",
          tags: ["permissions"],
          params: TenantParams,
          querystring: Type.Object({ workspaceId: Type.Optional(Id) }),
          response: { 200: Type.Object({ items: Type.Array(Binding) }) },
        },
      },
      async ({ ctx, params, query }) => {
        await ctx.authorize("binding:read", { tenantId: params.t, workspaceId: query.workspaceId });
        let select = db
          .selectFrom("binding")
          .innerJoin("role", "role.id", "binding.role_id")
          .leftJoin("member", (join) =>
            join
              .onRef("member.id", "=", "binding.principal_id")
              .on("binding.principal_type", "=", "member"),
          )
          .leftJoin("principal_group", (join) =>
            join
              .onRef("principal_group.id", "=", "binding.principal_id")
              .on("binding.principal_type", "=", "group"),
          )
          .leftJoin("service_account", (join) =>
            join
              .onRef("service_account.id", "=", "binding.principal_id")
              .on("binding.principal_type", "=", "service_account"),
          )
          .select([
            "binding.id",
            "binding.scope_type",
            "binding.workspace_id",
            "binding.resource_id",
            "binding.principal_type",
            "binding.principal_id",
            "binding.role_id",
            "binding.source_resource_id",
            "binding.created_at",
            "role.name as role_name",
            "member.email",
            "principal_group.name as group_name",
            "service_account.name as account_name",
          ])
          .where("binding.tenant_id", "=", params.t);
        if (query.workspaceId)
          select = select.where("binding.workspace_id", "=", query.workspaceId);
        const rows = await select.orderBy("binding.id").execute();
        return {
          items: rows.map((row) => ({
            id: row.id,
            scopeType: row.scope_type as "tenant" | "workspace" | "resource",
            workspaceId: row.workspace_id,
            resourceId: row.resource_id,
            principalType: row.principal_type,
            principalId: row.principal_id,
            principalLabel: row.email ?? row.group_name ?? row.account_name ?? "anyone",
            roleId: row.role_id,
            roleName: row.role_name,
            managedByResource: row.source_resource_id !== null,
            createdAt: iso(row.created_at),
          })),
        };
      },
    );

    app.post(
      "/tenants/:t/bindings",
      {
        config: { access: access.custom },
        schema: {
          summary: "Grant a role to a principal",
          description:
            "At the tenant, or at a workspace when `workspaceId` is given, or at one resource " +
            "when `resourceId` is given too. Needs `binding:write` at that scope.",
          tags: ["permissions"],
          params: TenantParams,
          body: Type.Object({
            workspaceId: Type.Optional(Id),
            resourceId: Type.Optional(Id),
            principalType: PrincipalType,
            principalId: Type.Optional(Id),
            roleId: Id,
          }),
          response: { 201: Type.Object({ id: Id }) },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const tenantId = params.t;
        const { workspaceId = null, resourceId = null } = body;
        if (resourceId && !workspaceId) throw badRequest("resourceId needs workspaceId.");
        await ctx.authorize("binding:write", {
          tenantId,
          workspaceId: workspaceId ?? undefined,
          resourceId: resourceId ?? undefined,
        });
        if ((body.principalType === "anonymous") !== (body.principalId === undefined)) {
          throw badRequest("principalId is required, except for the anonymous principal.");
        }

        const id = newId();
        await ctx.mutate(async (trx, audit) => {
          const role = await trx
            .selectFrom("role")
            .select(["id", "name", "tenant_id", "workspace_id"])
            .where("id", "=", body.roleId)
            .executeTakeFirst();
          const usable =
            role &&
            role.name !== INSTANCE_ONLY_ROLE &&
            (role.tenant_id === null || role.tenant_id === tenantId) &&
            (role.workspace_id === null || role.workspace_id === workspaceId);
          if (!role || !usable) throw badRequest("That role cannot be bound at this scope.");

          if (workspaceId) {
            const workspace = await trx
              .selectFrom("workspace")
              .select("id")
              .where("id", "=", workspaceId)
              .where("tenant_id", "=", tenantId)
              .executeTakeFirst();
            if (!workspace) throw badRequest("The workspace is not in this tenant.");
          }
          if (resourceId) {
            const resource = await trx
              .selectFrom("resource")
              .select("id")
              .where("id", "=", resourceId)
              .where("workspace_id", "=", workspaceId)
              .executeTakeFirst();
            if (!resource) throw badRequest("The resource is not in that workspace.");
          }
          if (body.principalId) {
            const principalId = body.principalId;
            const found =
              body.principalType === "member"
                ? await trx
                    .selectFrom("tenant_member")
                    .select("member_id")
                    .where("tenant_id", "=", tenantId)
                    .where("member_id", "=", principalId)
                    .executeTakeFirst()
                : await trx
                    .selectFrom(
                      body.principalType === "group" ? "principal_group" : "service_account",
                    )
                    .select("id")
                    .where("tenant_id", "=", tenantId)
                    .where("id", "=", principalId)
                    .executeTakeFirst();
            if (!found) throw badRequest("The principal does not belong to this tenant.");
          }

          await trx
            .insertInto("binding")
            .values({
              id,
              scope_type: resourceId ? "resource" : workspaceId ? "workspace" : "tenant",
              tenant_id: tenantId,
              workspace_id: workspaceId,
              resource_id: resourceId,
              principal_type: body.principalType,
              principal_id: body.principalId ?? null,
              role_id: role.id,
              source_resource_id: null,
            })
            .execute();
          await audit({
            action: "binding.created",
            targetType: "binding",
            targetId: id,
            tenantId,
            workspaceId,
            details: {
              role: role.name,
              principalType: body.principalType,
              principalId: body.principalId ?? null,
              resourceId,
            },
          });
        });
        return reply.code(201).send({ id });
      },
    );

    app.delete(
      "/tenants/:t/bindings/:id",
      {
        config: { access: access.custom },
        schema: {
          summary: "Remove a binding",
          description: "Needs `binding:write` at the binding's scope.",
          tags: ["permissions"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const binding = await db
          .selectFrom("binding")
          .innerJoin("role", "role.id", "binding.role_id")
          .select([
            "binding.id",
            "binding.workspace_id",
            "binding.resource_id",
            "binding.principal_type",
            "binding.principal_id",
            "binding.source_resource_id",
            "role.name",
          ])
          .where("binding.id", "=", params.id)
          .where("binding.tenant_id", "=", params.t)
          .executeTakeFirst();
        await ctx.authorize("binding:write", {
          tenantId: params.t,
          workspaceId: binding?.workspace_id ?? undefined,
          resourceId: binding?.resource_id ?? undefined,
        });
        if (!binding) throw notFound("The binding");
        if (binding.source_resource_id) {
          throw conflict("This binding comes from a resource. Change the resource instead.");
        }
        await ctx.mutate(async (trx, audit) => {
          await trx.deleteFrom("binding").where("id", "=", binding.id).execute();
          await audit({
            action: "binding.deleted",
            targetType: "binding",
            targetId: binding.id,
            tenantId: params.t,
            workspaceId: binding.workspace_id,
            details: {
              role: binding.name,
              principalType: binding.principal_type,
              principalId: binding.principal_id,
            },
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Operator access grants -----

    const grantRows = (tenantId: string) =>
      db
        .selectFrom("access_grant")
        .innerJoin("member", "member.id", "access_grant.member_id")
        .innerJoin("role", "role.id", "access_grant.role_id")
        .select([
          "access_grant.id",
          "access_grant.tenant_id",
          "access_grant.member_id",
          "access_grant.role_id",
          "access_grant.reason",
          "access_grant.created_at",
          "access_grant.expires_at",
          "access_grant.revoked_at",
          "member.email",
          "role.name",
        ])
        .where("access_grant.tenant_id", "=", tenantId);

    type GrantRow = Awaited<ReturnType<ReturnType<typeof grantRows>["execute"]>>[number];
    const toGrant = (row: GrantRow) => ({
      id: row.id,
      tenantId: row.tenant_id,
      memberId: row.member_id,
      memberEmail: row.email,
      roleId: row.role_id,
      roleName: row.name,
      reason: row.reason,
      createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at),
      revokedAt: isoOrNull(row.revoked_at),
      active: row.revoked_at === null && row.expires_at > new Date(),
    });

    app.get(
      "/tenants/:t/access-grants",
      {
        config: { access: access.custom },
        schema: {
          summary: "Every operator access grant for a tenant, past and present",
          description: "For the tenant's admins, and for operators.",
          tags: ["permissions"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(AccessGrant) }) },
        },
      },
      async ({ ctx, params }) => {
        if (!(await ctx.allowed("access_grant:read", {}))) {
          await ctx.authorize("access_grant:read", { tenantId: params.t });
        }
        const rows = await grantRows(params.t).orderBy("access_grant.id", "desc").execute();
        return { items: rows.map(toGrant) };
      },
    );

    app.post(
      "/tenants/:t/access-grants",
      {
        config: { access: access.custom },
        schema: {
          summary: "Open time-limited operator access to a tenant",
          description:
            "For operators only. The grant, and every request made under it, is recorded in " +
            "the tenant's audit log.",
          tags: ["permissions"],
          params: TenantParams,
          body: Type.Object({
            reason: Type.String({ minLength: 3, maxLength: 500 }),
            roleId: Type.Optional(Id),
            durationMinutes: Type.Optional(
              Type.Integer({ minimum: 1, maximum: MAX_GRANT_MINUTES, default: 60 }),
            ),
          }),
          response: { 201: AccessGrant },
        },
      },
      async ({ ctx, params, body }, reply) => {
        await ctx.authorize("access_grant:write", {});
        const memberId = ctx.memberId;
        const tenant = await db
          .selectFrom("tenant")
          .select("id")
          .where("id", "=", params.t)
          .executeTakeFirst();
        if (!tenant) throw notFound("The tenant");

        const id = newId();
        await ctx.mutate(async (trx, audit) => {
          let roleQuery = trx.selectFrom("role").select(["id", "name"]).where("builtin", "=", true);
          roleQuery = body.roleId
            ? roleQuery.where("id", "=", body.roleId)
            : roleQuery.where("name", "=", "viewer");
          const role = await roleQuery.executeTakeFirst();
          if (!role || role.name === INSTANCE_ONLY_ROLE) {
            throw badRequest("An access grant takes a built-in tenant role.");
          }
          const expiresAt = new Date(Date.now() + (body.durationMinutes ?? 60) * 60_000);
          await trx
            .insertInto("access_grant")
            .values({
              id,
              tenant_id: params.t,
              member_id: memberId,
              role_id: role.id,
              reason: body.reason,
              expires_at: expiresAt,
              revoked_at: null,
              revoked_by: null,
            })
            .execute();
          await audit({
            action: "access_grant.opened",
            targetType: "access_grant",
            targetId: id,
            tenantId: params.t,
            details: { reason: body.reason, role: role.name, expiresAt: iso(expiresAt) },
          });
        });
        const row = await grantRows(params.t)
          .where("access_grant.id", "=", id)
          .executeTakeFirstOrThrow();
        return reply.code(201).send(toGrant(row));
      },
    );

    app.delete(
      "/tenants/:t/access-grants/:id",
      {
        config: { access: access.custom },
        schema: {
          summary: "Revoke an operator access grant",
          description: "For the tenant's admins, and for the operator who opened it.",
          tags: ["permissions"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const grant = await db
          .selectFrom("access_grant")
          .select(["id", "member_id", "revoked_at"])
          .where("id", "=", params.id)
          .where("tenant_id", "=", params.t)
          .executeTakeFirst();
        const own =
          grant && ctx.principal.type === "member" && grant.member_id === ctx.principal.id;
        if (!own) await ctx.authorize("access_grant:write", { tenantId: params.t });
        if (!grant) throw notFound("The access grant");
        await ctx.mutate(async (trx, audit) => {
          if (!grant.revoked_at) {
            await trx
              .updateTable("access_grant")
              .set({ revoked_at: new Date(), revoked_by: ctx.principal.id })
              .where("id", "=", grant.id)
              .execute();
          }
          await audit({
            action: "access_grant.revoked",
            targetType: "access_grant",
            targetId: grant.id,
            tenantId: params.t,
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- The tenant's audit log -----

    app.get(
      "/tenants/:t/audit",
      {
        config: { access: access.tenant("audit:read") },
        schema: {
          summary: "A tenant's audit entries, newest first",
          tags: ["audit"],
          params: TenantParams,
          querystring: AuditQuery,
          response: { 200: pageOf(AuditEntry) },
        },
      },
      async ({ params, query }) => auditPage(kernel, params.t, query),
    );
  };
}
