import { type Kysely, newId, sql } from "@vynxlabs/db";
import type { TablePolicy } from "@vynxlabs/manifest";
import type { Db, Trx } from "../audit.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { constraintName, workspaceSchema } from "./apply.js";

// biome-ignore lint/suspicious/noExplicitAny: rows of a custom table have no fixed shape
type AnyDb = Kysely<any>;
export type Row = Record<string, unknown>;

export interface ColumnMeta {
  name: string;
  physicalName: string;
  type: string;
  required: boolean;
  hasDefault: boolean;
  /** False for a column of an external table whose type the platform only reads. */
  writable: boolean;
}

/** A table that rows can be read from and written to: a workspace's own, or one in an external source. */
export interface RowTarget {
  name: string;
  schema: string;
  table: string;
  /** The column that identifies a row. Null for an external table with no single-column key. */
  key: string | null;
  columns: ColumnMeta[];
  /** Workspace tables get their ID and timestamps from the platform. */
  managed: boolean;
  policy: TablePolicy;
  resourceId: string | null;
}

const SYSTEM: ColumnMeta[] = [
  {
    name: "id",
    physicalName: "id",
    type: "uuid",
    required: true,
    hasDefault: true,
    writable: false,
  },
  {
    name: "created_at",
    physicalName: "created_at",
    type: "timestamp",
    required: true,
    hasDefault: true,
    writable: false,
  },
  {
    name: "updated_at",
    physicalName: "updated_at",
    type: "timestamp",
    required: true,
    hasDefault: true,
    writable: false,
  },
];

/** A workspace's active table, as rows are read from and written to it. */
export async function describeTable(
  db: Db | Trx,
  workspaceId: string,
  name: string,
): Promise<RowTarget> {
  const table = await db
    .selectFrom("data_table")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .where("name", "=", name)
    .where("status", "=", "active")
    .executeTakeFirst();
  if (!table) throw notFound(`The table ${name}`);
  const columns = await db
    .selectFrom("data_column")
    .selectAll()
    .where("table_id", "=", table.id)
    .where("status", "=", "active")
    .orderBy("created_at")
    .orderBy("name")
    .execute();
  return {
    name,
    schema: workspaceSchema(workspaceId),
    table: table.physical_name,
    key: "id",
    managed: true,
    policy: table.policy,
    resourceId: table.resource_id,
    columns: [
      ...SYSTEM,
      ...columns.map((column) => ({
        name: column.name,
        physicalName: column.physical_name,
        type: column.type,
        required: column.required,
        hasDefault: column.default_value !== null && column.default_value !== undefined,
        writable: true,
      })),
    ],
  };
}

export interface DataScope {
  /** Who is asking. Null for a script acting as the workspace. */
  principalId: string | null;
  /** Whether the caller may see and change every row, whatever the table's policy. */
  all: boolean;
  /** The IDs and the names of the groups the person is in, for rules that match a row to a group. */
  groups?: string[];
  /** The person's attributes, for rules that match a row to one of them. */
  attributes?: Record<string, string>;
}

/**
 * Who a person is to a table's rules: their ID, the groups they are in, and
 * their attributes. A member's groups are groups of members and an end user's
 * are groups of end users. Read on each request, so that being put in a group
 * or taken out takes effect at once.
 */
export async function scopeFor(
  kernel: Kernel,
  tenantId: string,
  principal: { type: string; id: string | null },
  all: boolean,
): Promise<DataScope> {
  if (principal.id === null) return { principalId: null, all };
  const id = principal.id;
  if (principal.type === "end_user") {
    const [groups, user] = await Promise.all([
      kernel.db
        .selectFrom("end_user_group_member")
        .innerJoin("end_user_group", "end_user_group.id", "end_user_group_member.group_id")
        .select(["end_user_group.id", "end_user_group.name"])
        .where("end_user_group_member.end_user_id", "=", id)
        .where("end_user_group.tenant_id", "=", tenantId)
        .execute(),
      kernel.db
        .selectFrom("end_user")
        .select("attributes")
        .where("id", "=", id)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst(),
    ]);
    return {
      principalId: id,
      all,
      groups: groups.flatMap((group) => [group.id, group.name]),
      attributes: user?.attributes ?? {},
    };
  }
  if (principal.type === "member") {
    const groups = await kernel.db
      .selectFrom("group_member")
      .innerJoin("principal_group", "principal_group.id", "group_member.group_id")
      .select(["principal_group.id", "principal_group.name"])
      .where("group_member.member_id", "=", id)
      .where("principal_group.tenant_id", "=", tenantId)
      .execute();
    return { principalId: id, all, groups: groups.flatMap((group) => [group.id, group.name]) };
  }
  return { principalId: id, all };
}

