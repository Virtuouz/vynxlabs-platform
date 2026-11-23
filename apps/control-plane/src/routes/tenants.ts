import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { type DataLocation, newId } from "@volvel/db";
import { Type } from "typebox";
import { MIN_PASSWORD_LENGTH, RETENTION_BOUNDS } from "../config.js";
import { endSessions, keepingAnAdmin } from "../kernel/administer.js";
import { badRequest, conflict, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { createMember } from "../kernel/members.js";
import { effectivePolicy } from "../kernel/retention.js";
import { accessResource, freeKey, releaseOne } from "../kernel/tenant/releases.js";
import { likeTerm, pageOf, SearchPageQuery } from "../pagination.js";
import {
  ApiKey,
  insertApiKey,
  Member,
  NewApiKey,
  NewApiKeyBody,
  toApiKey,
  toMember,
} from "./identity.js";
import { insertBinding } from "./permissions.js";
import {
  Id,
  iso,
  Name,
  NoContent,
  pageArgs,
  Slug,
  TenantParams,
  Time,
  toPage,
  Waiting,
  waiting,
} from "./shared.js";

const Tenant = Type.Object({
  id: Id,
  slug: Type.String(),
  name: Type.String(),
  dataLocation: Type.Union([Type.String(), Type.Null()], {
    description:
      "The dedicated database that holds this tenant's custom tables, or null for the platform database.",
  }),
  managedWorkers: Type.Boolean({
    description:
      "Whether the instance starts workers for this tenant. False when the tenant runs everything on workers of its own.",
  }),
  createdAt: Time,
});
const toTenant = (row: {
  id: string;
  slug: string;
  name: string;
  data_location: DataLocation;
  managed_workers: boolean;
  created_at: Date;
}) => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  dataLocation: row.data_location.kind === "dedicated" ? row.data_location.ref : null,
  managedWorkers: row.managed_workers,
  createdAt: iso(row.created_at),
});

const Group = Type.Object({
  id: Id,
  tenantId: Id,
  key: Type.String({
    description: "What code and a repository name it by. It never changes.",
  }),
  name: Type.String({ description: "What people read. It can change." }),
  description: Type.String(),
  managedBy: Type.String({
    description: "`provider` for one an identity provider made by pushing it, `release` otherwise.",
  }),
  createdAt: Time,
});
const toGroup = (row: {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  description?: string;
  managed_by: string;
  created_at: Date;
}) => ({
  id: row.id,
  tenantId: row.tenant_id,
  key: row.key,
  name: row.name,
  description: row.description ?? "",
  managedBy: row.managed_by,
  createdAt: iso(row.created_at),
});

