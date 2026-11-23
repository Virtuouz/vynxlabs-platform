import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@volvel/db";
import { Type } from "typebox";
import { MIN_PASSWORD_LENGTH } from "../config.js";
import { portalUrl } from "../kernel/apps/address.js";
import { actorOf, endAppSession, signInEndUser } from "../kernel/apps/sessions.js";
import { ANONYMOUS, writeAudit } from "../kernel/audit.js";
import {
  changeEndUserPassword,
  checkEndUserPassword,
  cleanEmail,
  createEndUser,
  createPasswordToken,
  endUnusedTokens,
  endUserIdentity,
  setPasswordWithToken,
  signUpAllowed,
} from "../kernel/endusers.js";
import {
  badRequest,
  conflict,
  forbidden,
  HttpError,
  notFound,
  unauthenticated,
} from "../kernel/errors.js";
import { access, guestLimit } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { requireEndUserPasswordAllowed } from "../kernel/sso/people.js";
import { accessResource, freeKey, releaseOne } from "../kernel/tenant/releases.js";
import { listOf, PageQuery, pageOf } from "../pagination.js";
import {
  Id,
  iso,
  isoOrNull,
  Name,
  NoContent,
  NullableString,
  NullableTime,
  pageArgs,
  TenantParams,
  Time,
  toPage,
  Waiting,
  waiting,
} from "./shared.js";

const EndUser = Type.Object({
  id: Id,
  email: Type.String(),
  name: Type.String(),
  hasPassword: Type.Boolean({ description: "False until an invitation has been used." }),
  attributes: Type.Record(Type.String(), Type.String(), {
    description:
      "Facts about the person that a table's row rules can match: which customer they belong to, which region they cover.",
  }),
  groups: Type.Array(Type.String(), { description: "The names of the groups the person is in." }),
  disabled: Type.Boolean(),
  lastSignedInAt: NullableTime,
  createdAt: Time,
});
const toEndUser = (row: {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  attributes?: Record<string, string>;
  groups?: string[] | null;
  disabled_at: Date | null;
  last_signed_in_at: Date | null;
  created_at: Date;
}) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  hasPassword: row.password_hash !== null,
  attributes: row.attributes ?? {},
  groups: row.groups ?? [],
  disabled: row.disabled_at !== null,
  lastSignedInAt: isoOrNull(row.last_signed_in_at),
  createdAt: iso(row.created_at),
});

const Link = Type.Object({
  url: Type.String({ description: "Good once. Whoever opens it sets the account's password." }),
  expiresAt: Time,
  emailed: Type.Boolean({
    description:
      "Whether the link was also sent to the person. False when the instance sends no mail.",
  }),
});

const Email = Type.String({ minLength: 3, maxLength: 320 });
const Password = Type.String({ minLength: MIN_PASSWORD_LENGTH, maxLength: 200 });
const Session = Type.Object({
  principal: Type.Object({
    type: Type.String({ description: "end_user, member, service_account or anonymous." }),
    id: Type.Union([Id, Type.Null()]),
    name: NullableString,
    email: NullableString,
    groups: Type.Optional(
      Type.Array(Type.String(), {
        description:
          "What an end user's groups are called. Empty for anyone else. A name can change: an app that decides by a group should read `groupKeys`.",
      }),
    ),
    groupKeys: Type.Optional(
      Type.Array(Type.String(), {
        description: "The keys of an end user's groups, which never change. Empty for anyone else.",
      }),
    ),
    attributes: Type.Optional(
      Type.Record(Type.String(), Type.String(), {
        description:
          "An end user's attributes, which tables' rules can match. Empty for anyone else.",
      }),
    ),
  }),
  signUp: Type.Boolean({
    description: "Whether people may make their own account in this tenant.",
  }),
});

const SIGN_IN_LIMIT = { max: 20, timeWindow: "1 minute" };
const SIGN_UP_LIMIT = { max: 5, timeWindow: "1 minute" };

