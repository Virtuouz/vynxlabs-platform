import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { Database } from "@vynxlabs/db";
import { Type } from "typebox";
import { access } from "../kernel/http.js";

export function instanceRoutes(deps: {
  database: Database;
  version: string;
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
            }),
          },
        },
      },
      async () => ({
        coreVersion: deps.version,
        apiVersion: "v1" as const,
        migrationLevel: await deps.database.migrationLevel(),
      }),
    );
  };
}
