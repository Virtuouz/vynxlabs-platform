import { createHmac } from "node:crypto";
import type {
  FastifyPluginAsyncTypebox,
  TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import { newId } from "@vynxlabs/db";
import { Type } from "typebox";
import { appUrl, domainUrl } from "../kernel/apps/address.js";
import { MAX_ASSET_BYTES, storeAsset } from "../kernel/apps/assets.js";
import { challengeMet, challengeOf as domainChallenge } from "../kernel/apps/challenge.js";
import { hostnameOf } from "../kernel/apps/hosts.js";
import { actorOf, createHandoff, startAppSession, takeHandoff } from "../kernel/apps/sessions.js";
import { cleanTheme, resolveTheme, themeCss } from "../kernel/apps/theme.js";
import { writeAudit } from "../kernel/audit.js";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../kernel/errors.js";
import { loadBundle } from "../kernel/execution/bundles.js";
import { access, type WorkspaceRef } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import {
  Id,
  iso,
  isoOrNull,
  NoContent,
  NullableString,
  NullableTime,
  TenantParams,
  Time,
  WorkspaceParams,
} from "./shared.js";

const Hostname = Type.String({
  minLength: 4,
  maxLength: 253,
  description: "A hostname such as portal.example.com. No scheme, port or path.",
});
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const Domain = Type.Object({
  id: Id,
  workspaceId: Id,
  app: Type.String({ description: "The path of the app served at the hostname's root." }),
  hostname: Type.String(),
  url: Type.String(),
  enabled: Type.Boolean(),
  verifiedAt: NullableTime,
  checkedAt: NullableTime,
  checkError: NullableString,
  challenge: Type.Object(
    {
      name: Type.String(),
      value: Type.String(),
    },
    {
      description:
        "A DNS TXT record that shows the hostname's owner agrees. Create it, then run a check.",
    },
  ),
  createdAt: Time,
});

const ThemeTokens = Type.Record(Type.String(), Type.String({ maxLength: 200 }));
const Portal = Type.Object({
  signUp: Type.Boolean({ description: "Whether people may make their own end-user account." }),
  theme: Type.Object({
    tokens: ThemeTokens,
    dark: ThemeTokens,
  }),
  logo: Type.Boolean({ description: "Whether a logo is set." }),
  mail: Type.Boolean({
    description: "Whether this instance sends mail, for invitations and resets.",
  }),
  portalUrl: Type.String({ description: "Where the tenant's end users sign in." }),
});

const AppItem = Type.Object({
  id: Id,
  path: Type.String(),
  title: Type.String(),
  description: NullableString,
  url: Type.String({ description: "Where the app is served by path." }),
  domains: Type.Array(
    Type.Object({ hostname: Type.String(), url: Type.String(), enabled: Type.Boolean() }),
  ),
  files: Type.Integer(),
  bytes: Type.Integer(),
  access: Type.Array(Type.String(), {
    description: "Who is bound to a role at the app itself: anyone, every end user, or a name.",
  }),
});

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 512 * 1024;
const HANDOFF_LIMIT = { max: 60, timeWindow: "1 minute" };

/** Apps: their files, their addresses, their look, and signing staff in at an app's address. */
export function appRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    const tenantOf = async (id: string) => {
      const tenant = await db
        .selectFrom("tenant")
        .select(["id", "slug", "name"])
        .where("id", "=", id)
        .executeTakeFirst();
      if (!tenant) throw notFound("The tenant");
      return tenant;
    };

    // ----- Files of apps -----

    const AssetParams = Type.Object({
      t: Id,
      w: Id,
      sha256: Type.String({ pattern: "^[0-9a-f]{64}$" }),
    });
    const Asset = Type.Object({ sha256: Type.String(), size: Type.Integer() });

    app.get(
      `${base}/bundle-assets/:sha256`,
      {
        config: { access: access.workspace("bundle:read") },
        schema: {
          summary: "Whether the tenant already has a file of an app",
          description: "A build asks before uploading, so that only new files are sent.",
          tags: ["deploys"],
          params: AssetParams,
          response: { 200: Asset },
        },
      },
      async ({ params }) => {
        const row = await db
          .selectFrom("bundle_asset")
          .select(["sha256", "size_bytes"])
          .where("tenant_id", "=", params.t)
          .where("sha256", "=", params.sha256)
          .executeTakeFirst();
        if (!row) throw notFound("The file");
        return { sha256: row.sha256, size: row.size_bytes };
      },
    );

    await app.register(async (upload) => {
      upload.removeAllContentTypeParsers();
      upload.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) =>
        done(null, body),
      );
      upload.withTypeProvider<TypeBoxTypeProvider>().put(
        `${base}/bundle-assets/:sha256`,
        {
          bodyLimit: MAX_ASSET_BYTES,
          config: { access: access.workspace("bundle:write") },
          schema: {
            summary: "Upload one file of an app",
            description:
              "The request body is the file, and the address carries its SHA-256. A bundle " +
              "lists its apps' files by checksum, and can only be uploaded once every file " +
              "it lists is here. Files are kept once per tenant.",
            tags: ["deploys"],
            params: AssetParams,
            response: { 200: Asset, 201: Asset },
          },
        },
        async ({ ctx, params, body }, reply) => {
          const content = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
          const workspace = ctx.workspace as WorkspaceRef;
          const stored = await ctx.mutate(async (trx, audit) => {
            const result = await storeAsset(kernel, trx, params.t, params.sha256, content);
            await audit({
              action: "bundle_asset.uploaded",
              targetType: "bundle_asset",
              targetId: null,
              tenantId: params.t,
              workspaceId: workspace.id,
              details: {
                sha256: params.sha256,
                bytes: content.length,
                alreadyStored: !result.created,
              },
            });
            return result;
          });
          return reply
            .code(stored.created ? 201 : 200)
            .send({ sha256: params.sha256, size: content.length });
        },
      );

      upload.withTypeProvider<TypeBoxTypeProvider>().put(
        "/tenants/:t/portal/logo",
        {
          bodyLimit: MAX_LOGO_BYTES,
          config: { access: access.tenant("portal:write") },
          schema: {
            summary: "Set the tenant's logo",
            description:
              "The request body is the image: PNG, JPEG or WebP, up to 512 KB. It is shown on " +
              "the sign-in pages and is there for apps to use.",
            tags: ["branding"],
            params: TenantParams,
            response: { 204: NoContent },
          },
        },
        async ({ ctx, params, body, headers }, reply) => {
          const content = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
          const type = (headers["content-type"] ?? "").split(";")[0]?.trim() ?? "";
          if (content.length === 0 || !LOGO_TYPES.has(type)) {
            throw badRequest("Send a PNG, JPEG or WebP image as the request body.");
          }
          const key = `branding/${params.t}/logo-${newId()}`;
          await kernel.storage.put(key, content, type);
          const previous = await ctx.mutate(async (trx, audit) => {
            const before = await trx
              .selectFrom("tenant_portal")
              .select("logo_key")
              .where("tenant_id", "=", params.t)
              .executeTakeFirst();
            await trx
              .insertInto("tenant_portal")
              .values({ tenant_id: params.t, logo_key: key, logo_content_type: type })
              .onConflict((c) =>
                c.column("tenant_id").doUpdateSet({
                  logo_key: key,
                  logo_content_type: type,
                  updated_at: new Date(),
                }),
              )
              .execute();
            await audit({
              action: "portal.logo_set",
              targetType: "tenant",
              targetId: params.t,
              tenantId: params.t,
              details: { bytes: content.length, contentType: type },
            });
            return before?.logo_key ?? null;
          });
          if (previous) await kernel.storage.remove(previous).catch(() => {});
          return reply.code(204).send(null);
        },
      );
    });

    // ----- The apps of a workspace -----

    app.get(
      `${base}/apps`,
      {
        config: { access: access.workspace("app:read") },
        schema: {
          summary: "The apps deployed to a workspace, with where each is served",
          tags: ["apps"],
          params: WorkspaceParams,
          response: { 200: Type.Object({ items: Type.Array(AppItem) }) },
        },
      },
      async ({ ctx, params }) => {
        const workspace = ctx.workspace as WorkspaceRef;
        const tenant = await tenantOf(params.t);
        const resources = await db
          .selectFrom("resource")
          .select(["id", "path", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "app")
          .orderBy("path")
          .execute();
        if (resources.length === 0) return { items: [] };
        const domains = await db
          .selectFrom("app_domain")
          .select(["app_path", "hostname", "enabled"])
          .where("workspace_id", "=", params.w)
          .orderBy("hostname")
          .execute();
        const bound = await db
          .selectFrom("binding")
          .leftJoin("member", (join) =>
            join
              .onRef("member.id", "=", "binding.principal_id")
              .on("binding.principal_type", "=", "member"),
          )
          .leftJoin("end_user", (join) =>
            join
              .onRef("end_user.id", "=", "binding.principal_id")
              .on("binding.principal_type", "=", "end_user"),
          )
          .leftJoin("principal_group", (join) =>
            join
              .onRef("principal_group.id", "=", "binding.principal_id")
              .on("binding.principal_type", "=", "group"),
          )
          .select([
            "binding.resource_id",
            "binding.principal_type",
            "member.email",
            "end_user.email as end_user_email",
            "principal_group.name as group_name",
          ])
          .where("binding.workspace_id", "=", params.w)
          .where("binding.scope_type", "=", "resource")
          .where(
            "binding.resource_id",
            "in",
            resources.map((resource) => resource.id),
          )
          .execute();
        const active = await db
          .selectFrom("workspace")
          .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
          .select(["bundle.id", "bundle.storage_key"])
          .where("workspace.id", "=", params.w)
          .executeTakeFirst();
        const assets = active ? ((await loadBundle(kernel, active)).assets ?? []) : [];
        return {
          items: resources.map((resource) => {
            const body = resource.body as { title?: string; description?: string };
            const files = assets.filter((asset) => asset.app === resource.path);
            return {
              id: resource.id,
              path: resource.path,
              title: body.title ?? resource.path,
              description: body.description ?? null,
              url: appUrl(kernel, {
                tenantSlug: tenant.slug,
                workspaceSlug: workspace.slug,
                path: resource.path,
              }),
              domains: domains
                .filter((domain) => domain.app_path === resource.path)
                .map((domain) => ({
                  hostname: domain.hostname,
                  url: domainUrl(kernel, domain.hostname),
                  enabled: domain.enabled,
                })),
              files: files.length,
              bytes: files.reduce((sum, file) => sum + file.size, 0),
              access: bound
                .filter((binding) => binding.resource_id === resource.id)
                .map(
                  (binding) =>
                    binding.email ??
                    binding.end_user_email ??
                    binding.group_name ??
                    (binding.principal_type === "anonymous"
                      ? "anyone"
                      : binding.principal_type === "end_users"
                        ? "every end user"
                        : binding.principal_type),
                ),
            };
          }),
        };
      },
    );

    // ----- Branding and the portal -----

    const readPortal = async (tenantId: string) => {
      const tenant = await tenantOf(tenantId);
      const row = await db
        .selectFrom("tenant_portal")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      return {
        signUp: row?.sign_up ?? false,
        theme: { tokens: row?.theme.tokens ?? {}, dark: row?.theme.dark ?? {} },
        logo: Boolean(row?.logo_key),
        mail: kernel.mail.configured,
        portalUrl: `${kernel.hosts.appsOrigin}/portal/${tenant.slug}/`,
      };
    };

    app.get(
      "/tenants/:t/portal",
      {
        config: { access: access.tenant("portal:read") },
        schema: {
          summary: "A tenant's branding and end-user settings",
          tags: ["branding"],
          params: TenantParams,
          response: { 200: Portal },
        },
      },
      async ({ params }) => readPortal(params.t),
    );

    app.put(
      "/tenants/:t/portal",
      {
        config: { access: access.tenant("portal:write") },
        schema: {
          summary: "Set a tenant's branding and end-user settings",
          description:
            "`theme` replaces the tenant's token values: `tokens` for light, `dark` for dark. " +
            "A token that is left out keeps the component kit's value. Each value must be a " +
            "plain colour, length or font list. A workspace can override them with a theme " +
            "resource.",
          tags: ["branding"],
          params: TenantParams,
          body: Type.Object({
            signUp: Type.Optional(Type.Boolean()),
            theme: Type.Optional(
              Type.Object({ tokens: Type.Optional(ThemeTokens), dark: Type.Optional(ThemeTokens) }),
            ),
          }),
          response: { 200: Portal },
        },
      },
      async ({ ctx, params, body }) => {
        const theme = body.theme ? cleanTheme(body.theme) : undefined;
        await ctx.mutate(async (trx, audit) => {
          await trx
            .insertInto("tenant_portal")
            .values({
              tenant_id: params.t,
              ...(body.signUp !== undefined ? { sign_up: body.signUp } : {}),
              ...(theme ? { theme: JSON.stringify(theme) } : {}),
            })
            .onConflict((c) =>
              c.column("tenant_id").doUpdateSet({
                updated_at: new Date(),
                ...(body.signUp !== undefined ? { sign_up: body.signUp } : {}),
                ...(theme ? { theme: JSON.stringify(theme) } : {}),
              }),
            )
            .execute();
          await audit({
            action: "portal.updated",
            targetType: "tenant",
            targetId: params.t,
            tenantId: params.t,
            details: {
              ...(body.signUp !== undefined ? { signUp: body.signUp } : {}),
              ...(theme ? { theme: Object.keys({ ...theme.tokens, ...theme.dark }) } : {}),
            },
          });
        });
        return readPortal(params.t);
      },
    );

    app.delete(
      "/tenants/:t/portal/logo",
      {
        config: { access: access.tenant("portal:write") },
        schema: {
          summary: "Remove the tenant's logo",
          tags: ["branding"],
          params: TenantParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const previous = await ctx.mutate(async (trx, audit) => {
          const before = await trx
            .selectFrom("tenant_portal")
            .select("logo_key")
            .where("tenant_id", "=", params.t)
            .forUpdate()
            .executeTakeFirst();
          await trx
            .updateTable("tenant_portal")
            .set({ logo_key: null, logo_content_type: null, updated_at: new Date() })
            .where("tenant_id", "=", params.t)
            .execute();
          await audit({
            action: "portal.logo_removed",
            targetType: "tenant",
            targetId: params.t,
            tenantId: params.t,
          });
          return before?.logo_key ?? null;
        });
        if (previous) await kernel.storage.remove(previous).catch(() => {});
        return reply.code(204).send(null);
      },
    );

    const css = { 200: Type.String({ description: "A stylesheet that sets the theme tokens." }) };
    const sendCss = (reply: { header(name: string, value: string): unknown }, text: string) => {
      reply.header("content-type", "text/css; charset=utf-8");
      reply.header("x-content-type-options", "nosniff");
      reply.header("cache-control", "public, max-age=60");
      return text;
    };

    app.get(
      "/tenants/:t/theme.css",
      {
        config: { access: access.public },
        schema: {
          summary: "A tenant's theme tokens, as a stylesheet",
          description: "Public: a sign-in page needs it before anyone has signed in.",
          tags: ["branding"],
          params: TenantParams,
          produces: ["text/css"],
          response: css,
        },
      },
      async ({ params }, reply) => sendCss(reply, themeCss(await resolveTheme(db, params.t))),
    );

    app.get(
      `${base}/theme.css`,
      {
        config: { access: access.public },
        schema: {
          summary: "A workspace's theme tokens, as a stylesheet",
          description: "The tenant's values, with the workspace's theme resource over them.",
          tags: ["branding"],
          params: WorkspaceParams,
          produces: ["text/css"],
          response: css,
        },
      },
      async ({ params }, reply) =>
        sendCss(reply, themeCss(await resolveTheme(db, params.t, params.w))),
    );

    app.get(
      "/tenants/:t/portal/logo",
      {
        config: { access: access.public },
        schema: {
          summary: "The tenant's logo",
          tags: ["branding"],
          params: TenantParams,
          produces: ["image/png", "image/jpeg", "image/webp"],
          response: { 200: Type.Unknown({ description: "The image." }) },
        },
      },
      async ({ params }, reply) => {
        const row = await db
          .selectFrom("tenant_portal")
          .select(["logo_key", "logo_content_type"])
          .where("tenant_id", "=", params.t)
          .executeTakeFirst();
        if (!row?.logo_key || !LOGO_TYPES.has(row.logo_content_type ?? ""))
          throw notFound("The logo");
        return reply
          .header("content-type", row.logo_content_type as string)
          .header("x-content-type-options", "nosniff")
          .header("cache-control", "public, max-age=300")
          .send(await kernel.storage.get(row.logo_key));
      },
    );

    // ----- Hostnames -----

    const challengeOf = (tenantId: string, hostname: string) =>
      domainChallenge(kernel, tenantId, hostname);
    /** What this instance answers at its check address. The same on every replica, and no secret. */
    const instanceMark = createHmac("sha256", kernel.config.authSecret)
      .update("domain-check")
      .digest("hex")
      .slice(0, 32);

    const toDomain = (row: {
      id: string;
      tenant_id: string;
      workspace_id: string;
      app_path: string;
      hostname: string;
      enabled: boolean;
      verified_at: Date | null;
      checked_at: Date | null;
      check_error: string | null;
      created_at: Date;
    }) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      app: row.app_path,
      hostname: row.hostname,
      url: domainUrl(kernel, row.hostname),
      enabled: row.enabled,
      verifiedAt: isoOrNull(row.verified_at),
      checkedAt: isoOrNull(row.checked_at),
      checkError: row.check_error,
      challenge: challengeOf(row.tenant_id, row.hostname),
      createdAt: iso(row.created_at),
    });

    app.get(
      "/domain-check",
      {
        config: { access: access.public },
        schema: {
          summary: "Shows that a hostname reaches this instance",
          description: "A domain check asks for this through the hostname being checked.",
          tags: ["domains"],
          response: { 200: Type.Object({ instance: Type.String() }) },
        },
      },
      async () => ({ instance: instanceMark }),
    );

    app.get(
      "/tenants/:t/domains",
      {
        config: { access: access.tenant("domain:read") },
        schema: {
          summary: "The hostnames a tenant has registered for its apps",
          tags: ["domains"],
          params: TenantParams,
          response: { 200: Type.Object({ items: Type.Array(Domain) }) },
        },
      },
      async ({ params }) => {
        const rows = await db
          .selectFrom("app_domain")
          .selectAll()
          .where("tenant_id", "=", params.t)
          .orderBy("hostname")
          .execute();
        return { items: rows.map(toDomain) };
      },
    );

    app.post(
      "/tenants/:t/domains",
      {
        config: { access: access.tenant("domain:write") },
        schema: {
          summary: "Register a hostname for one app",
          description:
            "The app is then served at the hostname's root, once the registration is " +
            "enabled. Point the name at this instance with a CNAME or an address record, " +
            "and have whatever terminates TLS in front of the instance hold a certificate " +
            "for it. The platform issues no certificates. The answer carries a DNS TXT " +
            "record to create: it shows that whoever controls the name agrees.",
          tags: ["domains"],
          params: TenantParams,
          body: Type.Object({
            workspaceId: Id,
            app: Type.String({ maxLength: 255 }),
            hostname: Hostname,
          }),
          response: { 201: Domain },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const hostname = body.hostname.trim().toLowerCase().replace(/\.$/, "");
        if (!HOSTNAME.test(hostname)) {
          throw badRequest("That is not a hostname.", [
            { path: "/hostname", message: "must be a name such as portal.example.com" },
          ]);
        }
        if (kernel.hosts.isOwn(hostname)) {
          throw badRequest("That is one of this instance's own addresses.");
        }
        const row = await ctx.mutate(async (trx, audit) => {
          const target = await trx
            .selectFrom("resource")
            .select("id")
            .where("tenant_id", "=", params.t)
            .where("workspace_id", "=", body.workspaceId)
            .where("kind", "=", "app")
            .where("path", "=", body.app)
            .executeTakeFirst();
          if (!target) throw badRequest("No app has that path in that workspace of this tenant.");
          const taken = await trx
            .selectFrom("app_domain")
            .select("id")
            .where("hostname", "=", hostname)
            .executeTakeFirst();
          if (taken) throw conflict("That hostname is already registered on this instance.");
          const created = await trx
            .insertInto("app_domain")
            .values({
              id: newId(),
              tenant_id: params.t,
              workspace_id: body.workspaceId,
              app_path: body.app,
              hostname,
              created_by_type: ctx.principal.type,
              created_by_id: ctx.principal.id,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "app_domain.created",
            targetType: "app_domain",
            targetId: created.id,
            tenantId: params.t,
            workspaceId: body.workspaceId,
            details: { hostname, app: body.app },
          });
          return created;
        });
        return reply.code(201).send(toDomain(row));
      },
    );

    const DomainParams = Type.Object({ t: Id, id: Id });
    const findDomain = async (tenantId: string, id: string) => {
      const row = await db
        .selectFrom("app_domain")
        .selectAll()
        .where("id", "=", id)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (!row) throw notFound("The domain");
      return row;
    };

    app.post(
      "/tenants/:t/domains/:id/checks",
      {
        config: { access: access.tenant("domain:write") },
        schema: {
          summary: "Check a hostname: its DNS record, and that it reaches this instance",
          description:
            "Looks for the TXT record, which is what verifies the hostname, and asks this " +
            "instance for its check address through the hostname. The second is advice " +
            "only: a name that resolves only inside a client's network cannot be reached " +
            "from here and may still be right.",
          tags: ["domains"],
          params: DomainParams,
          response: { 200: Domain },
        },
      },
      async ({ ctx, params }) => {
        const domain = await findDomain(params.t, params.id);
        const challenge = challengeOf(params.t, domain.hostname);
        const verified = await challengeMet(kernel, params.t, domain.hostname);
        let problem: string | null = null;
        if (!verified) {
          problem = `No TXT record ${challenge.name} with the value ${challenge.value} was found.`;
        } else {
          const reached = await fetch(`${domainUrl(kernel, domain.hostname)}api/v1/domain-check`, {
            redirect: "manual",
            signal: AbortSignal.timeout(5000),
          })
            .then(async (response) => ((await response.json()) as { instance?: string }).instance)
            .catch(() => undefined);
          if (reached !== instanceMark) {
            problem =
              "The record is there, but the hostname did not reach this instance from here. Check where it points, and its certificate.";
          }
        }
        const row = await ctx.mutate(async (trx, audit) => {
          const updated = await trx
            .updateTable("app_domain")
            .set({
              checked_at: new Date(),
              check_error: problem,
              ...(verified ? { verified_at: new Date() } : {}),
            })
            .where("id", "=", domain.id)
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action: "app_domain.checked",
            targetType: "app_domain",
            targetId: domain.id,
            tenantId: params.t,
            workspaceId: domain.workspace_id,
            details: { hostname: domain.hostname, verified, reached: problem === null },
          });
          return updated;
        });
        return toDomain(row);
      },
    );

    app.patch(
      "/tenants/:t/domains/:id",
      {
        config: { access: access.tenant("domain:write") },
        schema: {
          summary: "Enable or disable a hostname, or point it at another app",
          description:
            "Enabling needs a verified hostname. An operator of the instance may enable one " +
            "that is not verified, for a name that exists only inside a network.",
          tags: ["domains"],
          params: DomainParams,
          body: Type.Object({
            enabled: Type.Optional(Type.Boolean()),
            app: Type.Optional(Type.String({ maxLength: 255 })),
          }),
          response: { 200: Domain },
        },
      },
      async ({ ctx, params, body }) => {
        const domain = await findDomain(params.t, params.id);
        if (body.enabled && !domain.verified_at && !(await ctx.allowed("instance:write", {}))) {
          throw new HttpError(
            409,
            "domain_not_verified",
            "Create the DNS TXT record and run a check first. An operator of the instance can enable a hostname without it.",
          );
        }
        const row = await ctx.mutate(async (trx, audit) => {
          if (body.app !== undefined) {
            const target = await trx
              .selectFrom("resource")
              .select("id")
              .where("workspace_id", "=", domain.workspace_id)
              .where("kind", "=", "app")
              .where("path", "=", body.app)
              .executeTakeFirst();
            if (!target) throw badRequest("No app has that path in the domain's workspace.");
          }
          const updated = await trx
            .updateTable("app_domain")
            .set({
              ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
              ...(body.app !== undefined ? { app_path: body.app } : {}),
            })
            .where("id", "=", domain.id)
            .returningAll()
            .executeTakeFirstOrThrow();
          await audit({
            action:
              body.enabled === undefined
                ? "app_domain.updated"
                : body.enabled
                  ? "app_domain.enabled"
                  : "app_domain.disabled",
            targetType: "app_domain",
            targetId: domain.id,
            tenantId: params.t,
            workspaceId: domain.workspace_id,
            details: {
              hostname: domain.hostname,
              ...(body.app !== undefined ? { app: body.app } : {}),
              ...(body.enabled && !domain.verified_at ? { unverified: true } : {}),
            },
          });
          return updated;
        });
        kernel.hosts.forget(domain.hostname);
        return toDomain(row);
      },
    );

    app.delete(
      "/tenants/:t/domains/:id",
      {
        config: { access: access.tenant("domain:write") },
        schema: {
          summary: "Remove a hostname",
          description: "Sign-ins made at the hostname end.",
          tags: ["domains"],
          params: DomainParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const domain = await findDomain(params.t, params.id);
        await ctx.mutate(async (trx, audit) => {
          await trx.deleteFrom("app_domain").where("id", "=", domain.id).execute();
          await trx
            .deleteFrom("app_session")
            .where("tenant_id", "=", params.t)
            .where((eb) =>
              eb.or([eb("host", "=", domain.hostname), eb("host", "like", `${domain.hostname}:%`)]),
            )
            .execute();
          await audit({
            action: "app_domain.deleted",
            targetType: "app_domain",
            targetId: domain.id,
            tenantId: params.t,
            workspaceId: domain.workspace_id,
            details: { hostname: domain.hostname },
          });
        });
        kernel.hosts.forget(domain.hostname);
        return reply.code(204).send(null);
      },
    );

    // ----- Staff at an app's address -----

    app.get(
      "/app-handoffs/start",
      {
        config: { access: access.custom, rateLimit: HANDOFF_LIMIT },
        schema: {
          summary: "Carry a signed-in member to an app's address",
          description:
            "For browsers, at the instance's own address. A member's session is not sent to " +
            "an app's address, so the member is sent there with a code that works once, " +
            "within a minute, and is exchanged there for a sign-in to that tenant's apps " +
            "only. `to` must be the instance's address for apps or a hostname the tenant " +
            "has registered.",
          tags: ["apps"],
          querystring: Type.Object({
            tenant: Id,
            to: Type.String({ maxLength: 300 }),
            return: Type.Optional(Type.String({ maxLength: 2000 })),
          }),
          response: { 302: Type.Null() },
        },
      },
      async (request, reply) => {
        const { ctx, query } = request;
        if ((await kernel.hosts.place(request)).kind !== "main") throw notFound("The page");
        if (!URL.canParse(query.to)) throw badRequest("`to` is not an address.");
        const to = new URL(query.to);
        const registered = await kernel.hosts.domain(hostnameOf(to.host));
        const isApps = kernel.hosts.hasAppsAddress && to.origin === kernel.hosts.appsOrigin;
        if (!isApps && registered?.tenantId !== query.tenant) {
          throw badRequest("`to` is not an address this tenant's apps are served at.");
        }
        const back = safePath(query.return) ?? "/";
        if (ctx.principal.type !== "member" || !ctx.principal.id || ctx.principal.apiKeyId) {
          // The console signs the member in and comes back to this address.
          return reply.redirect(`/?return=${encodeURIComponent(request.url)}`, 302);
        }
        const memberId = ctx.principal.id;
        // Only the tenant's own staff are carried over. An operator's access grant does not
        // count at an app's address, so there is nothing to carry an operator over for.
        const staff = await db
          .selectFrom("tenant_member")
          .select("member_id")
          .where("tenant_id", "=", query.tenant)
          .where("member_id", "=", memberId)
          .executeTakeFirst();
        if (!staff) throw notFound("The tenant");
        const code = await db.transaction().execute(async (trx) => {
          const made = await createHandoff(trx, {
            tenantId: query.tenant,
            memberId,
            host: to.host,
          });
          await writeAudit(trx, ctx.actor, {
            action: "app_session.handed_off",
            targetType: "member",
            targetId: memberId,
            tenantId: query.tenant,
            details: { host: to.host },
          });
          return made;
        });
        const next = new URL("/api/v1/app-sessions/start", to.origin);
        next.searchParams.set("code", code);
        next.searchParams.set("return", back);
        return reply.header("cache-control", "no-store").redirect(next.toString(), 302);
      },
    );

    app.get(
      "/app-sessions/start",
      {
        config: { access: access.public, rateLimit: HANDOFF_LIMIT },
        schema: {
          summary: "Exchange a hand-off code for a sign-in at this address",
          description: "For browsers, at an app's address. See `/app-handoffs/start`.",
          tags: ["apps"],
          querystring: Type.Object({
            code: Type.String({ minLength: 20, maxLength: 200 }),
            return: Type.Optional(Type.String({ maxLength: 2000 })),
          }),
          response: { 302: Type.Null() },
        },
      },
      async (request, reply) => {
        const { query } = request;
        if ((await kernel.hosts.place(request)).kind === "main") throw notFound("The page");
        const handoff = await db.transaction().execute(async (trx) => {
          const taken = await takeHandoff(trx, query.code, request.host);
          if (!taken) return null;
          await startAppSession(trx, request, reply, {
            tenantId: taken.tenantId,
            type: "member",
            id: taken.memberId,
          });
          await writeAudit(
            trx,
            actorOf(request, { type: "member", id: taken.memberId, appTenantId: taken.tenantId }),
            {
              action: "app_session.started",
              targetType: "member",
              targetId: taken.memberId,
              tenantId: taken.tenantId,
              details: { host: request.host.toLowerCase() },
            },
          );
          return taken;
        });
        if (!handoff) throw forbidden("app:read");
        return reply
          .header("cache-control", "no-store")
          .redirect(safePath(query.return) ?? "/", 302);
      },
    );
  };
}

/** A path on this same address, or nothing. Never another site. */
function safePath(raw: string | undefined): string | undefined {
  if (!raw?.startsWith("/") || raw.startsWith("//") || /[\\\r\n]/.test(raw)) return undefined;
  return raw;
}
