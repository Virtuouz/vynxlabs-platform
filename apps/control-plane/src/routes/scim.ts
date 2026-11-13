import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { sql } from "@vynxlabs/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Type } from "typebox";
import { type Audit, SYSTEM, type Trx, writeAudit } from "../kernel/audit.js";
import { notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { findProvider, type Provider, scimSettings } from "../kernel/sso/providers.js";
import {
  applyPushedGroups,
  asScimError,
  createScimGroup,
  createScimToken,
  createScimUser,
  deleteScimGroup,
  deleteScimUser,
  ERROR_SCHEMA,
  findScimGroup,
  findScimUser,
  GROUP_SCHEMA,
  groupChanges,
  groupMembers,
  groupResource,
  LIST_SCHEMA,
  parseFilter,
  ScimError,
  scimBase,
  USER_SCHEMA,
  updateScimGroup,
  updateScimUser,
  userChanges,
  userFields,
  userResource,
} from "../kernel/sso/scim.js";
import { AnyObject, Id, iso, isoOrNull, NoContent, NullableTime } from "./shared.js";

const SCIM_TYPE = "application/scim+json";
const MAX_PAGE = 200;

const ProviderParam = Type.Object({ provider: Type.String({ maxLength: 64 }) });
const ResourceParam = Type.Object({
  provider: Type.String({ maxLength: 64 }),
  id: Type.String({ maxLength: 64 }),
});
const ListQuery = Type.Object({
  filter: Type.Optional(Type.String({ maxLength: 1000 })),
  startIndex: Type.Optional(Type.Integer()),
  count: Type.Optional(Type.Integer()),
  attributes: Type.Optional(Type.String({ maxLength: 500 })),
  excludedAttributes: Type.Optional(Type.String({ maxLength: 500 })),
});
/** A SCIM document. Providers send more than is kept, so nothing is refused for being extra. */
const Document = Type.Object({}, { additionalProperties: true });

const Settings = Type.Object({
  subjectFrom: Type.Union([Type.Literal("externalId"), Type.Literal("userName"), Type.Null()], {
    description:
      "The pushed field that holds the name the provider signs the person in by. With one " +
      "named, a pushed person is tied to the provider at once. With null, their first sign-in " +
      "ties them, under the rules for any first sign-in.",
  }),
  groups: Type.Union([Type.Literal("sign_in"), Type.Literal("scim")], {
    description:
      "Where a person's groups come from: what a sign-in says, or the groups that are pushed.",
  }),
  createGroups: Type.Boolean({
    description: "Make a group here for a pushed group that nothing maps yet.",
  }),
});
const TokenView = Type.Object({
  id: Id,
  name: Type.String(),
  prefix: Type.String(),
  createdAt: Type.String({ format: "date-time" }),
  expiresAt: NullableTime,
  lastUsedAt: NullableTime,
});
const Provisioning = Type.Object({
  address: Type.String({
    description: "The SCIM base address to give the provider. It never changes.",
  }),
  settings: Settings,
  tokens: Type.Array(TokenView),
  users: Type.Object({ pushed: Type.Integer(), active: Type.Integer() }),
  groups: Type.Integer(),
  lastPushAt: NullableTime,
});

/**
 * Provisioning over SCIM: the routes an identity provider calls, and the ones
 * a person uses in the console to set that up.
 */
export function scimRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    // ----- Setting it up -----

    for (const scope of ["tenant", "instance"] as const) {
      const prefix =
        scope === "tenant" ? "/tenants/:t/provisioning/:p" : "/instance/provisioning/:p";
      const read =
        scope === "tenant" ? access.tenant("sso:read") : access.instance("instance:read");
      const write =
        scope === "tenant" ? access.tenant("sso:write") : access.instance("instance:write");
      const tags = ["single sign-on"];
      const Params = scope === "tenant" ? Type.Object({ t: Id, p: Id }) : Type.Object({ p: Id });
      const provider = async (params: { t?: string | undefined; p: string }) => {
        const found = await findProvider(
          db,
          params.p,
          scope === "tenant" ? (params.t ?? "") : null,
        );
        if (!found) throw notFound("The identity provider");
        return found;
      };
      const tokenView = (row: {
        id: string;
        name: string;
        prefix: string;
        created_at: Date;
        expires_at: Date | null;
        last_used_at: Date | null;
      }) => ({
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        createdAt: iso(row.created_at),
        expiresAt: isoOrNull(row.expires_at),
        lastUsedAt: isoOrNull(row.last_used_at),
      });
      const describe = async (found: Provider) => {
        const [tokens, users, groups] = await Promise.all([
          db
            .selectFrom("scim_token")
            .selectAll()
            .where("provider_id", "=", found.id)
            .where("revoked_at", "is", null)
            .orderBy("created_at")
            .execute(),
          sql<{ pushed: string; active: string; last: Date | null }>`
            select count(*) as pushed, count(*) filter (where active) as active,
              max(updated_at) as last
            from scim_user where provider_id = ${found.id}
          `.execute(db),
          sql<{ n: string; last: Date | null }>`
            select count(*) as n, max(updated_at) as last from scim_group
            where provider_id = ${found.id}
          `.execute(db),
        ]);
        const lasts = [users.rows[0]?.last, groups.rows[0]?.last].filter(
          (at): at is Date => at instanceof Date,
        );
        return {
          address: scimBase(kernel, found.id),
          settings: found.scim,
          tokens: tokens.map(tokenView),
          users: {
            pushed: Number(users.rows[0]?.pushed ?? 0),
            active: Number(users.rows[0]?.active ?? 0),
          },
          groups: Number(groups.rows[0]?.n ?? 0),
          lastPushAt:
            lasts.length > 0 ? iso(new Date(Math.max(...lasts.map((at) => at.getTime())))) : null,
        };
      };

      app.get(
        prefix,
        {
          config: { access: read },
          schema: {
            summary: "How a provider pushes people and groups, and what it has pushed",
            description:
              "The provider is given `address` and a token. It then creates, changes and turns " +
              "off the people it holds without waiting for them to sign in.",
            tags,
            params: Params,
            response: { 200: Provisioning },
          },
        },
        async ({ params }) => describe(await provider(params)),
      );

      app.put(
        prefix,
        {
          config: { access: write },
          schema: {
            summary: "Say how a provider's pushes are taken",
            tags,
            params: Params,
            body: Settings,
            response: { 200: Provisioning },
          },
        },
        async ({ ctx, params, body }) => {
          const found = await provider(params);
          const settings = scimSettings(body);
          await ctx.mutate(async (trx, audit) => {
            await trx
              .updateTable("identity_provider")
              .set({ scim: JSON.stringify(settings), updated_at: new Date() })
              .where("id", "=", found.id)
              .execute();
            await audit({
              action: "identity_provider.provisioning_changed",
              targetType: "identity_provider",
              targetId: found.id,
              tenantId: found.tenantId,
              details: { identityProvider: found.name, ...settings },
            });
            // What was pushed before pushed groups counted is taken in now.
            await applyPushedGroups(trx, audit, { ...found, scim: settings });
          });
          return describe({ ...found, scim: settings });
        },
      );

      app.post(
        `${prefix}/tokens`,
        {
          config: { access: write },
          schema: {
            summary: "Make a token for a provider to push with",
            description:
              "The token is returned once and cannot be read again. It opens this provider's " +
              "SCIM address and nothing else.",
            tags,
            params: Params,
            body: Type.Object({
              name: Type.String({ minLength: 1, maxLength: 80 }),
              expiresInDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 3650 })),
            }),
            response: {
              201: Type.Object({ ...TokenView.properties, token: Type.String() }),
            },
          },
        },
        async ({ ctx, params, body }, reply) => {
          const found = await provider(params);
          const made = await ctx.mutate((trx, audit) =>
            createScimToken(trx, audit, found, {
              name: body.name,
              expiresAt: body.expiresInDays
                ? new Date(Date.now() + body.expiresInDays * 86_400_000)
                : null,
              createdBy: ctx.principal.id,
            }),
          );
          return reply.code(201).send({ ...tokenView(made.row), token: made.token });
        },
      );

      app.delete(
        `${prefix}/tokens/:id`,
        {
          config: { access: write },
          schema: {
            summary: "Revoke a provider's token",
            description: "A push made with it afterwards is refused.",
            tags,
            params:
              scope === "tenant"
                ? Type.Object({ t: Id, p: Id, id: Id })
                : Type.Object({ p: Id, id: Id }),
            response: { 204: NoContent },
          },
        },
        async ({ ctx, params }, reply) => {
          const found = await provider(params);
          await ctx.mutate(async (trx, audit) => {
            const revoked = await trx
              .updateTable("scim_token")
              .set({ revoked_at: new Date() })
              .where("id", "=", params.id)
              .where("provider_id", "=", found.id)
              .where("revoked_at", "is", null)
              .returning(["name", "prefix"])
              .executeTakeFirst();
            if (!revoked) throw notFound("The token");
            await audit({
              action: "scim_token.revoked",
              targetType: "identity_provider",
              targetId: found.id,
              tenantId: found.tenantId,
              details: { identityProvider: found.name, ...revoked },
            });
          });
          return reply.code(204).send(null);
        },
      );
    }

    // ----- What a provider calls -----

    await app.register(async (plain) => {
      const scim = plain.withTypeProvider<TypeBoxTypeProvider>();
      const config = { access: access.scim, rateLimit: { max: 1200, timeWindow: "1 minute" } };
      const tags = ["SCIM"];

      scim.addContentTypeParser(SCIM_TYPE, { parseAs: "string" }, (_request, body, done) => {
        try {
          done(null, body === "" ? {} : JSON.parse(body as string));
        } catch {
          done(new ScimError(400, "The body is not valid JSON.", "invalidSyntax"));
        }
      });
      // Every refusal here is said the way SCIM says one, so a provider can read it.
      scim.setErrorHandler((error, request, reply) => {
        const known = asScimError(error);
        const failure = error as { statusCode?: number; message: string; validation?: unknown };
        const status = known?.status ?? (failure.validation ? 400 : (failure.statusCode ?? 500));
        if (status >= 500) request.log.error({ err: error }, "a SCIM request failed");
        return reply
          .code(status)
          .header("content-type", SCIM_TYPE)
          .send(
            JSON.stringify({
              schemas: [ERROR_SCHEMA],
              status: String(status),
              ...(known?.scimType
                ? { scimType: known.scimType }
                : failure.validation
                  ? { scimType: "invalidSyntax" }
                  : {}),
              detail: status >= 500 ? "Something went wrong here." : failure.message,
            }),
          );
      });

      const send = (reply: FastifyReply, status: number, body: unknown) =>
        reply.code(status).header("content-type", SCIM_TYPE).send(JSON.stringify(body));

      /** One change, with every entry it leaves in the audit log marked as the provider's push. */
      const change = <T>(request: FastifyRequest, run: (trx: Trx, audit: Audit) => Promise<T>) => {
        const { provider, tokenPrefix } = request.scim;
        const actor = {
          principal: { ...SYSTEM, name: `SCIM: ${provider.name}` },
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
          requestId: request.id,
        };
        return db.transaction().execute((trx) =>
          run(trx, (input) =>
            writeAudit(trx, actor, {
              ...input,
              details: {
                ...input.details,
                via: "scim",
                identityProvider: provider.name,
                token: tokenPrefix,
              },
            }),
          ),
        );
      };

      const page = (query: { startIndex?: number | undefined; count?: number | undefined }) => ({
        start: Math.max(1, query.startIndex ?? 1),
        count: Math.min(MAX_PAGE, Math.max(0, query.count ?? 100)),
      });
      const list = (resources: unknown[], total: number, start: number) => ({
        schemas: [LIST_SCHEMA],
        totalResults: total,
        startIndex: start,
        itemsPerPage: resources.length,
        Resources: resources,
      });
      const base = (request: FastifyRequest) => scimBase(kernel, request.scim.provider.id);

      // What the provider reads first, to learn what this side can do.

      scim.get(
        "/scim/v2/:provider/ServiceProviderConfig",
        {
          config,
          schema: {
            summary: "What this SCIM service supports",
            tags,
            params: ProviderParam,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) =>
          send(reply, 200, {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
            documentationUri: `${kernel.config.publicUrl}/api/v1/docs`,
            patch: { supported: true },
            bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
            filter: { supported: true, maxResults: MAX_PAGE },
            changePassword: { supported: false },
            sort: { supported: false },
            etag: { supported: false },
            authenticationSchemes: [
              {
                type: "oauthbearertoken",
                name: "Bearer token",
                description: "A token made for the provider in the console.",
                primary: true,
              },
            ],
            meta: {
              resourceType: "ServiceProviderConfig",
              location: `${base(request)}/ServiceProviderConfig`,
            },
          }),
      );

      const resourceTypes = (request: FastifyRequest) =>
        [
          ["User", "/Users", USER_SCHEMA],
          ["Group", "/Groups", GROUP_SCHEMA],
        ].map(([name, endpoint, schema]) => ({
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
          id: name,
          name,
          endpoint,
          schema,
          meta: {
            resourceType: "ResourceType",
            location: `${base(request)}/ResourceTypes/${name}`,
          },
        }));
      scim.get(
        "/scim/v2/:provider/ResourceTypes",
        {
          config,
          schema: {
            summary: "The kinds of thing that can be pushed",
            tags,
            params: ProviderParam,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) => {
          const types = resourceTypes(request);
          return send(reply, 200, list(types, types.length, 1));
        },
      );

      const attribute = (name: string, more: Record<string, unknown> = {}) => ({
        name,
        type: "string",
        multiValued: false,
        required: false,
        caseExact: false,
        mutability: "readWrite",
        returned: "default",
        uniqueness: "none",
        ...more,
      });
      const schemas = (request: FastifyRequest) => [
        {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
          id: USER_SCHEMA,
          name: "User",
          description: "A person the provider holds.",
          attributes: [
            attribute("userName", { required: true, uniqueness: "server" }),
            attribute("externalId", { caseExact: true }),
            attribute("displayName"),
            attribute("name", {
              type: "complex",
              subAttributes: [
                attribute("formatted"),
                attribute("givenName"),
                attribute("familyName"),
              ],
            }),
            attribute("emails", {
              type: "complex",
              multiValued: true,
              subAttributes: [
                attribute("value"),
                attribute("type"),
                attribute("primary", { type: "boolean" }),
              ],
            }),
            attribute("active", { type: "boolean" }),
          ],
          meta: { resourceType: "Schema", location: `${base(request)}/Schemas/${USER_SCHEMA}` },
        },
        {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
          id: GROUP_SCHEMA,
          name: "Group",
          description: "A group the provider holds.",
          attributes: [
            attribute("displayName", { required: true, uniqueness: "server" }),
            attribute("externalId", { caseExact: true }),
            attribute("members", {
              type: "complex",
              multiValued: true,
              subAttributes: [
                attribute("value", { mutability: "immutable" }),
                attribute("display", { mutability: "readOnly" }),
              ],
            }),
          ],
          meta: { resourceType: "Schema", location: `${base(request)}/Schemas/${GROUP_SCHEMA}` },
        },
      ];
      scim.get(
        "/scim/v2/:provider/Schemas",
        {
          config,
          schema: {
            summary: "The attributes of a user and a group that are kept",
            tags,
            params: ProviderParam,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) => {
          const all = schemas(request);
          return send(reply, 200, list(all, all.length, 1));
        },
      );

      // ----- Users -----

      scim.get(
        "/scim/v2/:provider/Users",
        {
          config,
          schema: {
            summary: "The people a provider has pushed",
            description: 'Takes `filter` as `userName eq "…"` or `externalId eq "…"`.',
            tags,
            params: ProviderParam,
            querystring: ListQuery,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) => {
          const { provider } = request.scim;
          const filter = parseFilter(request.query.filter, ["userName", "externalId"]);
          const { start, count } = page(request.query);
          let select = db.selectFrom("scim_user").where("provider_id", "=", provider.id);
          if (filter?.attribute === "userName") {
            select = select.where(sql<boolean>`lower(user_name) = ${filter.value.toLowerCase()}`);
          } else if (filter) select = select.where("external_id", "=", filter.value);
          const total = Number(
            (await select.select(sql<string>`count(*)`.as("n")).executeTakeFirstOrThrow()).n,
          );
          const rows =
            count === 0
              ? []
              : await select
                  .selectAll()
                  .orderBy("created_at")
                  .orderBy("id")
                  .offset(start - 1)
                  .limit(count)
                  .execute();
          return send(
            reply,
            200,
            list(
              rows.map((row) => userResource(row, base(request))),
              total,
              start,
            ),
          );
        },
      );

      scim.post(
        "/scim/v2/:provider/Users",
        {
          config,
          schema: {
            summary: "Push a person",
            description:
              "Finds or makes the account here. A member's email must be in a domain the " +
              "provider has proved. With `active` false the person is turned off at once.",
            tags,
            params: ProviderParam,
            body: Document,
            response: { 201: AnyObject },
          },
        },
        async (request, reply) => {
          const row = await change(request, (trx, audit) =>
            createScimUser(kernel, trx, audit, request.scim.provider, userFields(request.body)),
          );
          return send(reply, 201, userResource(row, base(request)));
        },
      );

      scim.get(
        "/scim/v2/:provider/Users/:id",
        {
          config,
          schema: {
            summary: "One pushed person",
            tags,
            params: ResourceParam,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) =>
          send(
            reply,
            200,
            userResource(
              await findScimUser(db, request.scim.provider, request.params.id),
              base(request),
            ),
          ),
      );

      scim.put(
        "/scim/v2/:provider/Users/:id",
        {
          config,
          schema: {
            summary: "Replace a pushed person",
            description: "What is left out is cleared. `active` false turns the person off.",
            tags,
            params: ResourceParam,
            body: Document,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) => {
          const { provider } = request.scim;
          const row = await change(request, async (trx, audit) =>
            updateScimUser(
              trx,
              audit,
              provider,
              await findScimUser(trx, provider, request.params.id),
              userFields(request.body),
              true,
            ),
          );
          return send(reply, 200, userResource(row, base(request)));
        },
      );

      scim.patch(
        "/scim/v2/:provider/Users/:id",
        {
          config,
          schema: {
            summary: "Change a pushed person",
            description:
              "Takes `add`, `replace` and `remove`, with a path or with an object of " +
              "attributes. `active` set to false turns the person off: an end user is " +
              "disabled, a member is suspended in the tenant, and for the instance's own " +
              "provider the account is disabled everywhere.",
            tags,
            params: ResourceParam,
            body: Document,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) => {
          const { provider } = request.scim;
          const row = await change(request, async (trx, audit) =>
            updateScimUser(
              trx,
              audit,
              provider,
              await findScimUser(trx, provider, request.params.id),
              userChanges(request.body),
            ),
          );
          return send(reply, 200, userResource(row, base(request)));
        },
      );

      scim.delete(
        "/scim/v2/:provider/Users/:id",
        {
          config,
          schema: {
            summary: "Say a person is gone",
            description:
              "The person is turned off here and their tie to the provider is removed. The " +
              "account and what it owns are kept.",
            tags,
            params: ResourceParam,
            response: { 204: NoContent },
          },
        },
        async (request, reply) => {
          const { provider } = request.scim;
          await change(request, async (trx, audit) =>
            deleteScimUser(
              trx,
              audit,
              provider,
              await findScimUser(trx, provider, request.params.id),
            ),
          );
          return reply.code(204).send(null);
        },
      );

      // ----- Groups -----

      const withMembers = async (
        request: FastifyRequest,
        row: Parameters<typeof groupResource>[0],
        excluded?: string,
      ) =>
        groupResource(
          row,
          (excluded ?? "").split(",").some((name) => name.trim().toLowerCase() === "members")
            ? undefined
            : await groupMembers(db, row.id),
          base(request),
        );

      scim.get(
        "/scim/v2/:provider/Groups",
        {
          config,
          schema: {
            summary: "The groups a provider has pushed",
            description:
              'Takes `filter` as `displayName eq "…"` or `externalId eq "…"`, and ' +
              "`excludedAttributes=members` to leave the members out.",
            tags,
            params: ProviderParam,
            querystring: ListQuery,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) => {
          const { provider } = request.scim;
          const filter = parseFilter(request.query.filter, ["displayName", "externalId"]);
          const { start, count } = page(request.query);
          let select = db.selectFrom("scim_group").where("provider_id", "=", provider.id);
          if (filter?.attribute === "displayName") {
            select = select.where(
              sql<boolean>`lower(display_name) = ${filter.value.toLowerCase()}`,
            );
          } else if (filter) select = select.where("external_id", "=", filter.value);
          const total = Number(
            (await select.select(sql<string>`count(*)`.as("n")).executeTakeFirstOrThrow()).n,
          );
          const rows =
            count === 0
              ? []
              : await select
                  .selectAll()
                  .orderBy("created_at")
                  .orderBy("id")
                  .offset(start - 1)
                  .limit(count)
                  .execute();
          const resources = [];
          for (const row of rows) {
            resources.push(await withMembers(request, row, request.query.excludedAttributes));
          }
          return send(reply, 200, list(resources, total, start));
        },
      );

      scim.post(
        "/scim/v2/:provider/Groups",
        {
          config,
          schema: {
            summary: "Push a group",
            description:
              "Which group here its people belong to is said by the provider's group map, by " +
              "the group's name. Where the provider makes groups of its own, one is made.",
            tags,
            params: ProviderParam,
            body: Document,
            response: { 201: AnyObject },
          },
        },
        async (request, reply) => {
          const row = await change(request, (trx, audit) =>
            createScimGroup(trx, audit, request.scim.provider, request.body),
          );
          return send(reply, 201, await withMembers(request, row));
        },
      );

      scim.get(
        "/scim/v2/:provider/Groups/:id",
        {
          config,
          schema: {
            summary: "One pushed group",
            tags,
            params: ResourceParam,
            querystring: ListQuery,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) =>
          send(
            reply,
            200,
            await withMembers(
              request,
              await findScimGroup(db, request.scim.provider, request.params.id),
              request.query.excludedAttributes,
            ),
          ),
      );

      scim.put(
        "/scim/v2/:provider/Groups/:id",
        {
          config,
          schema: {
            summary: "Replace a pushed group",
            description: "The members sent are the whole membership.",
            tags,
            params: ResourceParam,
            body: Document,
            response: { 200: AnyObject },
          },
        },
        async (request, reply) => {
          const { provider } = request.scim;
          const body = request.body as { displayName?: unknown; externalId?: unknown };
          const row = await change(request, async (trx, audit) =>
            updateScimGroup(
              trx,
              audit,
              provider,
              await findScimGroup(trx, provider, request.params.id),
              groupChanges({
                Operations: [
                  {
                    op: "replace",
                    value: {
                      members: [],
                      ...request.body,
                      displayName: body.displayName,
                      externalId: body.externalId ?? null,
                    },
                  },
                ],
              }),
            ),
          );
          return send(reply, 200, await withMembers(request, row));
        },
      );

      scim.patch(
        "/scim/v2/:provider/Groups/:id",
        {
          config,
          schema: {
            summary: "Change a pushed group",
            description:
              "Members are added and removed with `add` and `remove` on `members`, also in " +
              'the form `members[value eq "…"]`. The groups here of everyone it touches follow.',
            tags,
            params: ResourceParam,
            body: Document,
            response: { 200: AnyObject, 204: NoContent },
          },
        },
        async (request, reply) => {
          const { provider } = request.scim;
          const row = await change(request, async (trx, audit) =>
            updateScimGroup(
              trx,
              audit,
              provider,
              await findScimGroup(trx, provider, request.params.id),
              groupChanges(request.body),
            ),
          );
          return send(reply, 200, await withMembers(request, row, "members"));
        },
      );

      scim.delete(
        "/scim/v2/:provider/Groups/:id",
        {
          config,
          schema: {
            summary: "Say a group is gone",
            description: "The group here stays. The people who were in it by the push leave it.",
            tags,
            params: ResourceParam,
            response: { 204: NoContent },
          },
        },
        async (request, reply) => {
          const { provider } = request.scim;
          await change(request, async (trx, audit) =>
            deleteScimGroup(
              trx,
              audit,
              provider,
              await findScimGroup(trx, provider, request.params.id),
            ),
          );
          return reply.code(204).send(null);
        },
      );
    });
  };
}
