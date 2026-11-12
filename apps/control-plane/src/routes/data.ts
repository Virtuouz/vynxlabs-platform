import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@vynxlabs/db";
import { PATH_PATTERN } from "@vynxlabs/manifest";
import { Type } from "typebox";
import { loadCatalog, purgeRetired, workspaceSchema } from "../kernel/data/apply.js";
import {
  type DataScope,
  deleteRow,
  describeTable,
  findRows,
  getRow,
  insertRows,
  type Row,
  updateRow,
  withData,
} from "../kernel/data/rows.js";
import { badRequest } from "../kernel/errors.js";
import { publishPlatformEvent } from "../kernel/flows/events.js";
import { access, findWorkspace, type RequestContext } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { AnyObject, Id, NoContent, NullableString, WorkspaceParams } from "./shared.js";

const pathPattern = new RegExp(PATH_PATTERN);
export const WildParams = Type.Object({ t: Id, w: Id, "*": Type.String() });
export function wildPath(params: { "*": string }): string {
  const path = params["*"];
  if (!pathPattern.test(path) || path.length > 255) throw badRequest("The path is not valid.");
  return path;
}

export const RowsQuery = Type.Object({
  filter: Type.Optional(
    Type.String({ description: 'JSON, for example {"column":"total","op":"gt","value":100}.' }),
  ),
  sort: Type.Optional(
    Type.String({
      description: "Column names separated by commas. A leading minus sorts downwards.",
    }),
  ),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 50 })),
  cursor: Type.Optional(Type.String()),
});
export const RowsPage = Type.Object({ items: Type.Array(AnyObject), nextCursor: NullableString });

export function parseRowsQuery(query: {
  filter?: string;
  sort?: string;
  limit?: number;
  cursor?: string;
}) {
  let filter: unknown;
  if (query.filter !== undefined) {
    try {
      filter = JSON.parse(query.filter);
    } catch {
      throw badRequest("The filter must be JSON.");
    }
  }
  const offset =
    query.cursor === undefined
      ? 0
      : Number(Buffer.from(query.cursor, "base64url").toString("utf8"));
  if (!Number.isSafeInteger(offset) || offset < 0) throw badRequest("The cursor is not valid.");
  return {
    ...(filter !== undefined ? { filter } : {}),
    sort: query.sort
      ? query.sort
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : [],
    limit: query.limit ?? 50,
    offset,
  };
}
export const toRowsPage = (found: { items: Row[]; nextOffset: number | null }) => ({
  items: found.items,
  nextCursor:
    found.nextOffset === null ? null : Buffer.from(String(found.nextOffset)).toString("base64url"),
});

const Column = Type.Object({
  name: Type.String(),
  type: Type.String(),
  required: Type.Boolean(),
  unique: Type.Boolean(),
  default: Type.Unknown(),
  references: NullableString,
  status: Type.Union([Type.Literal("active"), Type.Literal("retired")]),
  held: Type.Union([Type.Integer(), Type.Null()], {
    description: "For a retired column: how many rows still hold a value in it.",
  }),
});

/** Tells subscribers that rows changed. Nothing is stored unless something listens. */
export async function announceRows(
  kernel: Kernel,
  tenantId: string,
  workspaceId: string,
  table: string,
  change: string,
  ids: string[],
) {
  for (const id of ids) {
    await publishPlatformEvent(kernel, {
      tenantId,
      workspaceId,
      name: "platform/row-changed",
      payload: { table, change, id },
      sourceId: id,
      depth: 0,
    }).catch((error) =>
      kernel.log.error({ err: error }, "a platform event could not be published"),
    );
  }
}

