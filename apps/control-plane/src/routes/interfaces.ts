import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { type InterfaceBody, interfaceTables } from "@vynxlabs/manifest";
import { type Static, Type } from "typebox";
import { notFound } from "../kernel/errors.js";
import { access, findWorkspace, guestLimit } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { wildPath } from "./data.js";
import { AnyObject, Id } from "./shared.js";

const TableView = Type.Object({
  found: Type.Boolean({ description: "False when the workspace has no such table." }),
  canRead: Type.Boolean(),
  canWrite: Type.Boolean(),
  columns: Type.Array(
    Type.Object({
      name: Type.String(),
      type: Type.String(),
      required: Type.Boolean(),
      references: Type.Union([Type.String(), Type.Null()]),
    }),
  ),
});

/** What the app that draws an interface reads before it reads any rows. */
export function interfaceRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    app.get(
      "/tenants/:t/workspaces/:w/interfaces/*",
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "An interface as it is deployed, with what its tables hold",
          description:
            "For the app that draws an interface. Answers for whoever may open an app that " +
            "serves the interface, and for whoever may read the workspace's resources. For " +
            "each table the interface shows it gives the columns and whether the caller may " +
            "read and write rows, and nothing else about the table: not its policy, not how " +
            "many rows it has. Which rows the caller sees is decided when rows are asked for.",
          tags: ["apps"],
          params: Type.Object({ t: Id, w: Id, "*": Type.String() }),
          response: {
            200: Type.Object({
              path: Type.String(),
              interface: AnyObject,
              tables: Type.Record(Type.String(), TableView),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const path = wildPath(params);
        await findWorkspace(kernel, params.t, params.w);
        const at = { tenantId: params.t, workspaceId: params.w };
        const resource = await db
          .selectFrom("resource")
          .select(["id", "body"])
          .where("workspace_id", "=", params.w)
          .where("tenant_id", "=", params.t)
          .where("kind", "=", "interface")
          .where("path", "=", path)
          .executeTakeFirst();
        // Someone who may open none of the apps that show it is told the same as when it is not there.
        let allowed =
          (await ctx.allowed("resource:read", at)) || (await ctx.allowed("interface:read", at));
        if (!allowed && resource) {
          const apps = await db
            .selectFrom("resource")
            .select(["id", "body"])
            .where("workspace_id", "=", params.w)
            .where("kind", "=", "app")
            .execute();
          for (const candidate of apps) {
            if ((candidate.body as { interface?: string }).interface !== path) continue;
            if (await ctx.allowed("app:read", { ...at, resourceId: candidate.id })) {
              allowed = true;
              break;
            }
          }
        }
        if (!resource || !allowed) throw notFound("The interface");

        const body = resource.body as unknown as InterfaceBody;
        const data = (await kernel.data.forTenant(params.t)).owner;
        const tables: Record<string, Static<typeof TableView>> = {};
        for (const name of interfaceTables(body)) {
          const table = await data
            .selectFrom("data_table")
            .select(["id", "resource_id"])
            .where("workspace_id", "=", params.w)
            .where("tenant_id", "=", params.t)
            .where("name", "=", name)
            .where("status", "=", "active")
            .executeTakeFirst();
          if (!table) {
            tables[name] = { found: false, canRead: false, canWrite: false, columns: [] };
            continue;
          }
          const where = { ...at, resourceId: table.resource_id ?? undefined };
          const canRead = await ctx.allowed("data:read", where);
          const columns = canRead
            ? await data
                .selectFrom("data_column")
                .select(["name", "type", "required", "reference_table"])
                .where("table_id", "=", table.id)
                .where("status", "=", "active")
                .orderBy("created_at")
                .orderBy("name")
                .execute()
            : [];
          tables[name] = {
            found: true,
            canRead,
            canWrite: canRead && (await ctx.allowed("data:write", where)),
            columns: [
              ...(canRead
                ? [
                    { name: "id", type: "uuid", required: true, references: null },
                    { name: "created_at", type: "timestamp", required: true, references: null },
                    { name: "updated_at", type: "timestamp", required: true, references: null },
                  ]
                : []),
              ...columns.map((column) => ({
                name: column.name,
                type: column.type,
                required: column.required,
                references: column.reference_table,
              })),
            ],
          };
        }
        return {
          path,
          interface: body as unknown as Record<string, unknown>,
          tables,
        };
      },
    );
  };
}
