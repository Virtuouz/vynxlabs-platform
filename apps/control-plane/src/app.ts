import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { type Database, newId } from "@vynxlabs/db";
import Fastify, { type RouteOptions } from "fastify";
import { Type } from "typebox";
import type { Config, LogLevel } from "./config.js";
import { installFrontDoor } from "./kernel/apps/front.js";
import { closeAllSources } from "./kernel/data/sources.js";
import { access, installAccessControl } from "./kernel/http.js";
import { createKernel, type Kernel } from "./kernel/kernel.js";
import { errorHandler, notFoundHandler } from "./problem.js";
import { appRoutes } from "./routes/apps.js";
import { authRoutes } from "./routes/auth.js";
import { authoringRoutes } from "./routes/authoring.js";
import { dashboardRoutes } from "./routes/dashboards.js";
import { dataRoutes } from "./routes/data.js";
import { endUserRoutes } from "./routes/endusers.js";
import { environmentRoutes } from "./routes/environments.js";
import { executionRoutes } from "./routes/execution.js";
import { flowRoutes } from "./routes/flows.js";
import { gitRoutes } from "./routes/git.js";
import { healthRoutes } from "./routes/health.js";
import { identityRoutes } from "./routes/identity.js";
import { instanceRoutes } from "./routes/instance.js";
import { interfaceRoutes } from "./routes/interfaces.js";
import { locationRoutes } from "./routes/locations.js";
import { mcpRoutes } from "./routes/mcp.js";
import { permissionRoutes } from "./routes/permissions.js";
import { portabilityRoutes } from "./routes/portability.js";
import { scimRoutes } from "./routes/scim.js";
import { sourceRoutes } from "./routes/sources.js";
import { ssoRoutes } from "./routes/sso.js";
import { tenantRoutes } from "./routes/tenants.js";
import { workerRoutes } from "./routes/worker.js";
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

/** The built console, when there is one to serve. */
function consoleDirectory(config: Config): string | undefined {
  if (config.consoleDir) return config.consoleDir;
  const inRepo = fileURLToPath(new URL("../../console/dist", import.meta.url));
  return existsSync(inRepo) ? inRepo : undefined;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logLevel ? { level: options.logLevel } : false,
    requestIdHeader: false,
    // On shutdown, do not wait for idle connections or for workers that are long-polling.
    forceCloseConnections: true,
    // Behind a proxy, the caller's address is in the forwarding header.
    trustProxy: true,
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
  app.addHook("onClose", () => kernel.expressions.close());
  app.addHook("onClose", () => closeAllSources());
  app.addHook("onClose", () => kernel.data.close());

  app.setErrorHandler(errorHandler);
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  if (options.onRoute) app.addHook("onRoute", options.onRoute);

  app.addHook("onClose", () => kernel.mail.close());
  // Apps and their sign-in pages, at whichever address the request came to.
  installFrontDoor(app, kernel);

  // Applies only to routes that ask for it, such as public webhooks.
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Vynxlabs platform API",
        version: options.version,
        description:
          "The one public API of the platform. Errors are RFC 9457 problem details " +
          "(application/problem+json) with a stable `code` and the `requestId`. " +
          "Sign in through `/api/v1/auth/sign-in/email` for a session cookie, or send " +
          "`Authorization: Bearer <api key>`.",
      },
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
      paths: { ...own.paths, ...authPaths },
      components: {
        ...own.components,
        schemas: { ...auth.components?.schemas, ...own.components?.schemas },
      },
    };
    return description;
  }

  await app.register(
    async (api) => {
      installAccessControl(api, kernel);
      await api.register(healthRoutes(options));
      await api.register(instanceRoutes(options));
      await api.register(authRoutes(kernel));
      await api.register(identityRoutes(kernel));
      await api.register(tenantRoutes(kernel));
      await api.register(permissionRoutes(kernel));
      await api.register(workspaceRoutes(kernel));
      await api.register(executionRoutes(kernel));
      await api.register(authoringRoutes(kernel));
      await api.register(gitRoutes(kernel));
      await api.register(mcpRoutes(kernel));
      await api.register(flowRoutes(kernel));
      await api.register(dataRoutes(kernel));
      await api.register(sourceRoutes(kernel));
      await api.register(locationRoutes(kernel));
      await api.register(environmentRoutes(kernel));
      await api.register(portabilityRoutes(kernel));
      await api.register(endUserRoutes(kernel));
      await api.register(ssoRoutes(kernel));
      await api.register(scimRoutes(kernel));
      await api.register(interfaceRoutes(kernel));
      await api.register(dashboardRoutes(kernel));
      await api.register(appRoutes(kernel));
      await api.register(workerRoutes(kernel));
      api.get(
        "/openapi.json",
        {
          config: { access: access.public },
          schema: {
            summary: "This API description",
            tags: ["instance"],
            response: { 200: Type.Object({}, { additionalProperties: true }) },
          },
        },
        async () => describe(),
      );
    },
    { prefix: API_PREFIX },
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
  interface FastifyInstance {
    kernel: Kernel;
  }
}
