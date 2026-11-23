import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { type Database, newId } from "@volvel/db";
import Fastify, { type RouteOptions } from "fastify";
import { Type } from "typebox";
import {
  API_DESCRIPTION,
  API_TAGS,
  errorCodeList,
  finish,
  SECURITY_SCHEMES,
} from "./api-description.js";
import type { Config, LogLevel } from "./config.js";
import { installFrontDoor } from "./kernel/apps/front.js";
import { SYSTEM } from "./kernel/audit.js";
import { closeAllSources } from "./kernel/data/sources.js";
import { consoleDirectory } from "./kernel/docs/product.js";
import { pushTenantAccess } from "./kernel/git.js";
import { type Access, access, installAccessControl } from "./kernel/http.js";
import { defaultIcon, icoOf, webManifest } from "./kernel/icons.js";
import { createKernel, type Kernel } from "./kernel/kernel.js";
import { observe } from "./kernel/metrics.js";
import { postgresRateLimitStore } from "./kernel/ratelimit.js";
import {
  newSpanId,
  newTraceId,
  parseTraceparent,
  type TraceContext,
  withTrace,
} from "./kernel/telemetry.js";
import { takeReleased } from "./kernel/tenant/releases.js";
import { errorHandler, notFoundHandler, Problem } from "./problem.js";
import { accessRoutes } from "./routes/access.js";
import { accessReleaseRoutes } from "./routes/access-releases.js";
import { alertRoutes } from "./routes/alerts.js";
import { approvalLinkRoutes } from "./routes/approval-links.js";
import { appRoutes } from "./routes/apps.js";
import { authRoutes } from "./routes/auth.js";
import { authoringRoutes } from "./routes/authoring.js";
import { batchRoutes } from "./routes/batch.js";
import { brandingRoutes } from "./routes/branding.js";
import { compareRoutes } from "./routes/compare.js";
import { dashboardRoutes } from "./routes/dashboards.js";
import { dataRoutes } from "./routes/data.js";
import { docRoutes } from "./routes/docs.js";
import { driftRoutes } from "./routes/drift.js";
import { endUserRoutes } from "./routes/endusers.js";
import { environmentRoutes } from "./routes/environments.js";
import { executionRoutes } from "./routes/execution.js";
import { flowRoutes } from "./routes/flows.js";
import { gitRoutes } from "./routes/git.js";
import { healthRoutes } from "./routes/health.js";
import { iconRoutes, instanceIcon } from "./routes/icons.js";
import { identityRoutes } from "./routes/identity.js";
import { instanceRoutes } from "./routes/instance.js";
import { instanceControlRoutes } from "./routes/instance-control.js";
import { interfaceRoutes } from "./routes/interfaces.js";
import { locationRoutes } from "./routes/locations.js";
import { masterKeyRoutes } from "./routes/master-key.js";
import { mcpRoutes } from "./routes/mcp.js";
import { operationsRoutes } from "./routes/operations.js";
import { pageActionRoutes } from "./routes/page-actions.js";
import { pageApprovalRoutes } from "./routes/page-approvals.js";
import { permissionRoutes } from "./routes/permissions.js";
import { poolRoutes } from "./routes/pools.js";
import { portabilityRoutes } from "./routes/portability.js";
import { preferenceRoutes } from "./routes/preferences.js";
import { promotionRequestRoutes } from "./routes/promotion-requests.js";
import { queryRoutes } from "./routes/queries.js";
import { scimRoutes } from "./routes/scim.js";
import { searchRoutes } from "./routes/search.js";
import { sourceRoutes } from "./routes/sources.js";
import { ssoRoutes } from "./routes/sso.js";
import { streamRoutes } from "./routes/stream.js";
import { summaryRoutes } from "./routes/summary.js";
import { tenantRoutes } from "./routes/tenants.js";
import { termRoutes } from "./routes/terms.js";
import { widgetChoicesRoutes } from "./routes/widget-choices.js";
import { widgetDataRoutes } from "./routes/widget-data.js";
import { workerRoutes } from "./routes/worker.js";
import { workerHostRoutes } from "./routes/worker-host.js";
import { workspaceRoutes } from "./routes/workspaces.js";
import type { ObjectStore } from "./storage.js";