/**
 * Runs a request for a tenant's rows. It runs on a connection signed in as a
 * role that owns nothing, so every table's row policy applies, and the policy
 * is told who is asking for as long as the transaction lasts. Nothing run on
 * that connection can become the role that owns the tables.
 *
 * Nothing in here may run SQL that a caller wrote: whoever can run SQL can
 * also say they are someone else.
 */
export async function withData<T>(
  kernel: Kernel,
  tenantId: string,
  scope: DataScope,
  run: (trx: AnyDb) => Promise<T>,
): Promise<T> {
  const store = await kernel.data.forTenant(tenantId);
  return store.rows.transaction().execute(async (trx) => {
    await sql`select
      set_config('app.principal', ${scope.principalId ?? ""}, true),
      set_config('app.data_all', ${scope.all ? "on" : "off"}, true),
      set_config('app.groups', ${JSON.stringify(scope.groups ?? [])}, true),
      set_config('app.attrs', ${JSON.stringify(scope.attributes ?? {})}, true)`.execute(trx);
    try {
      return await run(trx as unknown as AnyDb);
    } catch (error) {
      throw translate(error);
    }
  });
}

/** Database refusals that are the caller's doing, in words they can act on. */
export function translate(error: unknown): unknown {
  const code = (error as { code?: string }).code;
  const detail = (error as { detail?: string }).detail ?? "";
  const message = (error as { message?: string }).message ?? "";
  if (code === "42501" && message.includes("row-level security")) {
    return new HttpError(
      403,
      "forbidden",
      "This table's policy only lets you write rows you own, or rows its rules give you.",
    );
  }
  if (code === "23505") {
    const column = /\(([^)]+)\)=/.exec(detail)?.[1];
    return new HttpError(
      409,
      "conflict",
      column
        ? `Another row already has that value for "${column}".`
        : "Another row already has that value.",
    );
  }
  if (code === "23503") {
    return new HttpError(
      409,
      "conflict",
      detail.includes("is still referenced")
        ? "Another row still refers to this one."
        : "A reference points to a row that does not exist.",
    );
  }
  if (code === "23502") {
    return badRequest(
      `A value is required for "${(error as { column?: string }).column ?? "a column"}".`,
    );
  }
  if (code === "22P02" || code === "22007" || code === "22008" || code === "22003") {
    return badRequest("A value does not fit its column.");
  }
  return error;
}

/**
 * Names the column behind a unique violation. Postgres leaves the detail out
 * of the error when the caller may not see the whole table, so the column is
 * found from the constraint's name.
 */
async function naming<T>(target: RowTarget, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const failure = error as { code?: string; constraint?: string };
    // A column that came back from retirement is required of every row written from then on.
    const gap =
      failure.code === "23514"
        ? target.columns.find(
            (candidate) =>
              constraintName("nn", target.table, candidate.physicalName) === failure.constraint,
          )
        : undefined;
    if (gap) throw badRequest(`A value is required for "${gap.name}".`);
    const violated = failure.code === "23505" ? failure.constraint : undefined;
    const column = target.columns.find(
      (candidate) => constraintName("uq", target.table, candidate.physicalName) === violated,
    );
    if (column)
      throw new HttpError(
        409,
        "conflict",
        `Another row already has that value for "${column.name}".`,
      );
    throw error;
  }
}

// ----- Values -----

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class Invalid extends Error {}

/** Checks a value against its column's type and gives what to send to the database. */
function toDatabase(column: ColumnMeta, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const fail = (expected: string) => new Invalid(`must be ${expected}`);
  switch (column.type) {
    case "text":
      if (typeof value !== "string") throw fail("text");
      return value;
    case "integer":
      if (!Number.isSafeInteger(value)) throw fail("a whole number");
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) throw fail("a number");
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw fail("true or false");
      return value;
    case "timestamp":
      if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
        throw fail("a date and time, such as 2026-01-31T09:30:00Z");
      return new Date(value).toISOString();
    case "date":
      if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(value)))
        throw fail("a date, such as 2026-01-31");
      return value;
    case "json":
      return JSON.stringify(value);
    case "uuid":
    case "reference":
    case "file":
      if (typeof value !== "string" || !UUID.test(value)) throw fail("an ID");
      return value;
    default:
      throw fail("something this column can hold");
  }
}

