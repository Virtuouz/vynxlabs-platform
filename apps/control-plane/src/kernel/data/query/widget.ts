import {
  type DataInput,
  groupName,
  type PageFilter,
  type QueryBody,
  type VisualBucket,
  type VisualCondition,
  type VisualQuery,
} from "@volvel/manifest";
import { followRecordedKey } from "../../dashboard-queries.js";
import { badRequest, notFound } from "../../errors.js";
import type { Kernel } from "../../kernel.js";
import { resolveResource } from "../../resolve.js";
import { loadCatalog } from "../apply.js";
import type { CatalogTable } from "../plan.js";
import { dayAfter, daysIn, type FilterValues, rangeOf } from "./filters.js";
import { compileVisual, type VisualCatalog, VisualRefused } from "./visual.js";

/**
 * What a data input of a widget asks, as SQL and the values it is given: its source, with the
 * page's filters filled in as whoever is looking set them. The SQL is then run by `runQuery`,
 * which reads it and holds it to what a query may be, whichever of the three forms it came
 * from.
 */

export type { FilterValues } from "./filters.js";

const unset = (value: unknown) => value === undefined || value === null || value === "";

/** The workspace's tables, by path: what a visual query's names are looked up in, and what a result is described by. */
export interface WorkspaceCatalog {
  visual: VisualCatalog;
  tables: Map<string, CatalogTable>;
  /** What each table's definition says its columns hold, by table and column: the help behind a heading. */
  described: Map<string, Map<string, string>>;
}

export async function workspaceCatalog(
  kernel: Kernel,
  tenantId: string,
  workspaceId: string,
): Promise<WorkspaceCatalog> {
  const data = (await kernel.data.forTenant(tenantId)).owner;
  const visual: VisualCatalog = new Map();
  const tables = new Map<string, CatalogTable>();
  for (const table of await loadCatalog(data, workspaceId)) {
    if (table.status !== "active") continue;
    tables.set(table.name, table);
    visual.set(table.name, {
      columns: new Map(
        table.columns
          .filter((column) => column.status === "active")
          .map((column) => [column.name, { type: column.type, references: column.referenceTable }]),
      ),
    });
  }
  // What a column holds is said in its table's definition, which is a resource of the workspace.
  const described = new Map<string, Map<string, string>>();
  const ids = [...tables.values()].flatMap((table) => (table.resourceId ? [table.resourceId] : []));
  if (ids.length > 0) {
    const bodies = await kernel.db
      .selectFrom("resource")
      .select(["id", "body"])
      .where("id", "in", ids)
      .execute();
    const byId = new Map(
      bodies.map((row) => [
        row.id,
        row.body as { columns?: Record<string, { description?: unknown }> },
      ]),
    );
    for (const table of tables.values()) {
      const columns = table.resourceId ? byId.get(table.resourceId)?.columns : undefined;
      const said = new Map<string, string>();
      for (const [name, column] of Object.entries(columns ?? {})) {
        if (typeof column.description === "string" && column.description !== "") {
          said.set(name, column.description);
        }
      }
      if (said.size > 0) described.set(table.name, said);
    }
  }
  return { visual, tables, described };
}

/** The workspace's tables and columns, for a visual query's names to be looked up in. */
export async function visualCatalog(
  kernel: Kernel,
  tenantId: string,
  workspaceId: string,
): Promise<VisualCatalog> {
  return (await workspaceCatalog(kernel, tenantId, workspaceId)).visual;
}

/** The conditions a page's filters add to a visual input, as far as they were set. */
export function conditionsFor(
  input: DataInput,
  filters: Map<string, PageFilter>,
  values: FilterValues,
): VisualCondition[] {
  const conditions: VisualCondition[] = [];
  for (const binding of input.filters ?? []) {
    const filter = filters.get(binding.filter);
    const column = binding.column;
    if (!filter || !column) continue;
    const value = values[binding.filter];
    if (filter.type === "date_range") {
      const range = rangeOf(value);
      if (range?.from) conditions.push({ column, op: "gte", value: range.from });
      // Up to the end of the last day, whether the column holds a date or a time.
      if (range?.to) conditions.push({ column, op: "lt", value: dayAfter(range.to) });
      continue;
    }
    if (unset(value)) continue;
    if (filter.type === "text") conditions.push({ column, op: "contains", value: String(value) });
    else if (Array.isArray(value)) conditions.push({ column, op: "in", value });
    else conditions.push({ column, op: "eq", value });
  }
  return conditions;
}

/**
 * How long each point of a trend is when the figure does not say: days for a range of up to
 * six weeks, weeks for up to about half a year, months beyond that or when the dates are not
 * narrowed at all.
 */
export function bucketFor(
  input: DataInput,
  filters: Map<string, PageFilter>,
  values: FilterValues,
  column: string,
): VisualBucket {
  const bindings = (input.filters ?? []).filter(
    (one) => filters.get(one.filter)?.type === "date_range",
  );
  const binding = bindings.find((one) => one.column === column) ?? bindings[0];
  const range = binding ? rangeOf(values[binding.filter]) : undefined;
  if (!range?.from || !range.to) return "month";
  const days = daysIn({ from: range.from, to: range.to });
  return days <= 45 ? "day" : days <= 200 ? "week" : "month";
}

