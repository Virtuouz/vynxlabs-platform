import { createHash } from "node:crypto";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { dashboardKind, enumColor, type QueryBody, type VisualQuery } from "@volvel/manifest";
import { Type } from "typebox";
import { check } from "../kernel/authorize.js";
import { loadCatalog } from "../kernel/data/apply.js";
import { ALLOWED_FUNCTIONS } from "../kernel/data/query/allowed.js";
import { checkFor, QUERY_ROWS, runQuery } from "../kernel/data/query/run.js";
import { workspaceCatalog, writeVisual } from "../kernel/data/query/widget.js";
import { scopeFor } from "../kernel/data/rows.js";
import { badRequest, HttpError, notFound } from "../kernel/errors.js";
import { access, findWorkspace, type RequestContext } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { resolveResource } from "../kernel/resolve.js";
import { WildParams, wildPath } from "./data.js";
import { NullableString, WorkspaceParams } from "./shared.js";

const base = "/tenants/:t/workspaces/:w";

export const QueryResultSchema = Type.Object({
  columns: Type.Array(
    Type.Object({
      name: Type.String(),
      type: Type.String({
        description:
          "What the column's values are, read from the first one that is not empty: text, " +
          "number, boolean, timestamp, list, json, or unknown when every value is empty.",
      }),
    }),
  ),
  rows: Type.Array(Type.Array(Type.Unknown()), {
    description: "Each row's values, in the order of `columns`.",
  }),
  truncated: Type.Boolean({ description: "There was more than was returned." }),
  tables: Type.Array(Type.String(), { description: "The tables the query read." }),
  sql: Type.String({
    description: "The query as it ran: written again from what was read of the text sent.",
  }),
  written: Type.Optional(
    Type.Object(
      { sql: Type.String(), parameters: Type.Array(Type.Unknown()) },
      {
        description:
          "For a query built from menus: the SQL the platform wrote for it, as someone would " +
          "write it, and the values of its parameters. It is what turning the query into SQL gives.",
      },
    ),
  ),
});

/**
 * Read-only SQL over a workspace's tables (Decision 0003). The text is parsed
 * and written again before it runs; it reads the tables through views; each
 * table needs `data:read`; and each table's row policy applies to whoever asks.
 */