function fromDatabase(column: ColumnMeta, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (column.type === "integer" || column.type === "number") return Number(value);
  if (column.type === "timestamp")
    return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
  return value;
}

/** A column in a select list, under its logical name. Dates are read as text so no time zone touches them. */
function selected(column: ColumnMeta) {
  const physical = sql.ref(column.physicalName);
  if (column.type === "date" || !KNOWN.has(column.type))
    return sql`${physical}::text as ${sql.id(column.name)}`;
  return sql`${physical} as ${sql.id(column.name)}`;
}
const KNOWN = new Set([
  "text",
  "integer",
  "number",
  "boolean",
  "timestamp",
  "date",
  "json",
  "uuid",
  "reference",
  "file",
]);

const selectList = (target: RowTarget) => sql.join(target.columns.map(selected));
const shape = (target: RowTarget, row: Row): Row =>
  Object.fromEntries(
    target.columns.map((column) => [column.name, fromDatabase(column, row[column.name])]),
  );

function column(target: RowTarget, name: unknown, path: string): ColumnMeta {
  const found =
    typeof name === "string"
      ? target.columns.find((candidate) => candidate.name === name)
      : undefined;
  if (!found)
    throw badRequest("The request names a column the table does not have.", [
      { path, message: `there is no column "${String(name)}" in ${target.name}` },
    ]);
  return found;
}

// ----- Filters -----

export type Filter =
  | { and: Filter[] }
  | { or: Filter[] }
  | { column: string; op: string; value?: unknown };

const COMPARE: Record<string, string> = {
  eq: "=",
  ne: "<>",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};
const MAX_CONDITIONS = 50;

function compileFilter(
  target: RowTarget,
  filter: unknown,
  path = "/filter",
  count = { n: 0 },
): ReturnType<typeof sql> {
  const invalid = (message: string) => badRequest("The filter is not valid.", [{ path, message }]);
  if (typeof filter !== "object" || filter === null || Array.isArray(filter))
    throw invalid("must be an object");
  const node = filter as Record<string, unknown>;
  for (const joiner of ["and", "or"] as const) {
    if (joiner in node) {
      const parts = node[joiner];
      if (!Array.isArray(parts) || parts.length === 0)
        throw invalid(`"${joiner}" needs a list of conditions`);
      const compiled = parts.map((part, index) =>
        compileFilter(target, part, `${path}/${joiner}/${index}`, count),
      );
      return sql`(${sql.join(compiled, joiner === "and" ? sql` and ` : sql` or `)})`;
    }
  }
  if (++count.n > MAX_CONDITIONS)
    throw invalid(`a filter can have at most ${MAX_CONDITIONS} conditions`);
  const meta = column(target, node.column, `${path}/column`);
  const reference = sql.ref(meta.physicalName);
  const op = String(node.op ?? "eq");
  const value = (raw: unknown) => {
    try {
      return toDatabase(meta, raw);
    } catch (error) {
      if (error instanceof Invalid)
        throw badRequest("The filter is not valid.", [
          { path: `${path}/value`, message: `the value for "${meta.name}" ${error.message}` },
        ]);
      throw error;
    }
  };
  if (op === "is_null")
    return node.value === false ? sql`${reference} is not null` : sql`${reference} is null`;
  if (op === "contains") {
    if (meta.type !== "text" || typeof node.value !== "string")
      throw invalid(`"contains" works on text columns, with text to look for`);
    const pattern = `%${node.value.replace(/[\\%_]/g, "\\$&")}%`;
    return sql`${reference} ilike ${pattern}`;
  }
  if (op === "in") {
    if (!Array.isArray(node.value) || node.value.length === 0 || node.value.length > 200)
      throw invalid(`"in" needs a list of 1 to 200 values`);
    return sql`${reference} in (${sql.join(node.value.map((item) => sql`${value(item)}`))})`;
  }
  const operator = COMPARE[op];
  if (!operator)
    throw invalid(
      `there is no operator "${op}". Use eq, ne, gt, gte, lt, lte, in, contains or is_null`,
    );
  if (node.value === null || node.value === undefined) {
    if (op === "eq") return sql`${reference} is null`;
    if (op === "ne") return sql`${reference} is not null`;
    throw invalid(`"${op}" needs a value`);
  }
  if (meta.type === "json") throw invalid("a json column can only be tested with is_null");
  return sql`${reference} ${sql.raw(operator)} ${value(node.value)}`;
}

