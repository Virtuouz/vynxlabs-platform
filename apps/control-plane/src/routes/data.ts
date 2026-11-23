import { Readable } from "node:stream";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { sql } from "@volvel/db";
import { displayGuess, PATH_PATTERN } from "@volvel/manifest";
import { Type } from "typebox";
import { loadCatalog, purgeRetired, workspaceSchema } from "../kernel/data/apply.js";
import { columnCounts, columnValues, refuseColumn } from "../kernel/data/column-values.js";
import { updateRowKeepingFiles } from "../kernel/data/files.js";
import {
  aggregateQueryFrom,
  aggregateRows,
  type DataScope,
  deleteRow,
  deleteRows,
  describeTable,
  findRows,
  getRow,
  groupValues,
  insertRows,
  type Row,
  scopeFor,
  withData,
} from "../kernel/data/rows.js";
import { badRequest, forbidden, forbiddenBecause } from "../kernel/errors.js";
import { publishPlatformEvent } from "../kernel/flows/events.js";
import { access, findWorkspace, guestLimit, type RequestContext } from "../kernel/http.js";
import type { Kernel } from "../kernel/kernel.js";
import { findAlias } from "../kernel/resolve.js";
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
  // A cursor is where the last page ended: after a row (`{"after": [...]}`), or, for a
  // table with no key or a sort by several columns, after a number of rows.
  const text =
    query.cursor === undefined ? "0" : Buffer.from(query.cursor, "base64url").toString("utf8");
  let offset = 0;
  let after: unknown[] | undefined;
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as { after?: unknown };
      if (!Array.isArray(parsed.after)) throw new Error();
      after = parsed.after;
    } catch {
      throw badRequest("The cursor is not valid.");
    }
  } else {
    offset = Number(text);
    if (!Number.isSafeInteger(offset) || offset < 0) throw badRequest("The cursor is not valid.");
  }
  return {
    ...(after ? { after } : {}),
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

/** How many rows one CSV export holds at most. */
export const CSV_CAP = 100_000;

/**
 * One value as a CSV cell: quoted when it holds a comma, a quote or a line
 * break. Text a spreadsheet would read as a formula starts with an apostrophe.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  // A list of an enum's values is written as the values, not as JSON.
  const list = Array.isArray(value) && value.every((one) => typeof one === "string");
  let text = list
    ? (value as string[]).join(";")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toRowsPage = (found: {
  items: Row[];
  nextOffset: number | null;
  nextAfter?: unknown[] | null;
}) => ({
  items: found.items,
  nextCursor: found.nextAfter
    ? Buffer.from(JSON.stringify({ after: found.nextAfter })).toString("base64url")
    : found.nextOffset === null
      ? null
      : Buffer.from(String(found.nextOffset)).toString("base64url"),
});

const Column = Type.Object({
  id: Type.String({ description: "Tells apart two retired columns that had one name." }),
  name: Type.String(),
  description: Type.Optional(
    Type.String({ description: "What the column holds, when its definition says." }),
  ),
  type: Type.String(),
  required: Type.Boolean(),
  unique: Type.Boolean(),
  default: Type.Unknown(),
  references: NullableString,
  onDelete: Type.Optional(
    Type.Union([NullableString], {
      description: "For a reference: restrict, set_null or cascade.",
    }),
  ),
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
  retiredValues: Type.Optional(
    Type.Array(Type.String(), {
      description: "Values it had and no longer offers. Rows may still hold them.",
    }),
  ),
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
  /** How many events led to this change: a script's run passes its own, so that a chain stops. */
  depth = 0,
) {
  // Only a change to a row that has an id is announced; anything else would store an event naming no row.
  if (!["inserted", "updated", "deleted"].includes(change)) return;
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0) continue;
    await publishPlatformEvent(kernel, {
      tenantId,
      workspaceId,
      name: "platform/row-changed",
      payload: { table, change, id },
      sourceId: id,
      depth,
    }).catch((error) =>
      kernel.log.error({ err: error }, "a platform event could not be published"),
    );
  }
}

/**
 * Announces what a script's row operation changed: only an insert, update or
 * delete is a change, and only a row with an id can be named.
 */
