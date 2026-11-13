import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Type } from "typebox";
import { challengeMet, challengeOf } from "../kernel/apps/challenge.js";
import { actorOf } from "../kernel/apps/sessions.js";
import { ANONYMOUS } from "../kernel/audit.js";
import { consolePath } from "../kernel/auth.js";
import { badRequest, notFound } from "../kernel/errors.js";
import { access } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { answer, begin, refused, STATE_COOKIE_SECONDS } from "../kernel/sso/flow.js";
import { checkOidc } from "../kernel/sso/oidc.js";
import {
  endUserPasswordRefusedBy,
  memberPasswordRefusedBy,
  memberProvidersFor,
  SsoRefusal,
} from "../kernel/sso/people.js";
import {
  addDomain,
  addressesOf,
  createProvider,
  deleteProvider,
  domainTaken,
  findDomain,
  findProvider,
  isLive,
  isOidc,
  isSaml,
  listProviders,
  openSecrets,
  type Provider,
  slugOf,
  updateProvider,
} from "../kernel/sso/providers.js";
import { samlMetadata } from "../kernel/sso/saml.js";
import { AnyObject, Id, iso, isoOrNull, NoContent, NullableId, NullableTime } from "./shared.js";

const NullableString = Type.Union([Type.String(), Type.Null()]);
const ProviderView = Type.Object({
  id: Id,
  tenantId: NullableId,
  audience: Type.Union([Type.Literal("members"), Type.Literal("end_users")]),
  protocol: Type.Union([Type.Literal("oidc"), Type.Literal("saml")]),
  name: Type.String(),
  config: AnyObject,
  hasSecret: Type.Boolean({
    description: "Whether a client secret is stored. The secret itself is never returned.",
  }),
  enabled: Type.Boolean(),
  enforce: Type.Boolean({
    description: "Passwords are refused for the people this provider covers.",
  }),
  provision: Type.Boolean({ description: "People are created the first time they sign in." }),
  defaultRoleId: NullableId,
  paused: Type.Boolean({
    description:
      "True on a tenant imported from another instance, until the provider is saved again.",
  }),
  addresses: Type.Object(
    {
      start: Type.String(),
      callback: Type.String(),
      acs: Type.String(),
      metadata: Type.String(),
      entityId: Type.String(),
    },
    { description: "What to give the provider's administrator. They never change." },
  ),
  lastTest: Type.Union([AnyObject, Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});
const DomainView = Type.Object({
  id: Id,
  domain: Type.String(),
  verified: Type.Boolean(),
  verifiedAt: NullableTime,
  checkedAt: NullableTime,
  problem: NullableString,
  record: Type.Union([Type.Object({ name: Type.String(), value: Type.String() }), Type.Null()], {
    description: "The TXT record that proves the domain. Null for a provider of the instance.",
  }),
});
const GroupMap = Type.Object({
  value: Type.String({
    minLength: 1,
    maxLength: 500,
    description: "A group as the provider sends it. `*` stands for everyone it signs in.",
  }),
  groupId: Id,
});
const GroupMapView = Type.Object({ value: Type.String(), groupId: Id, groupName: Type.String() });
const LinkView = Type.Object({
  id: Id,
  subject: Type.String(),
  principalType: Type.Union([Type.Literal("member"), Type.Literal("end_user")]),
  principalId: Id,
  email: NullableString,
  name: NullableString,
  createdAt: Type.String({ format: "date-time" }),
  lastSignedInAt: NullableTime,
});
const _ProviderParams = Type.Object({ t: Type.Optional(Id), p: Id });
const Settings = {
  name: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  config: Type.Optional(AnyObject),
  clientSecret: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
  enabled: Type.Optional(Type.Boolean()),
  enforce: Type.Optional(Type.Boolean()),
  provision: Type.Optional(Type.Boolean()),
  defaultRoleId: Type.Optional(NullableId),
};
const CONFIG_DOC =
  "`config` for OIDC: `issuer`, `clientId`, `scopes`, `userinfo`. For SAML: `entryPoint`, " +
  "`idpIssuer`, `certificates`, or `metadataXml` or `metadataUrl` to read those three from the " +
  "provider's own metadata; and `signed` (`either`, `assertion`, `response`, `both`), " +
  "`signRequests`, `encryptAssertions`, `allowSha1`, `allowIdpInitiated`, `nameIdFormat`. For both: `claims` " +
  "(`subject`, `email`, `name`, `groups`), and for end users `attributes` and `trustEmail`.";

const SSO_LIMIT = { max: 60, timeWindow: "1 minute" };

export function ssoRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    const view = async (provider: Provider) => ({
      id: provider.id,
      tenantId: provider.tenantId,
      audience: provider.audience,
      protocol: provider.protocol,
      name: provider.name,
      config: provider.config as unknown as Record<string, unknown>,
      hasSecret: provider.protocol === "oidc" && provider.hasSecret,
      enabled: provider.enabled,
      enforce: provider.enforce,
      provision: provider.provision,
      defaultRoleId: provider.defaultRoleId,
      paused: provider.paused,
      addresses: addressesOf(kernel, provider, await slugOf(db, provider.tenantId)),
      lastTest: provider.lastTest,
      createdAt: iso(provider.createdAt),
      updatedAt: iso(provider.updatedAt),
    });
    const domainView = (
      provider: Provider,
      row: {
        id: string;
        domain: string;
        verified_at: Date | null;
        checked_at: Date | null;
        check_error: string | null;
      },
    ) => ({
      id: row.id,
      domain: row.domain,
      verified: row.verified_at !== null,
      verifiedAt: isoOrNull(row.verified_at),
      checkedAt: isoOrNull(row.checked_at),
      problem: row.check_error,
      record: provider.tenantId ? challengeOf(kernel, provider.tenantId, row.domain) : null,
    });

    // The same routes twice: for a tenant's providers, and for the instance's own.
    for (const scope of ["tenant", "instance"] as const) {
      const prefix =
        scope === "tenant" ? "/tenants/:t/identity-providers" : "/instance/identity-providers";
      const read =
        scope === "tenant" ? access.tenant("sso:read") : access.instance("instance:read");
      const write =
        scope === "tenant" ? access.tenant("sso:write") : access.instance("instance:write");
      const tags = ["single sign-on"];
      const of = scope === "tenant" ? "a tenant" : "the instance";
      const tenantOf = (params: { t?: string | undefined }) =>
        scope === "tenant" ? (params.t as string) : null;
      const provider = async (params: { t?: string | undefined; p: string }) => {
        const found = await findProvider(db, params.p, tenantOf(params));
        if (!found) throw notFound("The identity provider");
        return found;
      };
      const Params = scope === "tenant" ? Type.Object({ t: Id, p: Id }) : Type.Object({ p: Id });
      const ListParams = scope === "tenant" ? Type.Object({ t: Id }) : Type.Object({});

      app.get(
        prefix,
        {
          config: { access: read },
          schema: {
            summary: `The identity providers of ${of}`,
            tags,
            params: ListParams,
            response: { 200: Type.Object({ items: Type.Array(ProviderView) }) },
          },
        },
        async ({ params }) => ({
          items: await Promise.all(
            (await listProviders(db, tenantOf(params as { t?: string }))).map(view),
          ),
        }),
      );

      app.post(
        prefix,
        {
          config: { access: write },
          schema: {
            summary: `Connect an identity provider to ${of}`,
            description:
              "A provider is created off. Give its administrator the addresses in the answer, " +
              `try it, prove a domain, then turn it on. ${CONFIG_DOC} An OIDC issuer is read ` +
              "before anything is saved, so a wrong address is said now.",
            tags,
            params: ListParams,
            body: Type.Object({
              audience:
                scope === "tenant"
                  ? Type.Union([Type.Literal("members"), Type.Literal("end_users")])
                  : Type.Literal("members"),
              protocol: Type.Union([Type.Literal("oidc"), Type.Literal("saml")]),
              ...Settings,
              name: Type.String({ minLength: 1, maxLength: 80 }),
            }),
            response: { 201: ProviderView },
          },
        },
        async ({ ctx, params, body }, reply) => {
          const tenantId = tenantOf(params as { t?: string });
          const created = await ctx.mutate(async (trx, audit) => {
            const made = await createProvider(
              kernel,
              trx,
              audit,
              { tenantId, audience: body.audience, protocol: body.protocol },
              body,
            );
            if (isOidc(made)) await reachable(made, body.clientSecret);
            return made;
          });
          return reply.code(201).send(await view(created));
        },
      );

      app.get(
        `${prefix}/:p`,
        {
          config: { access: read },
          schema: {
            summary: "One identity provider",
            tags,
            params: Params,
            response: { 200: ProviderView },
          },
        },
        async ({ params }) => view(await provider(params as { p: string })),
      );

      app.patch(
        `${prefix}/:p`,
        {
          config: { access: write },
          schema: {
            summary: "Change an identity provider, turn it on or off, or require it",
            description:
              `${CONFIG_DOC} Settings left out of \`config\` keep their values. Turning a ` +
              "provider of members on needs a proved domain. `enforce` refuses passwords for " +
              "the people the provider covers; the people who run the instance keep theirs. " +
              "Saving turns a paused provider back on.",
            tags,
            params: Params,
            body: Type.Object(Settings),
            response: { 200: ProviderView },
          },
        },
        async ({ ctx, params, body }) => {
          const current = await provider(params as { p: string });
          const updated = await ctx.mutate(async (trx, audit) => {
            const saved = await updateProvider(kernel, trx, audit, current, body);
            if (isOidc(saved) && (body.config !== undefined || body.clientSecret !== undefined)) {
              await reachable(
                saved,
                body.clientSecret ?? (await openSecrets(kernel, trx, saved)).clientSecret,
              );
            }
            return saved;
          });
          return view(updated);
        },
      );

      app.delete(
        `${prefix}/:p`,
        {
          config: { access: write },
          schema: {
            summary: "Remove an identity provider",
            description:
              "Its domains, group mapping and links go with it. The people it signed in stay, " +
              "and need another way in.",
            tags,
            params: Params,
            response: { 204: NoContent },
          },
        },
        async ({ ctx, params }, reply) => {
          const current = await provider(params as { p: string });
          await ctx.mutate((trx, audit) => deleteProvider(trx, audit, current));
          return reply.code(204).send(null);
        },
      );

      app.post(
        `${prefix}/:p/tests`,
        {
          config: { access: write },
          schema: {
            summary: "Try a provider out",
            description:
              "Answers with an address to open in a browser. Signing in there changes nothing " +
              "and signs nobody in: what the provider sent, who that would be here and what " +
              "would happen are kept as the provider's `lastTest`. Works while the provider is off.",
            tags,
            params: Params,
            response: { 201: Type.Object({ url: Type.String() }) },
          },
        },
        async ({ ctx, params }, reply) => {
          const current = await provider(params as { p: string });
          const began = await begin(kernel, current, {
            purpose: "test",
            base: "test",
            ...(ctx.principal.id ? { startedBy: ctx.principal.id } : {}),
          }).catch(asProblem);
          await ctx.mutate(async (_trx, audit) => {
            await audit({
              action: "identity_provider.test_started",
              targetType: "identity_provider",
              targetId: current.id,
              tenantId: current.tenantId,
              details: { name: current.name },
            });
          });
          return reply.code(201).send({ url: began.url });
        },
      );

      // ----- Domains -----

      app.get(
        `${prefix}/:p/domains`,
        {
          config: { access: read },
          schema: {
            summary: "The email domains a provider signs in",
            tags,
            params: Params,
            response: { 200: Type.Object({ items: Type.Array(DomainView) }) },
          },
        },
        async ({ params }) => {
          const current = await provider(params as { p: string });
          const rows = await db
            .selectFrom("identity_domain")
            .selectAll()
            .where("provider_id", "=", current.id)
            .orderBy("domain")
            .execute();
          return { items: rows.map((row) => domainView(current, row)) };
        },
      );

      app.post(
        `${prefix}/:p/domains`,
        {
          config: { access: write },
          schema: {
            summary: "List an email domain for a provider",
            description:
              "The answer carries the TXT record that proves the domain. Publish it, then " +
              "check the domain. A hostname of the same name proved for an app uses the same " +
              "record. A domain of the instance's own provider needs no proof.",
            tags,
            params: Params,
            body: Type.Object({ domain: Type.String({ minLength: 1, maxLength: 260 }) }),
            response: { 201: DomainView },
          },
        },
        async ({ ctx, params, body }, reply) => {
          const current = await provider(params as { p: string });
          const row = await ctx.mutate((trx, audit) => addDomain(trx, audit, current, body.domain));
          return reply.code(201).send(domainView(current, row));
        },
      );

      app.post(
        `${prefix}/:p/domains/:d/checks`,
        {
          config: { access: write },
          schema: {
            summary: "Check a domain's DNS record",
            description: "Looks for the TXT record. Finding it proves the domain.",
            tags,
            params: Type.Object({ ...Params.properties, d: Id }),
            response: { 200: DomainView },
          },
        },
        async ({ ctx, params }) => {
          const current = await provider(params as { p: string });
          const domain = await findDomain(db, current, (params as { d: string }).d);
          const met =
            current.tenantId === null ||
            (await challengeMet(kernel, current.tenantId, domain.domain));
          const record = current.tenantId
            ? challengeOf(kernel, current.tenantId, domain.domain)
            : null;
          const row = await ctx.mutate(async (trx, audit) => {
            const updated = await trx
              .updateTable("identity_domain")
              .set({
                checked_at: new Date(),
                check_error: met
                  ? null
                  : `No TXT record ${record?.name} with the value ${record?.value} was found.`,
                ...(met && !domain.verified_at ? { verified_at: new Date() } : {}),
              })
              .where("id", "=", domain.id)
              .returningAll()
              .executeTakeFirstOrThrow()
              .catch((error: { code?: string }) => {
                if (error.code === "23505") throw domainTaken(domain.domain);
                throw error;
              });
            await audit({
              action: "identity_domain.checked",
              targetType: "identity_domain",
              targetId: domain.id,
              tenantId: current.tenantId,
              details: { domain: domain.domain, provider: current.name, verified: met },
            });
            return updated;
          });
          return domainView(current, row);
        },
      );

      app.delete(
        `${prefix}/:p/domains/:d`,
        {
          config: { access: write },
          schema: {
            summary: "Remove a domain from a provider",
            description:
              "People already tied to the provider still sign in. A provider of members with " +
              "no proved domain left is turned off.",
            tags,
            params: Type.Object({ ...Params.properties, d: Id }),
            response: { 204: NoContent },
          },
        },
        async ({ ctx, params }, reply) => {
          const current = await provider(params as { p: string });
          const domain = await findDomain(db, current, (params as { d: string }).d);
          await ctx.mutate(async (trx, audit) => {
            await trx.deleteFrom("identity_domain").where("id", "=", domain.id).execute();
            await audit({
              action: "identity_domain.removed",
              targetType: "identity_domain",
              targetId: domain.id,
              tenantId: current.tenantId,
              details: { domain: domain.domain, provider: current.name },
            });
            const left = await trx
              .selectFrom("identity_domain")
              .select("id")
              .where("provider_id", "=", current.id)
              .where("verified_at", "is not", null)
              .executeTakeFirst();
            if (!left && current.audience === "members" && current.enabled) {
              await trx
                .updateTable("identity_provider")
                .set({ enabled: false, enforce: false, updated_at: new Date() })
                .where("id", "=", current.id)
                .execute();
              await audit({
                action: "identity_provider.disabled",
                targetType: "identity_provider",
                targetId: current.id,
                tenantId: current.tenantId,
                details: { name: current.name, because: "its last proved domain was removed" },
              });
            }
          });
          return reply.code(204).send(null);
        },
      );

      // ----- Who is tied to a provider -----

      app.get(
        `${prefix}/:p/links`,
        {
          config: { access: read },
          schema: {
            summary: "The people tied to a provider",
            tags,
            params: Params,
            response: { 200: Type.Object({ items: Type.Array(LinkView) }) },
          },
        },
        async ({ params }) => {
          const current = await provider(params as { p: string });
          const rows = await db
            .selectFrom("identity_link")
            .leftJoin("member", (join) =>
              join
                .onRef("member.id", "=", "identity_link.principal_id")
                .on("identity_link.principal_type", "=", "member"),
            )
            .leftJoin("end_user", (join) =>
              join
                .onRef("end_user.id", "=", "identity_link.principal_id")
                .on("identity_link.principal_type", "=", "end_user"),
            )
            .select([
              "identity_link.id",
              "identity_link.subject",
              "identity_link.principal_type",
              "identity_link.principal_id",
              "identity_link.email",
              "identity_link.created_at",
              "identity_link.last_signed_in_at",
              "member.name as member_name",
              "end_user.name as end_user_name",
            ])
            .where("identity_link.provider_id", "=", current.id)
            .orderBy("identity_link.id")
            .limit(1000)
            .execute();
          return {
            items: rows.map((row) => ({
              id: row.id,
              subject: row.subject,
              principalType: row.principal_type,
              principalId: row.principal_id,
              email: row.email,
              name: row.member_name ?? row.end_user_name ?? null,
              createdAt: iso(row.created_at),
              lastSignedInAt: isoOrNull(row.last_signed_in_at),
            })),
          };
        },
      );

      app.delete(
        `${prefix}/:p/links/:l`,
        {
          config: { access: write },
          schema: {
            summary: "Untie a person from a provider",
            description:
              "For when a person's identity at the provider was replaced. Their next sign-in " +
              "ties them again, by email, under the rules of a first sign-in.",
            tags,
            params: Type.Object({ ...Params.properties, l: Id }),
            response: { 204: NoContent },
          },
        },
        async ({ ctx, params }, reply) => {
          const current = await provider(params as { p: string });
          await ctx.mutate(async (trx, audit) => {
            const removed = await trx
              .deleteFrom("identity_link")
              .where("id", "=", (params as { l: string }).l)
              .where("provider_id", "=", current.id)
              .returning(["principal_type", "principal_id", "email"])
              .executeTakeFirst();
            if (!removed) throw notFound("The link");
            await audit({
              action: "identity_link.removed",
              targetType: removed.principal_type,
              targetId: removed.principal_id,
              tenantId: current.tenantId,
              details: { identityProvider: current.name, email: removed.email },
            });
          });
          return reply.code(204).send(null);
        },
      );

      if (scope !== "tenant") continue;

      // ----- Groups -----

      const maps = async (current: Provider) => {
        const rows = await db
          .selectFrom("identity_group_map")
          .leftJoin("principal_group", "principal_group.id", "identity_group_map.member_group_id")
          .leftJoin("end_user_group", "end_user_group.id", "identity_group_map.end_user_group_id")
          .select([
            "identity_group_map.claim_value",
            "identity_group_map.member_group_id",
            "identity_group_map.end_user_group_id",
            "principal_group.name as member_group",
            "end_user_group.name as end_user_group",
          ])
          .where("identity_group_map.provider_id", "=", current.id)
          .orderBy("identity_group_map.claim_value")
          .orderBy("identity_group_map.id")
          .execute();
        return rows.map((row) => ({
          value: row.claim_value,
          groupId: (row.member_group_id ?? row.end_user_group_id) as string,
          groupName: row.member_group ?? row.end_user_group ?? "",
        }));
      };

      app.get(
        `${prefix}/:p/group-maps`,
        {
          config: { access: read },
          schema: {
            summary: "Which of the provider's groups put people in which groups here",
            tags,
            params: Params,
            response: { 200: Type.Object({ items: Type.Array(GroupMapView) }) },
          },
        },
        async ({ params }) => ({ items: await maps(await provider(params as { p: string })) }),
      );

      app.put(
        `${prefix}/:p/group-maps`,
        {
          config: { access: write },
          schema: {
            summary: "Set the whole group mapping",
            description:
              "On every sign-in a person is put in exactly the mapped groups the provider " +
              "names for them, and taken out of the mapped groups it does not. A group that " +
              "is not mapped is never touched. A provider of members maps to groups of " +
              "members, and a provider of end users to groups of end users.",
            tags,
            params: Params,
            body: Type.Object({ items: Type.Array(GroupMap, { maxItems: 500 }) }),
            response: { 200: Type.Object({ items: Type.Array(GroupMapView) }) },
          },
        },
        async ({ ctx, params, body }) => {
          const current = await provider(params as { p: string });
          const tenantId = current.tenantId as string;
          const forMembers = current.audience === "members";
          await ctx.mutate(async (trx, audit) => {
            const wanted = [...new Set(body.items.map((item) => item.groupId))];
            const known =
              wanted.length === 0
                ? []
                : await trx
                    .selectFrom(forMembers ? "principal_group" : "end_user_group")
                    .select("id")
                    .where("tenant_id", "=", tenantId)
                    .where("id", "in", wanted)
                    .execute();
            if (known.length !== wanted.length) {
              throw badRequest(
                `A group in the mapping is not a group of ${forMembers ? "members" : "end users"} of this tenant.`,
              );
            }
            await trx
              .deleteFrom("identity_group_map")
              .where("provider_id", "=", current.id)
              .execute();
            const seen = new Set<string>();
            for (const item of body.items) {
              const key = `${item.value}\n${item.groupId}`;
              if (seen.has(key)) continue;
              seen.add(key);
              await trx
                .insertInto("identity_group_map")
                .values({
                  id: newId(),
                  provider_id: current.id,
                  tenant_id: tenantId,
                  claim_value: item.value,
                  member_group_id: forMembers ? item.groupId : null,
                  end_user_group_id: forMembers ? null : item.groupId,
                })
                .execute();
            }
            await audit({
              action: "identity_provider.groups_mapped",
              targetType: "identity_provider",
              targetId: current.id,
              tenantId,
              details: { name: current.name, entries: seen.size },
            });
          });
          return { items: await maps(current) };
        },
      );
    }

    /** Reads an OIDC provider's own description, so a wrong issuer is said when it is saved. */
    async function reachable(provider: Provider, clientSecret: string | undefined) {
      if (!isOidc(provider)) return;
      await checkOidc(provider, clientSecret ? { clientSecret } : {}).catch(asProblem);
    }

    // ----- Signing a member in -----

    const atMain = async (request: FastifyRequest) => {
      if ((await kernel.hosts.place(request)).kind !== "main") throw notFound("The page");
    };
    const memberBase = `${kernel.hosts.mainOrigin}/api/v1/auth`;
    const memberProvider = async (id: string) => {
      const found = await findProvider(db, id);
      if (found?.audience !== "members") throw notFound("The identity provider");
      return found;
    };
    const toConsole = (reply: FastifyReply, reason: string) =>
      reply
        .code(302)
        .header("location", `/?sso_error=${encodeURIComponent(reason)}`)
        .header("cache-control", "no-store")
        .send(null);

    app.get(
      "/sso/providers",
      {
        config: { access: access.public, rateLimit: SSO_LIMIT },
        schema: {
          summary: "How a member with this email signs in",
          description:
            "For the sign-in screen. Answers by the email's domain alone, so it says nothing " +
            "about whether the person exists.",
          tags: ["single sign-on"],
          querystring: Type.Object({ email: Type.String({ maxLength: 320 }) }),
          response: {
            200: Type.Object({
              providers: Type.Array(
                Type.Object({ id: Id, name: Type.String(), url: Type.String() }),
              ),
              password: Type.Boolean({ description: "Whether a password may be used." }),
            }),
          },
        },
      },
      async (request) => {
        await atMain(request);
        const providers = await memberProvidersFor(db, request.query.email);
        return {
          providers: providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            url: `/api/v1/sso/${provider.id}/start`,
          })),
          password: (await memberPasswordRefusedBy(db, request.query.email)) === undefined,
        };
      },
    );

    app.get(
      "/tenants/:t/end-user-auth/providers",
      {
        config: { access: access.public, rateLimit: SSO_LIMIT },
        schema: {
          summary: "How an end user of the tenant signs in",
          description:
            "For an app that draws its own sign-in screen. Each provider's `path` is under " +
            "the tenant's sign-in pages at the address the app is served from. Give `email` " +
            "to learn whether that person may use a password.",
          tags: ["single sign-on"],
          params: Type.Object({ t: Id }),
          querystring: Type.Object({ email: Type.Optional(Type.String({ maxLength: 320 })) }),
          response: {
            200: Type.Object({
              providers: Type.Array(
                Type.Object({ id: Id, name: Type.String(), path: Type.String() }),
              ),
              password: Type.Boolean(),
            }),
          },
        },
      },
      async ({ params, query }) => {
        const providers = (await listProviders(db, params.t)).filter(
          (provider) => provider.audience === "end_users" && isLive(provider),
        );
        return {
          providers: providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            path: `/sso/${provider.id}/start`,
          })),
          password: (await endUserPasswordRefusedBy(db, params.t, query.email ?? "")) === undefined,
        };
      },
    );

    app.get(
      "/sso/:p/start",
      {
        config: { access: access.public, rateLimit: SSO_LIMIT },
        schema: {
          summary: "Begin a member's single sign-on",
          description:
            "For browsers, at the instance's own address. Sends the browser to the identity " +
            "provider. `return` is a path in the console to end at.",
          tags: ["single sign-on"],
          params: Type.Object({ p: Id }),
          querystring: Type.Object({ return: Type.Optional(Type.String({ maxLength: 2000 })) }),
          response: { 302: Type.Null() },
        },
      },
      async (request, reply) => {
        await atMain(request);
        const provider = await memberProvider(request.params.p);
        try {
          const began = await begin(kernel, provider, {
            purpose: "sign_in",
            base: memberBase,
            returnTo: consolePath(request.query.return),
          });
          return reply
            .code(302)
            .header("set-cookie", stateCookieHeader(request, began.cookie))
            .header("location", began.url)
            .header("cache-control", "no-store")
            .send(null);
        } catch (error) {
          if (!(error instanceof SsoRefusal)) throw error;
          await refused(db, provider, actorOf(request, ANONYMOUS), error);
          return toConsole(reply, error.reason);
        }
      },
    );

    const TEST_DONE = (ok: boolean) =>
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Single sign-on test</title></head><body><h1>${
        ok ? "The provider answered" : "The test did not pass"
      }</h1><p>Close this tab and look at the result in the console.</p></body></html>\n`;
    const page = (reply: FastifyReply, ok: boolean) =>
      reply
        .code(200)
        .header("content-type", "text/html; charset=utf-8")
        .header("content-security-policy", "default-src 'none'")
        .header("cache-control", "no-store")
        .send(TEST_DONE(ok));

    /** What the provider's answer leads to: the last step of a sign-in, or the end of a try-out. */
    async function answered(
      request: FastifyRequest,
      reply: FastifyReply,
      provider: Provider,
      given: Parameters<typeof answer>[2],
    ) {
      try {
        const result = await answer(
          kernel,
          provider,
          given,
          actorOf(request, ANONYMOUS),
          memberBase,
        );
        if (result.purpose === "test") return page(reply, result.ok);
        return reply
          .code(302)
          .header("location", result.finishUrl)
          .header("cache-control", "no-store")
          .send(null);
      } catch (error) {
        if (!(error instanceof SsoRefusal)) throw error;
        return toConsole(reply, error.reason);
      }
    }

    app.get(
      "/sso/:p/callback",
      {
        config: { access: access.public, rateLimit: SSO_LIMIT },
        schema: {
          summary: "Where an OIDC provider sends a member back",
          description:
            "For browsers. The provider's answer is checked and exchanged, and the browser " +
            "is sent on to the last step, which signs the member in.",
          tags: ["single sign-on"],
          params: Type.Object({ p: Id }),
          response: { 302: Type.Null(), 200: Type.String() },
        },
      },
      async (request, reply) => {
        await atMain(request);
        const provider = await memberProvider(request.params.p);
        return answered(request, reply, provider, {
          protocol: "oidc",
          query: new URL(request.url, kernel.hosts.mainOrigin).searchParams,
        });
      },
    );

    app.get(
      "/sso/:p/metadata",
      {
        config: { access: access.public, rateLimit: SSO_LIMIT },
        schema: {
          summary: "This side's SAML metadata for a provider of members",
          description: "What the provider's administrator loads. It holds nothing secret.",
          tags: ["single sign-on"],
          params: Type.Object({ p: Id }),
          response: { 200: Type.String() },
        },
      },
      async (request, reply) => {
        const provider = await memberProvider(request.params.p);
        if (!isSaml(provider)) throw notFound("The metadata");
        return reply
          .code(200)
          .header("content-type", "application/samlmetadata+xml; charset=utf-8")
          .send(
            samlMetadata(
              provider,
              await openSecrets(kernel, db, provider),
              addressesOf(kernel, provider, null),
            ),
          );
      },
    );

    // A SAML provider answers with a form the browser posts. Only this address reads one.
    await app.register(async (forms) => {
      const posted = forms.withTypeProvider<TypeBoxTypeProvider>();
      posted.addContentTypeParser(
        "application/x-www-form-urlencoded",
        { parseAs: "string", bodyLimit: 512 * 1024 },
        (_request, body, done) =>
          done(null, Object.fromEntries(new URLSearchParams(body as string))),
      );
      posted.post(
        "/sso/:p/acs",
        {
          config: { access: access.public, rateLimit: SSO_LIMIT },
          schema: {
            summary: "Where a SAML provider posts a member's sign-in",
            description:
              "For browsers. The assertion is checked: its signature, issuer, audience, " +
              "recipient and validity, that it answers a request this instance made, and that " +
              "it was not used before. The browser is sent on to the last step.",
            tags: ["single sign-on"],
            params: Type.Object({ p: Id }),
            body: Type.Object({
              SAMLResponse: Type.String({ maxLength: 512 * 1024 }),
              RelayState: Type.Optional(Type.String({ maxLength: 500 })),
            }),
            response: { 302: Type.Null(), 200: Type.String() },
          },
        },
        async (request, reply) => {
          await atMain(request);
          const provider = await memberProvider(request.params.p);
          return answered(request, reply, provider, { protocol: "saml", body: request.body });
        },
      );
    });
  };
}

/** A refusal from the sign-on code, as the problem an API caller is told. */
function asProblem(error: unknown): never {
  if (error instanceof SsoRefusal) throw badRequest(error.detail ?? error.message);
  throw error;
}

export function stateCookieHeader(
  request: FastifyRequest,
  cookie: { name: string; value: string },
  maxAge = STATE_COOKIE_SECONDS,
): string {
  const parts = [
    `${cookie.name}=${cookie.value}`,
    "Path=/",
    "HttpOnly",
    // Lax: the last step is a page the browser is sent to, which this allows and a form post from elsewhere is not.
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (request.protocol === "https") parts.push("Secure");
  return parts.join("; ");
}