const ServiceAccount = Type.Object({
  ...Group.properties,
  description: Type.String({ description: 'What it is for, in a sentence: "deploys from CI".' }),
});
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
          querystring: SearchPageQuery,
          response: {
            200: pageOf(
              Type.Object({
                ...Tenant.properties,
                workspaceCount: Type.Integer({ minimum: 0 }),
              }),
            ),
          },
        },
      },
      async ({ ctx, query }) => {
        const args = pageArgs(query);
        const { principal } = ctx;
        let select = db
          .selectFrom("tenant")
          .select(["id", "slug", "name", "data_location", "managed_workers", "created_at"]);
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
        if (query.search) {
          const term = likeTerm(query.search);
          select = select.where((eb) =>
            eb.or([eb(eb.fn("lower", ["name"]), "like", term), eb("slug", "like", term)]),
          );
        }
        if (args.after) select = select.where("id", ">", args.after);
        const rows = await select
          .orderBy("id")
          .limit(args.limit + 1)
          .execute();
        const counts =
          rows.length === 0
            ? []
            : await db
                .selectFrom("workspace")
                .select(["tenant_id", (eb) => eb.fn.countAll<string>().as("count")])
                .where(
                  "tenant_id",
                  "in",
                  rows.map((row) => row.id),
                )
                .groupBy("tenant_id")
                .execute();
        return toPage(
          rows,
          args,
          (row) => row.id,
          (row) => ({
            ...toTenant(row),
            workspaceCount: Number(counts.find((one) => one.tenant_id === row.id)?.count ?? 0),
          }),
        );
      },
    );

    app.post(
      "/tenants",
      {
        config: { access: access.instance("tenant:write") },
        schema: {
          summary: "Create a tenant",
          tags: ["tenancy"],
          body: Type.Object({
            slug: Slug,
            name: Name,
            dataLocation: Type.Optional(
              Type.String({
                description:
                  "The name of a registered dedicated database for this tenant's custom tables. " +
                  "It is chosen once: moving a tenant later is an export and an import.",
              }),
            ),
            addCreator: Type.Optional(
              Type.Boolean({
                description:
                  "Makes the member creating the tenant a member of it, holding `tenant_admin`, " +
                  "in the same change. Without it, an operator sees inside only through an access grant.",
              }),
            ),
          }),
          response: { 201: Tenant },
        },
      },
      async ({ ctx, body }, reply) => {
        // Only a person can be made the tenant's first member.
        const creator = body.addCreator ? ctx.memberId : undefined;
        const tenant = await ctx.mutate(async (trx, audit) => {
          if (body.dataLocation !== undefined) {
            const known = await trx
              .selectFrom("database_location")
              .select("name")
              .where("name", "=", body.dataLocation)
              .executeTakeFirst();
            if (!known) {
              throw badRequest("The tenant cannot be created.", [
                {
                  path: "/body/dataLocation",
                  message: `no database location is registered as "${body.dataLocation}"`,
                },
              ]);
            }
          }
          const row = await trx
            .insertInto("tenant")
            .values({
              id: newId(),
              slug: body.slug,
              name: body.name,
              ...(body.dataLocation !== undefined
                ? { data_location: JSON.stringify({ kind: "dedicated", ref: body.dataLocation }) }
                : {}),
            })
            .returning(["id", "slug", "name", "data_location", "managed_workers", "created_at"])
            .executeTakeFirstOrThrow();
          // The tenant's own log starts with its creation.
          await audit({
            action: "tenant.created",
            targetType: "tenant",
            targetId: row.id,
            tenantId: row.id,
            details: { slug: row.slug, name: row.name, dataLocation: body.dataLocation ?? null },
          });
          if (creator) {
            await trx
              .insertInto("tenant_member")
              .values({ tenant_id: row.id, member_id: creator })
              .execute();
            await audit({
              action: "tenant_member.added",
              targetType: "member",
              targetId: creator,
              tenantId: row.id,
              details: { asCreator: true },
            });
            const admin = await trx
              .selectFrom("role")
              .select("id")
              .where("name", "=", "tenant_admin")
              .where("builtin", "=", true)
              .executeTakeFirstOrThrow();
            await insertBinding(trx, audit, row.id, {
              principalType: "member",
              principalId: creator,
              roleId: admin.id,
              workspaceId: null,
              resourceId: null,
            });
          }
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
          .select(["id", "slug", "name", "data_location", "managed_workers", "created_at"])
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
          summary: "Rename a tenant, or say whether the instance runs workers for it",
          tags: ["tenancy"],
          params: TenantParams,
          body: Type.Object({
            name: Type.Optional(Name),
            managedWorkers: Type.Optional(Type.Boolean()),
          }),
          response: { 200: Tenant },
        },
      },
      async ({ ctx, params, body }) => {
        if (body.name === undefined && body.managedWorkers === undefined) {
          throw badRequest("Send a name, or managedWorkers.");
        }
        const row = await ctx.mutate(async (trx, audit) => {
          const updated = await trx
            .updateTable("tenant")
            .set({
              ...(body.name !== undefined ? { name: body.name } : {}),
              ...(body.managedWorkers !== undefined
                ? { managed_workers: body.managedWorkers }
                : {}),
            })
            .where("id", "=", params.t)
            .returning(["id", "slug", "name", "data_location", "managed_workers", "created_at"])
            .executeTakeFirstOrThrow();
          await audit({
            action: "tenant.updated",
            targetType: "tenant",
            targetId: params.t,
            tenantId: params.t,
            details: { name: updated.name, managedWorkers: updated.managed_workers },
          });
          return updated;
        });
        return toTenant(row);
      },
    );

    // ----- How long the tenant's history is kept -----

    const Days = (bounds: { min: number; max: number }, about: string) =>
      Type.Union([Type.Integer({ minimum: bounds.min, maximum: bounds.max }), Type.Null()], {
        description: `${about} From ${bounds.min} to ${bounds.max} days. Null takes the instance's default.`,
      });
    const RetentionFields = {
      runsDays: Days(
        RETENTION_BOUNDS.runsDays,
        "Script and flow runs, with their logs, after they end.",
      ),
      eventsDays: Days(RETENTION_BOUNDS.eventsDays, "Published events."),
      refusalsDays: Days(
        RETENTION_BOUNDS.refusalsDays,
        "Refused webhook requests and SCIM pushes.",
      ),
      auditDays: Days(RETENTION_BOUNDS.auditDays, "The audit log."),
    };
    const PolicyDays = Type.Object({
      runsDays: Type.Integer(),
      eventsDays: Type.Integer(),
      refusalsDays: Type.Integer(),
      auditDays: Type.Integer(),
    });
    const Retention = Type.Object({
      ...RetentionFields,
      effective: PolicyDays,
      defaults: PolicyDays,
      bounds: Type.Object(
        Object.fromEntries(
          Object.keys(RETENTION_BOUNDS).map((key) => [
            key,
            Type.Object({ min: Type.Integer(), max: Type.Integer() }),
          ]),
        ),
      ),
    });
    const retentionOf = async (tenantId: string) => {
      const row = await db
        .selectFrom("tenant_retention")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      return {
        runsDays: row?.runs_days ?? null,
        eventsDays: row?.events_days ?? null,
        refusalsDays: row?.refusals_days ?? null,
        auditDays: row?.audit_days ?? null,
        effective: await effectivePolicy(kernel, tenantId),
        defaults: kernel.config.retention,
        bounds: RETENTION_BOUNDS,
      };
    };

    app.get(
      "/tenants/:t/retention",
      {
        config: { access: access.tenantOrInstance("tenant:read") },
        schema: {
          summary: "How long the tenant's history is kept",
          description:
            "Each kind is the tenant's own number of days, or null for the instance's default. " +
            "`effective` is what applies.",
          tags: ["tenancy"],
          params: TenantParams,
          response: { 200: Retention },
        },
      },
      async ({ params }) => retentionOf(params.t),
    );

    app.put(
      "/tenants/:t/retention",
      {
        config: { access: access.tenantOrInstance("tenant:write") },
        schema: {
          summary: "Say how long the tenant's history is kept",
          description:
            "Only the kinds sent change. Null goes back to the instance's default. What is " +
            "older than the new period is removed by the next retention pass, within minutes.",
          tags: ["tenancy"],
          params: TenantParams,
          body: Type.Partial(Type.Object(RetentionFields)),
          response: { 200: Retention },
        },
      },
      async ({ ctx, params, body }) => {
        const set = {
          ...(body.runsDays !== undefined ? { runs_days: body.runsDays } : {}),
          ...(body.eventsDays !== undefined ? { events_days: body.eventsDays } : {}),
          ...(body.refusalsDays !== undefined ? { refusals_days: body.refusalsDays } : {}),
          ...(body.auditDays !== undefined ? { audit_days: body.auditDays } : {}),
        };
        if (Object.keys(set).length === 0) {
          throw badRequest("Send at least one of runsDays, eventsDays, refusalsDays, auditDays.");
        }
        await ctx.mutate(async (trx, audit) => {
          await trx
            .insertInto("tenant_retention")
            .values({ tenant_id: params.t, ...set })
            .onConflict((c) =>
              c.column("tenant_id").doUpdateSet({ ...set, updated_at: new Date() }),
            )
            .execute();
          await audit({
            action: "tenant.retention_set",
            targetType: "tenant",
            targetId: params.t,
            tenantId: params.t,
            details: body,
          });
        });
        return retentionOf(params.t);
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
          querystring: SearchPageQuery,
          response: { 200: pageOf(Member) },
        },
      },
      async ({ params, query }) => {
        const args = pageArgs(query);
        let select = db
          .selectFrom("member")
          .innerJoin("tenant_member", "tenant_member.member_id", "member.id")
          .select([
            "member.id",
            "member.name",
            "member.email",
            "member.created_at",
            "tenant_member.suspended_at",
          ])
          .where("tenant_member.tenant_id", "=", params.t);
        if (query.search) {
          const term = likeTerm(query.search);
          select = select.where((eb) =>
            eb.or([
              eb(eb.fn("lower", ["member.email"]), "like", term),
              eb(eb.fn("lower", ["member.name"]), "like", term),
            ]),
          );
        }
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
            "are required and a new member is created. `bindings` gives them roles in the same " +
            "change, at the tenant or in a workspace; each needs `binding:write` there.",
          tags: ["identity"],
          params: TenantParams,
          body: Type.Object({
            email: Type.String({ format: "email", maxLength: 254 }),
            name: Type.Optional(Name),
            password: Type.Optional(
              Type.String({ minLength: MIN_PASSWORD_LENGTH, maxLength: 128 }),
            ),
            bindings: Type.Optional(
              Type.Array(Type.Object({ roleId: Id, workspaceId: Type.Optional(Id) }), {
                maxItems: 20,
              }),
            ),
          }),
          response: { 201: Member },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const email = body.email.trim().toLowerCase();
        // Giving access with the member needs the right to give it, at each scope.
        for (const binding of body.bindings ?? []) {
          await ctx.authorize("binding:write", {
            tenantId: params.t,
            workspaceId: binding.workspaceId,
          });
        }
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
          for (const binding of body.bindings ?? []) {
            await insertBinding(trx, audit, params.t, {
              principalType: "member",
              principalId: found.id,
              roleId: binding.roleId,
              workspaceId: binding.workspaceId ?? null,
              resourceId: null,
            });
          }
          return found;
        });
        return reply.code(201).send(toMember(member));
      },
    );

    app.patch(
      "/tenants/:t/members/:memberId",
      {
        config: { access: access.tenant("member:write") },
        schema: {
          summary: "Suspend or resume a member in a tenant",
          description:
            "A suspended member holds nothing in the tenant: no role, by any binding or group, " +
            "counts until they are resumed. What they were given is kept, and so is whatever " +
            "they hold in other tenants. The tenant's identity provider does this when it says " +
            "someone has left. Nobody suspends themselves.",
          tags: ["identity"],
          params: Type.Object({ t: Id, memberId: Id }),
          body: Type.Object({ suspended: Type.Boolean() }),
          response: { 200: Member },
        },
      },
      async ({ ctx, params, body }) => {
        if (body.suspended && ctx.principal.id === params.memberId) {
          throw badRequest("You cannot suspend yourself.");
        }
        return ctx.mutate((trx, audit) =>
          keepingAnAdmin(trx, params.t, async () => {
            const changed = await trx
              .updateTable("tenant_member")
              .set({ suspended_at: body.suspended ? new Date() : null })
              .where("tenant_id", "=", params.t)
              .where("member_id", "=", params.memberId)
              .returning("suspended_at")
              .executeTakeFirst();
            if (!changed) throw notFound("The member");
            if (body.suspended) await endSessions(trx, params.memberId, { tenantId: params.t });
            await audit({
              action: body.suspended ? "tenant_member.suspended" : "tenant_member.resumed",
              targetType: "member",
              targetId: params.memberId,
              tenantId: params.t,
            });
            const member = await trx
              .selectFrom("member")
              .select(["id", "name", "email", "created_at"])
              .where("id", "=", params.memberId)
              .executeTakeFirstOrThrow();
            return toMember({ ...member, suspended_at: changed.suspended_at });
          }),
        );
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
        await ctx.mutate((trx, audit) =>
          keepingAnAdmin(trx, params.t, async () => {
            const removed = await trx
              .deleteFrom("tenant_member")
              .where("tenant_id", "=", params.t)
              .where("member_id", "=", params.memberId)
              .returning("member_id")
              .executeTakeFirst();
            if (!removed) throw notFound("The member");
            // Their sign-ins to this tenant's apps end with their place in it.
            await endSessions(trx, params.memberId, { tenantId: params.t });
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
            // What the tenant's providers knew of the person goes with them.
            await trx
              .deleteFrom("identity_link")
              .where("tenant_id", "=", params.t)
              .where("principal_type", "=", "member")
              .where("principal_id", "=", params.memberId)
              .execute();
            await trx
              .deleteFrom("scim_user")
              .where("tenant_id", "=", params.t)
              .where("principal_type", "=", "member")
              .where("principal_id", "=", params.memberId)
              .execute();
            await audit({
              action: "tenant_member.removed",
              targetType: "member",
              targetId: params.memberId,
              tenantId: params.t,
              details: { bindingsRemoved: bindings.length },
            });
          }),
        );
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
          body: Type.Object({
            name: Name,
            description: Type.Optional(Type.String({ maxLength: 300 })),
          }),
          response: { 201: Group, 202: Waiting },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const made = await ctx.mutate(async (trx, audit) => {
          const key = await freeKey(trx, params.t, "group", body.name);
          const released = await releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            {
              op: "put",
              resource: {
                kind: "group",
                key,
                body: {
                  title: body.name.trim(),
                  ...(body.description?.trim() ? { description: body.description.trim() } : {}),
                },
              },
            },
            `Made the group ${body.name.trim()}`,
          );
          if (released.status !== "applied") return { released, row: undefined };
          const row = await trx
            .selectFrom("principal_group")
            .selectAll()
            .where("tenant_id", "=", params.t)
            .where("key", "=", key)
            .executeTakeFirstOrThrow();
          return { released, row };
        });
        return made.row
          ? reply.code(201).send(toGroup(made.row))
          : reply.code(202).send(waiting(made.released));
      },
    );

    app.patch(
      "/tenants/:t/groups/:g",
      {
        config: { access: access.tenant("group:write") },
        schema: {
          summary: "Change what a group is called or what it is for",
          description:
            "Its key stays, so everything that names the group by key keeps working. A group " +
            "an identity provider made can be given a description, and keeps the provider's name.",
          tags: ["identity"],
          params: GroupParams,
          body: Type.Object({
            name: Type.Optional(Name),
            description: Type.Optional(Type.String({ maxLength: 300 })),
          }),
          response: { 200: Group, 202: Waiting },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const changed = await ctx.mutate(async (trx, audit) => {
          const now = await accessResource(trx, params.t, "group", params.g);
          if (!now) throw notFound("The group");
          if (now.managedBy === "provider" && body.name !== undefined) {
            throw conflict(
              "This group is made by the identity provider, which names it. Rename it there.",
            );
          }
          const description =
            body.description?.trim() ?? (now.resource.body.description as string | undefined);
          const { description: _was, ...rest } = now.resource.body;
          const released = await releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            {
              op: "put",
              resource: {
                ...now.resource,
                body: {
                  ...rest,
                  title: body.name?.trim() ?? (now.resource.body.title as string),
                  ...(description ? { description } : {}),
                },
              },
            },
            `Changed the group ${now.resource.body.title as string}`,
          );
          if (released.status !== "applied") return { released, row: undefined };
          const row = await trx
            .selectFrom("principal_group")
            .selectAll()
            .where("id", "=", params.g)
            .executeTakeFirstOrThrow();
          return { released, row };
        });
        return changed.row ? toGroup(changed.row) : reply.code(202).send(waiting(changed.released));
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
          summary: "Delete a group and what it was given",
          description:
            "Refused with `principal_in_use` while a workspace's bundle still gives the group " +
            "access: remove it from that code first, so the bundle and the tenant agree.",
          tags: ["identity"],
          params: GroupParams,
          response: { 204: NoContent, 202: Waiting },
        },
      },
      async ({ ctx, params }, reply) => {
        const released = await ctx.mutate(async (trx, audit) => {
          const now = await accessResource(trx, params.t, "group", params.g);
          if (!now) throw notFound("The group");
          return releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            { op: "delete", kind: "group", key: now.resource.key },
            `Deleted the group ${now.resource.body.title as string}`,
          );
        });
        return released.status === "applied"
          ? reply.code(204).send(null)
          : reply.code(202).send(waiting(released));
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
        await ctx.mutate((trx, audit) =>
          keepingAnAdmin(trx, params.t, async () => {
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
          }),
        );
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
          body: Type.Object({
            name: Name,
            description: Type.Optional(Type.String({ maxLength: 300 })),
          }),
          response: { 201: ServiceAccount, 202: Waiting },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const made = await ctx.mutate(async (trx, audit) => {
          const key = await freeKey(trx, params.t, "service_account", body.name);
          const released = await releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            {
              op: "put",
              resource: {
                kind: "service_account",
                key,
                body: {
                  title: body.name.trim(),
                  ...(body.description?.trim() ? { description: body.description.trim() } : {}),
                },
              },
            },
            `Made the service account ${body.name.trim()}`,
          );
          if (released.status !== "applied") return { released, row: undefined };
          const row = await trx
            .selectFrom("service_account")
            .selectAll()
            .where("tenant_id", "=", params.t)
            .where("key", "=", key)
            .executeTakeFirstOrThrow();
          return { released, row };
        });
        return made.row
          ? reply.code(201).send(toServiceAccount(made.row))
          : reply.code(202).send(waiting(made.released));
      },
    );

    app.patch(
      "/tenants/:t/service-accounts/:id",
      {
        config: { access: access.tenant("service_account:write") },
        schema: {
          summary: "Change what a service account is called or what it is for",
          description: "Its key and its API keys stay.",
          tags: ["identity"],
          params: Type.Object({ t: Id, id: Id }),
          body: Type.Object({
            name: Type.Optional(Name),
            description: Type.Optional(Type.String({ maxLength: 300 })),
          }),
          response: { 200: ServiceAccount, 202: Waiting },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const changed = await ctx.mutate(async (trx, audit) => {
          const now = await accessResource(trx, params.t, "service_account", params.id);
          if (!now) throw notFound("The service account");
          const description =
            body.description?.trim() ?? (now.resource.body.description as string | undefined);
          const released = await releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            {
              op: "put",
              resource: {
                ...now.resource,
                body: {
                  title: body.name?.trim() ?? (now.resource.body.title as string),
                  ...(description ? { description } : {}),
                },
              },
            },
            `Changed the service account ${now.resource.body.title as string}`,
          );
          if (released.status !== "applied") return { released, row: undefined };
          const row = await trx
            .selectFrom("service_account")
            .selectAll()
            .where("id", "=", params.id)
            .executeTakeFirstOrThrow();
          return { released, row };
        });
        return changed.row
          ? toServiceAccount(changed.row)
          : reply.code(202).send(waiting(changed.released));
      },
    );

    app.delete(
      "/tenants/:t/service-accounts/:id",
      {
        config: { access: access.tenant("service_account:write") },
        schema: {
          summary: "Delete a service account, its keys and what it was given",
          description:
            "Refused with `principal_in_use` while a workspace's bundle still gives it access.",
          tags: ["identity"],
          params: Type.Object({ t: Id, id: Id }),
          response: { 204: NoContent, 202: Waiting },
        },
      },
      async ({ ctx, params }, reply) => {
        const released = await ctx.mutate(async (trx, audit) => {
          const now = await accessResource(trx, params.t, "service_account", params.id);
          if (!now) throw notFound("The service account");
          return releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            { op: "delete", kind: "service_account", key: now.resource.key },
            `Deleted the service account ${now.resource.body.title as string}`,
          );
        });
        return released.status === "applied"
          ? reply.code(204).send(null)
          : reply.code(202).send(waiting(released));
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
