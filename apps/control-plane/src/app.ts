import swagger from "@fastify/swagger";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { type Database, newId } from "@vynxlabs/db";
import Fastify, { type RouteOptions } from "fastify";
import { Type } from "typebox";
import type { LogLevel } from "./config.js";
import { errorHandler, notFoundHandler } from "./problem.js";
import { healthRoutes } from "./routes/health.js";
import { instanceRoutes } from "./routes/instance.js";
import type { ObjectStore } from "./storage.js";

export const API_PREFIX = "/api/v1";

const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export interface AppOptions {
  database: Database;
  storage: ObjectStore;
  version: string;
  /** Omit to disable logging. */
  logLevel?: LogLevel;
  /** Receives every registered route. For tests. */
  onRoute?: (route: RouteOptions) => void;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logLevel ? { level: options.logLevel } : false,
    requestIdHeader: false,
    genReqId: (request) => {
      const incoming = request.headers["x-request-id"];
      return typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : newId();
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  if (options.onRoute) app.addHook("onRoute", options.onRoute);

  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Vynxlabs platform API",
        version: options.version,
        description:
          "The one public API of the platform. Errors are RFC 9457 problem details " +
          "(application/problem+json) with a stable `code` and the `requestId`.",
      },
    },
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes(options));
      await api.register(instanceRoutes(options));
      api.get(
        "/openapi.json",
        {
          schema: {
            summary: "This API description",
            tags: ["instance"],
            response: { 200: Type.Object({}, { additionalProperties: true }) },
          },
        },
        async () => app.swagger(),
      );
    },
    { prefix: API_PREFIX },
  );

  return app;
}
