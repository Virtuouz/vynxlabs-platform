import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { PERMISSION_KINDS } from "@vynxlabs/manifest";
import { CORE_NODES } from "@vynxlabs/nodes";
import { Type } from "typebox";
import { MIN_PASSWORD_LENGTH } from "../config.js";
import type { Trx } from "../kernel/audit.js";
import { badRequest, conflict, forbidden, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { INSTANCE_ONLY_ROLE } from "../kernel/kinds.js";
import { createMember } from "../kernel/members.js";
import { generateApiKey } from "../kernel/principal.js";
import { makeRecoveryCodes, ownsATenant } from "../kernel/sso/recovery.js";
import { PageQuery, pageOf } from "../pagination.js";
import {
  AnyObject,
  Id,
  iso,
  isoOrNull,
  Name,
  NoContent,
  NullableId,
  NullableString,
  NullableTime,
  pageArgs,
  Time,
  toPage,
} from "./shared.js";

export const Member = Type.Object({
  id: Id,
  name: Type.String(),
  email: Type.String(),
  createdAt: Time,
  suspended: Type.Optional(
    Type.Boolean({
      description: "In a tenant's list: whether the member may not act in the tenant for now.",
    }),
  ),
  disabled: Type.Optional(
    Type.Boolean({
      description: "In the instance's list: whether the account can sign in nowhere.",
    }),
  ),
});
export const toMember = (row: {
  id: string;
  name: string;
  email: string;
  created_at: Date;
  suspended_at?: Date | null;
  disabled_at?: Date | null;
}) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  createdAt: iso(row.created_at),
  ...(row.suspended_at !== undefined ? { suspended: row.suspended_at !== null } : {}),
  ...(row.disabled_at !== undefined ? { disabled: row.disabled_at !== null } : {}),
});

export const NewMemberBody = Type.Object({
  email: Type.String({ format: "email", maxLength: 254 }),
  name: Name,
  password: Type.String({ minLength: MIN_PASSWORD_LENGTH, maxLength: 128 }),
});

export const ApiKey = Type.Object({
  id: Id,
  name: Type.String(),
  prefix: Type.String({ description: "The first characters of the key, to tell keys apart." }),
  suffix: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: "Its last four characters. Null for a key made before they were kept.",
    }),
  ),
  ownerType: Type.Union([Type.Literal("member"), Type.Literal("service_account")]),
  ownerId: Id,
  expiresAt: NullableTime,
  lastUsedAt: NullableTime,
  revokedAt: NullableTime,
  createdAt: Time,
});
export const NewApiKey = Type.Object({
  ...ApiKey.properties,
  token: Type.String({ description: "The key itself. Shown only in this response." }),
});
export const NewApiKeyBody = Type.Object({ name: Name, expiresAt: Type.Optional(Time) });

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  suffix?: string | null;
  owner_type: "member" | "service_account";
  owner_id: string;
  expires_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}
export const toApiKey = (row: ApiKeyRow) => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  suffix: row.suffix ?? null,
  ownerType: row.owner_type,
  ownerId: row.owner_id,
  expiresAt: isoOrNull(row.expires_at),
  lastUsedAt: isoOrNull(row.last_used_at),
  revokedAt: isoOrNull(row.revoked_at),
  createdAt: iso(row.created_at),
});

