import type {
  DashboardBody,
  DashboardFilter,
  DashboardWidget,
  QueryBody,
  VisualBucket,
  VisualCondition,
  VisualQuery,
} from "@volvel/manifest";
import { groupName } from "@volvel/manifest";
import { badRequest, notFound } from "../../errors.js";
import type { Kernel } from "../../kernel.js";
import { resolveResource } from "../../resolve.js";
import { loadCatalog } from "../apply.js";
import { compileVisual, type VisualCatalog, VisualRefused } from "./visual.js";

/**
 * What a dashboard's widget asks, as SQL and the values it is given: its
 * source, with the dashboard's filters filled in as whoever is looking set
 * them. The SQL is then run by `runQuery`, which reads it and holds it to
 * what a query may be, whichever of the three forms it came from.
 */

/** What whoever looks at a dashboard set its filters to, by filter name. A filter left out narrows nothing. */
export type FilterValues = Record<string, unknown>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day after a date, as a date: so that a range's last day is whole. */
function dayAfter(day: string): string {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** A range of dates as it was set: both ends, or nothing when it was not set or is not a range. */
function rangeOf(value: unknown): { from?: string; to?: string } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { from, to } = value as { from?: unknown; to?: unknown };
  const range = {
    ...(typeof from === "string" && DAY.test(from) ? { from } : {}),
    ...(typeof to === "string" && DAY.test(to) ? { to } : {}),
  };
  return range.from || range.to ? range : undefined;
}

const unset = (value: unknown) => value === undefined || value === null || value === "";

/** The workspace's tables and columns, for a visual query's names to be looked up in. */
export async function visualCatalog(
  kernel: Kernel,
  tenantId: string,
  workspaceId: string,
): Promise<VisualCatalog> {
  const data = (await kernel.data.forTenant(tenantId)).owner;
  const catalog = new Map();
  for (const table of await loadCatalog(data, workspaceId)) {
    if (table.status !== "active") continue;
    catalog.set(table.name, {
      columns: new Map(
        table.columns
          .filter((column) => column.status === "active")
          .map((column) => [column.name, { type: column.type, references: column.referenceTable }]),
      ),
    });
  }
  return catalog;
}

/** The conditions a dashboard's filters add to a visual query, as far as they were set. */
function conditionsFor(
  widget: DashboardWidget,
  filters: Map<string, DashboardFilter>,
  values: FilterValues,
): VisualCondition[] {
  const conditions: VisualCondition[] = [];
  for (const binding of widget.filters ?? []) {
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
 * How long each point of a trend is when the figure does not say: days for a
 * range of up to six weeks, weeks for up to about half a year, months beyond
 * that or when the dates are not narrowed at all.
 */
function bucketFor(
  widget: DashboardWidget,
  filters: Map<string, DashboardFilter>,
  values: FilterValues,
  column: string,
): VisualBucket {
  const bindings = (widget.filters ?? []).filter(
    (one) => filters.get(one.filter)?.type === "date_range",
  );
  const binding = bindings.find((one) => one.column === column) ?? bindings[0];
  const range = binding ? rangeOf(values[binding.filter]) : undefined;
  if (!range?.from || !range.to) return "month";
  const days =
    (new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime()) /
      86_400_000 +
    1;
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
}

/** What one widget of a dashboard asks, with the filters as they were set. */
export async function widgetQuery(
  kernel: Kernel,
  at: { tenantId: string; workspaceId: string },
  dashboard: DashboardBody,
  widget: DashboardWidget,
  values: FilterValues,
  /** `trend`: a figure's number over the time it covers, one row to a day, week or month. */
  part?: "trend",
): Promise<WidgetQuery> {
  const source = widget.source;
  if (!source) throw badRequest("This widget asks nothing.");
  const filters = new Map((dashboard.filters ?? []).map((filter) => [filter.name, filter]));

  if (part === "trend") {
    const trend = widget.options?.trend;
    if (widget.type !== "figure" || !trend) throw badRequest("This widget draws no trend.");
    // A saved query or SQL gives its own rows as the trend: there is nothing more to ask.
    if (!("visual" in source)) {
      throw badRequest("This figure's trend is the rows of its own query.");
    }
  }

  if ("visual" in source) {
    const catalog = await visualCatalog(kernel, at.tenantId, at.workspaceId);
    const trend = part === "trend" ? widget.options?.trend : undefined;
    const group = trend
      ? { column: trend.by, bucket: trend.bucket ?? bucketFor(widget, filters, values, trend.by) }
      : undefined;
    const written = writeVisual(
      group
        ? // The same question, a period at a time, oldest first.
          {
            table: source.visual.table,
            ...(source.visual.joins ? { joins: source.visual.joins } : {}),
            ...(source.visual.filters ? { filters: source.visual.filters } : {}),
            ...(source.visual.measures ? { measures: source.visual.measures } : {}),
            groupBy: [group],
            sort: [{ by: groupName(group) }],
          }
        : source.visual,
      catalog,
      conditionsFor(widget, filters, values),
      "/source/visual",
    );
    return { text: written.sql, parameters: written.parameters };
  }

  /** What a filter gives the parameter it is bound to: for a range of dates, the end that was asked for. */
  const given = (name: string): unknown => {
    const binding = (widget.filters ?? []).find((one) => one.parameter === name);
    if (!binding) return undefined;
    const filter = filters.get(binding.filter);
    const value = values[binding.filter];
    if (filter?.type === "date_range") {
      const range = rangeOf(value);
      return binding.part === "to" ? range?.to : range?.from;
    }
    return unset(value) ? undefined : value;
  };

  if ("query" in source) {
    const found = await resolveResource(kernel.db, at.workspaceId, source.query, { kind: "query" });
    if (!found?.resource) throw notFound(`The query ${source.query}`);
    const saved = found.resource.body as unknown as QueryBody;
    return {
      text: saved.sql,
      parameters: (saved.parameters ?? []).map(
        (parameter) =>
          given(parameter.name) ?? source.values?.[parameter.name] ?? parameter.default ?? null,
      ),
    };
  }

  // SQL written in the widget: its parameters are $1, $2 and so on.
  const fixed = source.values ?? [];
  const bound = (widget.filters ?? [])
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
