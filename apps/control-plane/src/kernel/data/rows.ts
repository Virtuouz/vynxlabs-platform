import { type Kysely, newId, sql } from "@vynxlabs/db";
import type { TablePolicy } from "@vynxlabs/manifest";
import type { Db, Trx } from "../audit.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { constraintName, DATA_ROLE, workspaceSchema } from "./apply.js";

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
}

/**
 * Runs a request for tenant data. Inside, the connection is the data role,
 * which owns nothing and is subject to every table's row policy, and the
 * policy is told who is asking. Both last only as long as the transaction.
 *
 * Nothing in here may run SQL that a caller wrote. Row policies guard against
 * our mistakes, not against injected SQL, which could switch the role back.
 */
export function withData<T>(
  kernel: Kernel,
  scope: DataScope,
  run: (trx: AnyDb) => Promise<T>,
): Promise<T> {
  return kernel.db.transaction().execute(async (trx) => {
    await sql`set local role ${sql.id(DATA_ROLE)}`.execute(trx);
    await sql`select set_config('app.principal', ${scope.principalId ?? ""}, true), set_config('app.data_all', ${scope.all ? "on" : "off"}, true)`.execute(
      trx,
    );
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
    return new HttpError(403, "forbidden", "This table's policy only lets you write rows you own.");
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
    const violated =
      (error as { code?: string; constraint?: string }).code === "23505"
        ? (error as { constraint?: string }).constraint
        : undefined;
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
  const owner =
    target.policy.type === "owner"
      ? target.columns.find((c) => c.name === (target.policy as { column: string }).column)
      : undefined;
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