// ----- Operations -----

export interface FindQuery {
  filter?: unknown;
  /** Column names. A leading minus sorts that column downwards. */
  sort?: string[];
  limit?: number;
  offset?: number;
}

export async function findRows(db: AnyDb, target: RowTarget, query: FindQuery = {}) {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 1000);
  const offset = Math.max(query.offset ?? 0, 0);
  const where = query.filter === undefined ? sql`true` : compileFilter(target, query.filter);
  const order = (query.sort ?? []).map((entry, index) => {
    const descending = entry.startsWith("-");
    const meta = column(target, descending ? entry.slice(1) : entry, `/sort/${index}`);
    return sql`${sql.ref(meta.physicalName)} ${sql.raw(descending ? "desc" : "asc")} nulls last`;
  });
  // The key breaks ties, so paging never repeats or skips a row.
  if (target.key) order.push(sql`${sql.ref(target.key)} asc`);
  const result = await sql<Row>`
    select ${selectList(target)} from ${sql.id(target.schema, target.table)}
    where ${where}
    ${order.length > 0 ? sql`order by ${sql.join(order)}` : sql``}
    limit ${limit + 1} offset ${offset}
  `.execute(db);
  const rows = result.rows.slice(0, limit).map((row) => shape(target, row));
  return { items: rows, nextOffset: result.rows.length > limit ? offset + limit : null };
}

// ----- Totals -----

export const AGGREGATE_FUNCTIONS = ["count", "sum", "avg", "min", "max"] as const;
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];
export const BUCKETS = ["day", "week", "month", "year"] as const;
export type Bucket = (typeof BUCKETS)[number];

export interface AggregateQuery {
  /** What to group by. A date or a time can be gathered into days, weeks, months or years. */
  group?: { column: string; bucket?: Bucket }[];
  /** What to work out for each group. With none, the rows are counted. */
  measures?: { fn: AggregateFunction; column?: string }[];
  filter?: unknown;
  /** Names as they come back: a group's or a measure's. A leading minus sorts downwards. */
  sort?: string[];
  limit?: number;
}

export const MAX_GROUPS = 3;
export const MAX_MEASURES = 5;
/** How long totals over a table may take. A table too big for that needs an index or a narrower filter. */
const AGGREGATE_TIMEOUT_MS = 5000;

/** The name a group comes back under: its column, and its bucket when it has one. */
export const groupName = (group: { column: string; bucket?: string | undefined }) =>
  group.bucket ? `${group.column}:${group.bucket}` : group.column;
/** The name a measure comes back under: `count`, or the function and its column. */
export const measureName = (measure: { fn: string; column?: string | undefined }) =>
  measure.column ? `${measure.fn}:${measure.column}` : measure.fn;

/** Reads groups written as `status` or `created_at:month`, and totals written as `count` or `sum:total`. */
export function aggregateQueryFrom(asked: {
  group?: string[] | undefined;
  measure?: string[] | undefined;
  filter?: unknown;
  sort?: string[] | undefined;
  limit?: number | undefined;
}): AggregateQuery {
  return {
    group: (asked.group ?? []).map((part) => {
      const [name = "", bucket] = String(part).split(":");
      return { column: name, ...(bucket !== undefined ? { bucket: bucket as Bucket } : {}) };
    }),
    measures: (asked.measure ?? []).map((part) => {
      const [fn = "", name] = String(part).split(":");
      return { fn: fn as AggregateFunction, ...(name !== undefined ? { column: name } : {}) };
    }),
    ...(asked.filter !== undefined ? { filter: asked.filter } : {}),
    sort: (asked.sort ?? []).map(String),
    ...(asked.limit !== undefined ? { limit: asked.limit } : {}),
  };
}

const NUMERIC = new Set(["integer", "number"]);
const ORDERED = new Set(["integer", "number", "timestamp", "date", "text"]);