export const queryRoutes =
  (kernel: Kernel): FastifyPluginAsyncTypebox =>
  async (app) => {
    const db = kernel.db;
    /** A visual query is checked as a dashboard widget's is, by the same schema. */
    const validateVisual = (visual: unknown) => {
      const result = kernel.kinds.validateManifest({
        kind: "dashboard",
        schemaVersion: dashboardKind.schemaVersion,
        path: "preview",
        ownership: "ui",
        body: {
          widgets: [
            {
              id: "preview",
              type: "core/table",
              at: { x: 0, y: 0, w: 12, h: 6 },
              data: { rows: { source: { visual } } },
            },
          ],
        },
      });
      return result.ok
        ? []
        : result.issues.map((issue) => ({
            path: issue.path.replace("/body/widgets/0/data/rows/source/visual", "/query"),
            message: issue.message,
          }));
    };
    /**
     * Whoever has no standing in the tenant is told nothing, whatever they ask: the same 404 as for
     * a tenant that is not there, before anything of the workspace is read.
     */
    const standing = async (ctx: RequestContext, params: { t: string; w: string }) => {
      const at = { tenantId: params.t, workspaceId: params.w };
      const decision = await check(db, ctx.principal, "data:read", at);
      if (!decision.allowed && !decision.related) throw notFound("The tenant");
    };
    /** Refuses a table the caller may not read, naming it. */
    const reader =
      (ctx: RequestContext, params: { t: string; w: string }) =>
      async (table: { name: string; resourceId: string | null }) => {
        const allowed = await ctx.allowed("data:read", {
          tenantId: params.t,
          workspaceId: params.w,
          resourceId: table.resourceId ?? undefined,
        });
        if (!allowed) {
          throw new HttpError(
            403,
            "forbidden",
            `The query reads the table "${table.name}", which needs the data:read permission there.`,
          );
        }
      };

    app.post(
      `${base}/queries/run`,
      {
        config: { access: access.workspace("sql:read") },
        schema: {
          summary: "Run a query written in SQL, and read its result",
          description:
            "One SELECT over the workspace's tables, each named by its path. Nothing else is " +
            "allowed: no other statement, no table of the database's own, and only the " +
            "functions that work on the values they are given. Each table read needs " +
            "`data:read`, and its row policy applies to the caller. Parameters are `$1`, `$2` " +
            "and so on. The run is recorded in the audit log, with its text and not its result.",
          tags: ["data"],
          params: WorkspaceParams,
          body: Type.Object({
            sql: Type.String({ minLength: 1, maxLength: 20_000 }),
            params: Type.Optional(Type.Array(Type.Unknown(), { maxItems: 50 })),
            limit: Type.Optional(
              Type.Integer({ minimum: 1, maximum: QUERY_ROWS.most, default: QUERY_ROWS.default }),
            ),
          }),
          response: { 200: QueryResultSchema },
        },
      },
      async ({ ctx, params, body }) => {
        await findWorkspace(kernel, params.t, params.w);
        const at = { tenantId: params.t, workspaceId: params.w };
        const scope = await scopeFor(
          kernel,
          params.t,
          ctx.principal,
          await ctx.allowed("data_all:read", at),
        );
        const result = await runQuery(kernel, {
          tenantId: params.t,
          workspaceId: params.w,
          scope,
          text: body.sql,
          ...(body.params ? { parameters: body.params } : {}),
          ...(body.limit ? { limit: body.limit } : {}),
          mayRead: reader(ctx, params),
        });
        await ctx.mutate(async (_trx, audit) => {
          await audit({
            action: "sql.run",
            targetType: "workspace",
            targetId: params.w,
            tenantId: params.t,
            workspaceId: params.w,
            details: {
              sql: result.sql,
              hash: createHash("sha256").update(result.sql).digest("hex"),
              tables: result.tables,
              rows: result.rows.length,
              truncated: result.truncated,
            },
          });
        });
        return result;
      },
    );

    app.get(
      `${base}/queries/schema`,
      {
        // Whoever builds a query from menus needs this as much as whoever writes one. It gives
        // only the tables the caller may read rows of, so it asks for nothing more than that.
        config: {
          access: access.custom(
            "Needs `data:read`, and lists only the tables the caller may read.",
          ),
        },
        schema: {
          summary: "What a query can name: tables, their columns, and the functions allowed",
          description:
            "The tables the caller may read, for an editor to complete from. A table is named " +
            "in a query by its path, in double quotes when it has a `/` or a `-`.",
          tags: ["data"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              tables: Type.Array(
                Type.Object({
                  name: Type.String(),
                  display: NullableString,
                  columns: Type.Array(
                    Type.Object({
                      name: Type.String(),
                      type: Type.String(),
                      references: NullableString,
                      required: Type.Optional(
                        Type.Boolean({
                          description:
                            "Whether the column is NOT NULL. A row must give it unless it has a default.",
                        }),
                      ),
                      default: Type.Optional(
                        Type.Unknown({
                          description: "What a row gets when it gives none, when the table says.",
                        }),
                      ),
                      description: Type.Optional(
                        Type.String({
                          description:
                            "What the column holds, when its definition says (in cents, say).",
                        }),
                      ),
                      values: Type.Optional(
                        Type.Array(
                          Type.Object({
                            value: Type.String(),
                            label: Type.Optional(Type.String()),
                            color: Type.Optional(Type.String()),
                          }),
                        ),
                      ),
                    }),
                  ),
                }),
              ),
              functions: Type.Array(Type.String()),
              maySql: Type.Boolean({
                description:
                  "Whether the caller may run SQL of their own here, and write it into a " +
                  "dashboard's widget: whether they hold `sql:read`, which no wildcard gives.",
              }),
            }),
          },
        },
      },
      async ({ ctx, params }) => {
        await standing(ctx, params);
        await findWorkspace(kernel, params.t, params.w);
        const data = (await kernel.data.forTenant(params.t)).owner;
        const catalog = (await loadCatalog(data, params.w)).filter(
          (table) => table.status === "active",
        );
        // What a column is for is in its table's definition, not in the catalog.
        const defined = new Map(
          (
            await db
              .selectFrom("resource")
              .select(["path", "body"])
              .where("workspace_id", "=", params.w)
              .where("kind", "=", "table")
              .execute()
          ).map((one) => [
            one.path,
            (one.body as { columns?: Record<string, { description?: string }> } | null)?.columns,
          ]),
        );
        const tables = [];
        for (const table of catalog) {
          const allowed = await ctx.allowed("data:read", {
            tenantId: params.t,
            workspaceId: params.w,
            resourceId: table.resourceId ?? undefined,
          });
          if (!allowed) continue;
          tables.push({
            name: table.name,
            display: table.display ?? null,
            columns: [
              { name: "id", type: "uuid", references: null },
              { name: "created_at", type: "timestamp", references: null },
              { name: "updated_at", type: "timestamp", references: null },
              ...table.columns
                .filter((column) => column.status === "active")
                .map((column) => ({
                  name: column.name,
                  type: column.type,
                  references: column.referenceTable,
                  ...(column.required ? { required: true } : {}),
                  ...(column.default !== null && column.default !== undefined
                    ? { default: column.default }
                    : {}),
                  ...(defined.get(table.name)?.[column.name]?.description
                    ? { description: defined.get(table.name)?.[column.name]?.description as string }
                    : {}),
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
          });
        }
        const maySql = await ctx.allowed("sql:read", { tenantId: params.t, workspaceId: params.w });
        return { tables, functions: [...ALLOWED_FUNCTIONS].sort(), maySql };
      },
    );

    app.get(
      `${base}/queries/visual`,
      {
        config: {
          access: access.custom(
            "Needs `data:read` at each table the query reads, and each table's row policy applies.",
          ),
        },
        schema: {
          summary: "Run a query built from menus, and read its result",
          description:
            "`query` is a visual query, as JSON: a table, the references of it to follow, " +
            "filters, groups, measures and a sort. See `visual` in the `dashboard` schema. The " +
            "platform writes its SQL and runs it as any query: each table read needs " +
            "`data:read`, and its row policy applies to the caller. It asks for no `sql:read`, " +
            "since nothing here is SQL the caller wrote.",
          tags: ["data"],
          params: WorkspaceParams,
          querystring: Type.Object({
            query: Type.String({ maxLength: 8000 }),
            limit: Type.Optional(
              Type.Integer({ minimum: 1, maximum: QUERY_ROWS.most, default: QUERY_ROWS.default }),
            ),
          }),
          response: { 200: QueryResultSchema },
        },
      },
      async ({ ctx, params, query: asked }) => {
        await standing(ctx, params);
        await findWorkspace(kernel, params.t, params.w);
        const at = { tenantId: params.t, workspaceId: params.w };
        let visual: unknown;
        try {
          visual = JSON.parse(asked.query);
        } catch {
          throw badRequest("The query must be JSON.");
        }
        const valid = validateVisual(visual);
        if (valid.length > 0) throw badRequest("The query is not valid.", valid);
        // Only the tables the caller may read are there to be named: a table they may not read is
        // answered as one that does not exist, and the names of the others cannot be probed.
        const known = await workspaceCatalog(kernel, params.t, params.w);
        for (const [name, table] of known.tables) {
          if (
            !(await ctx.allowed("data:read", { ...at, resourceId: table.resourceId ?? undefined }))
          )
            known.visual.delete(name);
        }
        const written = writeVisual(visual as VisualQuery, known.visual);
        const scope = await scopeFor(
          kernel,
          params.t,
          ctx.principal,
          await ctx.allowed("data_all:read", at),
        );
        const result = await runQuery(kernel, {
          ...at,
          scope,
          text: written.sql,
          parameters: written.parameters,
          ...(asked.limit ? { limit: asked.limit } : {}),
          mayRead: reader(ctx, params),
        });
        return { ...result, written: { sql: written.sql, parameters: written.parameters } };
      },
    );

    // ----- Saved queries -----

    const Parameter = Type.Object({
      name: Type.String(),
      type: Type.String(),
      label: Type.Optional(Type.String()),
      default: Type.Optional(Type.Unknown()),
      required: Type.Optional(Type.Boolean()),
    });

    app.get(
      `${base}/queries`,
      {
        config: { access: access.workspace("resource:read") },
        schema: {
          summary: "The queries a workspace keeps by name",
          description:
            "Deployed ones, and those made or changed in the console that wait to be deployed.",
          tags: ["data"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  path: Type.String(),
                  description: Type.String(),
                  sql: Type.String(),
                  parameters: Type.Array(Parameter),
                  ownership: Type.String(),
                  draft: Type.Union([
                    Type.Literal("new"),
                    Type.Literal("changed"),
                    Type.Literal("removed"),
                    Type.Null(),
                  ]),
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const deployed = await db
          .selectFrom("resource")
          .select(["path", "body", "ownership"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "query")
          .execute();
        const drafts = await db
          .selectFrom("resource_draft")
          .select(["path", "body", "deleted"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "query")
          .execute();
        const item = (
          path: string,
          raw: unknown,
          ownership: string,
          draft: "new" | "changed" | "removed" | null,
        ) => {
          const body = (raw ?? {}) as Partial<QueryBody>;
          return {
            path,
            description: body.description ?? "",
            sql: body.sql ?? "",
            parameters: body.parameters ?? [],
            ownership,
            draft,
          };
        };
        const items = [
          ...deployed.map((one) => {
            const draft = drafts.find((candidate) => candidate.path === one.path);
            // What is listed is what runs. The draft's own text is read from the draft.
            return item(
              one.path,
              one.body,
              one.ownership,
              draft ? (draft.deleted ? "removed" : "changed") : null,
            );
          }),
          ...drafts
            .filter((one) => !one.deleted && !deployed.some((row) => row.path === one.path))
            .map((one) => item(one.path, one.body, "ui", "new")),
        ].sort((a, b) => a.path.localeCompare(b.path));
        return { items };
      },
    );

    app.get(
      `${base}/queries/saved/*`,
      {
        config: {
          access: access.custom(
            "Needs `data:read` at the workspace or the table, for each table the query reads. Its row policy applies.",
          ),
        },
        schema: {
          summary: "Run a query the workspace keeps, and read its result",
          description:
            "Its text is the workspace's, so writing SQL is not asked of the caller: reading " +
            "rows is. Each table the query reads needs `data:read`, at the workspace or at " +
            "that table, and each table's row policy applies to the caller. It is a read, and " +
            "is not recorded in the audit log.",
          tags: ["data"],
          params: WildParams,
          querystring: Type.Object({
            params: Type.Optional(
              Type.String({
                maxLength: 8000,
                description: 'The parameters by name, as JSON: {"least": 20}.',
              }),
            ),
            limit: Type.Optional(
              Type.Integer({ minimum: 1, maximum: QUERY_ROWS.most, default: QUERY_ROWS.default }),
            ),
          }),
          response: { 200: QueryResultSchema },
        },
      },
      async ({ ctx, params, query: asked }) => {
        await standing(ctx, params);
        let named: unknown = {};
        if (asked.params !== undefined) {
          try {
            named = JSON.parse(asked.params);
          } catch {
            throw badRequest("The parameters must be JSON.");
          }
        }
        if (typeof named !== "object" || named === null || Array.isArray(named)) {
          throw badRequest("The parameters must be an object, by name.");
        }
        const body = { params: named as Record<string, unknown>, limit: asked.limit };
        await findWorkspace(kernel, params.t, params.w);
        const at = { tenantId: params.t, workspaceId: params.w };
        const found = await resolveResource(db, params.w, wildPath(params), { kind: "query" });
        const saved = found?.resource;
        // Someone with no standing here is told nothing of what the workspace keeps.
        if (!saved) {
          await ctx.authorize("data:read", at);
          throw notFound(`The query ${wildPath(params)}`);
        }
        const query = saved.body as unknown as QueryBody;
        // The caller's standing on what it reads comes before anything is said of its parameters.
        // A query that reads no table still runs on the workspace's database, so it needs standing
        // here. One that reads tables is held to each of them.
        const read = await checkFor(kernel, params.t, params.w, query.sql).catch(() => undefined);
        if (!read || read.tables.length === 0) await ctx.authorize("data:read", at);
        else {
          const mayRead = reader(ctx, params);
          for (const name of read.tables) {
            await mayRead({ name, resourceId: read.resources.get(name)?.resourceId ?? null });
          }
        }
        const given = body.params ?? {};
        const declared = query.parameters ?? [];
        const unknown = Object.keys(given).filter(
          (name) => !declared.some((one) => one.name === name),
        );
        if (unknown.length > 0) {
          throw badRequest("The query has no such parameter.", [
            { path: `/params/${unknown[0]}`, message: `there is no parameter "${unknown[0]}"` },
          ]);
        }
        const values = declared.map((parameter) => {
          const value = given[parameter.name] ?? parameter.default ?? null;
          if (value === null) {
            if (parameter.required) {
              throw badRequest("A parameter is missing.", [
                { path: `/params/${parameter.name}`, message: "a value is required" },
              ]);
            }
            return null;
          }
          const problem = misfit(parameter.type, value);
          if (problem) {
            throw badRequest("A parameter does not fit.", [
              { path: `/params/${parameter.name}`, message: `must be ${problem}` },
            ]);
          }
          return value;
        });
        const scope = await scopeFor(
          kernel,
          params.t,
          ctx.principal,
          await ctx.allowed("data_all:read", at),
        );
        const result = await runQuery(kernel, {
          tenantId: params.t,
          workspaceId: params.w,
          scope,
          text: query.sql,
          parameters: values,
          ...(body.limit ? { limit: body.limit } : {}),
          mayRead: reader(ctx, params),
        });
        return result;
      },
    );
  };

/** Why a value does not fit a parameter of this type, or nothing when it does. */
function misfit(type: string, value: unknown): string | undefined {
  switch (type) {
    case "text":
      return typeof value === "string" ? undefined : "text";
    case "integer":
      return Number.isSafeInteger(value) ? undefined : "a whole number";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? undefined : "a number";
    case "boolean":
      return typeof value === "boolean" ? undefined : "true or false";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? undefined
        : "a date, such as 2026-01-31";
    case "timestamp":
      return typeof value === "string" && !Number.isNaN(Date.parse(value))
        ? undefined
        : "a date and time, such as 2026-01-31T09:30:00Z";
    default:
      return "something this parameter can hold";
  }
}
