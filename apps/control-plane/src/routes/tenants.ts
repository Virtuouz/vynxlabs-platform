import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { Type } from "typebox";
import { MIN_PASSWORD_LENGTH } from "../config.js";
import { badRequest, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { createMember } from "../kernel/members.js";
import { PageQuery, pageOf } from "../pagination.js";
import {
  ApiKey,
  insertApiKey,
  Member,
  NewApiKey,
  NewApiKeyBody,
  toApiKey,
  toMember,
} from "./identity.js";
import { Id, iso, Name, NoContent, pageArgs, Slug, TenantParams, Time, toPage } from "./shared.js";

const Tenant = Type.Object({ id: Id, slug: Type.String(), name: Type.String(), createdAt: Time });
const toTenant = (row: { id: string; slug: string; name: string; created_at: Date }) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  createdAt: iso(row.created_at),
});

const Group = Type.Object({ id: Id, tenantId: Id, name: Type.String(), createdAt: Time });
const toGroup = (row: { id: string; tenant_id: string; name: string; created_at: Date }) => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  createdAt: iso(row.created_at),
});

const ServiceAccount = Group;
const toServiceAccount = toGroup;

const GroupParams = Type.Object({ t: Id, g: Id });
const GroupMemberParams = Type.Object({ t: Id, g: Id, memberId: Id });