/**
 * Totals over the rows a person may see: counts, sums, averages, the least and
 * the most, for the whole table or for each group of rows.
 *
 * It runs where rows are read, so a table's policy applies to it: two people
 * asking for the same total get the total of their own rows. Every name that
 * reaches the statement is a column of the table or comes from a fixed list.
 * What the caller called things never does: results come back by position.
 */
export async function aggregateRows(db: AnyDb, target: RowTarget, query: AggregateQuery = {}) {
  const groups = query.group ?? [];
  const measures = query.measures?.length ? query.measures : [{ fn: "count" as const }];
  const invalid = (path: string, message: string) =>
    badRequest("The request for totals is not valid.", [{ path, message }]);
  if (groups.length > MAX_GROUPS) {
    throw invalid("/group", `rows can be grouped by at most ${MAX_GROUPS} columns`);
  }
  if (measures.length > MAX_MEASURES) {
    throw invalid("/measure", `at most ${MAX_MEASURES} totals can be asked for at once`);
  }

  const names = new Map<string, ReturnType<typeof sql>>();
  const grouped = groups.map((group, index) => {
    const path = `/group/${index}`;
    const meta = column(target, group.column, path);
    if (meta.type === "json" || meta.type === "file" || !KNOWN.has(meta.type)) {
      throw invalid(path, `rows cannot be grouped by "${meta.name}", which holds ${meta.type}`);
    }
    const reference = sql.ref(meta.physicalName);
    let expression = reference;
    if (group.bucket !== undefined) {
      // Checked against the list before it is written into the statement as a word.
      if (!BUCKETS.includes(group.bucket)) {
        throw invalid(
          path,
          `there is no bucket "${String(group.bucket)}". Use ${BUCKETS.join(", ")}`,
        );
      }
      if (meta.type === "timestamp") {
        // Buckets begin at midnight UTC, so the answer does not depend on who is asking.
        expression = sql`date_trunc(${sql.lit(group.bucket)}, ${reference}, 'UTC')`;
      } else if (meta.type === "date") {
        expression = sql`date_trunc(${sql.lit(group.bucket)}, ${reference}::timestamp)::date`;
      } else {
        throw invalid(
          path,
          `"${meta.name}" is not a date or a time, so it has no ${group.bucket}s`,
        );
      }
    }
    const alias = `g${index}`;
    names.set(groupName(group), sql.ref(alias));
    return { name: groupName(group), meta, alias, expression, isDate: meta.type === "date" };
  });
  if (new Set(grouped.map((group) => group.name)).size !== grouped.length) {
    throw invalid("/group", "a column is grouped by twice");
  }

  const measured = measures.map((measure, index) => {
    const path = `/measure/${index}`;
    if (!AGGREGATE_FUNCTIONS.includes(measure.fn)) {
      throw invalid(
        path,
        `there is no total "${String(measure.fn)}". Use ${AGGREGATE_FUNCTIONS.join(", ")}`,
      );
    }
    const alias = `a${index}`;
    const name = measureName(measure);
    names.set(name, sql.ref(alias));
    if (measure.column === undefined) {
      if (measure.fn !== "count") throw invalid(path, `"${measure.fn}" needs a column`);
      return { name, alias, expression: sql`count(*)`, meta: undefined, fn: measure.fn };
    }
    const meta = column(target, measure.column, path);
    const reference = sql.ref(meta.physicalName);
    if (measure.fn === "count") {
      // Counting a column counts the rows that have a value in it.
      return { name, alias, expression: sql`count(${reference})`, meta, fn: measure.fn };
    }
    const allowed = measure.fn === "sum" || measure.fn === "avg" ? NUMERIC : ORDERED;
    if (!allowed.has(meta.type)) {
      throw invalid(
        path,
        `"${measure.fn}" does not work on "${meta.name}", which holds ${meta.type}`,
      );
    }
    // The function's name is one of five written here, never the caller's text.
    const call = { sum: sql`sum`, avg: sql`avg`, min: sql`min`, max: sql`max` }[measure.fn];
    const cast = meta.type === "date" ? sql`::text` : sql``;
    return { name, alias, expression: sql`${call}(${reference})${cast}`, meta, fn: measure.fn };
  });
  if (new Set(measured.map((measure) => measure.name)).size !== measured.length) {
    throw invalid("/measure", "a total is asked for twice");
  }

  const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000);
  const where = query.filter === undefined ? sql`true` : compileFilter(target, query.filter);
  const order = (query.sort ?? []).map((entry, index) => {
    const descending = entry.startsWith("-");
    const by = names.get(descending ? entry.slice(1) : entry);
    if (!by) {
      throw invalid(
        `/sort/${index}`,
        `totals can be sorted by ${[...names.keys()].join(", ")}, not "${entry}"`,
      );
    }
    return sql`${by} ${sql.raw(descending ? "desc" : "asc")} nulls last`;
  });
  // Groups in their own order after whatever was asked for, so the answer is the same every time.
  for (const group of grouped) order.push(sql`${sql.ref(group.alias)} asc nulls last`);

  const columns = [
    ...grouped.map((group) =>
      group.isDate
        ? sql`${group.expression}::text as ${sql.id(group.alias)}`
        : sql`${group.expression} as ${sql.id(group.alias)}`,
    ),
    ...measured.map((measure) => sql`${measure.expression} as ${sql.id(measure.alias)}`),
  ];
  await sql`select set_config('statement_timeout', ${String(AGGREGATE_TIMEOUT_MS)}, true)`.execute(
    db,
  );
  const result = await sql<Row>`
    select ${sql.join(columns)} from ${sql.id(target.schema, target.table)}
    where ${where}
    ${grouped.length > 0 ? sql`group by ${sql.join(grouped.map((_, index) => sql.raw(String(index + 1))))}` : sql``}
    ${order.length > 0 ? sql`order by ${sql.join(order)}` : sql``}
    limit ${limit + 1}
  `
    .execute(db)
    .catch((error: { code?: string }) => {
      if (error.code === "57014") {
        throw new HttpError(
          422,
          "too_slow",
          `Working out these totals took longer than ${AGGREGATE_TIMEOUT_MS / 1000} seconds. Narrow the filter, or index the columns it uses.`,
        );
      }
      throw error;
    });

  const items = result.rows.slice(0, limit).map((row) => ({
    by: Object.fromEntries(
      grouped.map((group) => [group.name, fromDatabase(group.meta, row[group.alias])]),
    ),
    values: Object.fromEntries(
      measured.map((measure) => {
        const raw = row[measure.alias];
        if (raw === null || raw === undefined) return [measure.name, null];
        if (measure.fn === "count" || measure.fn === "sum" || measure.fn === "avg") {
          return [measure.name, Number(raw)];
        }
        return [measure.name, fromDatabase(measure.meta as ColumnMeta, raw)];
      }),
    ),
  }));
  return { items, truncated: result.rows.length > limit };
}

