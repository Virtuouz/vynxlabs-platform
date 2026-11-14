import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@vynxlabs/db";
import { PATH_PATTERN } from "@vynxlabs/manifest";
import { Type } from "typebox";
import { loadCatalog, purgeRetired, workspaceSchema } from "../kernel/data/apply.js";
import {
  aggregateQueryFrom,
  aggregateRows,
  type DataScope,
  deleteRow,
  describeTable,
  findRows,
  getRow,
  insertRows,
  type Row,
  scopeFor,
  updateRow,
  withData,
} from "../kernel/data/rows.js";
import { badRequest, forbidden } from "../kernel/errors.js";
import { publishPlatformEvent } from "../kernel/flows/events.js";
import { access, findWorkspace, guestLimit, type RequestContext } from "../kernel/http.js";
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
const list = (text: string | undefined) =>
  (text ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/** Reads `group=status,created_at:month` and `measure=count,sum:total` into a request for totals. */
export function parseAggregateQuery(query: {
  group?: string;
  measure?: string;
  filter?: string;
  sort?: string;
  limit?: number;
}) {
  let filter: unknown;
  if (query.filter !== undefined) {
    try {
      filter = JSON.parse(query.filter);
    } catch {
      throw badRequest("The filter must be JSON.");
    }
  }
  return aggregateQueryFrom({
    group: list(query.group),
    measure: list(query.measure),
    filter,
    sort: list(query.sort),
    limit: query.limit,
  });
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
      const scope: DataScope = await scopeFor(
        kernel,
        params.t,
        ctx.principal,
        await ctx.allowed(`data_all:${verb}`, at),
      );
      return { target, scope };
    }

    /**
     * The scope to read with when the caller asks to look through an end user's
     * eyes, or through a group's: someone in that group and nothing else, who owns
     * no row, the way the builder previews an app for an audience.
     */
    async function seenAs(
      tenantId: string,
      scope: DataScope,
      as: string | undefined,
      asGroup?: string | undefined,
    ) {
      if (asGroup !== undefined) {
        if (!scope.all) throw forbidden("the permission to read every row of this table");
        const group =
          (await db
            .selectFrom("end_user_group")
            .select(["id", "name"])
            .where("id", "=", asGroup)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst()) ??
          (await db
            .selectFrom("principal_group")
            .select(["id", "name"])
            .where("id", "=", asGroup)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst());
        if (!group) throw badRequest("`asGroup` is not a group of this tenant.");
        return {
          principalId: "00000000-0000-0000-0000-000000000000",
          all: false,
          groups: [group.id, group.name],
          attributes: {},
        } satisfies DataScope;
      }
      if (as === undefined) return scope;
      // Only someone who may see every row may look through another person's eyes.
      if (!scope.all) throw forbidden("the permission to read every row of this table");
      const person = await db
        .selectFrom("end_user")
        .select("id")
        .where("id", "=", as)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();
      if (!person) throw badRequest("`as` is not an end user of this tenant.");
      return scopeFor(kernel, tenantId, { type: "end_user", id: person.id }, false);
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
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "Rows of a table",
          description:
            "The table's policy decides which rows the caller sees. Needs `data:read` at the workspace or at the table.",
          tags: ["data"],
          params: WildParams,
          querystring: Type.Object({
            ...RowsQuery.properties,
            as: Type.Optional(
              Type.String({
                format: "uuid",
                description:
                  "Read as this end user would: the rows the table's policy gives them. For checking a policy. Needs `data_all:read`.",
              }),
            ),
            asGroup: Type.Optional(
              Type.String({
                format: "uuid",
                description:
                  "Read as someone in this group, of members or of end users, who owns no row would. Needs `data_all:read`.",
              }),
            ),
          }),
          response: { 200: RowsPage },
        },
      },
      async ({ ctx, params, query }) => {
        const entered = await enter(ctx, params, wildPath(params), "read");
        const scope = await seenAs(params.t, entered.scope, query.as, query.asGroup);
        const asked = parseRowsQuery(query);
        return toRowsPage(
          await withData(kernel, params.t, scope, (data) => findRows(data, entered.target, asked)),
        );
      },
    );

    app.get(
      `${base}/aggregate/*`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "Totals over a table's rows",
          description:
            "Counts, sums, averages, the least and the most, over the rows the caller may see: " +
            "the table's policy applies as it does to rows, so two people get the totals of " +
            "their own rows. `group` is up to three columns separated by commas; a date or a " +
            "time can be gathered as `created_at:month` (day, week, month or year, beginning " +
            "at midnight UTC). `measure` is up to five of `count`, `count:column`, " +
            "`sum:column`, `avg:column`, `min:column` and `max:column`; left out, rows are " +
            "counted. `sort` takes the same names, with a leading minus to sort downwards. " +
            "With no `group` the answer is one item. Needs `data:read` at the workspace or at " +
            "the table. A request that runs longer than five seconds is refused.",
          tags: ["data"],
          params: WildParams,
          querystring: Type.Object({
            group: Type.Optional(Type.String({ maxLength: 500 })),
            measure: Type.Optional(Type.String({ maxLength: 500 })),
            filter: RowsQuery.properties.filter,
            sort: Type.Optional(Type.String({ maxLength: 500 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, default: 200 })),
            as: Type.Optional(
              Type.String({
                format: "uuid",
                description:
                  "Work the totals out as this end user would see them. Needs `data_all:read`.",
              }),
            ),
            asGroup: Type.Optional(
              Type.String({
                format: "uuid",
                description:
                  "Work the totals out as someone in this group who owns no row would. Needs `data_all:read`.",
              }),
            ),
          }),
          response: {
            200: Type.Object({
              items: Type.Array(Type.Object({ by: AnyObject, values: AnyObject })),
              truncated: Type.Boolean({
                description: "True when there were more groups than `limit`.",
              }),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        const entered = await enter(ctx, params, wildPath(params), "read");
        const scope = await seenAs(params.t, entered.scope, query.as, query.asGroup);
        const asked = parseAggregateQuery(query);
        return withData(kernel, params.t, scope, (data) =>
          aggregateRows(data, entered.target, asked),
        );
      },
    );

    app.post(
      `${base}/rows/*`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
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
        config: { access: access.custom, rateLimit: guestLimit },
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
        config: { access: access.custom, rateLimit: guestLimit },
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
        config: { access: access.custom, rateLimit: guestLimit },
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
