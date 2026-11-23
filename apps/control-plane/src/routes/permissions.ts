import { Readable } from "node:stream";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId, type PrincipalType as PrincipalKind } from "@volvel/db";
import { ACCESS_DESCRIPTION_MAX } from "@volvel/manifest";
import { Type } from "typebox";
import { keepingAnAdmin } from "../kernel/administer.js";
import type { Audit, Db, Trx } from "../kernel/audit.js";
import { holdsAppFacing, PERMISSION_PATTERN } from "../kernel/authorize.js";
import { principalLabel } from "../kernel/binding-labels.js";
import { badRequest, conflict, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { INSTANCE_ONLY_ROLE } from "../kernel/kinds.js";
import { releaseOne } from "../kernel/tenant/releases.js";
import { listOf, pageOf } from "../pagination.js";
import { csvCell } from "./data.js";
import {
  AuditEntry,
  AuditFacets,
  AuditFilterQuery,
  AuditQuery,
  auditEntries,
  auditEntry,
  auditFacets,
  auditPage,
} from "./identity.js";
import {
  Id,
  iso,
  isoOrNull,
  NoContent,
  NullableId,
  NullableString,
  NullableTime,
  TenantParams,
  Time,
  Waiting,
  waiting,
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
  Type.Literal("end_user"),
  Type.Literal("end_users"),
  Type.Literal("end_user_group"),
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
  resourceKind: NullableString,
  resourcePath: NullableString,
  principalType: Type.String(),
  principalId: NullableId,
  principalLabel: Type.String({
    description: "The member's or end user's email, or the group or account name.",
  }),
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
        config: {
          access: access.custom(
            "Needs role:read, or binding:read at the workspace when workspaceId is given.",
          ),
        },
        schema: {
          summary: "Roles usable in a tenant: built-in and custom",
          description:
            "Each role with the permissions it gives, and whether it is built in or the tenant's own.",
          tags: ["permissions"],
          params: TenantParams,
          querystring: Type.Object({ workspaceId: Type.Optional(Id) }),
          response: { 200: listOf(Role) },
        },
      },
      async ({ ctx, params, query }) => {
        if (query.workspaceId) {
          await ctx.authorize("binding:read", {
            tenantId: params.t,
            workspaceId: query.workspaceId,
          });
        } else {
          await ctx.authorize("role:read", { tenantId: params.t });
        }
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
          description:
            "A role is a named set of permissions. Bind it to give it to someone. Audited.",
          tags: ["permissions"],
          params: TenantParams,
          body: Type.Object({
            name: RoleName,
            description: Type.Optional(Type.String({ maxLength: ACCESS_DESCRIPTION_MAX })),
            permissions: Permissions,
          }),
          response: { 201: Role, 202: Waiting },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const made = await ctx.mutate(async (trx, audit) => {
          const taken = await trx
            .selectFrom("role")
            .select("id")
            .where("tenant_id", "=", params.t)
            .where("workspace_id", "is", null)
            .where("name", "=", body.name)
            .executeTakeFirst();
          if (taken) throw conflict(`This tenant already has a role named ${body.name}.`);
          const released = await releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            {
              op: "put",
              resource: {
                kind: "tenant_role",
                key: body.name,
                body: {
                  ...(body.description ? { description: body.description } : {}),
                  permissions: body.permissions,
                },
              },
            },
            `Made the role ${body.name}`,
          );
          if (released.status !== "applied") return { released, row: undefined };
          const row = await trx
            .selectFrom("role")
            .selectAll()
            .where("tenant_id", "=", params.t)
            .where("workspace_id", "is", null)
            .where("name", "=", body.name)
            .executeTakeFirstOrThrow();
          return { released, row };
        });
        return made.row
          ? reply.code(201).send(toRole(made.row))
          : reply.code(202).send(waiting(made.released));
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
          description:
            "A change to its permissions takes effect for everyone it is bound to. Audited.",
          tags: ["permissions"],
          params: Type.Object({ t: Id, id: Id }),
          body: Type.Object({
            description: Type.Optional(Type.String({ maxLength: ACCESS_DESCRIPTION_MAX })),
            permissions: Type.Optional(Permissions),
          }),
          response: { 200: Role, 202: Waiting },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const changed = await ctx.mutate(async (trx, audit) => {
          const current = await editableRole(trx, params.t, params.id);
          const description = body.description ?? current.description;
          const released = await releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            {
              op: "put",
              resource: {
                kind: "tenant_role",
                key: current.name,
                body: {
                  ...(description ? { description } : {}),
                  permissions: body.permissions ?? current.permissions,
                },
              },
            },
            `Changed the role ${current.name}`,
          );
          if (released.status !== "applied") return { released, row: undefined };
          const row = await trx
            .selectFrom("role")
            .selectAll()
            .where("id", "=", params.id)
            .executeTakeFirstOrThrow();
          return { released, row };
        });
        return changed.row ? toRole(changed.row) : reply.code(202).send(waiting(changed.released));
      },
    );

    app.delete(
      "/tenants/:t/roles/:id",
      {
        config: { access: access.tenant("role:write") },
        schema: {
          summary: "Delete a custom role that no binding uses",
          description:
            "A role that a binding still gives is not deleted. Remove those bindings first. Audited.",
          tags: ["permissions"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 204: NoContent, 202: Waiting },
        },
      },
      async ({ ctx, params }, reply) => {
        const released = await ctx.mutate(async (trx, audit) => {
          const role = await editableRole(trx, params.t, params.id);
          const used = await trx
            .selectFrom("binding")
            .select("id")
            .where("role_id", "=", role.id)
            .executeTakeFirst();
          if (used) throw conflict("The role is still bound. Remove its bindings first.");
          return releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            { op: "delete", kind: "tenant_role", key: role.name },
            `Deleted the role ${role.name}`,
          );
        });
        return released.status === "applied"
          ? reply.code(204).send(null)
          : reply.code(202).send(waiting(released));
      },
    );

    // ----- Bindings -----

    app.get(
      "/tenants/:t/bindings",
      {
        config: {
          access: access.custom(
            "Needs `binding:read` at the scope asked for: the tenant, or the workspace given.",
          ),
        },
        schema: {
          summary: "Bindings in a tenant",
          description:
            "All of the tenant's bindings, or with `workspaceId` only those at that workspace " +
            "and its resources. Needs `binding:read` at the scope asked for.",
          tags: ["permissions"],
          params: TenantParams,
          querystring: Type.Object({ workspaceId: Type.Optional(Id) }),
          response: { 200: listOf(Binding) },
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
          .leftJoin("end_user", (join) =>
            join
              .onRef("end_user.id", "=", "binding.principal_id")
              .on("binding.principal_type", "=", "end_user"),
          )
          .leftJoin("end_user_group", (join) =>
            join
              .onRef("end_user_group.id", "=", "binding.principal_id")
              .on("binding.principal_type", "=", "end_user_group"),
          )
          .leftJoin("resource", "resource.id", "binding.resource_id")
          .select([
            "resource.kind as resource_kind",
            "resource.path as resource_path",
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
            "end_user.email as end_user_email",
            "principal_group.name as group_name",
            "end_user_group.name as end_user_group_name",
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
            resourceKind: row.resource_kind,
            resourcePath: row.resource_path,
            principalType: row.principal_type,
            principalId: row.principal_id,
            principalLabel: principalLabel(row),
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
        config: {
          access: access.custom(
            "Needs `binding:write` at the scope the binding is given at: the tenant, the workspace or the resource.",
          ),
        },
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
          response: { 201: Type.Object({ id: Id }), 202: Waiting },
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
        const everyone = body.principalType === "anonymous" || body.principalType === "end_users";
        if (everyone !== (body.principalId === undefined)) {
          throw badRequest(
            "principalId is required, except for anonymous and end_users, which take none.",
          );
        }

        // What a group or a service account is given is part of the tenant's access as it is
        // released: it is in that history, and waits when the tenant asks for a second person.
        // What a person is given, and anything at one resource, stays a change made here.
        const given = resourceId
          ? undefined
          : await asTenantBinding(db, tenantId, {
              principalType: body.principalType,
              principalId: body.principalId,
              roleId: body.roleId,
              workspaceId,
            });
        if (given) {
          const made = await ctx.mutate(async (trx, audit) => {
            const released = await releaseOne(
              trx,
              audit,
              tenantId,
              ctx.principal,
              { op: "put", resource: { kind: "tenant_binding", key: "given", body: given.body } },
              `Gave ${given.body.role} to ${given.label}`,
            );
            if (released.status !== "applied") return { released, id: undefined };
            const row = await trx
              .selectFrom("binding")
              .select("id")
              .where("tenant_id", "=", tenantId)
              .where("principal_type", "=", body.principalType)
              .where("principal_id", "=", body.principalId as string)
              .where("role_id", "=", body.roleId)
              .where("resource_id", "is", null)
              .where("source_resource_id", "is", null)
              .$if(workspaceId === null, (query) => query.where("workspace_id", "is", null))
              .$if(workspaceId !== null, (query) =>
                query.where("workspace_id", "=", workspaceId as string),
              )
              .executeTakeFirstOrThrow();
            return { released, id: row.id };
          });
          return made.id
            ? reply.code(201).send({ id: made.id })
            : reply.code(202).send(waiting(made.released));
        }
        const id = await ctx.mutate((trx, audit) =>
          insertBinding(trx, audit, tenantId, { ...body, workspaceId, resourceId }),
        );
        return reply.code(201).send({ id });
      },
    );

    app.delete(
      "/tenants/:t/bindings/:id",
      {
        config: { access: access.custom("Needs `binding:write` at the binding's scope.") },
        schema: {
          summary: "Remove a binding",
          description: "Needs `binding:write` at the binding's scope.",
          tags: ["permissions"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 204: NoContent, 202: Waiting },
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
            "binding.role_id",
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
        const taken = binding.resource_id
          ? undefined
          : await asTenantBinding(db, params.t, {
              principalType: binding.principal_type,
              principalId: binding.principal_id ?? undefined,
              roleId: binding.role_id,
              workspaceId: binding.workspace_id,
            });
        if (taken) {
          const released = await ctx.mutate((trx, audit) =>
            releaseOne(
              trx,
              audit,
              params.t,
              ctx.principal,
              // A binding is what it gives to whom: it is named here by that, not by a key.
              {
                op: "put-absent",
                resource: { kind: "tenant_binding", key: "taken", body: taken.body },
              },
              `Took ${taken.body.role} from ${taken.label}`,
            ),
          );
          return released.status === "applied"
            ? reply.code(204).send(null)
            : reply.code(202).send(waiting(released));
        }
        await ctx.mutate((trx, audit) =>
          keepingAnAdmin(trx, params.t, async () => {
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
          }),
        );
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
        config: {
          access: access.custom(
            "Needs `access_grant:read` in the tenant, which the tenant's admins and operators hold.",
          ),
        },
        schema: {
          summary: "Every operator access grant for a tenant, past and present",
          description: "For the tenant's admins, and for operators.",
          tags: ["permissions"],
          params: TenantParams,
          response: { 200: listOf(AccessGrant) },
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
        config: {
          access: access.custom(
            "Needs `access_grant:write` on the instance, which only operators hold.",
          ),
        },
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
        config: {
          access: access.custom(
            "Needs `access_grant:write` in the tenant, or being the operator who opened the grant.",
          ),
        },
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
        // Ended already: nothing changes, so nothing is written and nothing is audited.
        if (grant.revoked_at) {
          ctx.mutated = true;
          return reply.code(204).send(null);
        }
        await ctx.mutate(async (trx, audit) => {
          await trx
            .updateTable("access_grant")
            .set({ revoked_at: new Date(), revoked_by: ctx.principal.id })
            .where("id", "=", grant.id)
            .execute();
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
          description:
            "Who did what, to what, and when, in this tenant. Page through it with `cursor`.",
          tags: ["audit"],
          params: TenantParams,
          querystring: AuditQuery,
          response: { 200: pageOf(AuditEntry) },
        },
      },
      async ({ params, query }) => auditPage(kernel, params.t, query),
    );

    app.get(
      "/tenants/:t/principals",
      {
        config: {
          access: access.custom("Needs binding:read, at the workspace when workspaceId is given."),
        },
        schema: {
          summary: "Who can be given access, found by name or email",
          description:
            "Members, groups, service accounts, end users and groups of end users of the tenant " +
            "whose name or email holds `q`, at most `limit` of each kind. Without `q`, the first of each. " +
            "Needs `binding:read`, at the workspace when `workspaceId` is given.",
          tags: ["permissions"],
          params: TenantParams,
          querystring: Type.Object({
            workspaceId: Type.Optional(Id),
            q: Type.Optional(Type.String({ maxLength: 200 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 10 })),
          }),
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  type: Type.Union([
                    Type.Literal("member"),
                    Type.Literal("group"),
                    Type.Literal("service_account"),
                    Type.Literal("end_user"),
                    Type.Literal("end_user_group"),
                  ]),
                  id: Id,
                  label: Type.String(),
                  detail: Type.Union([Type.String(), Type.Null()]),
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        await ctx.authorize("binding:read", { tenantId: params.t, workspaceId: query.workspaceId });
        const limit = query.limit ?? 10;
        const like = `%${(query.q ?? "").trim().replace(/[\\%_]/g, "\\$&")}%`;
        const [members, groups, accounts, endUsers, endUserGroups] = await Promise.all([
          db
            .selectFrom("tenant_member")
            .innerJoin("member", "member.id", "tenant_member.member_id")
            .select(["member.id", "member.email", "member.name"])
            .where("tenant_member.tenant_id", "=", params.t)
            .where((eb) =>
              eb.or([eb("member.email", "ilike", like), eb("member.name", "ilike", like)]),
            )
            .orderBy("member.email")
            .limit(limit)
            .execute(),
          db
            .selectFrom("principal_group")
            .select(["id", "name"])
            .where("tenant_id", "=", params.t)
            .where("name", "ilike", like)
            .orderBy("name")
            .limit(limit)
            .execute(),
          db
            .selectFrom("service_account")
            .select(["id", "name"])
            .where("tenant_id", "=", params.t)
            .where("name", "ilike", like)
            .orderBy("name")
            .limit(limit)
            .execute(),
          db
            .selectFrom("end_user")
            .select(["id", "email", "name"])
            .where("tenant_id", "=", params.t)
            .where((eb) => eb.or([eb("email", "ilike", like), eb("name", "ilike", like)]))
            .orderBy("email")
            .limit(limit)
            .execute(),
          db
            .selectFrom("end_user_group")
            .select(["id", "name"])
            .where("tenant_id", "=", params.t)
            .where("name", "ilike", like)
            .orderBy("name")
            .limit(limit)
            .execute(),
        ]);
        return {
          items: [
            ...members.map((one) => ({
              type: "member" as const,
              id: one.id,
              label: one.email,
              detail: one.name || null,
            })),
            ...groups.map((one) => ({
              type: "group" as const,
              id: one.id,
              label: one.name,
              detail: "Group of members",
            })),
            ...accounts.map((one) => ({
              type: "service_account" as const,
              id: one.id,
              label: one.name,
              detail: "Service account",
            })),
            ...endUsers.map((one) => ({
              type: "end_user" as const,
              id: one.id,
              label: one.email,
              detail: one.name ? `${one.name}, end user` : "End user",
            })),
            ...endUserGroups.map((one) => ({
              type: "end_user_group" as const,
              id: one.id,
              label: one.name,
              detail: "Group of end users",
            })),
          ],
        };
      },
    );

    app.get(
      "/tenants/:t/audit/:id",
      {
        config: { access: access.tenant("audit:read") },
        schema: {
          summary: "One audit entry",
          description: "For a link to an entry. 404 once the tenant's log no longer keeps it.",
          tags: ["audit"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 200: AuditEntry },
        },
      },
      async ({ params }) => {
        const entry = await auditEntry(kernel, params.t, params.id);
        if (!entry) throw notFound("The audit entry");
        return entry;
      },
    );

    app.get(
      "/tenants/:t/audit-facets",
      {
        config: { access: access.tenant("audit:read") },
        schema: {
          summary: "What a tenant's log holds, to narrow it by",
          description:
            "The actions, actors and kinds of target among the entries the filters keep, each " +
            "with how many entries it has, most first. At most 100 of each.",
          tags: ["audit"],
          params: TenantParams,
          querystring: AuditFilterQuery,
          response: { 200: AuditFacets },
        },
      },
      async ({ params, query }) => auditFacets(kernel, params.t, query),
    );

    app.get(
      "/tenants/:t/audit-export",
      {
        config: { access: access.tenant("audit:read") },
        schema: {
          summary: "A tenant's audit entries, as CSV",
          description: `The entries the filters keep, newest first, at most ${AUDIT_CSV_CAP.toLocaleString("en-US")}.`,
          tags: ["audit"],
          params: TenantParams,
          querystring: AuditFilterQuery,
          produces: ["text/csv"],
          response: { 200: Type.Unknown({ description: "The entries, as CSV." }) },
        },
      },
      async ({ params, query }, reply) => {
        const columns = [
          "occurredAt",
          "action",
          "actorType",
          "actorLabel",
          "actorId",
          "targetType",
          "targetLabel",
          "targetId",
          "workspaceId",
          "accessGrantId",
          "requestId",
          "ipAddress",
          "details",
        ] as const;
        async function* lines() {
          yield `${columns.join(",")}\r\n`;
          for await (const entry of auditEntries(kernel, params.t, query, AUDIT_CSV_CAP)) {
            yield `${columns.map((column) => csvCell(entry[column])).join(",")}\r\n`;
          }
        }
        reply
          .header("content-type", "text/csv; charset=utf-8")
          .header("content-disposition", `attachment; filename="audit-log.csv"`);
        return reply.send(Readable.from(lines()));
      },
    );
  };
}

/** How many entries one audit export holds at most. */
const AUDIT_CSV_CAP = 100_000;

/**
 * Gives a principal a role at a scope, inside a change: checks that the role
 * may be held there and that the principal and scope belong to the tenant,
 * then records it. Shared by giving access and by adding a member with it.
 */
/**
 * A binding as part of the tenant's released access, when it is one: a role of
 * the tenant's own, or one every tenant has, given to a group or a service
 * account in the tenant or in one workspace. Nothing for any other binding.
 */
async function asTenantBinding(
  db: Db,
  tenantId: string,
  given: {
    principalType: string;
    principalId: string | undefined;
    roleId: string;
    workspaceId: string | null;
  },
): Promise<{ body: Record<string, unknown> & { role: string }; label: string } | undefined> {
  const table =
    given.principalType === "group"
      ? "principal_group"
      : given.principalType === "end_user_group"
        ? "end_user_group"
        : given.principalType === "service_account"
          ? "service_account"
          : undefined;
  if (!table || !given.principalId) return undefined;
  const principal = await db
    .selectFrom(table)
    .select(["key", "name"])
    .where("tenant_id", "=", tenantId)
    .where("id", "=", given.principalId)
    .executeTakeFirst();
  const role = await db
    .selectFrom("role")
    .select(["name", "workspace_id", "tenant_id"])
    .where("id", "=", given.roleId)
    .executeTakeFirst();
  // A role that one workspace defines is that workspace's to give.
  if (!principal || !role || role.workspace_id !== null) return undefined;
  if (role.tenant_id !== null && role.tenant_id !== tenantId) return undefined;
  let workspace: string | undefined;
  if (given.workspaceId) {
    const found = await db
      .selectFrom("workspace")
      .select("slug")
      .where("tenant_id", "=", tenantId)
      .where("id", "=", given.workspaceId)
      .executeTakeFirst();
    if (!found) return undefined;
    workspace = found.slug;
  }
  return {
    body: {
      role: role.name,
      principal: { type: given.principalType, key: principal.key },
      ...(workspace ? { workspace } : {}),
    },
    label: principal.name,
  };
}

/** Anyone, every end user, and end users hold only what apps use: a role with none of it gives them nothing. */
function refuseNothingForApps(
  principalType: string,
  role: { name?: string; permissions: string[] },
) {
  const forApps = ["anonymous", "end_users", "end_user", "end_user_group"];
  if (forApps.includes(principalType) && !holdsAppFacing(role.permissions)) {
    throw badRequest(
      "People who are not members hold only what apps use, and that role gives none of it. Bind a role that has app permissions, such as viewer.",
    );
  }
}

export async function insertBinding(
  trx: Trx,
  audit: Audit,
  tenantId: string,
  body: {
    principalType: PrincipalKind;
    principalId?: string | undefined;
    roleId: string;
    workspaceId: string | null;
    resourceId: string | null;
  },
): Promise<string> {
  const { workspaceId, resourceId } = body;
  const id = newId();
  const role = await trx
    .selectFrom("role")
    .select(["id", "name", "tenant_id", "workspace_id", "permissions"])
    .where("id", "=", body.roleId)
    .executeTakeFirst();
  const usable =
    role &&
    role.name !== INSTANCE_ONLY_ROLE &&
    (role.tenant_id === null || role.tenant_id === tenantId) &&
    (role.workspace_id === null || role.workspace_id === workspaceId);
  if (!role || !usable) throw badRequest("That role cannot be bound at this scope.");
  refuseNothingForApps(body.principalType, role);

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
        : body.principalType === "end_user"
          ? await trx
              .selectFrom("end_user")
              .select("id")
              .where("tenant_id", "=", tenantId)
              .where("id", "=", principalId)
              .executeTakeFirst()
          : await trx
              .selectFrom(
                body.principalType === "group"
                  ? "principal_group"
                  : body.principalType === "end_user_group"
                    ? "end_user_group"
                    : "service_account",
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
  return id;
}