function keyColumn(target: RowTarget): ColumnMeta {
  const key = target.columns.find((candidate) => candidate.name === target.key);
  if (!key)
    throw badRequest(
      `The table ${target.name} has no single key column, so its rows can only be listed.`,
    );
  return key;
}

function keyValue(target: RowTarget, id: string): unknown {
  const key = keyColumn(target);
  try {
    return toDatabase(key, key.type === "integer" || key.type === "number" ? Number(id) : id);
  } catch {
    throw notFound("The row");
  }
}

export async function getRow(db: AnyDb, target: RowTarget, id: string): Promise<Row> {
  const result = await sql<Row>`
    select ${selectList(target)} from ${sql.id(target.schema, target.table)}
    where ${sql.ref(keyColumn(target).physicalName)} = ${keyValue(target, id)}
  `.execute(db);
  if (!result.rows[0]) throw notFound("The row");
  return shape(target, result.rows[0]);
}

/** Checks the values of one row and gives them by physical column name. */
function validate(
  target: RowTarget,
  input: unknown,
  index: number | null,
  inserting: boolean,
): Map<ColumnMeta, unknown> {
  const prefix = index === null ? "" : `/${index}`;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw badRequest("A row must be an object of column names and values.", [
      { path: prefix || "/", message: "must be an object" },
    ]);
  }
  const issues: { path: string; message: string }[] = [];
  const values = new Map<ColumnMeta, unknown>();
  for (const [name, raw] of Object.entries(input)) {
    const meta = target.columns.find((candidate) => candidate.name === name);
    if (!meta) {
      issues.push({
        path: `${prefix}/${name}`,
        message: `there is no column "${name}" in ${target.name}`,
      });
    } else if (!meta.writable) {
      issues.push({
        path: `${prefix}/${name}`,
        message: target.managed
          ? `"${name}" is set by the platform`
          : `"${name}" has a type the platform only reads`,
      });
    } else {
      try {
        const value = toDatabase(meta, raw);
        if (value === null && meta.required && !(inserting && meta.hasDefault)) {
          issues.push({ path: `${prefix}/${name}`, message: "is required" });
        }
        values.set(meta, value);
      } catch (error) {
        if (!(error instanceof Invalid)) throw error;
        issues.push({ path: `${prefix}/${name}`, message: error.message });
      }
    }
  }
  if (inserting && target.managed) {
    for (const meta of target.columns) {
      if (meta.writable && meta.required && !meta.hasDefault && !values.has(meta)) {
        issues.push({ path: `${prefix}/${meta.name}`, message: "is required" });
      }
    }
  }
  if (issues.length > 0) throw badRequest("The row does not fit the table.", issues);
  return values;
}