/** Inserts a key for an owner and returns the row plus the one-time token. */
export async function insertApiKey(
  trx: Trx,
  owner: { type: "member" | "service_account"; id: string },
  input: { name: string; expiresAt?: string | undefined },
) {
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw badRequest("expiresAt must be in the future.");
  const key = generateApiKey();
  const row = await trx
    .insertInto("api_key")
    .values({
      id: newId(),
      owner_type: owner.type,
      owner_id: owner.id,
      name: input.name,
      prefix: key.prefix,
      suffix: key.token.slice(-4),
      token_hash: key.hash,
      expires_at: expiresAt,
      last_used_at: null,
      revoked_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { ...toApiKey(row), token: key.token };
}

export const AuditEntry = Type.Object({
  id: Id,
  occurredAt: Time,
  tenantId: NullableId,
  workspaceId: NullableId,
  actorType: Type.String(),
  actorId: NullableId,
  actorLabel: Type.Union([Type.String(), Type.Null()], {
    description: "A member's email or a service account's name, when the actor is one of those.",
  }),
  apiKeyId: NullableId,
  accessGrantId: NullableId,
  action: Type.String(),
  targetType: Type.String(),
  targetId: NullableString,
  details: AnyObject,
  ipAddress: NullableString,
  userAgent: NullableString,
  requestId: NullableString,
});
export const AuditQuery = Type.Object({
  ...PageQuery.properties,
  action: Type.Optional(Type.String({ description: "Only entries with exactly this action." })),
  area: Type.Optional(
    Type.String({
      pattern: "^[a-z][a-z0-9_]*$",
      maxLength: 63,
      description:
        "Only entries whose action starts with this word and a dot: `secret` for `secret.set`.",
    }),
  ),
  actorId: Type.Optional(Type.String({ format: "uuid", description: "Only what this actor did." })),
  target: Type.Optional(
    Type.String({ maxLength: 255, description: "Only entries about the thing with this ID." }),
  ),
  from: Type.Optional(
    Type.String({ format: "date-time", description: "Nothing older than this." }),
  ),
  to: Type.Optional(Type.String({ format: "date-time", description: "Nothing newer than this." })),
});

/** A page of audit entries, newest first. `tenantId` null selects instance-level entries. */
export async function auditPage(
  kernel: Kernel,
  tenantId: string | null,
  query: {
    limit?: number;
    cursor?: string;
    action?: string;
    area?: string;
    actorId?: string;
    target?: string;
    from?: string;
    to?: string;
  },
) {
  const args = pageArgs(query);
  let select = kernel.db.selectFrom("audit_entry").selectAll();
  select =
    tenantId === null
      ? select.where("tenant_id", "is", null)
      : select.where("tenant_id", "=", tenantId);
  if (query.action) select = select.where("action", "=", query.action);
  // The pattern on `area` allows no wildcard character, so it is safe inside `like`.
  if (query.area) select = select.where("action", "like", `${query.area}.%`);
  if (query.actorId) select = select.where("actor_id", "=", query.actorId);
  if (query.target) select = select.where("target_id", "=", query.target);
  if (query.from) select = select.where("occurred_at", ">=", new Date(query.from));
  if (query.to) select = select.where("occurred_at", "<=", new Date(query.to));
  if (args.after) select = select.where("id", "<", args.after);
  const rows = await select
    .orderBy("id", "desc")
    .limit(args.limit + 1)
    .execute();
  // Who each actor is, for people to read: a member's email or a service account's name.
  const ids = (type: string) => [
    ...new Set(
      rows
        .filter((row) => row.actor_type === type && row.actor_id)
        .map((row) => row.actor_id as string),
    ),
  ];
  const members = ids("member");
  const accounts = ids("service_account");
  const names = new Map<string, string>();
  if (members.length > 0) {
    for (const member of await kernel.db
      .selectFrom("member")
      .select(["id", "email"])
      .where("id", "in", members)
      .execute()) {
      names.set(member.id, member.email);
    }
  }
  if (accounts.length > 0) {
    for (const account of await kernel.db
      .selectFrom("service_account")
      .select(["id", "name"])
      .where("id", "in", accounts)
      .execute()) {
      names.set(account.id, account.name);
    }
  }
  return toPage(
    rows,
    args,
    (row) => row.id,
    (row) => ({
      id: row.id,
      occurredAt: iso(row.occurred_at),
      tenantId: row.tenant_id,
      workspaceId: row.workspace_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      actorLabel: (row.actor_id && names.get(row.actor_id)) ?? null,
      apiKeyId: row.api_key_id,
      accessGrantId: row.access_grant_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: row.details,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      requestId: row.request_id,
    }),
  );
}

const InstanceBinding = Type.Object({
  id: Id,
  memberId: Id,
  memberEmail: Type.String(),
  roleId: Id,
  roleName: Type.String(),
  createdAt: Time,
});

export function identityRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/me/recovery-codes",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "How many of the caller's recovery codes are left",
          tags: ["identity"],
          response: {
            200: Type.Object({
              eligible: Type.Boolean({
                description: "Whether the caller owns a tenant, and so may hold codes.",
              }),
              left: Type.Integer(),
              madeAt: Type.Union([Time, Type.Null()]),
            }),
          },
        },
      },
      async ({ ctx }) => {
        if (ctx.principal.type !== "member" || !ctx.principal.id)
          return { eligible: false, left: 0, madeAt: null };
        const rows = await kernel.db
          .selectFrom("member_recovery_code")
          .select(["used_at", "created_at"])
          .where("member_id", "=", ctx.principal.id)
          .execute();
        return {
          eligible: await ownsATenant(kernel.db, ctx.principal.id),
          left: rows.filter((row) => row.used_at === null).length,
          madeAt: rows[0] ? iso(rows[0].created_at) : null,
        };
      },
    );

    app.post(
      "/me/recovery-codes",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "Make the caller's recovery codes, putting away any they had",
          description:
            "For a tenant's owner. While single sign-on is required, a code with the owner's " +
            "own password signs them in once, so a broken provider cannot lock the tenant out. " +
            "The codes are shown in this answer only, and kept as hashes.",
          tags: ["identity"],
          response: { 201: Type.Object({ codes: Type.Array(Type.String()) }) },
        },
      },
      async ({ ctx }, reply) => {
        if (ctx.principal.type !== "member" || !ctx.principal.id)
          throw forbidden("a member's own sign-in");
        const memberId = ctx.principal.id;
        if (!(await ownsATenant(kernel.db, memberId)))
          throw forbidden("tenant_admin over a tenant: recovery codes are for a tenant's owners");
        const codes = await ctx.mutate(async (trx, audit) => {
          const made = await makeRecoveryCodes(trx, memberId);
          await audit({
            action: "member.recovery_codes_made",
            targetType: "member",
            targetId: memberId,
            details: { count: made.length },
          });
          return made;
        });
        return reply.code(201).send({ codes });
      },
    );

    app.get(
      "/me/recent",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "Where the caller was last in each tenant",
          description: "Kept by the server, so it follows a member from one device to the next.",
          tags: ["identity"],
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  tenantId: Id,
                  workspaceId: Type.Union([Id, Type.Null()]),
                  visitedAt: Time,
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx }) => {
        if (ctx.principal.type !== "member" || !ctx.principal.id) return { items: [] };
        const rows = await kernel.db
          .selectFrom("member_recent_scope")
          .selectAll()
          .where("member_id", "=", ctx.principal.id)
          .orderBy("visited_at", "desc")
          .execute();
        return {
          items: rows.map((row) => ({
            tenantId: row.tenant_id,
            workspaceId: row.workspace_id,
            visitedAt: iso(row.visited_at),
          })),
        };
      },
    );

    app.put(
      "/me/recent",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "Remember where the caller is",
          description:
            "Kept only for a tenant the member belongs to, and written only when the workspace " +
            "changes. It records where a person was, for them to come back to.",
          tags: ["identity"],
          body: Type.Object({
            tenantId: Id,
            workspaceId: Type.Optional(Type.Union([Id, Type.Null()])),
          }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, body }, reply) => {
        if (ctx.principal.type !== "member" || !ctx.principal.id) {
          ctx.mutated = true;
          return reply.code(204).send(null);
        }
        const memberId = ctx.principal.id;
        const belongs = await kernel.db
          .selectFrom("tenant_member")
          .select("tenant_id")
          .where("member_id", "=", memberId)
          .where("tenant_id", "=", body.tenantId)
          .executeTakeFirst();
        if (!belongs) {
          // Nothing is kept for a tenant the caller does not belong to: nothing changed.
          ctx.mutated = true;
          return reply.code(204).send(null);
        }
        const workspace = body.workspaceId
          ? await kernel.db
              .selectFrom("workspace")
              .select("id")
              .where("id", "=", body.workspaceId)
              .where("tenant_id", "=", body.tenantId)
              .executeTakeFirst()
          : undefined;
        const before = await kernel.db
          .selectFrom("member_recent_scope")
          .select("workspace_id")
          .where("member_id", "=", memberId)
          .where("tenant_id", "=", body.tenantId)
          .executeTakeFirst();
        const now = workspace?.id ?? null;
        // Kept through the write path, and only when it moves: moving within one workspace
        // writes nothing, and so leaves the audit log alone.
        if (before && before.workspace_id === now) {
          ctx.mutated = true;
          return reply.code(204).send(null);
        }
        await ctx.mutate(async (trx, audit) => {
          await trx
            .insertInto("member_recent_scope")
            .values({
              member_id: memberId,
              tenant_id: body.tenantId,
              workspace_id: now,
              visited_at: new Date(),
            })
            .onConflict((c) =>
              c
                .columns(["member_id", "tenant_id"])
                .doUpdateSet({ workspace_id: now, visited_at: new Date() }),
            )
            .execute();
          await audit({
            action: "member.recent_set",
            targetType: "tenant",
            targetId: body.tenantId,
            tenantId: body.tenantId,
            details: { workspaceId: now },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/me",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "The calling principal",
          tags: ["identity"],
          response: {
            200: Type.Object({
              principal: Type.Object({
                type: Type.String(),
                id: Id,
                name: NullableString,
                email: NullableString,
              }),
              instancePermissions: Type.Array(Type.String(), {
                description: "Permissions held at instance scope.",
              }),
              tenants: Type.Array(
                Type.Object({ id: Id, slug: Type.String(), name: Type.String() }),
              ),
            }),
          },
        },
      },
      async ({ ctx }) => {
        const { principal } = ctx;
        const id = principal.id as string;
        const roles =
          principal.type === "member"
            ? await kernel.db
                .selectFrom("binding")
                .innerJoin("role", "role.id", "binding.role_id")
                .select("role.permissions")
                .where("binding.scope_type", "=", "instance")
                .where("binding.principal_type", "=", "member")
                .where("binding.principal_id", "=", id)
                .execute()
            : [];
        let tenants = kernel.db.selectFrom("tenant").select(["id", "slug", "name"]).orderBy("slug");
        tenants =
          principal.type === "member"
            ? tenants.where("id", "in", (eb) =>
                // A tenant the member is suspended in is not offered: nothing in it would open.
                eb
                  .selectFrom("tenant_member")
                  .select("tenant_id")
                  .where("member_id", "=", id)
                  .where("suspended_at", "is", null),
              )
            : tenants.where("id", "=", principal.tenantId as string);
        return {
          principal: {
            type: principal.type,
            id,
            name: principal.name ?? null,
            email: principal.email ?? null,
          },
          instancePermissions: [...new Set(roles.flatMap((role) => role.permissions))].sort(),
          tenants: await tenants.execute(),
        };
      },
    );

    app.get(
      "/kinds",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "Registered resource kinds",
          tags: ["resources"],
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({ kind: Type.String(), schemaVersions: Type.Array(Type.Integer()) }),
              ),
            }),
          },
        },
      },
      async () => ({ items: kernel.kinds.kinds() }),
    );

    app.get(
      "/core-nodes",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "The core nodes: steps for flows that come with the platform",
          description:
            "Each is a script under `core/`. A flow uses one by naming it in a script step, and " +
            "the platform adds it to the workspace's bundle when the bundle is composed. " +
            "`takes` is what a step may hand it with `with`. In `input`, a field marked " +
            "`x-pick` names a connection, a table or an event of the workspace.",
          tags: ["flows"],
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  label: Type.String(),
                  icon: Type.String(),
                  category: Type.String(),
                  description: Type.String(),
                  takes: Type.Array(Type.String()),
                  input: AnyObject,
                  output: AnyObject,
                }),
              ),
            }),
          },
        },
      },
      async () => ({
        items: CORE_NODES.map(({ path, label, icon, description, takes, input, output }) => ({
          path,
          label,
          icon,
          category: "Core",
          description,
          takes,
          input,
          output,
        })),
      }),
    );

    app.get(
      "/permissions",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "Every permission a role can list",
          description:
            "A permission is `kind:verb`. A role may also use `*` for either half. " +
            "`scope` is the narrowest place the permission is checked at, and `appFacing` " +
            "marks the kinds an end user can hold.",
          tags: ["permissions"],
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  kind: Type.String(),
                  label: Type.String(),
                  group: Type.String(),
                  scope: Type.Union([
                    Type.Literal("instance"),
                    Type.Literal("tenant"),
                    Type.Literal("workspace"),
                  ]),
                  appFacing: Type.Boolean(),
                  verbs: Type.Array(
                    Type.Object({
                      verb: Type.Union([Type.Literal("read"), Type.Literal("write")]),
                      permission: Type.String(),
                      description: Type.String(),
                    }),
                  ),
                }),
              ),
            }),
          },
        },
      },
      async () => ({
        items: PERMISSION_KINDS.map((entry) => ({
          kind: entry.kind,
          label: entry.label,
          group: entry.group,
          scope: entry.scope,
          appFacing: entry.appFacing === true,
          verbs: (["read", "write"] as const)
            .filter((verb) => entry.verbs[verb] !== undefined)
            .map((verb) => ({
              verb,
              permission: `${entry.kind}:${verb}`,
              description: entry.verbs[verb] as string,
            })),
        })),
      }),
    );

    app.get(
      "/api-keys",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "The calling member's API keys",
          tags: ["identity"],
          response: { 200: Type.Object({ items: Type.Array(ApiKey) }) },
        },
      },
      async ({ ctx }) => {
        const rows = await kernel.db
          .selectFrom("api_key")
          .selectAll()
          .where("owner_type", "=", "member")
          .where("owner_id", "=", ctx.memberId)
          .orderBy("id")
          .execute();
        return { items: rows.map(toApiKey) };
      },
    );

    app.post(
      "/api-keys",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "Create an API key that acts as the calling member",
          tags: ["identity"],
          body: NewApiKeyBody,
          response: { 201: NewApiKey },
        },
      },
      async ({ ctx, body }, reply) => {
        const memberId = ctx.memberId;
        const created = await ctx.mutate(async (trx, audit) => {
          const key = await insertApiKey(trx, { type: "member", id: memberId }, body);
          await audit({
            action: "api_key.created",
            targetType: "api_key",
            targetId: key.id,
            details: { name: key.name, ownerType: "member", ownerId: memberId },
          });
          return key;
        });
        return reply.code(201).send(created);
      },
    );

    app.delete(
      "/api-keys/:id",
      {
        config: { access: access.signedIn },
        schema: {
          summary: "Revoke one of the calling member's API keys",
          tags: ["identity"],
          params: Type.Object({ id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const memberId = ctx.memberId;
        await ctx.mutate(async (trx, audit) => {
          const revoked = await trx
            .updateTable("api_key")
            .set({ revoked_at: new Date() })
            .where("id", "=", params.id)
            .where("owner_type", "=", "member")
            .where("owner_id", "=", memberId)
            .where("revoked_at", "is", null)
            .returning("id")
            .executeTakeFirst();
          if (!revoked) throw notFound("The API key");
          await audit({ action: "api_key.revoked", targetType: "api_key", targetId: params.id });
        });
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/members",
      {
        config: { access: access.instance("member:read") },
        schema: {
          summary: "Every member of the instance",
          description: "With the tenants each belongs to.",
          tags: ["identity"],
          querystring: PageQuery,
          response: {
            200: pageOf(
              Type.Object({
                ...Member.properties,
                tenants: Type.Array(Type.Object({ id: Id, name: Type.String() })),
              }),
            ),
          },
        },
      },
      async ({ query }) => {
        const args = pageArgs(query);
        let select = kernel.db
          .selectFrom("member")
          .select(["id", "name", "email", "created_at", "disabled_at"]);
        if (args.after) select = select.where("id", ">", args.after);
        const rows = await select
          .orderBy("id")
          .limit(args.limit + 1)
          .execute();
        const ids = rows.map((row) => row.id);
        const belongs =
          ids.length === 0
            ? []
            : await kernel.db
                .selectFrom("tenant_member")
                .innerJoin("tenant", "tenant.id", "tenant_member.tenant_id")
                .select(["tenant_member.member_id", "tenant.id", "tenant.name"])
                .where("tenant_member.member_id", "in", ids)
                .orderBy("tenant.name")
                .execute();
        return toPage(
          rows,
          args,
          (row) => row.id,
          (row) => ({
            ...toMember(row),
            tenants: belongs
              .filter((one) => one.member_id === row.id)
              .map((one) => ({ id: one.id, name: one.name })),
          }),
        );
      },
    );

    app.patch(
      "/members/:id",
      {
        config: { access: access.instance("member:write") },
        schema: {
          summary: "Disable or enable a member's account",
          description:
            "A disabled member can sign in nowhere, by password, single sign-on or API key, and " +
            "every session they have ends. The account and what it holds are kept. The " +
            "instance's identity provider does this when it says someone has left. Nobody " +
            "disables their own account.",
          tags: ["identity"],
          params: Type.Object({ id: Id }),
          body: Type.Object({ disabled: Type.Boolean() }),
          response: { 200: Member },
        },
      },
      async ({ ctx, params, body }) => {
        if (body.disabled && ctx.principal.id === params.id) {
          throw badRequest("You cannot disable your own account.");
        }
        return ctx.mutate(async (trx, audit) => {
          const member = await trx
            .updateTable("member")
            .set({ disabled_at: body.disabled ? new Date() : null })
            .where("id", "=", params.id)
            .returning(["id", "name", "email", "created_at", "disabled_at"])
            .executeTakeFirst();
          if (!member) throw notFound("The member");
          if (body.disabled) {
            await trx.deleteFrom("member_session").where("member_id", "=", member.id).execute();
          }
          await audit({
            action: body.disabled ? "member.disabled" : "member.enabled",
            targetType: "member",
            targetId: member.id,
            details: { email: member.email },
          });
          return toMember(member);
        });
      },
    );

    app.post(
      "/members",
      {
        config: { access: access.instance("member:write") },
        schema: {
          summary: "Create a member identity",
          tags: ["identity"],
          body: NewMemberBody,
          response: { 201: Member },
        },
      },
      async ({ ctx, body }, reply) => {
        const member = await ctx.mutate((trx, audit) => createMember(kernel, trx, audit, body));
        return reply.code(201).send(toMember(member));
      },
    );

    app.get(
      "/bindings",
      {
        config: { access: access.instance("binding:read") },
        schema: {
          summary: "Instance-scope bindings",
          tags: ["permissions"],
          response: { 200: Type.Object({ items: Type.Array(InstanceBinding) }) },
        },
      },
      async () => {
        const rows = await kernel.db
          .selectFrom("binding")
          .innerJoin("role", "role.id", "binding.role_id")
          .innerJoin("member", "member.id", "binding.principal_id")
          .select([
            "binding.id",
            "binding.principal_id",
            "member.email",
            "binding.role_id",
            "role.name",
            "binding.created_at",
          ])
          .where("binding.scope_type", "=", "instance")
          .orderBy("binding.id")
          .execute();
        return {
          items: rows.map((row) => ({
            id: row.id,
            memberId: row.principal_id as string,
            memberEmail: row.email,
            roleId: row.role_id,
            roleName: row.name,
            createdAt: iso(row.created_at),
          })),
        };
      },
    );

    app.post(
      "/bindings",
      {
        config: { access: access.instance("binding:write") },
        schema: {
          summary: "Bind a built-in role to a member at instance scope",
          tags: ["permissions"],
          body: Type.Object({ memberId: Id, roleId: Id }),
          response: { 201: Type.Object({ id: Id }) },
        },
      },
      async ({ ctx, body }, reply) => {
        const role = await kernel.db
          .selectFrom("role")
          .select(["id", "name", "builtin"])
          .where("id", "=", body.roleId)
          .executeTakeFirst();
        if (!role?.builtin)
          throw badRequest("Only a built-in role can be bound at instance scope.");
        const id = newId();
        await ctx.mutate(async (trx, audit) => {
          await trx
            .insertInto("binding")
            .values({
              id,
              scope_type: "instance",
              tenant_id: null,
              workspace_id: null,
              resource_id: null,
              principal_type: "member",
              principal_id: body.memberId,
              role_id: role.id,
              source_resource_id: null,
            })
            .execute();
          await audit({
            action: "binding.created",
            targetType: "binding",
            targetId: id,
            details: { scope: "instance", memberId: body.memberId, role: role.name },
          });
        });
        return reply.code(201).send({ id });
      },
    );

    app.delete(
      "/bindings/:id",
      {
        config: { access: access.instance("binding:write") },
        schema: {
          summary: "Remove an instance-scope binding",
          tags: ["permissions"],
          params: Type.Object({ id: Id }),
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        await ctx.mutate(async (trx, audit) => {
          const binding = await trx
            .selectFrom("binding")
            .innerJoin("role", "role.id", "binding.role_id")
            .select(["binding.id", "binding.principal_id", "role.name"])
            .where("binding.id", "=", params.id)
            .where("binding.scope_type", "=", "instance")
            .executeTakeFirst();
          if (!binding) throw notFound("The binding");
          if (binding.name === INSTANCE_ONLY_ROLE) {
            const others = await trx
              .selectFrom("binding")
              .innerJoin("role", "role.id", "binding.role_id")
              .select("binding.id")
              .where("role.name", "=", INSTANCE_ONLY_ROLE)
              .where("binding.id", "!=", params.id)
              .executeTakeFirst();
            if (!others) throw conflict("The instance must keep at least one operator admin.");
          }
          await trx.deleteFrom("binding").where("id", "=", params.id).execute();
          await audit({
            action: "binding.deleted",
            targetType: "binding",
            targetId: params.id,
            details: { scope: "instance", memberId: binding.principal_id, role: binding.name },
          });
        });
        return reply.code(204).send(null);
      },
    );

    app.get(
      "/audit",
      {
        config: { access: access.instance("audit:read") },
        schema: {
          summary: "Instance-level audit entries, newest first",
          description: "Entries that belong to no tenant. A tenant's entries are under the tenant.",
          tags: ["audit"],
          querystring: AuditQuery,
          response: { 200: pageOf(AuditEntry) },
        },
      },
      async ({ query }) => auditPage(kernel, null, query),
    );
  };
}
