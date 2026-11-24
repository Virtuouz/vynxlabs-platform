import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Database } from "@volvel/db";
import { Type } from "typebox";
import { access } from "../kernel/http.js";

export function instanceRoutes(deps: {
  database: Database;
  version: string;
  config?: {
    publicUrl?: string;
    appsUrl: string | undefined;
    appsOnConsoleAddress: boolean;
    mail?: unknown;
    mailCaptureDir?: string | undefined;
  };
}): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/instance",
      {
        config: { access: access.public },
        schema: {
          summary: "Instance information",
          description:
            "The core's version, the API version, how far the database is migrated, and where apps are served: at a separate address, at the console's own, or not at all. For a program that has to know which instance it is talking to.",
          tags: ["instance"],
          response: {
            200: Type.Object({
              coreVersion: Type.String(),
              apiVersion: Type.Literal("v1"),
              migrationLevel: Type.Integer({
                description: "The highest database migration applied.",
              }),
              appsAddress: Type.Union(
                [Type.Literal("separate"), Type.Literal("console"), Type.Literal("none")],
                {
                  description:
                    "Where apps written as code are served: at an address of their own, at the " +
                    "console's by the operator's choice, or nowhere yet. Interfaces are served " +
                    "in every case.",
                },
              ),
              appsUrl: Type.Union([Type.String(), Type.Null()], {
                description:
                  "The address apps and widgets are served at when it is a second address of " +
                  "its own, as an origin; null when they are served at the console's or nowhere.",
              }),
              mail: Type.Boolean({
                description:
                  "Whether the instance sends mail: approvers are told of what waits for them.",
              }),
              publicUrl: Type.Union([Type.String(), Type.Null()], {
                description:
                  "The address the instance is reached at, as its operator set it: what a " +
                  "standalone worker is given as `--url`.",
              }),
            }),
          },
        },
      },
      async () => ({
        coreVersion: deps.version,
        apiVersion: "v1" as const,
        migrationLevel: await deps.database.migrationLevel(),
        mail: Boolean(deps.config?.mail || deps.config?.mailCaptureDir),
        publicUrl: deps.config?.publicUrl ?? null,
        appsUrl: deps.config?.appsUrl ? new URL(deps.config.appsUrl).origin : null,
        appsAddress: deps.config?.appsUrl
          ? ("separate" as const)
          : deps.config?.appsOnConsoleAddress
            ? ("console" as const)
            : ("none" as const),
      }),
    );
  };
}
