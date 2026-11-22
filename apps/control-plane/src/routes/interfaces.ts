import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { enumColor, type InterfaceBody, interfaceTables, type TableBody } from "@volvel/manifest";
import { type Static, Type } from "typebox";
import { humanize } from "../kernel/data/query/inputs.js";
import { forbidden, forbiddenBecause, notFound } from "../kernel/errors.js";
import { access, findWorkspace, guestLimit } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { groupNamesFor } from "../kernel/pages/who.js";
import { wildPath } from "./data.js";
import { AnyObject, Id } from "./shared.js";

const TableView = Type.Object({
  found: Type.Boolean({ description: "False when the workspace has no such table." }),
  canRead: Type.Boolean(),
  canWrite: Type.Boolean(),
  columns: Type.Array(
    Type.Object({
      name: Type.String(),
      label: Type.String({ description: "What the column is called, in the reader's words." }),
      description: Type.Optional(
        Type.String({ description: "What the column holds, when its definition says." }),
      ),
      type: Type.String(),
      required: Type.Boolean(),
      references: Type.Union([Type.String(), Type.Null()]),
      values: Type.Optional(
        Type.Array(
          Type.Object({
            value: Type.String(),
            label: Type.Optional(Type.String()),
            color: Type.Optional(Type.String()),
          }),
          { description: "For an enum or an enum_list: the values it offers, in order." },
        ),
      ),
    }),
  ),
});