export async function announceScriptRows(
  kernel: Kernel,
  run: { tenant_id: string; workspace_id: string; trigger_detail: Record<string, unknown> },
  table: string,
  op: string,
  result: unknown,
  id: unknown,
) {
  const change = { insert: "inserted", update: "updated", delete: "deleted" }[op];
  if (!change) return;
  const ids =
    op === "insert" ? ((result as { id?: unknown }[] | null) ?? []).map((row) => row?.id) : [id];
  await announceRows(
    kernel,
    run.tenant_id,
    run.workspace_id,
    table,
    change,
    ids.filter((one): one is string => typeof one === "string" && one.length > 0),
    Number(run.trigger_detail.depth ?? 0),
  );
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
      const lookUp = (name: string) =>
        data
          .selectFrom("data_table")
          .select("resource_id")
          .where("workspace_id", "=", params.w)
          .where("tenant_id", "=", params.t)
          .where("name", "=", name)
          .where("status", "=", "active")
          .executeTakeFirst();
      let known = await lookUp(table);
      if (!known) {
        // A table asked for by a path it had before it was renamed still answers, and says so.
        const alias = await findAlias(kernel.db, params.w, table, ["table"]);
        const now = alias
          ? await kernel.db
              .selectFrom("resource")
              .select("path")
              .where("id", "=", alias.resource_id)
              .executeTakeFirst()
          : undefined;
        if (alias && now) {
          ctx.moved = {
            path: table,
            now: now.path,
            createdAt: alias.created_at,
            expiresAt: alias.expires_at,
          };
          table = now.path;
          known = await lookUp(table);
        }
      }
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
        if (!scope.all)
          throw forbiddenBecause("This needs the permission to read every row of this table.");
        const group =
          (await db
            .selectFrom("end_user_group")
            .select(["id", "key", "name"])
            .where("id", "=", asGroup)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst()) ??
          (await db
            .selectFrom("principal_group")
            .select(["id", "key", "name"])
            .where("id", "=", asGroup)
            .where("tenant_id", "=", tenantId)
            .executeTakeFirst());
        if (!group) throw badRequest("`asGroup` is not a group of this tenant.");
        return {
          principalId: "00000000-0000-0000-0000-000000000000",
          all: false,
          groups: groupValues([group]),
          attributes: {},
        } satisfies DataScope;
      }
      if (as === undefined) return scope;
      // Only someone who may see every row may look through another person's eyes.
      if (!scope.all)
        throw forbiddenBecause("This needs the permission to read every row of this table.");
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
                  id: Type.String({
                    description: "Tells apart two retired tables that had one name.",
                  }),
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
            id: table.id,
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
              id: Type.Optional(Type.String()),
              name: Type.String(),
              description: Type.Optional(
                Type.String({ description: "What the table is for, when its definition says." }),
              ),
              status: Type.String(),
              managedIn: Type.String(),
              policy: AnyObject,
              display: Type.Optional(
                Type.Union([NullableString], {
                  description: "The column that stands for a row where another table refers to it.",
                }),
              ),
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
          .select(["ownership", "body"])
          .where("workspace_id", "=", params.w)
          .where("kind", "=", "table")
          .where("path", "=", name)
          .executeTakeFirst();
        // What the table and its columns are for is in its definition, not in the catalog.
        const defined = (resource?.body ?? {}) as {
          description?: string;
          columns?: Record<string, { description?: string }>;
        };
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
          id: table.id,
          name,
          ...(defined.description ? { description: defined.description } : {}),
          status: table.status,
          managedIn: resource?.ownership ?? "code",
          policy: table.policy as Record<string, unknown>,
          display: table.display ?? null,
          rowCount: Number(count.rows[0]?.n ?? 0),
          stored: { schema, table: table.physicalName },
          columns: table.columns.map((column) => ({
            id: column.id,
            name: column.name,
            ...(defined.columns?.[column.name]?.description
              ? { description: defined.columns[column.name]?.description as string }
              : {}),
            type: column.type,
            required: column.required,
            unique: column.unique,
            default: column.default ?? null,
            references: column.referenceTable,
            ...(column.referenceTable ? { onDelete: column.onDelete ?? "restrict" } : {}),
            ...(column.options?.values
              ? { values: column.options.values, retiredValues: column.options.retired ?? [] }
              : {}),
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
            columnId: Type.Optional(
              Type.String({ description: "Which retired column, when two had the name." }),
            ),
            tableId: Type.Optional(
              Type.String({ description: "Which retired table, when two had the name." }),
            ),
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
            expand: Type.Optional(
              Type.String({
                maxLength: 300,
                description:
                  "Reference columns, separated by commas, at most five. For each, `expanded` " +
                  "gives what stands for every row pointed to: the value of the target table's " +
                  "`display` column (else its `name`, `title` or first text column), by the row's ID. A row the caller may not read is left out.",
              }),
            ),
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
          response: {
            200: Type.Object({
              ...RowsPage.properties,
              expanded: Type.Optional(
                Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown()), {
                  description:
                    "By reference column, then by the ID pointed to: what stands for that row.",
                }),
              ),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        const entered = await enter(ctx, params, wildPath(params), "read");
        const scope = await seenAs(params.t, entered.scope, query.as, query.asGroup);
        const asked = parseRowsQuery(query);
        const page = toRowsPage(
          await withData(kernel, params.t, scope, (data) => findRows(data, entered.target, asked)),
        );
        const wanted = (query.expand ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);
        if (wanted.length === 0) return page;
        if (wanted.length > 5) throw badRequest("At most five columns can be expanded.");
        const expanded: Record<string, Record<string, unknown>> = {};
        for (const name of wanted) {
          const column = entered.target.columns.find((one) => one.name === name);
          if (!column?.references) {
            throw badRequest(`"${name}" is not a reference column of ${entered.target.name}.`);
          }
          expanded[name] = {};
          const ids = [
            ...new Set(page.items.map((row) => row[name]).filter((id) => typeof id === "string")),
          ];
          if (ids.length === 0) continue;
          // What stands for a row is read as the caller reads that table: with their
          // permission there, and through its own row policy.
          let pointed: Awaited<ReturnType<typeof enter>>;
          try {
            pointed = await enter(ctx, params, column.references, "read");
          } catch {
            continue;
          }
          // What the table says stands for a row, else the one rule the console's pickers use.
          const named = pointed.target.display;
          const display =
            named && pointed.target.columns.some((one) => one.name === named)
              ? named
              : displayGuess(pointed.target.columns);
          if (!display) continue;
          const found = await withData(kernel, params.t, pointed.scope, (data) =>
            findRows(data, pointed.target, {
              filter: { column: "id", op: "in", value: ids },
              limit: 1000,
            }),
          );
          for (const row of found.items) {
            (expanded[name] as Record<string, unknown>)[String(row.id)] = row[display] ?? null;
          }
        }
        return { ...page, expanded };
      },
    );

    app.get(
      `${base}/column-values`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "The values a column holds, with how many rows have each",
          description:
            "For an editor that offers a choice of a column's values. Read as the caller reads the " +
            "table (needs `data:read` there; its row policy applies, so two people may be given " +
            "different counts). At most 50 values, the most common first; an enum column lists all " +
            "its values, in its own order, the ones no row has too. `distinct` counts the different " +
            "values up to 1000, and `more` says there are more. At most 50,000 rows are looked at, " +
            "and `sampled` says the table had more. A json, files or list-of-choices column is refused.",
          tags: ["data"],
          params: WorkspaceParams,
          querystring: Type.Object({
            table: Type.String({ minLength: 1, maxLength: 255 }),
            column: Type.String({ minLength: 1, maxLength: 100 }),
          }),
          response: {
            200: Type.Object({
              values: Type.Array(Type.Object({ value: Type.String(), count: Type.Integer() })),
              distinct: Type.Integer(),
              more: Type.Optional(Type.Literal(true)),
              rows: Type.Integer(),
              empty: Type.Integer(),
              sampled: Type.Optional(Type.Literal(true)),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        const entered = await enter(ctx, params, wildPath({ "*": query.table }), "read");
        const column = refuseColumn(entered.target, query.column);
        return columnValues(kernel, params.t, entered.scope, entered.target, column);
      },
    );

    app.get(
      `${base}/column-counts`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "How many different values each column of a table has",
          description:
            'For the chart\'s "For each" hints: in one statement, the number of different values of ' +
            "every column, up to 1000 (`more` names the columns with more), `null` for a json, " +
            "files or list-of-choices column. Read as the caller reads the table, over at most " +
            "50,000 rows (`sampled` says the table had more).",
          tags: ["data"],
          params: WorkspaceParams,
          querystring: Type.Object({ table: Type.String({ minLength: 1, maxLength: 255 }) }),
          response: {
            200: Type.Object({
              rows: Type.Integer(),
              columns: Type.Record(Type.String(), Type.Union([Type.Integer(), Type.Null()])),
              more: Type.Optional(Type.Array(Type.String())),
              sampled: Type.Optional(Type.Literal(true)),
            }),
          },
        },
      },
      async ({ ctx, params, query }) => {
        const entered = await enter(ctx, params, wildPath({ "*": query.table }), "read");
        return columnCounts(kernel, params.t, entered.scope, entered.target);
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
          updateRowKeepingFiles(
            kernel,
            data,
            { tenantId: params.t, id: params.w },
            ctx.principal,
            target,
            params.id,
            body,
          ),
        );
        ctx.mutated = true;
        await announceRows(kernel, params.t, params.w, target.name, "updated", [params.id]);
        return row;
      },
    );

    app.get(
      `${base}/rows-export/*`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "Rows of a table, as CSV",
          description:
            "The rows the caller may read, with the same `filter` and `sort` as the rows route, as " +
            `a CSV file. At most ${CSV_CAP.toLocaleString("en-US")} rows; a last line says when there were more. ` +
            "A value that a spreadsheet would run as a formula starts with an apostrophe.",
          tags: ["data"],
          params: WildParams,
          querystring: Type.Object({
            filter: RowsQuery.properties.filter,
            sort: RowsQuery.properties.sort,
          }),
          produces: ["text/csv"],
          response: { 200: Type.Unknown({ description: "The rows, as CSV." }) },
        },
      },
      async ({ ctx, params, query }, reply) => {
        const { target, scope } = await enter(ctx, params, wildPath(params), "read");
        const asked = parseRowsQuery(query);
        const names = target.columns.map((column) => column.name);
        async function* lines() {
          yield `${names.map(csvCell).join(",")}\r\n`;
          let after: unknown[] | undefined;
          let offset = 0;
          let sent = 0;
          while (sent < CSV_CAP) {
            const page = await withData(kernel, params.t, scope, (data) =>
              findRows(data, target, {
                ...asked,
                limit: Math.min(1000, CSV_CAP - sent),
                ...(after ? { after } : { offset }),
              }),
            );
            for (const row of page.items)
              yield `${names.map((name) => csvCell(row[name])).join(",")}\r\n`;
            sent += page.items.length;
            if (page.nextAfter) after = page.nextAfter;
            else if (page.nextOffset !== null) offset = page.nextOffset;
            else return;
          }
          yield `"There were more than ${CSV_CAP} rows. Narrow the filter to export the rest."\r\n`;
        }
        const file = `${target.name.replace(/[^A-Za-z0-9_-]+/g, "-")}.csv`;
        reply
          .header("content-type", "text/csv; charset=utf-8")
          .header("content-disposition", `attachment; filename="${file}"`);
        return reply.send(Readable.from(lines()));
      },
    );

    app.post(
      `${base}/row-deletions/*`,
      {
        config: { access: access.custom, rateLimit: guestLimit },
        schema: {
          summary: "Delete several rows",
          description:
            "Deletes the rows with these keys that the table's policy lets the caller delete, in " +
            "one statement. Keys that name no such row come back in `missing`.",
          tags: ["data"],
          params: WildParams,
          body: Type.Object({
            ids: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
              minItems: 1,
              maxItems: 1000,
              uniqueItems: true,
            }),
          }),
          response: {
            200: Type.Object({
              deleted: Type.Array(Type.String()),
              missing: Type.Array(Type.String()),
            }),
          },
        },
      },
      async ({ ctx, params, body }) => {
        const { target, scope } = await enter(ctx, params, wildPath(params), "write");
        const done = await withData(kernel, params.t, scope, (data) =>
          deleteRows(data, target, body.ids),
        );
        ctx.mutated = true;
        if (done.deleted.length > 0) {
          await announceRows(kernel, params.t, params.w, target.name, "deleted", done.deleted);
        }
        return done;
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