export function tenantRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    // ----- Tenants -----

    app.get(
      "/tenants",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "Tenants the caller can see",
          description: "Every tenant for an operator. Otherwise the tenants the caller belongs to.",
          tags: ["tenancy"],
          querystring: PageQuery,
          response: { 200: pageOf(Tenant) },
        },
      },
      async ({ ctx, query }) => {
        const args = pageArgs(query);
        const { principal } = ctx;
        let select = db.selectFrom("tenant").select(["id", "slug", "name", "created_at"]);
        if (!(await ctx.allowed("tenant:read", {}))) {
          select =
            principal.type === "member"
              ? select.where("id", "in", (eb) =>
                  eb
                    .selectFrom("tenant_member")
                    .select("tenant_id")
                    .where("member_id", "=", principal.id as string),
                )
              : select.where("id", "=", principal.tenantId as string);
        }
        if (args.after) select = select.where("id", ">", args.after);
        const rows = await select
          .orderBy("id")
          .limit(args.limit + 1)
          .execute();
        return toPage(rows, args, (row) => row.id, toTenant);
      },
    );

    app.post(
      "/tenants",
      {
        config: { access: access.instance("tenant:write") },
        schema: {
          summary: "Create a tenant",
          tags: ["tenancy"],
          body: Type.Object({ slug: Slug, name: Name }),
          response: { 201: Tenant },
        },
      },
      async ({ ctx, body }, reply) => {
        const tenant = await ctx.mutate(async (trx, audit) => {
          const row = await trx
            .insertInto("tenant")
            .values({ id: newId(), slug: body.slug, name: body.name })
            .returning(["id", "slug", "name", "created_at"])
            .executeTakeFirstOrThrow();
          // The tenant's own log starts with its creation.
          await audit({
            action: "tenant.created",
            targetType: "tenant",
            targetId: row.id,
            tenantId: row.id,
            details: { slug: row.slug, name: row.name },
          });
          return row;
        });
        return reply.code(201).send(toTenant(tenant));
      },
    );

    app.get(
      "/tenants/:t",
      {
        config: { access: access.tenantOrInstance("tenant:read") },
        schema: {
          summary: "One tenant",
          tags: ["tenancy"],
          params: TenantParams,
          response: { 200: Tenant },
        },
      },
      async ({ params }) => {
        const row = await db
          .selectFrom("tenant")
          .select(["id", "slug", "name", "created_at"])
          .where("id", "=", params.t)
          .executeTakeFirstOrThrow();
        return toTenant(row);
      },
    );

    app.patch(
      "/tenants/:t",
      {
        config: { access: access.tenantOrInstance("tenant:write") },
        schema: {
          summary: "Rename a tenant",
          tags: ["tenancy"],
          params: TenantParams,
          body: Type.Object({ name: Name }),
          response: { 200: Tenant },
        },
      },
      async ({ ctx, params, body }) => {
        const row = await ctx.mutate(async (trx, audit) => {
          const updated = await trx
            .updateTable("tenant")
            .set({ name: body.name })
            .where("id", "=", params.t)
            .returning(["id", "slug", "name", "created_at"])
            .executeTakeFirstOrThrow();
          await audit({
            action: "tenant.updated",
            targetType: "tenant",
            targetId: params.t,
            tenantId: params.t,
            details: { name: body.name },
          });
          return updated;
        });
        return toTenant(row);
      },
    );

    // ----- Members of a tenant -----

    app.get(
      "/tenants/:t/members",
      {
        config: { access: access.tenant("member:read") },
        schema: {
          summary: "Members of a tenant",
          tags: ["identity"],
          params: TenantParams,
          querystring: PageQuery,
          response: { 200: pageOf(Member) },
        },
      },
      async ({ params, query }) => {
        const args = pageArgs(query);
        let select = db
          .selectFrom("member")
          .innerJoin("tenant_member", "tenant_member.member_id", "member.id")
          .select(["member.id", "member.name", "member.email", "member.created_at"])
          .where("tenant_member.tenant_id", "=", params.t);
        if (args.after) select = select.where("member.id", ">", args.after);
        const rows = await select
          .orderBy("member.id")
          .limit(args.limit + 1)
          .execute();
        return toPage(rows, args, (row) => row.id, toMember);
      },
    );

    app.post(
      "/tenants/:t/members",
      {
        config: { access: access.tenant("member:write") },
        schema: {
          summary: "Add a member to a tenant",
          description:
            "Adds the existing member with that email. If there is none, `name` and `password` " +
            "are required and a new member is created.",
          tags: ["identity"],
          params: TenantParams,
          body: Type.Object({
            email: Type.String({ format: "email", maxLength: 254 }),
            name: Type.Optional(Name),
            password: Type.Optional(
              Type.String({ minLength: MIN_PASSWORD_LENGTH, maxLength: 128 }),
            ),
          }),
          response: { 201: Member },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const email = body.email.trim().toLowerCase();
        const member = await ctx.mutate(async (trx, audit) => {
          let found = await trx
            .selectFrom("member")
            .select(["id", "name", "email", "created_at"])
            .where("email", "=", email)
            .executeTakeFirst();
          if (!found) {
            if (body.name === undefined || body.password === undefined) {
              throw badRequest("No member has that email. Send name and password to create one.");
            }
            found = await createMember(kernel, trx, audit, {
              email,
              name: body.name,
              password: body.password,
            });
          }
          await trx
            .insertInto("tenant_member")
            .values({ tenant_id: params.t, member_id: found.id })
            .execute();
          await audit({
            action: "tenant_member.added",
            targetType: "member",
            targetId: found.id,
            tenantId: params.t,
            details: { email },
          });
          return found;
        });
        return reply.code(201).send(toMember(member));
      },
    );

    app.delete(
      "/tenants/:t/members/:memberId",
      {
        config: { access: access.tenant("member:write") },
        schema: {
          summary: "Remove a member from a tenant",
          description: "Also removes the member's bindings and group memberships in the tenant.",
          tags: ["identity"],
          params: Type.Object({ t: Id, memberId: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("tenant_member")
            .where("tenant_id", "=", params.t)
            .where("member_id", "=", params.memberId)
            .returning("member_id")
            .executeTakeFirst();
          if (!removed) throw notFound("The member");
          const bindings = await trx
            .deleteFrom("binding")
            .where("tenant_id", "=", params.t)
            .where("principal_type", "=", "member")
            .where("principal_id", "=", params.memberId)
            .returning("id")
            .execute();
          await trx
            .deleteFrom("group_member")
            .where("member_id", "=", params.memberId)
            .where("group_id", "in", (eb) =>
              eb.selectFrom("principal_group").select("id").where("tenant_id", "=", params.t),
            )
            .execute();
          await audit({
            action: "tenant_member.removed",
            targetType: "member",
            targetId: params.memberId,
            tenantId: params.t,
            details: { bindingsRemoved: bindings.length },
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Groups -----

    app.get(
      "/tenants/:t/groups",
      {
        config: { access: access.tenant("group:read") },
        schema: {
          summary: "Groups in a tenant",
          tags: ["identity"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(Group) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("principal_group")
          .selectAll()
          .where("tenant_id", "=", params.t)
          .orderBy("name")
          .execute();
        return { items: rows.map(toGroup) };
      },
    );

    app.post(
      "/tenants/:t/groups",
      {
        config: { access: access.tenant("group:write") },
        schema: {
          summary: "Create a group",
          tags: ["identity"],
          params: TenantParams,
          body: Type.Object({ name: Name }),
          response: { 201: Group },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const group = await ctx.mutate(async (trx, audit) => {
          const row = await trx
            .insertInto("principal_group")
            .values({ id: newId(), tenant_id: params.t, name: body.name })
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "group.created",
            targetType: "group",
            targetId: row.id,
            tenantId: params.t,
            details: { name: row.name },
          });
          return row;
        });
        return reply.code(201).send(toGroup(group));
      },
    );

    app.get(
      "/tenants/:t/groups/:g",
      {
        config: { access: access.tenant("group:read") },
        schema: {
          summary: "One group and its members",
          tags: ["identity"],
          params: GroupParams,
          response: { 200: Type.Object({ ...Group.properties, members: Type.Array(Member) }) },
        },
      },
      async ({ params }) => {
        const group = await db
          .selectFrom("principal_group")
          .selectAll()
          .where("id", "=", params.g)
          .where("tenant_id", "=", params.t)
          .executeTakeFirst();
        if (!group) throw notFound("The group");
        const members = await db
          .selectFrom("member")
          .innerJoin("group_member", "group_member.member_id", "member.id")
          .select(["member.id", "member.name", "member.email", "member.created_at"])
          .where("group_member.group_id", "=", params.g)
          .orderBy("member.email")
          .execute();
        return { ...toGroup(group), members: members.map(toMember) };
      },
    );

    app.delete(
      "/tenants/:t/groups/:g",
      {
        config: { access: access.tenant("group:write") },
        schema: {
          summary: "Delete a group and its bindings",
          tags: ["identity"],
          params: GroupParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          await trx
            .deleteFrom("binding")
            .where("tenant_id", "=", params.t)
            .where("principal_type", "=", "group")
            .where("principal_id", "=", params.g)
            .execute();
          const removed = await trx
            .deleteFrom("principal_group")
            .where("id", "=", params.g)
            .where("tenant_id", "=", params.t)
            .returning("name")
            .executeTakeFirst();
          if (!removed) throw notFound("The group");
          await audit({
            action: "group.deleted",
            targetType: "group",
            targetId: params.g,
            tenantId: params.t,
            details: { name: removed.name },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.put(
      "/tenants/:t/groups/:g/members/:memberId",
      {
        config: { access: access.tenant("group:write") },
        schema: {
          summary: "Add a tenant member to a group",
          tags: ["identity"],
          params: GroupMemberParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const group = await trx
            .selectFrom("principal_group")
            .select("id")
            .where("id", "=", params.g)
            .where("tenant_id", "=", params.t)
            .executeTakeFirst();
          if (!group) throw notFound("The group");
          const member = await trx
            .selectFrom("tenant_member")
            .select("member_id")
            .where("tenant_id", "=", params.t)
            .where("member_id", "=", params.memberId)
            .executeTakeFirst();
          if (!member) throw notFound("The member");
          await trx
            .insertInto("group_member")
            .values({ group_id: params.g, member_id: params.memberId })
            .onConflict((oc) => oc.doNothing())
            .execute();
          await audit({
            action: "group_member.added",
            targetType: "group",
            targetId: params.g,
            tenantId: params.t,
            details: { memberId: params.memberId },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.delete(
      "/tenants/:t/groups/:g/members/:memberId",
      {
        config: { access: access.tenant("group:write") },
        schema: {
          summary: "Remove a member from a group",
          tags: ["identity"],
          params: GroupMemberParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("group_member")
            .where("group_id", "=", params.g)
            .where("member_id", "=", params.memberId)
            .where("group_id", "in", (eb) =>
              eb.selectFrom("principal_group").select("id").where("tenant_id", "=", params.t),
            )
            .returning("member_id")
            .executeTakeFirst();
          if (!removed) throw notFound("The group member");
          await audit({
            action: "group_member.removed",
            targetType: "group",
            targetId: params.g,
            tenantId: params.t,
            details: { memberId: params.memberId },
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Service accounts -----

    app.get(
      "/tenants/:t/service-accounts",
      {
        config: { access: access.tenant("service_account:read") },
        schema: {
          summary: "Service accounts in a tenant",
          tags: ["identity"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(ServiceAccount) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("service_account")
          .selectAll()
          .where("tenant_id", "=", params.t)
          .orderBy("name")
          .execute();
        return { items: rows.map(toServiceAccount) };
      },
    );

    app.post(
      "/tenants/:t/service-accounts",
      {
        config: { access: access.tenant("service_account:write") },
        schema: {
          summary: "Create a service account",
          tags: ["identity"],
          params: TenantParams,
          body: Type.Object({ name: Name }),
          response: { 201: ServiceAccount },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const account = await ctx.mutate(async (trx, audit) => {
          const row = await trx
            .insertInto("service_account")
            .values({ id: newId(), tenant_id: params.t, name: body.name })
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "service_account.created",
            targetType: "service_account",
            targetId: row.id,
            tenantId: params.t,
            details: { name: row.name },
          });
          return row;
        });
        return reply.code(201).send(toServiceAccount(account));
      },
    );

    app.delete(
      "/tenants/:t/service-accounts/:id",
      {
        config: { access: access.tenant("service_account:write") },
        schema: {
          summary: "Delete a service account, its keys and its bindings",
          tags: ["identity"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("service_account")
            .where("id", "=", params.id)
            .where("tenant_id", "=", params.t)
            .returning("name")
            .executeTakeFirst();
          if (!removed) throw notFound("The service account");
          await trx
            .deleteFrom("api_key")
            .where("owner_type", "=", "service_account")
            .where("owner_id", "=", params.id)
            .execute();
          await trx
            .deleteFrom("binding")
            .where("principal_type", "=", "service_account")
            .where("principal_id", "=", params.id)
            .execute();
          await audit({
            action: "service_account.deleted",
            targetType: "service_account",
            targetId: params.id,
            tenantId: params.t,
            details: { name: removed.name },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/tenants/:t/service-accounts/:id/api-keys",
      {
        config: { access: access.tenant("service_account:read") },
        schema: {
          summary: "A service account's API keys",
          tags: ["identity"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 200: Type.Object({ items: Type.Array(ApiKey) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("api_key")
          .selectAll("api_key")
          .innerJoin("service_account", "service_account.id", "api_key.owner_id")
          .where("api_key.owner_type", "=", "service_account")
          .where("api_key.owner_id", "=", params.id)
          .where("service_account.tenant_id", "=", params.t)
          .orderBy("api_key.id")
          .execute();
        return { items: rows.map(toApiKey) };
      },
    );

    app.post(
      "/tenants/:t/service-accounts/:id/api-keys",
      {
        config: { access: access.tenant("service_account:write") },
        schema: {
          summary: "Create an API key for a service account",
          tags: ["identity"],
          params: Type.Object({ t: Id, id: Id }),
          body: NewApiKeyBody,
          response: { 201: NewApiKey },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const created = await ctx.mutate(async (trx, audit) => {
          const account = await trx
            .selectFrom("service_account")
            .select("id")
            .where("id", "=", params.id)
            .where("tenant_id", "=", params.t)
            .executeTakeFirst();
          if (!account) throw notFound("The service account");
          const key = await insertApiKey(trx, { type: "service_account", id: params.id }, body);
          await audit({
            action: "api_key.created",
            targetType: "api_key",
            targetId: key.id,
            tenantId: params.t,
            details: { name: key.name, ownerType: "service_account", ownerId: params.id },
          });
          return key;
        });
        return reply.code(201).send(created);
      },
    );

    app.delete(
      "/tenants/:t/service-accounts/:id/api-keys/:keyId",
      {
        config: { access: access.tenant("service_account:write") },
        schema: {
          summary: "Revoke a service account's API key",
          tags: ["identity"],
          params: Type.Object({ t: Id, id: Id, keyId: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const revoked = await trx
            .updateTable("api_key")
            .set({ revoked_at: new Date() })
            .where("id", "=", params.keyId)
            .where("owner_type", "=", "service_account")
            .where("owner_id", "=", params.id)
            .where("revoked_at", "is", null)
            .where("owner_id", "in", (eb) =>
              eb.selectFrom("service_account").select("id").where("tenant_id", "=", params.t),
            )
            .returning("id")
            .executeTakeFirst();
          if (!revoked) throw notFound("The API key");
          await audit({
            action: "api_key.revoked",
            targetType: "api_key",
            targetId: params.keyId,
            tenantId: params.t,
          });
        });
        return reply.code(204).send(null);
      },
    );
  };
}