/** What the app that draws an interface reads before it reads any rows. */
export function interfaceRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;

    app.get(
      "/tenants/:t/workspaces/:w/interfaces",
      {
        config: { access: access.custom },
        schema: {
          summary: "The interfaces of a workspace, deployed and in draft",
          description:
            "For the console's builder. Each is listed once, with whether it is deployed, " +
            "whether a draft of it is waiting, and the app that serves it. Needs " +
            "`interface:read` or `resource:read`.",
          tags: ["apps"],
          params: Type.Object({ t: Id, w: Id }),
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  title: Type.String(),
                  deployed: Type.Boolean(),
                  draft: Type.Boolean({ description: "A change is saved and not yet deployed." }),
                  removing: Type.Boolean({ description: "The draft removes it." }),
                  ownership: Type.String({
                    description:
                      "`code` for the repository, `ui` for the console. One the repository " +
                      "manages is changed and removed there.",
                  }),
                  app: Type.Union([Type.String(), Type.Null()], {
                    description: "The path of an app that serves it, deployed or in draft.",
                  }),
                  pages: Type.Integer({
                    description: "Pages, as the draft has it if there is one.",
                  }),
                  version: Type.Union([Type.Integer(), Type.Null()], {
                    description: "The deployed version; null when it is only a draft.",
                  }),
                  tables: Type.Array(Type.String(), {
                    description:
                      "The tables its widgets read, as the draft has it if there is one.",
                  }),
                  editedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()], {
                    description: "When its draft was last saved.",
                  }),
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        const workspace = await findWorkspace(kernel, params.t, params.w);
        const at = { tenantId: params.t, workspaceId: params.w };
        if (!(await ctx.allowed("resource:read", at))) await ctx.authorize("interface:read", at);
        const [live, drafts] = await Promise.all([
          db
            .selectFrom("resource")
            .select(["path", "kind", "body", "version", "ownership"])
            .where("workspace_id", "=", workspace.id)
            .where("kind", "in", ["interface", "app"])
            .execute(),
          db
            .selectFrom("resource_draft")
            .select(["path", "kind", "body", "deleted", "updated_at"])
            .where("workspace_id", "=", workspace.id)
            .where("kind", "in", ["interface", "app"])
            .execute(),
        ]);
        const servedBy = new Map<string, string>();
        // An app drafted for removal still names the screen it serves, so the removal can be taken back.
        for (const row of [...live, ...drafts.filter((draft) => !draft.deleted)]) {
          const served = (row.body as { interface?: unknown } | null)?.interface;
          if (row.kind === "app" && typeof served === "string") servedBy.set(served, row.path);
        }
        /** How many pages a body has, and the tables its widgets read. */
        const shapeOf = (body: unknown) => {
          const shown = body as InterfaceBody | null;
          return {
            pages: shown?.pages?.length ?? 0,
            tables: shown?.pages ? interfaceTables(shown).sort() : [],
          };
        };
        const found = new Map<
          string,
          {
            title: string;
            deployed: boolean;
            draft: boolean;
            removing: boolean;
            ownership: string;
            pages: number;
            version: number | null;
            tables: string[];
            editedAt: string | null;
          }
        >();
        for (const row of live.filter((row) => row.kind === "interface")) {
          found.set(row.path, {
            title: String((row.body as { title?: unknown }).title ?? row.path),
            deployed: true,
            draft: false,
            removing: false,
            ownership: row.ownership,
            ...shapeOf(row.body),
            version: row.version,
            editedAt: null,
          });
        }
        for (const draft of drafts.filter((draft) => draft.kind === "interface")) {
          const known = found.get(draft.path);
          found.set(draft.path, {
            title: draft.deleted
              ? (known?.title ?? draft.path)
              : String((draft.body as { title?: unknown }).title ?? draft.path),
            deployed: known?.deployed ?? false,
            draft: true,
            removing: draft.deleted,
            ownership: known?.ownership ?? "ui",
            ...(draft.deleted
              ? { pages: known?.pages ?? 0, tables: known?.tables ?? [] }
              : shapeOf(draft.body)),
            version: known?.version ?? null,
            editedAt: draft.updated_at.toISOString(),
          });
        }
        return {
          items: [...found.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([path, entry]) => ({ path, ...entry, app: servedBy.get(path) ?? null })),
        };
      },
    );

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
          querystring: Type.Object({
            draft: Type.Optional(
              Type.String({
                maxLength: 5,
                description:
                  "`1` reads the draft, for someone who may edit the interface, in a dev workspace.",
              }),
            ),
          }),
          response: {
            200: Type.Object({
              path: Type.String(),
              body: AnyObject,
              tables: Type.Record(Type.String(), TableView),
              groupNames: Type.Optional(
                Type.Record(Type.String(), Type.String(), {
                  description:
                    "What each group the interface names (who may run, who sees) is called now, by the path it is named by.",
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        const path = wildPath(params);
        await findWorkspace(kernel, params.t, params.w);
        const at = { tenantId: params.t, workspaceId: params.w };
        let resource: { id: string; body: unknown } | undefined = await db
          .selectFrom("resource")
          .select(["id", "key", "body"])
          .where("workspace_id", "=", params.w)
          .where("tenant_id", "=", params.t)
          .where("kind", "=", "interface")
          .where("path", "=", path)
          .executeTakeFirst();
        if (query.draft === "1" || query.draft === "true") {
          const where = await db
            .selectFrom("workspace")
            .select("type")
            .where("id", "=", params.w)
            .executeTakeFirstOrThrow();
          const mayEdit =
            (await ctx.allowed("resource:write", at)) || (await ctx.allowed("interface:write", at));
          if (where.type !== "dev" || !mayEdit) {
            throw forbiddenBecause(
              "The draft of this interface is read only by someone who may edit it, in a dev workspace.",
            );
          }
          const draft = await db
            .selectFrom("resource_draft")
            .select(["key", "body", "deleted"])
            .where("workspace_id", "=", params.w)
            .where("kind", "=", "interface")
            .where("path", "=", path)
            .executeTakeFirst();
          if (draft?.deleted) throw notFound("The interface");
          if (draft) resource = { id: draft.key, body: draft.body };
        }
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
          // What each column is for, from the table's definition, for whoever may read its rows.
          const said =
            canRead && table.resource_id
              ? ((
                  (
                    await db
                      .selectFrom("resource")
                      .select("body")
                      .where("id", "=", table.resource_id)
                      .executeTakeFirst()
                  )?.body as TableBody | undefined
                )?.columns ?? {})
              : {};
          const columns = canRead
            ? await data
                .selectFrom("data_column")
                .select(["name", "type", "required", "reference_table", "options"])
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
                    { name: "id", label: "Id", type: "uuid", required: true, references: null },
                    {
                      name: "created_at",
                      label: "Created at",
                      type: "timestamp",
                      required: true,
                      references: null,
                    },
                    {
                      name: "updated_at",
                      label: "Updated at",
                      type: "timestamp",
                      required: true,
                      references: null,
                    },
                  ]
                : []),
              ...columns.map((column) => ({
                name: column.name,
                label: humanize(column.name),
                ...(said[column.name]?.description
                  ? { description: said[column.name]?.description as string }
                  : {}),
                // A reference is of the type `reference`, and `references` says which table.
                type: column.reference_table ? "reference" : column.type,
                required: column.required,
                references: column.reference_table,
                // A colour by name is given as the colour itself: a page needs no list of names.
                ...(column.options?.values
                  ? {
                      values: column.options.values.map((one) => {
                        const color = enumColor(one.color);
                        return { ...one, ...(color ? { color } : {}) };
                      }),
                    }
                  : {}),
              })),
            ],
          };
        }
        return {
          path,
          body: body as unknown as Record<string, unknown>,
          tables,
          groupNames: await groupNamesFor(kernel, params.t, body),
        };
      },
    );
  };
}