const bound = (meta: ColumnMeta, value: unknown) =>
  meta.type === "json" && value !== null ? sql`${value}::jsonb` : sql`${value}`;

export async function insertRows(
  db: AnyDb,
  target: RowTarget,
  inputs: unknown[],
  scope: DataScope,
): Promise<Row[]> {
  if (inputs.length === 0) return [];
  const rows = inputs.map((input, index) =>
    validate(target, input, inputs.length === 1 ? null : index, true),
  );
  // The column that says whose a row is: the owner column, or one a rule compares with the person.
  const policy = target.policy;
  const ownerName =
    policy.type === "owner"
      ? policy.column
      : policy.type === "rules"
        ? policy.rules.flatMap((rule) =>
            "is" in rule.when && rule.allow !== "read" ? [rule.when.column] : [],
          )[0]
        : undefined;
  const owner = target.columns.find((c) => c.name === ownerName);
  const writable = target.columns.filter((meta) => meta.writable);
  const names = [
    ...(target.managed ? [sql.id("id")] : []),
    ...writable.map((meta) => sql.id(meta.physicalName)),
  ];
  const tuples = rows.map((values) => {
    // A row written by a person with no owner given becomes theirs.
    if (owner && !values.has(owner) && scope.principalId) values.set(owner, scope.principalId);
    const cells = writable.map((meta) =>
      values.has(meta) && !(values.get(meta) === null && meta.hasDefault && meta.required)
        ? bound(meta, values.get(meta))
        : sql`default`,
    );
    return sql`(${sql.join([...(target.managed ? [sql`${newId()}`] : []), ...cells])})`;
  });
  const result = await naming(target, () =>
    sql<Row>`
      insert into ${sql.id(target.schema, target.table)} (${sql.join(names)})
      values ${sql.join(tuples)}
      returning ${selectList(target)}
    `.execute(db),
  );
  return result.rows.map((row) => shape(target, row));
}

export async function updateRow(
  db: AnyDb,
  target: RowTarget,
  id: string,
  patch: unknown,
): Promise<Row> {
  const values = validate(target, patch, null, false);
  const assignments = [...values].map(
    ([meta, value]) => sql`${sql.id(meta.physicalName)} = ${bound(meta, value)}`,
  );
  if (target.managed) assignments.push(sql`updated_at = now()`);
  if (assignments.length === 0) return getRow(db, target, id);
  const result = await naming(target, () =>
    sql<Row>`
      update ${sql.id(target.schema, target.table)} set ${sql.join(assignments)}
      where ${sql.ref(keyColumn(target).physicalName)} = ${keyValue(target, id)}
      returning ${selectList(target)}
    `.execute(db),
  );
  // A row the policy hides cannot be told apart from one that is not there.
  if (!result.rows[0]) throw notFound("The row");
  return shape(target, result.rows[0]);
}

export async function deleteRow(db: AnyDb, target: RowTarget, id: string): Promise<void> {
  const result = await sql`
    delete from ${sql.id(target.schema, target.table)}
    where ${sql.ref(keyColumn(target).physicalName)} = ${keyValue(target, id)}
  `.execute(db);
  if ((result.numAffectedRows ?? 0n) === 0n) throw notFound("The row");
}

export async function countRows(db: AnyDb, target: RowTarget): Promise<number> {
  const result = await sql<{
    n: string;
  }>`select count(*) as n from ${sql.id(target.schema, target.table)}`.execute(db);
  return Number(result.rows[0]?.n ?? 0);
}