export const API_PREFIX = "/api/v1";

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export interface AppOptions {
  database: Database;
  storage: ObjectStore;
  version: string;
  config: Config;
  /** Omit to disable logging. */
  logLevel?: LogLevel;
  /** Receives every registered route. For tests. */
  onRoute?: (route: RouteOptions) => void;
}

/** What Fastify is given for `TRUSTED_PROXIES`: a count of hops from this server, or networks. */
export function trustProxy(trusted: number | string[]) {
  return typeof trusted === "number" ? (_address: string, hop: number) => hop < trusted : trusted;
}

/** The built console, when there is one to serve. */
export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logLevel ? { level: options.logLevel } : false,
    requestIdHeader: false,
    // On shutdown, do not wait for idle connections or for workers that are long-polling.
    forceCloseConnections: true,
    // Behind a proxy, the caller's address is what the proxy added to the forwarding header.
    // What the caller wrote is not believed past the proxies the operator says (TRUSTED_PROXIES).
    trustProxy: trustProxy(options.config.trustedProxies),
    genReqId: (request) => {
      const incoming = request.headers["x-request-id"];
      return typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : newId();
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  const kernel = createKernel(
    options.database,
    options.storage,
    options.version,
    options.config,
    app.log,
  );
  app.decorate("kernel", kernel);
  // A release of a tenant's access is committed to the tenant's branch once it is in the
  // database. It has applied already: a push that fails is logged, and the next one carries it.
  app.addHook("onResponse", async (request) => {
    if (request.method === "GET") return;
    for (const release of await takeReleased(kernel.db)) {
      void pushTenantAccess(
        kernel,
        request.ctx?.actor ?? { principal: SYSTEM },
        release.tenantId,
        release,
      )
        .then((pushed) => {
          if (pushed.status === "failed") {
            kernel.log.warn(
              { tenantId: release.tenantId, problem: pushed.problem },
              "the tenant's access could not be committed to its branch",
            );
          }
        })
        .catch((error) =>
          kernel.log.error({ err: error }, "the tenant's access could not be committed"),
        );
    }
  });
  app.addHook("onClose", () => kernel.expressions.close());
  app.addHook("onClose", () => closeAllSources());
  app.addHook("onClose", () => kernel.data.close());
  app.addHook("onClose", () => kernel.stream.close());

  app.setErrorHandler(errorHandler);
  app.decorateRequest("trace", null as unknown as TraceContext);
  app.decorateRequest("traceParent", undefined);
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    // A caller that is already part of a trace says so, and the request joins it.
    const incoming = parseTraceparent(request.headers.traceparent);
    request.traceParent = incoming?.spanId;
    request.trace = { traceId: incoming?.traceId ?? newTraceId(), spanId: newSpanId() };
    reply.header("x-trace-id", request.trace.traceId);
  });
  // What the handler starts, a run or a flow run, is found to belong to the request's trace.
  app.addHook("preHandler", (request, _reply, done) => withTrace(request.trace, done));
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url ?? "unmatched";
    const status = String(reply.statusCode);
    const seconds = reply.elapsedTime / 1000;
    observe.http(kernel.metrics, { method: request.method, route, status }, seconds);
    const kind = request.routeOptions.config?.access?.kind;
    // A worker asking for work, and a scrape, are not work anyone follows.
    if (!kernel.telemetry.tracing || kind === "worker" || kind === "worker-host") return;
    if (request.routeOptions.config?.traced === false) return;
    const end = Date.now();
    kernel.telemetry.span({
      ...request.trace,
      parentSpanId: request.traceParent,
      name: `${request.method} ${route}`,
      kind: "server",
      start: end - reply.elapsedTime,
      end,
      attributes: {
        "http.request.method": request.method,
        "http.route": route,
        "http.response.status_code": reply.statusCode,
        "url.path": request.url.split("?")[0],
        "platform.request.id": request.id,
        "platform.tenant.id": (request.params as { t?: string } | undefined)?.t,
      },
      error: reply.statusCode >= 500 ? `HTTP ${reply.statusCode}` : undefined,
    });
  });
  app.addHook("onClose", () => kernel.telemetry.close());
  if (options.onRoute) app.addHook("onRoute", options.onRoute);

  app.addHook("onClose", () => kernel.mail.close());
  // Apps and their sign-in pages, at whichever address the request came to.
  installFrontDoor(app, kernel);

  // Applies only to routes that ask for it, such as public webhooks. Counted in Postgres,
  // so a limit holds across every replica.
  await app.register(rateLimit, { global: false, store: postgresRateLimitStore(kernel) });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Volvel API",
        version: options.version,
        description: API_DESCRIPTION,
      },
      // Every path below already begins `/api/v1`, so the server is the instance itself.
      servers: [{ url: "/", description: "This instance" }],
      tags: API_TAGS.map((tag) => ({ ...tag })),
      components: { securitySchemes: SECURITY_SCHEMES },
    },
    // What a route needs is in its own configuration. It is written into the description
    // from there, so the two cannot differ.
    transform: ({ schema, url, route }) => {
      const needs = (route.config as { access?: Access } | undefined)?.access;
      return {
        url,
        schema: needs ? ({ ...schema, "x-access": needs } as typeof schema) : schema,
      };
    },
  });

  let description: Record<string, unknown> | undefined;
  /** Our routes plus the authentication library's, as one description. */
  async function describe() {
    if (description) return description;
    const own = app.swagger() as unknown as {
      paths: Record<string, unknown>;
      components?: { schemas?: Record<string, unknown> };
    };
    const auth = (await kernel.auth.api.generateOpenAPISchema()) as {
      paths: Record<string, unknown>;
      components?: { schemas?: Record<string, unknown> };
    };
    const authPaths = Object.fromEntries(
      Object.entries(auth.paths).map(([path, item]) => [`${API_PREFIX}/auth${path}`, item]),
    );
    description = {
      ...own,
      "x-error-codes": errorCodeList(),
      paths: { ...own.paths, ...authPaths },
      components: {
        ...own.components,
        schemas: {
          ...auth.components?.schemas,
          ...own.components?.schemas,
          Problem: { ...Problem, $id: undefined },
        },
      },
    };
    finish(description as unknown as Parameters<typeof finish>[0]);
    return description;
  }

  await app.register(
    async (api) => {
      installAccessControl(api, kernel);
      await api.register(healthRoutes(options));
      await api.register(instanceRoutes(options));
      await api.register(brandingRoutes(kernel));
      await api.register(instanceControlRoutes(kernel));
      await api.register(authRoutes(kernel));
      await api.register(identityRoutes(kernel));
      await api.register(tenantRoutes(kernel));
      await api.register(permissionRoutes(kernel));
      await api.register(accessReleaseRoutes(kernel));
      await api.register(workspaceRoutes(kernel));
      await api.register(executionRoutes(kernel));
      await api.register(authoringRoutes(kernel));
      await api.register(gitRoutes(kernel));
      await api.register(mcpRoutes(kernel));
      await api.register(flowRoutes(kernel));
      await api.register(dataRoutes(kernel));
      await api.register(iconRoutes(kernel));
      await api.register(queryRoutes(kernel));
      await api.register(sourceRoutes(kernel));
      await api.register(locationRoutes(kernel));
      await api.register(environmentRoutes(kernel));
      await api.register(portabilityRoutes(kernel));
      await api.register(endUserRoutes(kernel));
      await api.register(ssoRoutes(kernel));
      await api.register(scimRoutes(kernel));
      await api.register(interfaceRoutes(kernel));
      await api.register(termRoutes(kernel));
      await api.register(docRoutes(kernel));
      await api.register(dashboardRoutes(kernel));
      await api.register(widgetDataRoutes(kernel));
      await api.register(widgetChoicesRoutes(kernel));
      await api.register(pageActionRoutes(kernel));
      await api.register(pageApprovalRoutes(kernel));
      await api.register(appRoutes(kernel));
      await api.register(workerRoutes(kernel));
      await api.register(searchRoutes(kernel));
      await api.register(preferenceRoutes(kernel));
      await api.register(batchRoutes(kernel));
      await api.register(compareRoutes(kernel));
      await api.register(alertRoutes(kernel));
      await api.register(workerHostRoutes(kernel));
      await api.register(summaryRoutes(kernel));
      await api.register(operationsRoutes(kernel));
      await api.register(streamRoutes(kernel));
      await api.register(poolRoutes(kernel));
      await api.register(masterKeyRoutes(kernel));
      await api.register(promotionRequestRoutes(kernel));
      await api.register(driftRoutes(kernel));
      await api.register(accessRoutes(kernel));
      await api.register(approvalLinkRoutes(kernel));
      api.get(
        "/openapi.json",
        {
          config: { access: access.public },
          schema: {
            summary: "This API description",
            description:
              "This document, as OpenAPI 3.1: every route of the API with what it needs and how it can fail, and the sign-in library's routes.",
            tags: ["instance"],
            response: { 200: Type.Object({}, { additionalProperties: true }) },
          },
        },
        async () => describe(),
      );
    },
    { prefix: API_PREFIX },
  );

  // What a browser asks for at the root of a site, whatever page it is on: the icon for its
  // tab, and what the console is called when it is kept on a home screen.
  app.get(
    "/favicon.ico",
    { config: { access: access.public }, schema: { hide: true } },
    async (_request, reply) => {
      const icon = (await instanceIcon(kernel, 32)) ?? defaultIcon(32);
      return reply
        .header("content-type", "image/x-icon")
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "public, max-age=300")
        .send(icoOf(icon, 32));
    },
  );
  app.get(
    "/site.webmanifest",
    { config: { access: access.public }, schema: { hide: true } },
    async (_request, reply) => {
      const branding = await kernel.db
        .selectFrom("instance_branding")
        .select("product_name")
        .executeTakeFirst();
      return reply
        .header("content-type", "application/manifest+json")
        .header("cache-control", "public, max-age=300")
        .send(
          webManifest(
            branding?.product_name ?? "Console",
            `${API_PREFIX}/instance/branding/icons`,
            "/",
          ),
        );
    },
  );

  const consoleDir = consoleDirectory(options.config);
  if (consoleDir) {
    await app.register(fastifyStatic, {
      root: consoleDir,
      wildcard: false,
      // The build leaves a Brotli and a gzip copy beside each file. One of them is sent when
      // the browser takes it, and nothing is compressed while a request waits.
      preCompressed: true,
      cacheControl: false,
      setHeaders(response, path) {
        // A file under assets has a hash of its content in its name, so it never changes.
        response.header(
          "cache-control",
          /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    });
  }
  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url === "/api" || request.url.startsWith("/api/");
    // The console is a single-page app: any other path is one of its screens.
    if (consoleDir && request.method === "GET" && !isApi) {
      return reply.sendFile("index.html");
    }
    return notFoundHandler(request, reply);
  });

  return app;
}

declare module "fastify" {
  interface FastifyRequest {
    /** The trace this request is part of, and the span the request itself is. */
    trace: TraceContext;
    /** The caller's span, when the caller sent a `traceparent`. */
    traceParent: string | undefined;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    kernel: Kernel;
  }
}