/** A visual query as SQL, refused as a bad request that says where. */
export function writeVisual(
  query: VisualQuery,
  catalog: VisualCatalog,
  extra: VisualCondition[] = [],
  at = "/query",
) {
  try {
    return compileVisual(query, catalog, extra);
  } catch (error) {
    if (!(error instanceof VisualRefused)) throw error;
    throw badRequest("The query cannot be run.", [
      { path: `${at}${error.path}`, message: error.message },
    ]);
  }
}

export interface WidgetQuery {
  text: string;
  parameters: unknown[];
  /** The names of the result's columns, in order, when the query is built from menus. */
  columns?: string[];
  /**
   * The input's path named nothing, and its query was found by the key recorded when the page
   * was deployed: `names` is the path the page still has, `now` the query's.
   */
  followed?: { names: string; now: string };
}

/** What a data input is read as, for a visual query. */
export interface InputKind {
  /** `rows`: every row has its `id` and a stable order, so that pages do not repeat or skip. */
  shape: "rows" | "summary" | "record";
  /** For a figure's trend: its number over the time it covers, one row to a day, week or month. */
  trend?: { by: string };
}

/** A visual query asked for as rows: it carries each row's id, and a stable order. */
export function asRows(visual: VisualQuery): VisualQuery {
  if ((visual.groupBy?.length ?? 0) > 0 || (visual.measures?.length ?? 0) > 0) return visual;
  const columns = visual.columns && visual.columns.length > 0 ? visual.columns : undefined;
  const sort = visual.sort ?? [];
  return {
    ...visual,
    ...(columns && !columns.includes("id") ? { columns: ["id", ...columns] } : {}),
    sort: sort.some((one) => one.by === "id") ? sort : [...sort, { by: "id" }],
  };
}

/** What one data input of a widget asks, with the page's filters as they were set. */
export async function inputQuery(
  kernel: Kernel,
  at: { tenantId: string; workspaceId: string },
  input: DataInput,
  page: {
    filters: readonly PageFilter[];
    values: FilterValues;
    catalog: VisualCatalog;
    /** The deployed page and where the input is in it, whose recorded keys a saved query falls back on. */
    follow?: { pageId: string; place: string };
  },
  kind: InputKind,
): Promise<WidgetQuery> {
  const source = input.source;
  const filters = new Map(page.filters.map((filter) => [filter.name, filter]));

  if ("visual" in source) {
    const trend = kind.trend;
    const group = trend
      ? { column: trend.by, bucket: bucketFor(input, filters, page.values, trend.by) }
      : undefined;
    const visual = group
      ? // The same question, a period at a time, oldest first.
        {
          table: source.visual.table,
          ...(source.visual.joins ? { joins: source.visual.joins } : {}),
          ...(source.visual.filters ? { filters: source.visual.filters } : {}),
          ...(source.visual.measures ? { measures: source.visual.measures.slice(0, 1) } : {}),
          groupBy: [group],
          sort: [{ by: groupName(group) }],
        }
      : kind.shape === "summary"
        ? source.visual
        : asRows(source.visual);
    const written = writeVisual(
      visual,
      page.catalog,
      conditionsFor(input, filters, page.values),
      "/source/visual",
    );
    return { text: written.sql, parameters: written.parameters, columns: written.columns };
  }

  if (kind.trend) throw badRequest("This figure's trend is the rows of its own query.");

  /** What a filter gives the parameter it is bound to: for a range of dates, the end that was asked for. */
  const given = (name: string): unknown => {
    const binding = (input.filters ?? []).find((one) => one.parameter === name);
    if (!binding) return undefined;
    const filter = filters.get(binding.filter);
    const value = page.values[binding.filter];
    if (filter?.type === "date_range") {
      const range = rangeOf(value);
      return binding.part === "to" ? range?.to : range?.from;
    }
    return unset(value) ? undefined : value;
  };

  if ("query" in source) {
    const found = await resolveResource(kernel.db, at.workspaceId, source.query, { kind: "query" });
    // Nothing at the path, or at a path it had: the query the path named when the page was
    // deployed, if it is still there under another path.
    const byKey =
      !found?.resource && page.follow
        ? await followRecordedKey(kernel.db, at.workspaceId, page.follow.pageId, page.follow.place)
        : undefined;
    const query = found?.resource ?? byKey?.resource;
    if (!query) throw notFound(`The query ${source.query}`);
    const saved = query.body as unknown as QueryBody;
    return {
      ...(byKey ? { followed: { names: byKey.names, now: byKey.now } } : {}),
      text: saved.sql,
      parameters: (saved.parameters ?? []).map(
        (parameter) =>
          given(parameter.name) ?? source.values?.[parameter.name] ?? parameter.default ?? null,
      ),
    };
  }

  // SQL written in the widget: its parameters are $1, $2 and so on.
  const fixed = source.values ?? [];
  const bound = (input.filters ?? [])
    .map((one) => Number(one.parameter?.slice(1)))
    .filter((n) => Number.isInteger(n) && n > 0);
  const count = Math.max(fixed.length, 0, ...bound);
  return {
    text: source.sql,
    parameters: Array.from(
      { length: count },
      (_, index) => given(`$${index + 1}`) ?? fixed[index] ?? null,
    ),
  };
}
