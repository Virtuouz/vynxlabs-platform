import { CompiledQuery, sql } from "@vynxlabs/db";
import { badRequest, HttpError } from "../../errors.js";
import type { Kernel } from "../../kernel.js";
import { type DataScope, withData } from "../rows.js";
import { type CheckedQuery, checkQuery, QueryRefused } from "./parse.js";
import { ensureQueryViews } from "./views.js";

/**
 * Runs a query that was checked and written again by `checkQuery` (Decision
 * 0003). It runs as a row read does: on the connection of the role that owns
 * nothing, told who is asking by a claim it cannot forge, in a transaction
 * that can only read, with a time limit and a cap on what comes back.
 *
 * Two things follow from reading each row as JSON. Two columns of one name
 * are one column in the result: the second is the one kept, so a join names
 * its columns apart with AS. And a result with no rows has no columns to
 * name, since the names are read from the rows.
 */

export const QUERY_ROWS = { default: 1000, most: 10_000 } as const;
/** The most a result may weigh, as JSON. Past it the result is cut short and says so. */
export const QUERY_BYTES = 5 * 1024 * 1024;

export interface QueryResult {
  columns: { name: string; type: string }[];
  rows: unknown[][];
  /** There was more than was returned. */
  truncated: boolean;
  /** The tables it read. */
  tables: string[];
  /** The query as it ran: written again from what was read of it. */
  sql: string;
}

export interface QueryRequest {
  tenantId: string;
  workspaceId: string;
  /** Who is asking, as a row read would be told. */
  scope: DataScope;
  text: string;
  parameters?: unknown[];
  limit?: number;
  /** Refuses, by throwing, when the caller may not read this table. Called for each one the query names. */
  mayRead(table: { name: string; resourceId: string | null }): Promise<void>;
}

/** What a value is, said the way a column's type is: for showing, not for trusting. */
function typeOf(value: unknown): string {
  if (value === null || value === undefined) return "unknown";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "list";
  if (typeof value === "object") return "json";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return "timestamp";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  return "text";
}

const plain = (value: unknown): unknown => (value === undefined ? null : value);

/**
 * What Postgres says of a query that parsed and still cannot run: a column
 * that is not there, a value that will not cast, a division by zero. These are
 * the author's to fix, so they are answered as a bad request with the
 * database's own words.
 */
async function reading<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = String((error as { code?: unknown }).code ?? "");
    // Syntax and names (42), data (22), cardinality (21), and what a read-only transaction refuses (25).
    if (/^(42|22|21|25|2F|54)/.test(code) && code !== "42501") {
      throw badRequest("The query cannot be run.", [
        { path: "/sql", message: (error as Error).message },
      ]);
    }
    throw error;
  }
}

/** A refusal as the API answers it: what is wrong, and where in the text. */
export function refusal(error: QueryRefused) {
  return badRequest("The query cannot be run.", [
    {
      path: error.line ? `/sql/${error.line}:${error.column}` : "/sql",
      message: error.message,
    },
  ]);
}

/** Checks a query against a workspace's tables without running it. Throws `QueryRefused`. */
export async function checkFor(
  kernel: Kernel,
  tenantId: string,
  workspaceId: string,
  text: string,
): Promise<CheckedQuery & { resources: Map<string, { resourceId: string | null }> }> {
  const store = await kernel.data.forTenant(tenantId);
  const views = await ensureQueryViews(store.owner, store.role, workspaceId);
  const checked = await checkQuery(text, {
    schema: views.schema,
    tables: new Set(views.tables.keys()),
  });
  return { ...checked, resources: views.tables };
}

export async function runQuery(kernel: Kernel, request: QueryRequest): Promise<QueryResult> {
  let checked: Awaited<ReturnType<typeof checkFor>>;
  try {
    checked = await checkFor(kernel, request.tenantId, request.workspaceId, request.text);
  } catch (error) {
    if (error instanceof QueryRefused) throw refusal(error);
    throw error;
  }
  // The database's grants do not know that a permission can be held at one table.
  for (const name of checked.tables) {
    await request.mayRead({ name, resourceId: checked.resources.get(name)?.resourceId ?? null });
  }
  const given = request.parameters ?? [];
  if (given.length !== checked.parameters) {
    throw badRequest(
      checked.parameters === 0
        ? "The query takes no parameters, and some were given."
        : `The query takes ${checked.parameters} parameter${checked.parameters === 1 ? "" : "s"}, $1 to $${checked.parameters}, and ${given.length} ${given.length === 1 ? "was" : "were"} given.`,
    );
  }
  const limit = Math.min(Math.max(request.limit ?? QUERY_ROWS.default, 1), QUERY_ROWS.most);
  const timeoutMs = kernel.config.limits.sqlStatementTimeoutMs;

  const found = await reading(() =>
    withData(
      kernel,
      request.tenantId,
      request.scope,
      async (trx) => {
        // Nothing here can write, whatever got this far; and a name means Postgres's own, nobody else's.
        await sql`set transaction read only`.execute(trx);
        await sql`select set_config('search_path', 'pg_catalog', true)`.execute(trx);
        // Each row comes back as JSON written by Postgres, which keeps the columns in order and
        // says a number as a number and a date as text, whatever the driver would make of them.
        // One row more than is wanted is read, to know whether there were more.
        const fetched = await trx.executeQuery<{ r: Record<string, unknown> }>(
          CompiledQuery.raw(
            `select row_to_json(vx_q) as r from (${checked.sql}) as vx_q limit ${limit + 1}`,
            given,
          ),
        );
        return fetched.rows.map((row) => row.r);
      },
      { timeoutMs },
    ),
  );

  const truncatedByCount = found.length > limit;
  const kept = truncatedByCount ? found.slice(0, limit) : found;
  const names = kept[0] ? Object.keys(kept[0]) : [];
  const rows: unknown[][] = [];
  let weight = 0;
  let truncatedBySize = false;
  for (const row of kept) {
    const values = names.map((name) => plain(row[name]));
    weight += JSON.stringify(values).length;
    if (weight > QUERY_BYTES) {
      truncatedBySize = true;
      break;
    }
    rows.push(values);
  }
  return {
    columns: names.map((name, at) => ({
      name,
      type: typeOf(rows.find((row) => row[at] !== null)?.[at]),
    })),
    rows,
    truncated: truncatedByCount || truncatedBySize,
    tables: checked.tables,
    sql: checked.sql,
  };
}