export function dataRoutes(kernel: Kernel): FastifyPluginAsyncTypebox {
  return async (app) => {
    const { db } = kernel;
    const base = "/tenants/:t/workspaces/:w";

    /** Checks the caller may touch this table's rows, and says how much of it they may see. */
    async function enter(
      ctx: RequestContext,
      params: { t: string; w: string },
      table: string,
      verb: "read" | "write",
    ) {
      await findWorkspace(kernel, params.t, params.w);
      const data = (await kernel.data.forTenant(params.t)).owner;
      // The permission may be held at the workspace or at this one table.
      const known = await data
        .selectFrom("data_table")
        .select("resource_id")
        .where("workspace_id", "=", params.w)
        .where("tenant_id", "=", params.t)
        .where("name", "=", table)
        .where("status", "=", "active")
        .executeTakeFirst();
      const at = {
        tenantId: params.t,
        workspaceId: params.w,
        resourceId: known?.resource_id ?? undefined,
      };
      await ctx.authorize(`data:${verb}`, at);
      const target = await describeTable(data, params.w, table);
      const scope: DataScope = {
        principalId: ctx.principal.id,
        all: await ctx.allowed(`data_all:${verb}`, at),
      };
      return { target, scope };
    }

    // ----- Definitions -----

    app.get(
      `${base}/tables`,
      {
        config: { access: access.workspace("table:read") },
        schema: {
          summary: "Custom tables in a workspace",
          tags: ["data"],
          params: WorkspaceParams,
          response: {
            200: Type.Object({
              items: Type.Array(
                Type.Object({
                  name: Type.String(),
                  description: Type.String(),
                  status: Type.String(),
                  managedIn: Type.String({
                    description: "`code` for the repository, `ui` for the console.",
                  }),
                  columnCount: Type.Integer(),
                  rowCount: Type.Integer(),
                  policy: AnyObject,
                }),
              ),
            }),
          },
        },
      },
      async ({ params }) => {
        const data = (await kernel.data.forTenant(params.t)).owner;
        const catalog = await loadCatalog(data, params.w);
        const resources = await db
          .selectFrom("resource")
          .select(["path", "body", "ownership"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "table")
          .execute();
        const schema = workspaceSchema(params.w);
        const items = [];
        for (const table of catalog) {
          const resource =
            table.status === "active"
              ? resources.find((candidate) => candidate.path === table.name)
              : undefined;
          const count = await sql<{
            n: string;
          }>`select count(*) as n from ${sql.id(schema, table.physicalName)}`.execute(data);
          items.push({
            name: table.name,
            description:
              (resource?.body as { description?: string } | undefined)?.description ?? "",
            status: table.status,
            managedIn: resource?.ownership ?? "code",
            columnCount: table.columns.filter((column) => column.status === "active").length,
            rowCount: Number(count.rows[0]?.n ?? 0),
            policy: table.policy as Record<string, unknown>,
          });
        }
        return { items };
      },
    );

    app.get(
      `${base}/tables/*`,
      {
        config: { access: access.workspace("table:read") },
        schema: {
          summary: "One table: its columns, including retired ones, and where it is stored",
          tags: ["data"],
          params: WildParams,
          response: {
            200: Type.Object({
              name: Type.String(),
              status: Type.String(),
              managedIn: Type.String(),
              policy: AnyObject,
              rowCount: Type.Integer(),
              stored: Type.Object(
                { schema: Type.String(), table: Type.String() },
                { description: "Where the rows are in Postgres." },
              ),
              columns: Type.Array(Column),
            }),
          },
        },
      },
      async ({ params }) => {
        const name = wildPath(params);
        const data = (await kernel.data.forTenant(params.t)).owner;
        const catalog = await loadCatalog(data, params.w);
        const table =
          catalog.find((candidate) => candidate.name === name && candidate.status === "active") ??
          catalog.find((candidate) => candidate.name === name);
        if (!table) return describeTable(data, params.w, name) as never;
        const resource = await db
          .selectFrom("resource")
          .select("ownership")
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "table")
          .where("path", "=", name)
          .executeTakeFirst();
        const schema = workspaceSchema(params.w);
        const count = await sql<{
          n: string;
        }>`select count(*) as n from ${sql.id(schema, table.physicalName)}`.execute(data);
        const held = new Map<string, number>();
        for (const column of table.columns.filter((candidate) => candidate.status === "retired")) {
          const kept = await sql<{
            n: string;
          }>`select count(${sql.ref(column.physicalName)}) as n from ${sql.id(schema, table.physicalName)}`.execute(
            data,
          );
          held.set(column.id, Number(kept.rows[0]?.n ?? 0));
        }
        return {
          name,
          status: table.status,
          managedIn: resource?.ownership ?? "code",
          policy: table.policy as Record<string, unknown>,
          rowCount: Number(count.rows[0]?.n ?? 0),
          stored: { schema, table: table.physicalName },
          columns: table.columns.map((column) => ({
            name: column.name,
            type: column.type,
            required: column.required,
            unique: column.unique,
            default: column.default ?? null,
            references: column.referenceTable,
            status: column.status,
            held: held.get(column.id) ?? null,
          })),
        };
      },
    );

    app.post(
      `${base}/table-purges`,
      {
        config: { access: access.workspace("table:write") },
        schema: {
          summary: "Drop retired data for good",
          description:
            "Drops one retired column, or a whole retired table when no column is named. This " +
            "is the only way data is ever destroyed, and it cannot be undone.",
          tags: ["data"],
          params: WorkspaceParams,
          body: Type.Object({
            table: Type.String({ pattern: PATH_PATTERN }),
            column: Type.Optional(Type.String()),
          }),
          response: { 200: Type.Object({ dropped: Type.String() }) },
        },
      },
      async ({ ctx, params, body }) =>
        ctx.mutate(async (trx, audit) => {
          const data = (await kernel.data.within(trx, params.t)).db;
          const result = await purgeRetired(data, params.w, body);
          await audit({
            action: "table.purged",
            targetType: "table",
            targetId: body.table,
            tenantId: params.t,
            workspaceId: params.w,
            details: { column: body.column ?? null, dropped: result.dropped },
          });
          return result;
        }),
    );

    // ----- Rows -----

    app.get(
      `${base}/rows/*`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Rows of a table",
          description:
            "The table's policy decides which rows the caller sees. Needs `data:read` at the workspace or at the table.",
          tags: ["data"],
          params: WildParams,
          querystring: RowsQuery,
          response: { 200: RowsPage },
        },
      },
      async ({ ctx, params, query }) => {
        const { target, scope } = await enter(ctx, params, wildPath(params), "read");
        const asked = parseRowsQuery(query);
        return toRowsPage(
          await withData(kernel, params.t, scope, (data) => findRows(data, target, asked)),
        );
      },
    );

    app.post(
      `${base}/rows/*`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Insert one row, or up to 1,000",
          description: 'Send a row, or `{ "rows": [...] }`. Either all are inserted or none.',
          tags: ["data"],
          params: WildParams,
          body: AnyObject,
          response: { 201: Type.Object({ items: Type.Array(AnyObject) }) },
        },
      },
      async ({ ctx, params, body }, reply) => {
        const { target, scope } = await enter(ctx, params, wildPath(params), "write");
        const rows =
          Array.isArray(body.rows) && Object.keys(body).length === 1
            ? (body.rows as unknown[])
            : [body];
        if (rows.length === 0 || rows.length > 1000)
          throw badRequest("Send between 1 and 1,000 rows.");
        const items = await withData(kernel, params.t, scope, (data) =>
          insertRows(data, target, rows, scope),
        );
        // Rows are business data, not configuration: they are not written to the audit log one by one.
        ctx.mutated = true;
        await announceRows(
          kernel,
          params.t,
          params.w,
          target.name,
          "inserted",
          items.map((item) => String(item.id)),
        );
        return reply.code(201).send({ items });
      },
    );

    const RowParams = Type.Object({
      t: Id,
      w: Id,
      id: Type.String({ maxLength: 200 }),
      "*": Type.String(),
    });

    app.get(
      `${base}/row/:id/*`,
      {
        config: { access: access.custom },
        schema: {
          summary: "One row",
          tags: ["data"],
          params: RowParams,
          response: { 200: AnyObject },
        },
      },
      async ({ ctx, params }) => {
        const { target, scope } = await enter(ctx, params, wildPath(params), "read");
        return withData(kernel, params.t, scope, (data) => getRow(data, target, params.id));
      },
    );

    app.patch(
      `${base}/row/:id/*`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Change some of a row's values",
          tags: ["data"],
          params: RowParams,
          body: AnyObject,
          response: { 200: AnyObject },
        },
      },
      async ({ ctx, params, body }) => {
        const { target, scope } = await enter(ctx, params, wildPath(params), "write");
        const row = await withData(kernel, params.t, scope, (data) =>
          updateRow(data, target, params.id, body),
        );
        ctx.mutated = true;
        await announceRows(kernel, params.t, params.w, target.name, "updated", [params.id]);
        return row;
      },
    );

    app.delete(
      `${base}/row/:id/*`,
      {
        config: { access: access.custom },
        schema: {
          summary: "Delete a row",
          tags: ["data"],
          params: RowParams,
          response: { 204: NoContent },
        },
      },
      async ({ ctx, params }, reply) => {
        const { target, scope } = await enter(ctx, params, wildPath(params), "write");
        await withData(kernel, params.t, scope, (data) => deleteRow(data, target, params.id));
        ctx.mutated = true;
        await announceRows(kernel, params.t, params.w, target.name, "deleted", [params.id]);
        return reply.code(204).send(null);
      },
    );
  };
}
