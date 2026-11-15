import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Database } from "@vynxlabs/db";
import { Type } from "typebox";
import { access } from "../kernel/http.js";

export function instanceRoutes(deps: {
  database: Database;
  version: string;
  config?: { appsUrl: string | undefined; appsOnConsoleAddress: boolean };
}): FastifyPluginAsyncTypebox {
  return async (app) => {
    app.get(
      "/instance",
      {
        config: { access: access.public },
        schema: {
          summary: "Instance information",
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
            }),
          },
        },
      },
      async () => ({
        coreVersion: deps.version,
        apiVersion: "v1" as const,
        migrationLevel: await deps.database.migrationLevel(),
        appsAddress: deps.config?.appsUrl
          ? ("separate" as const)
          : deps.config?.appsOnConsoleAddress
            ? ("console" as const)
            : ("none" as const),
      }),
    );
  };
}