/** The tenant's end-user pool: managing it, and signing in to it. */
export function endUserRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    const tenantOf = async (id: string) => {
      const tenant = await db
        .selectFrom("tenant")
        .select(["id", "slug", "name"])
        .where("id", "=", id)
        .executeTakeFirst();
      if (!tenant) throw notFound("The tenant");
      return tenant;
    };

    /** Makes a link, and sends it when the instance sends mail. */
    async function link(
      tenant: { id: string; slug: string; name: string },
      user: { id: string; email: string },
      purpose: "invite" | "reset",
      made: { token: string; expiresAt: Date },
      hostname?: string,
    ) {
      const url = `${portalUrl(kernel, tenant.slug, hostname)}/set-password?token=${made.token}`;
      const emailed =
        kernel.mail.configured &&
        (await kernel.mail.send({
          to: user.email,
          subject:
            purpose === "invite"
              ? `Your account at ${tenant.name}`
              : `Reset your password at ${tenant.name}`,
          text:
            purpose === "invite"
              ? `An account has been made for you at ${tenant.name}.\n\nOpen this link to choose your password:\n${url}\n\nThe link works once, until ${made.expiresAt.toUTCString()}.\n`
              : `Open this link to choose a new password for your account at ${tenant.name}:\n${url}\n\nThe link works once, until ${made.expiresAt.toUTCString()}. If you did not ask for it, you can ignore this message.\n`,
        }));
      return { url, expiresAt: iso(made.expiresAt), emailed };
    }

    /** The registered hostname to build a link on, when one was asked for. */
    async function hostnameOf(tenantId: string, domainId: string | undefined) {
      if (domainId === undefined) return undefined;
      const domain = await db
        .selectFrom("app_domain")
        .select("hostname")
        .where("id", "=", domainId)
        .where("tenant_id", "=", tenantId)
        .where("enabled", "=", true)
        .executeTakeFirst();
      if (!domain) throw badRequest("No enabled domain of this tenant has that ID.");
      return domain.hostname;
    }

    // ----- Managing the pool -----

    app.get(
      "/tenants/:t/end-users",
      {
        config: { access: access.tenant("end_user:read") },
        schema: {
          summary: "List a tenant's end users",
          description: "The people who use the tenant's apps. Page through them with `cursor`.",
          tags: ["end users"],
          params: TenantParams,
          querystring: Type.Object({
            ...PageQuery.properties,
            search: Type.Optional(Type.String({ maxLength: 200 })),
          }),
          response: { 200: pageOf(EndUser) },
        },
      },
      async ({ params, query }) => {
        const args = pageArgs(query);
        let select = db
          .selectFrom("end_user")
          .selectAll()
          .select(
            sql<string[]>`coalesce((
              select array_agg(g.name order by g.name)
              from end_user_group_member m join end_user_group g on g.id = m.group_id
              where m.end_user_id = end_user.id
            ), '{}')`.as("groups"),
          )
          .where("tenant_id", "=", params.t);
        if (query.search) {
          const term = `%${query.search.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`;
          select = select.where((eb) =>
            eb.or([eb("email", "like", term), eb(eb.fn("lower", ["name"]), "like", term)]),
          );
        }
        if (args.after) select = select.where("id", ">", args.after);
        const rows = await select
          .orderBy("id")
          .limit(args.limit + 1)
          .execute();
        return toPage(rows, args, (row) => row.id, toEndUser);
      },
    );

    app.post(
      "/tenants/:t/end-users",
      {
        config: { access: access.tenant("end_user:write") },
        schema: {
          summary: "Add an end user, with an invitation link",
          description:
            "The account has no password yet. The answer carries a link that works once: " +
            "whoever opens it chooses the password. It is emailed to the person when the " +
            "instance sends mail. Otherwise pass it on yourself.",
          tags: ["end users"],
          params: TenantParams,
          body: Type.Object({
            email: Email,
            name: Type.Optional(Name),
            domainId: Type.Optional(
              Type.String({
                format: "uuid",
                description: "Build the link on this registered hostname of the tenant.",
              }),
            ),
          }),
          response: { 201: Type.Object({ endUser: EndUser, invitation: Link }) },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const tenant = await tenantOf(params.t);
        const hostname = await hostnameOf(params.t, body.domainId);
        const made = await ctx.mutate(async (trx, audit) => {
          const user = await createEndUser(kernel, trx, audit, {
            tenantId: params.t,
            email: body.email,
            ...(body.name !== undefined ? { name: body.name } : {}),
          });
          return {
            user,
            token: await createPasswordToken(trx, { id: user.id, tenantId: params.t }, "invite"),
          };
        });
        return reply.code(201).send({
          endUser: toEndUser(made.user),
          invitation: await link(tenant, made.user, "invite", made.token, hostname),
        });
      },
    );

    const UserParams = Type.Object({ t: Id, userId: Id });
    /** At most 50 short facts. Names are plain, so that a rule can name one. */
    const Attributes = Type.Record(
      Type.String({ pattern: "^[a-z][a-z0-9_]{0,62}$" }),
      Type.String({ maxLength: 500 }),
      { maxProperties: 50 },
    );
    const groupsOf = async (from: typeof db, userId: string) =>
      (
        await from
          .selectFrom("end_user_group_member")
          .innerJoin("end_user_group", "end_user_group.id", "end_user_group_member.group_id")
          .select("end_user_group.name")
          .where("end_user_group_member.end_user_id", "=", userId)
          .orderBy("end_user_group.name")
          .execute()
      ).map((row) => row.name);

    app.post(
      "/tenants/:t/end-users/:userId/links",
      {
        config: { access: access.tenant("end_user:write") },
        schema: {
          summary: "Make a new invitation or password reset link for an end user",
          description: "An earlier unused link of the same kind stops working.",
          tags: ["end users"],
          params: UserParams,
          body: Type.Object({
            purpose: Type.Union([Type.Literal("invite"), Type.Literal("reset")]),
            domainId: Type.Optional(Type.String({ format: "uuid" })),
          }),
          response: { 201: Link },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const tenant = await tenantOf(params.t);
        const hostname = await hostnameOf(params.t, body.domainId);
        const made = await ctx.mutate(async (trx, audit) => {
          const user = await trx
            .selectFrom("end_user")
            .select(["id", "email", "disabled_at"])
            .where("id", "=", params.userId)
            .where("tenant_id", "=", params.t)
            .executeTakeFirst();
          if (!user) throw notFound("The end user");
          if (user.disabled_at) throw badRequest("This account is disabled. Enable it first.");
          const token = await createPasswordToken(
            trx,
            { id: user.id, tenantId: params.t },
            body.purpose,
          );
          await audit({
            action: `end_user.${body.purpose}_link_created`,
            targetType: "end_user",
            targetId: user.id,
            tenantId: params.t,
          });
          return { user, token };
        });
        return reply
          .code(201)
          .send(await link(tenant, made.user, body.purpose, made.token, hostname));
      },
    );

    app.patch(
      "/tenants/:t/end-users/:userId",
      {
        config: { access: access.tenant("end_user:write") },
        schema: {
          summary: "Rename, disable or enable an end user",
          description: "Disabling ends every sign-in the person has.",
          tags: ["end users"],
          params: UserParams,
          body: Type.Object({
            name: Type.Optional(Type.String({ maxLength: 200 })),
            disabled: Type.Optional(Type.Boolean()),
            attributes: Type.Optional(Attributes),
          }),
          response: { 200: EndUser },
        },
      },
      async ({ ctx, params, body }) => {
        // The schema's pattern for names is not enforced on every key, so it is checked here.
        const badName = Object.keys(body.attributes ?? {}).find(
          (name) => !/^[a-z][a-z0-9_]{0,62}$/.test(name),
        );
        if (badName !== undefined) {
          throw badRequest("An attribute's name is lowercase letters, digits and underscores.", [
            { path: `/body/attributes/${badName}`, message: "is not a usable name" },
          ]);
        }
        const row = await ctx.mutate(async (trx, audit) => {
          const updated = await trx
            .updateTable("end_user")
            .set({
              updated_at: new Date(),
              ...(body.name !== undefined ? { name: body.name.trim() } : {}),
              ...(body.attributes !== undefined
                ? { attributes: JSON.stringify(body.attributes) }
                : {}),
              ...(body.disabled !== undefined
                ? {
                    disabled_at: body.disabled ? new Date() : null,
                    disabled_by: body.disabled ? "hand" : null,
                  }
                : {}),
            })
            .where("id", "=", params.userId)
            .where("tenant_id", "=", params.t)
            .returningAll()
            .executeTakeFirst();
          if (!updated) throw notFound("The end user");
          if (body.disabled) {
            await endUnusedTokens(trx, updated.id);
            await trx
              .deleteFrom("app_session")
              .where("principal_type", "=", "end_user")
              .where("principal_id", "=", updated.id)
              .execute();
          }
          await audit({
            action:
              body.disabled === undefined
                ? "end_user.updated"
                : body.disabled
                  ? "end_user.disabled"
                  : "end_user.enabled",
            targetType: "end_user",
            targetId: updated.id,
            tenantId: params.t,
            ...(body.attributes !== undefined
              ? { details: { attributes: Object.keys(body.attributes).sort() } }
              : {}),
          });
          return { ...updated, groups: await groupsOf(trx, updated.id) };
        });
        return toEndUser(row);
      },
    );

    app.delete(
      "/tenants/:t/end-users/:userId",
      {
        config: { access: access.tenant("end_user:write") },
        schema: {
          summary: "Delete an end user",
          description:
            "Removes the account, its sign-ins and its bindings. Rows the person owns in " +
            "custom tables stay, with the owner they had.",
          tags: ["end users"],
          params: UserParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const removed = await trx
            .deleteFrom("end_user")
            .where("id", "=", params.userId)
            .where("tenant_id", "=", params.t)
            .returning(["id", "email"])
            .executeTakeFirst();
          if (!removed) throw notFound("The end user");
          await trx
            .deleteFrom("app_session")
            .where("principal_type", "=", "end_user")
            .where("principal_id", "=", removed.id)
            .execute();
          await trx
            .deleteFrom("binding")
            .where("principal_type", "=", "end_user")
            .where("principal_id", "=", removed.id)
            .execute();
          // Nothing of the person is left for a provider to sign in or to push to.
          await trx
            .deleteFrom("identity_link")
            .where("principal_type", "=", "end_user")
            .where("principal_id", "=", removed.id)
            .execute();
          await trx
            .deleteFrom("scim_user")
            .where("principal_type", "=", "end_user")
            .where("principal_id", "=", removed.id)
            .execute();
          await audit({
            action: "end_user.deleted",
            targetType: "end_user",
            targetId: removed.id,
            tenantId: params.t,
            details: { email: removed.email },
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Groups of end users -----

    /**
     * Any name, as a group of members takes. Rows match a group by its name in a
     * text column, so it is trimmed and kept to one line.
     */
    const GroupName = Type.String({
      minLength: 1,
      maxLength: 100,
      pattern: "^\\S(?:[^\\n]*\\S)?$",
    });
    const Group = Type.Object({
      id: Id,
      name: Type.String(),
      description: Type.String(),
      memberCount: Type.Integer(),
      createdAt: Time,
    });
    const GroupParams = Type.Object({ t: Id, g: Id });
    const findGroup = async (from: typeof db, tenantId: string, groupId: string) => {
      const group = await from
        .selectFrom("end_user_group")
        .selectAll()
        .where("id", "=", groupId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (!group) throw notFound("The group");
      return group;
    };

    app.get(
      "/tenants/:t/end-user-groups",
      {
        config: { access: access.tenant("end_user_group:read") },
        schema: {
          summary: "The tenant's groups of end users",
          description: "Each group of end users in the tenant.",
          tags: ["end users"],
          params: TenantParams,
          response: { 200: listOf(Group) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("end_user_group")
          .selectAll("end_user_group")
          .select((eb) =>
            eb
              .selectFrom("end_user_group_member")
              .select((count) => count.fn.countAll<string>().as("n"))
              .whereRef("end_user_group_member.group_id", "=", "end_user_group.id")
              .as("member_count"),
          )
          .where("tenant_id", "=", params.t)
          .orderBy("name")
          .execute();
        return {
          items: rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            memberCount: Number(row.member_count ?? 0),
            createdAt: iso(row.created_at),
          })),
        };
      },
    );

    app.post(
      "/tenants/:t/end-user-groups",
      {
        config: { access: access.tenant("end_user_group:write") },
        schema: {
          summary: "Create a group of end users",
          description:
            "Give a role to the group under Access, and rule a table's rows by it. The name is " +
            "what a repository's binding and a row rule refer to, so it cannot be changed later.",
          tags: ["end users"],
          params: TenantParams,
          body: Type.Object({
            name: GroupName,
            description: Type.Optional(Type.String({ maxLength: 500 })),
          }),
          response: { 201: Group, 202: Waiting },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const made = await ctx.mutate(async (trx, audit) => {
          const taken = await trx
            .selectFrom("end_user_group")
            .select("id")
            .where("tenant_id", "=", params.t)
            .where("name", "=", body.name)
            .executeTakeFirst();
          if (taken) throw conflict(`A group of end users named ${body.name} already exists.`);
          const key = await freeKey(trx, params.t, "end_user_group", body.name);
          const released = await releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            {
              op: "put",
              resource: {
                kind: "end_user_group",
                key,
                body: {
                  title: body.name,
                  ...(body.description?.trim() ? { description: body.description.trim() } : {}),
                },
              },
            },
            `Made the group of end users ${body.name}`,
          );
          if (released.status !== "applied") return { released, row: undefined };
          const row = await trx
            .selectFrom("end_user_group")
            .selectAll()
            .where("tenant_id", "=", params.t)
            .where("key", "=", key)
            .executeTakeFirstOrThrow();
          return { released, row };
        });
        if (!made.row) return reply.code(202).send(waiting(made.released));
        return reply.code(201).send({
          id: made.row.id,
          name: made.row.name,
          description: made.row.description,
          memberCount: 0,
          createdAt: iso(made.row.created_at),
        });
      },
    );

    app.get(
      "/tenants/:t/end-user-groups/:g",
      {
        config: { access: access.tenant("end_user_group:read") },
        schema: {
          summary: "One group of end users, with who is in it",
          description: "The group and the end users in it.",
          tags: ["end users"],
          params: GroupParams,
          response: {
            200: Type.Object({
              id: Id,
              name: Type.String(),
              description: Type.String(),
              members: Type.Array(
                Type.Object({ id: Id, email: Type.String(), name: Type.String() }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const group = await findGroup(db, params.t, params.g);
        const members = await db
          .selectFrom("end_user_group_member")
          .innerJoin("end_user", "end_user.id", "end_user_group_member.end_user_id")
          .select(["end_user.id", "end_user.email", "end_user.name"])
          .where("end_user_group_member.group_id", "=", group.id)
          .orderBy("end_user.email")
          .execute();
        return { id: group.id, name: group.name, description: group.description, members };
      },
    );

    app.patch(
      "/tenants/:t/end-user-groups/:g",
      {
        config: { access: access.tenant("end_user_group:write") },
        schema: {
          summary: "Change what a group of end users is called or what it is for",
          description:
            "Its key stays, so a binding that names it by key, and a row that holds its key, " +
            "are not touched. A row that holds what the group was called stops being its row: " +
            "rows should hold the key.",
          tags: ["end users"],
          params: GroupParams,
          body: Type.Object({
            name: Type.Optional(GroupName),
            description: Type.Optional(Type.String({ maxLength: 500 })),
          }),
          response: { 200: Group, 202: Waiting },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const changed = await ctx.mutate(async (trx, audit) => {
          const group = await findGroup(trx, params.t, params.g);
          const now = await accessResource(trx, params.t, "end_user_group", group.id);
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
                  title: body.name ?? (now.resource.body.title as string),
                  ...(description ? { description } : {}),
                },
              },
            },
            `Changed the group of end users ${group.name}`,
          );
          if (released.status !== "applied") return { released, row: undefined };
          const row = await trx
            .selectFrom("end_user_group")
            .selectAll()
            .where("id", "=", group.id)
            .executeTakeFirstOrThrow();
          const members = await trx
            .selectFrom("end_user_group_member")
            .select((eb) => eb.fn.countAll<string>().as("n"))
            .where("group_id", "=", group.id)
            .executeTakeFirst();
          return { released, row, members: Number(members?.n ?? 0) };
        });
        if (!changed.row) return reply.code(202).send(waiting(changed.released));
        return {
          id: changed.row.id,
          name: changed.row.name,
          description: changed.row.description,
          memberCount: changed.members ?? 0,
          createdAt: iso(changed.row.created_at),
        };
      },
    );

    app.delete(
      "/tenants/:t/end-user-groups/:g",
      {
        config: { access: access.tenant("end_user_group:write") },
        schema: {
          summary: "Delete a group of end users",
          description:
            "Its members lose what the group was given. A table ruled by the group shows its rows to nobody in it any more.",
          tags: ["end users"],
          params: GroupParams,
          response: { 204: NoContent, 202: Waiting },
        },
      },
      async ({ ctx, params }, reply) => {
        const released = await ctx.mutate(async (trx, audit) => {
          const group = await findGroup(trx, params.t, params.g);
          const now = await accessResource(trx, params.t, "end_user_group", group.id);
          if (!now) throw notFound("The group");
          return releaseOne(
            trx,
            audit,
            params.t,
            ctx.principal,
            { op: "delete", kind: "end_user_group", key: now.resource.key },
            `Deleted the group of end users ${group.name}`,
          );
        });
        return released.status === "applied"
          ? reply.code(204).send(null)
          : reply.code(202).send(waiting(released));
      },
    );

    const MembershipParams = Type.Object({ t: Id, g: Id, userId: Id });

    app.put(
      "/tenants/:t/end-user-groups/:g/members/:userId",
      {
        config: { access: access.tenant("end_user_group:write") },
        schema: {
          summary: "Put an end user in a group",
          description: "Takes effect on the person's next request. Doing it twice changes nothing.",
          tags: ["end users"],
          params: MembershipParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const group = await findGroup(trx, params.t, params.g);
          const user = await trx
            .selectFrom("end_user")
            .select(["id", "email"])
            .where("id", "=", params.userId)
            .where("tenant_id", "=", params.t)
            .executeTakeFirst();
          if (!user) throw notFound("The end user");
          await trx
            .insertInto("end_user_group_member")
            .values({ group_id: group.id, end_user_id: user.id })
            .onConflict((oc) => oc.doNothing())
            .execute();
          await audit({
            action: "end_user_group.member_added",
            targetType: "end_user_group",
            targetId: group.id,
            tenantId: params.t,
            details: { name: group.name, endUserId: user.id, email: user.email },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.delete(
      "/tenants/:t/end-user-groups/:g/members/:userId",
      {
        config: { access: access.tenant("end_user_group:write") },
        schema: {
          summary: "Take an end user out of a group",
          description: "The person loses what the group's bindings gave them. Audited.",
          tags: ["end users"],
          params: MembershipParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const group = await findGroup(trx, params.t, params.g);
          const removed = await trx
            .deleteFrom("end_user_group_member")
            .where("group_id", "=", group.id)
            .where("end_user_id", "=", params.userId)
            .returning("end_user_id")
            .executeTakeFirst();
          if (!removed) throw notFound("That person in the group");
          await audit({
            action: "end_user_group.member_removed",
            targetType: "end_user_group",
            targetId: group.id,
            tenantId: params.t,
            details: { name: group.name, endUserId: params.userId },
          });
        });
        return reply.code(204).send(null);
      },
    );

    // ----- Signing in -----

    app.get(
      "/tenants/:t/session",
      {
        config: {
          access: access.custom(
            "Answers for anyone, signed in or not, and says who is calling as the tenant's apps see them.",
          ),
          rateLimit: guestLimit,
        },
        schema: {
          summary: "Who is calling, as this tenant's apps see them",
          description:
            "For apps. Answers for anyone, signed in or not: an app uses it to decide what to show.",
          tags: ["end users"],
          params: TenantParams,
          response: { 200: Session },
        },
      },
      async ({ ctx, params }) => {
        const { principal } = ctx;
        return {
          principal: {
            type: principal.type,
            id: principal.id,
            name: principal.name ?? null,
            email: principal.email ?? null,
            ...(await endUserIdentity(db, params.t, principal)),
          },
          signUp: await signUpAllowed(db, params.t),
        };
      },
    );

    app.post(
      "/tenants/:t/end-user-auth/sign-in",
      {
        config: { access: access.public, rateLimit: SIGN_IN_LIMIT },
        schema: {
          summary: "Sign in as an end user of the tenant",
          description:
            "Sets a session cookie that is good for this tenant's apps, at the address the " +
            "request was sent to.",
          tags: ["end users"],
          params: TenantParams,
          body: Type.Object({ email: Email, password: Type.String({ maxLength: 200 }) }),
          response: { 200: Session },
        },
      },
      async (request, reply) => {
        const { params, body } = request;
        await requireEndUserPasswordAllowed(db, params.t, body.email, actorOf(request, ANONYMOUS));
        const user = await checkEndUserPassword(kernel, params.t, body.email, body.password);
        if (!user) throw unauthenticated("The email or the password is not right.");
        await signIn(request, reply, params.t, user.id);
        return {
          principal: { type: "end_user", id: user.id, name: user.name, email: user.email },
          signUp: await signUpAllowed(db, params.t),
        };
      },
    );

    const signIn = (
      request: Parameters<typeof signInEndUser>[1],
      reply: Parameters<typeof signInEndUser>[2],
      tenantId: string,
      userId: string,
    ) => signInEndUser(kernel, request, reply, tenantId, userId);

    app.post(
      "/tenants/:t/end-user-auth/sign-out",
      {
        config: {
          access: access.custom(
            "Needs the end user's own session in this tenant. With none there is nothing to end.",
          ),
        },
        schema: {
          summary: "End the calling end user's session",
          description: "Their sign-in to this tenant's apps ends.",
          tags: ["end users"],
          params: TenantParams,
          response: { 204: NoContent },
        },
      },
      async (request, reply) => {
        const { ctx, params } = request;
        await ctx.mutate(async (trx, audit) => {
          const ended = await endAppSession(trx, request, reply, params.t);
          await audit({
            action: "app_session.ended",
            targetType: ended?.type ?? "session",
            targetId: ended?.id ?? null,
            tenantId: params.t,
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.post(
      "/tenants/:t/end-user-auth/sign-up",
      {
        config: { access: access.public, rateLimit: SIGN_UP_LIMIT },
        schema: {
          summary: "Make an end-user account for yourself",
          description: "Only when the tenant allows it. Signs the new account in.",
          tags: ["end users"],
          params: TenantParams,
          body: Type.Object({ email: Email, name: Type.Optional(Name), password: Password }),
          response: { 201: Session },
        },
      },
      async (request, reply) => {
        const { params, body } = request;
        if (!(await signUpAllowed(db, params.t))) throw forbidden("end_user:write");
        await requireEndUserPasswordAllowed(db, params.t, body.email, actorOf(request, ANONYMOUS));
        const actor = {
          principal: { type: "anonymous" as const, id: null },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
          requestId: request.id,
        };
        const user = await db.transaction().execute((trx) =>
          createEndUser(
            kernel,
            trx,
            (input) => writeAudit(trx, actor, input),
            {
              tenantId: params.t,
              email: body.email,
              password: body.password,
              ...(body.name !== undefined ? { name: body.name } : {}),
            },
            "signed_up",
          ),
        );
        await signIn(request, reply, params.t, user.id);
        return reply.code(201).send({
          principal: { type: "end_user", id: user.id, name: user.name, email: user.email },
          signUp: true,
        });
      },
    );

    app.post(
      "/tenants/:t/end-user-auth/password-links",
      {
        config: { access: access.public, rateLimit: SIGN_UP_LIMIT },
        schema: {
          summary: "Ask for a password reset link by email",
          description:
            "Answers the same whether or not the email has an account. A link is sent only " +
            "when the instance sends mail: `sent` is false when it does not, and the person " +
            "must ask the tenant's staff for a link.",
          tags: ["end users"],
          params: TenantParams,
          body: Type.Object({ email: Email }),
          response: { 200: Type.Object({ sent: Type.Boolean() }) },
        },
      },
      async (request) => {
        const { params, body } = request;
        if (!kernel.mail.configured) return { sent: false };
        const tenant = await tenantOf(params.t);
        const email = cleanEmail(body.email);
        const place = await kernel.hosts.place(request);
        const user = await db
          .selectFrom("end_user")
          .select(["id", "email"])
          .where("tenant_id", "=", params.t)
          .where("email", "=", email)
          .where("disabled_at", "is", null)
          .executeTakeFirst();
        if (user) {
          const made = await db.transaction().execute(async (trx) => {
            const token = await createPasswordToken(
              trx,
              { id: user.id, tenantId: params.t },
              "reset",
            );
            await writeAudit(
              trx,
              {
                principal: { type: "anonymous", id: null },
                ipAddress: request.ip,
                userAgent: request.headers["user-agent"],
                requestId: request.id,
              },
              {
                action: "end_user.reset_requested",
                targetType: "end_user",
                targetId: user.id,
                tenantId: params.t,
              },
            );
            return token;
          });
          // Not awaited: how long sending takes must not tell an account from none.
          void link(
            tenant,
            user,
            "reset",
            made,
            place.kind === "domain" ? place.domain.hostname : undefined,
          );
        }
        return { sent: true };
      },
    );

    app.post(
      "/tenants/:t/end-user-auth/passwords",
      {
        config: {
          access: access.publicWith(
            "Needs the token of the invitation or reset link, in the body.",
          ),
          rateLimit: SIGN_IN_LIMIT,
        },
        schema: {
          summary: "Set a password with an invitation or reset link's token",
          description: "The token works once. Signs the account in.",
          tags: ["end users"],
          params: TenantParams,
          body: Type.Object({
            token: Type.String({ minLength: 20, maxLength: 200 }),
            password: Password,
            name: Type.Optional(Name),
          }),
          response: { 200: Session },
        },
      },
      async (request, reply) => {
        const { params, body } = request;
        const user = await db.transaction().execute((trx) =>
          setPasswordWithToken(
            kernel,
            trx,
            (input) =>
              writeAudit(
                trx,
                {
                  principal: { type: "anonymous", id: null },
                  ipAddress: request.ip,
                  userAgent: request.headers["user-agent"],
                  requestId: request.id,
                },
                input,
              ),
            {
              tenantId: params.t,
              token: body.token,
              password: body.password,
              ...(body.name !== undefined ? { name: body.name } : {}),
            },
          ),
        );
        await signIn(request, reply, params.t, user.id);
        return {
          principal: { type: "end_user", id: user.id, name: user.name, email: user.email },
          signUp: await signUpAllowed(db, params.t),
        };
      },
    );

    app.put(
      "/tenants/:t/end-user-auth/password",
      {
        config: {
          access: access.custom(
            "Needs the end user's own sign-in to this tenant. A member or an API key is refused.",
          ),
          rateLimit: SIGN_IN_LIMIT,
        },
        schema: {
          summary: "Change the calling end user's password",
          description: "Ends the person's other sign-ins.",
          tags: ["end users"],
          params: TenantParams,
          body: Type.Object({ current: Type.String({ maxLength: 200 }), password: Password }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const { principal } = ctx;
        if (principal.type !== "end_user" || principal.tenantId !== params.t || !principal.id) {
          throw new HttpError(
            403,
            "forbidden",
            "Only a signed-in end user can change their password here.",
          );
        }
        const id = principal.id;
        await ctx.mutate((trx, audit) =>
          changeEndUserPassword(kernel, trx, audit, {
            tenantId: params.t,
            id,
            current: body.current,
            password: body.password,
            ...(principal.appSessionId ? { keepSessionId: principal.appSessionId } : {}),
          }),
        );
        return reply.code(204).send(null);
      },
    );
  };
}
