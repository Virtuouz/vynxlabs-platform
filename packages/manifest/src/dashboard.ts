import type { InterfacePage, PageWidget, ValueFormat } from "./interface.js";
import type { KindDefinition } from "./registry.js";

/**
 * A dashboard: questions asked of a workspace's tables, and their answers
 * drawn. Each widget has a source, which is a query in one of three forms,
 * and the dashboard's filters fill the parameters of those queries.
 *
 * - A **visual** query is built from menus: a table, the tables its
 *   references point to, filters, groups and measures. The platform writes
 *   its SQL.
 * - A **saved** query is a `query` resource, named by its path.
 * - **SQL** is written into the widget by someone who may write SQL.
 *
 * Whoever looks at a dashboard is given the rows each table's policy gives
 * them. A dashboard reads, and changes nothing.
 */

export const DASHBOARD_VERSION = 2;
export const MAX_DASHBOARD_WIDGETS = 30;
export const MAX_DASHBOARD_FILTERS = 8;

export const VISUAL_FUNCTIONS = ["count", "count_distinct", "sum", "avg", "min", "max"] as const;
export type VisualFunction = (typeof VISUAL_FUNCTIONS)[number];
export const VISUAL_BUCKETS = ["day", "week", "month", "quarter", "year"] as const;
export type VisualBucket = (typeof VISUAL_BUCKETS)[number];
export const VISUAL_OPERATORS = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "is_null",
  "not_null",
] as const;
export type VisualOperator = (typeof VISUAL_OPERATORS)[number];

/**
 * A column of the query's table, or of a table it joins: `fee`, or
 * `device.name` for the `name` of the row the `device` column points to.
 */
export type VisualColumn = string;

export interface VisualCondition {
  column: VisualColumn;
  op: VisualOperator;
  /** What it is compared with. Left out for `is_null` and `not_null`. */
  value?: unknown;
}

/** A query built from menus. The platform writes it as one SELECT and runs it as any other. */
export interface VisualQuery {
  /** The table it starts from, by its path. */
  table: string;
  /**
   * References of that table to follow, by the column that holds each: the
   * columns of the row pointed to are then there to use, as `<column>.<theirs>`.
   */
  joins?: string[];
  /** Conditions every row must meet. */
  filters?: VisualCondition[];
  /** What rows are gathered by. A date or a time can be gathered into periods. */
  groupBy?: { column: VisualColumn; bucket?: VisualBucket }[];
  /** What is worked out for each group, or for all the rows when there are no groups. */
  measures?: { fn: VisualFunction; column?: VisualColumn; as: string }[];
  /** Without groups or measures: the columns to show. Left out, every column of the table. */
  columns?: VisualColumn[];
  /** By a column shown, a group, or a measure's name. */
  sort?: { by: string; descending?: boolean }[];
  limit?: number;
}

export const DASHBOARD_FILTER_TYPES = ["date_range", "choice", "text", "number"] as const;
export type DashboardFilterType = (typeof DASHBOARD_FILTER_TYPES)[number];

/** The ranges a date filter offers by name, each counted back from today. */
export const RELATIVE_RANGES = [
  "today",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "last_12_months",
] as const;
export type RelativeRange = (typeof RELATIVE_RANGES)[number];

/** A value set by whoever reads the dashboard, which its widgets' queries are given. */
export interface DashboardFilter {
  /** What the widgets refer to it by. */
  name: string;
  label?: string;
  type: DashboardFilterType;
  /**
   * What it is when nobody has set it: for a date range one of `RELATIVE_RANGES`
   * or `{ from, to }`; for the others a value. Left out, it narrows nothing.
   */
  default?: unknown;
  /** For a choice: the values offered. Left out with `from`, they are read from the table. */
  choices?: string[];
  /** For a choice: the table and column whose values are offered. An enum's are its own. */
  from?: { table: string; column: string };
}

/**
 * How a widget's query takes a dashboard filter.
 *
 * - For a visual query: the column the filter narrows.
 * - For a saved query or SQL: the parameter it fills. A date range fills two:
 *   `from` and `to`.
 */
export interface FilterBinding {
  filter: string;
  /** A visual query's column. */
  column?: VisualColumn;
  /** A saved query's parameter by name, or `$n` for SQL written in the widget. */
  parameter?: string;
  /** For a date range filling a parameter: which end. */
  part?: "from" | "to";
}

export type WidgetSource =
  | { visual: VisualQuery }
  | { query: string; values?: Record<string, unknown> }
  | { sql: string; values?: unknown[] };

export const DASHBOARD_WIDGET_TYPES = ["figure", "chart", "table", "pivot", "text"] as const;
export type DashboardWidgetType = (typeof DASHBOARD_WIDGET_TYPES)[number];
export const DASHBOARD_CHART_MARKS = ["bar", "line", "area", "pie", "scatter"] as const;
/** How many twelfths of the page a widget is wide. */
export const WIDGET_WIDTHS = [3, 4, 6, 8, 12] as const;

export interface DashboardWidgetOptions {
  /** A figure's number, a pivot's cells, a chart's values: the column they come from. */
  value?: string;
  format?: ValueFormat;
  /**
   * A figure also says how it stands against the period before: the same
   * length of time, ending where the date filter named here begins.
   */
  compareTo?: string;
  /** A chart's shape and what it draws. `y` may be several columns. */
  mark?: (typeof DASHBOARD_CHART_MARKS)[number];
  x?: string;
  y?: string | string[];
  series?: string;
  /** Bars of several series: one on another, or side by side. */
  bars?: "stacked" | "grouped";
  /** A column drawn as a line over the bars. */
  line?: string;
  /** A pivot's rows and columns: the result's columns that head each. */
  rows?: string[];
  columns?: string[];
  /** How a pivot's cell is worked out from the rows that fall in it. */
  cell?: "sum" | "avg" | "min" | "max" | "count";
  totals?: boolean;
  /** A table's columns, in order. Left out, every column of the result. */
  show?: string[];
  /** A text widget's words. Plain text. */
  text?: string;
}

export interface DashboardWidget {
  id: string;
  title?: string;
  type: DashboardWidgetType;
  /** How many twelfths of the page it is wide. Widgets fill a row, then the next. */
  width?: (typeof WIDGET_WIDTHS)[number];
  /** Every kind of widget but text has one. */
  source?: WidgetSource;
  /** The dashboard filters its query takes. */
  filters?: FilterBinding[];
  options?: DashboardWidgetOptions;
}

/** The body of a `dashboard` manifest, and what a member's own dashboard holds. */
export interface DashboardBody {
  version: typeof DASHBOARD_VERSION;
  title?: string;
  description?: string;
  filters?: DashboardFilter[];
  widgets: DashboardWidget[];
}

const NAME = "^[a-z][a-z0-9_]{0,54}$";
const SLUG = "^[a-z][a-z0-9_-]{0,39}$";
/** A column, or a column of a joined table: `fee`, `device.name`. */
const COLUMN = "^[a-z][a-z0-9_]{0,62}(\\.[a-z][a-z0-9_]{0,62})?$";
const PATH = "^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$";

const visualSchema = {
  type: "object",
  properties: {
    table: { type: "string", pattern: PATH, maxLength: 255 },
    joins: {
      type: "array",
      maxItems: 6,
      items: { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$" },
    },
    filters: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          column: { type: "string", pattern: COLUMN },
          op: { enum: [...VISUAL_OPERATORS] },
          value: {},
        },
        required: ["column", "op"],
        additionalProperties: false,
      },
    },
    groupBy: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          column: { type: "string", pattern: COLUMN },
          bucket: { enum: [...VISUAL_BUCKETS] },
        },
        required: ["column"],
        additionalProperties: false,
      },
    },
    measures: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          fn: { enum: [...VISUAL_FUNCTIONS] },
          column: { type: "string", pattern: COLUMN },
          as: { type: "string", pattern: NAME },
        },
        required: ["fn", "as"],
        additionalProperties: false,
      },
    },
    columns: { type: "array", maxItems: 50, items: { type: "string", pattern: COLUMN } },
    sort: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          by: { type: "string", pattern: "^[a-z][a-z0-9_.]{0,130}$" },
          descending: { type: "boolean" },
        },
        required: ["by"],
        additionalProperties: false,
      },
    },
    limit: { type: "integer", minimum: 1, maximum: 10000 },
  },
  required: ["table"],
  additionalProperties: false,
} as const;

const formatSchema = {
  type: "object",
  properties: {
    style: { enum: ["number", "currency", "percent"] },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    minorUnits: { type: "boolean" },
    decimals: { type: "integer", minimum: 0, maximum: 6 },
  },
  required: ["style"],
  additionalProperties: false,
} as const;

const resultColumn = { type: "string", minLength: 1, maxLength: 130 } as const;

export const dashboardBodySchema = {
  type: "object",
  properties: {
    version: { const: DASHBOARD_VERSION },
    title: { type: "string", minLength: 1, maxLength: 100 },
    description: { type: "string", maxLength: 500 },
    filters: {
      type: "array",
      maxItems: MAX_DASHBOARD_FILTERS,
      items: {
        type: "object",
        properties: {
          name: { type: "string", pattern: NAME },
          label: { type: "string", minLength: 1, maxLength: 100 },
          type: { enum: [...DASHBOARD_FILTER_TYPES] },
          default: {},
          choices: {
            type: "array",
            maxItems: 200,
            items: { type: "string", minLength: 1, maxLength: 200 },
          },
          from: {
            type: "object",
            properties: {
              table: { type: "string", pattern: PATH, maxLength: 255 },
              column: { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$" },
            },
            required: ["table", "column"],
            additionalProperties: false,
          },
        },
        required: ["name", "type"],
        additionalProperties: false,
      },
    },
    widgets: {
      type: "array",
      maxItems: MAX_DASHBOARD_WIDGETS,
      items: {
        type: "object",
        properties: {
          id: { type: "string", pattern: SLUG },
          title: { type: "string", maxLength: 100 },
          type: { enum: [...DASHBOARD_WIDGET_TYPES] },
          width: { enum: [...WIDGET_WIDTHS] },
          source: {
            oneOf: [
              {
                type: "object",
                properties: { visual: visualSchema },
                required: ["visual"],
                additionalProperties: false,
              },
              {
                type: "object",
                properties: {
                  query: { type: "string", pattern: PATH, maxLength: 255 },
                  values: { type: "object" },
                },
                required: ["query"],
                additionalProperties: false,
              },
              {
                type: "object",
                properties: {
                  sql: { type: "string", minLength: 1, maxLength: 20000 },
                  values: { type: "array", maxItems: 20 },
                },
                required: ["sql"],
                additionalProperties: false,
              },
            ],
          },
          filters: {
            type: "array",
            maxItems: 16,
            items: {
              type: "object",
              properties: {
                filter: { type: "string", pattern: NAME },
                column: { type: "string", pattern: COLUMN },
                parameter: { type: "string", pattern: "^(\\$[0-9]{1,2}|[a-z][a-z0-9_]{0,54})$" },
                part: { enum: ["from", "to"] },
              },
              required: ["filter"],
              additionalProperties: false,
            },
          },
          options: {
            type: "object",
            properties: {
              value: resultColumn,
              format: formatSchema,
              compareTo: { type: "string", pattern: NAME },
              mark: { enum: [...DASHBOARD_CHART_MARKS] },
              x: resultColumn,
              y: {
                oneOf: [
                  resultColumn,
                  { type: "array", minItems: 1, maxItems: 6, items: resultColumn },
                ],
              },
              series: resultColumn,
              bars: { enum: ["stacked", "grouped"] },
              line: resultColumn,
              rows: { type: "array", maxItems: 3, items: resultColumn },
              columns: { type: "array", maxItems: 2, items: resultColumn },
              cell: { enum: ["sum", "avg", "min", "max", "count"] },
              totals: { type: "boolean" },
              show: { type: "array", maxItems: 50, items: resultColumn },
              text: { type: "string", maxLength: 5000 },
            },
            additionalProperties: false,
          },
        },
        required: ["id", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["version", "widgets"],
  additionalProperties: false,
} as const;

/**
 * A dashboard kept as a resource: versioned, deployed and promoted with the
 * rest of a workspace, and open to whoever may see its dashboards.
 */
export const dashboardKind: KindDefinition = {
  kind: "dashboard",
  schemaVersion: 1,
  body: dashboardBodySchema,
};

export interface DashboardIssue {
  path: string;
  message: string;
}

/** Checks a dashboard beyond what its JSON Schema can say. */
export function checkDashboard(body: DashboardBody): DashboardIssue[] {
  const issues: DashboardIssue[] = [];
  const filters = new Map((body.filters ?? []).map((filter) => [filter.name, filter]));
  if (filters.size !== (body.filters ?? []).length) {
    issues.push({ path: "/filters", message: "two filters have the same name" });
  }
  const ids = new Set<string>();
  body.widgets.forEach((widget, index) => {
    const at = `/widgets/${index}`;
    if (ids.has(widget.id))
      issues.push({ path: `${at}/id`, message: `"${widget.id}" is used twice` });
    ids.add(widget.id);
    if (widget.type === "text") {
      if (widget.source)
        issues.push({ path: `${at}/source`, message: "a text widget asks nothing" });
      return;
    }
    if (!widget.source) {
      issues.push({ path: `${at}/source`, message: `a ${widget.type} needs a query to show` });
      return;
    }
    (widget.filters ?? []).forEach((binding, bound) => {
      const where = `${at}/filters/${bound}`;
      const filter = filters.get(binding.filter);
      if (!filter) {
        issues.push({
          path: `${where}/filter`,
          message: `the dashboard has no filter "${binding.filter}"`,
        });
        return;
      }
      if ("visual" in (widget.source as object)) {
        if (!binding.column) {
          issues.push({ path: where, message: "says which column the filter narrows" });
        }
      } else if (!binding.parameter) {
        issues.push({ path: where, message: "says which parameter the filter fills" });
      } else if (filter.type === "date_range" && !binding.part) {
        issues.push({
          path: where,
          message: "a range of dates fills two parameters: say whether this is `from` or `to`",
        });
      }
    });
    const compared = widget.options?.compareTo;
    if (compared !== undefined && filters.get(compared)?.type !== "date_range") {
      issues.push({
        path: `${at}/options/compareTo`,
        message: `a figure is compared across a range of dates, and "${compared}" is not one`,
      });
    }
    const source = widget.source;
    if ("visual" in source) {
      const names = (source.visual.measures ?? []).map((measure) => measure.as);
      if (new Set(names).size !== names.length) {
        issues.push({
          path: `${at}/source/visual/measures`,
          message: "two measures have the same name",
        });
      }
      (source.visual.measures ?? []).forEach((measure, which) => {
        if (measure.fn !== "count" && !measure.column) {
          issues.push({
            path: `${at}/source/visual/measures/${which}`,
            message: `${measure.fn} is of a column`,
          });
        }
      });
    }
  });
  return issues;
}

/** The name a group has in a visual query's result: its column, and its period when it has one. */
export function groupName(group: { column: string; bucket?: string }): string {
  const base = group.column.replace(".", "_");
  return group.bucket ? `${base}_${group.bucket}` : base;
}

const SYSTEM = new Set(["id", "created_at", "updated_at"]);

/** A filter of the rows API, with literal values, as the conditions of a visual query. Anything else is left out. */
function conditionsOf(filter: unknown): VisualCondition[] {
  if (typeof filter !== "object" || filter === null) return [];
  const node = filter as Record<string, unknown>;
  if (Array.isArray(node.and)) return node.and.flatMap(conditionsOf);
  if (typeof node.column !== "string") return [];
  const op = String(node.op ?? "eq");
  if (op === "is_null") {
    return [{ column: node.column, op: node.value === false ? "not_null" : "is_null" }];
  }
  if (!(VISUAL_OPERATORS as readonly string[]).includes(op)) return [];
  return [{ column: node.column, op: op as VisualOperator, value: node.value }];
}

/**
 * A dashboard made before phase 18, which was one page of an interface, as a
 * dashboard of now. Each widget's one-table read becomes a visual query that
 * says the same. What a dashboard of now has no word for is left out: a
 * widget that followed the row chosen in another, and a card of one row.
 */
export function upgradeDashboard(page: InterfacePage, title?: string): DashboardBody {
  const pageFilters = page.filters ?? [];
  const nameOf = (id: string) => id.replace(/-/g, "_").replace(/^[^a-z]/, "f");
  const widgets: DashboardWidget[] = [];
  // By where they sat: top to bottom, then left to right.
  const ordered = [...page.widgets].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  for (const old of ordered) {
    const width = WIDGET_WIDTHS.reduce((best, one) =>
      Math.abs(one - old.at.w) < Math.abs(best - old.at.w) ? one : best,
    );
    const base = { id: old.id, ...(old.title ? { title: old.title } : {}), width };
    if (old.type === "text") {
      widgets.push({ ...base, type: "text", options: { text: old.options?.text ?? "" } });
      continue;
    }
    if (!old.table || old.type === "form" || old.type === "action" || old.link) continue;
    const visual = visualOf(old);
    const bindings: FilterBinding[] = pageFilters.map((filter) => ({
      filter: nameOf(filter.id),
      column: filter.column,
    }));
    const common = {
      ...base,
      source: { visual },
      ...(bindings.length > 0 ? { filters: bindings } : {}),
    };
    const first = old.summary?.aggregates[0]?.as;
    if (old.type === "figure") {
      widgets.push({
        ...common,
        type: "figure",
        options: {
          ...(first ? { value: first } : {}),
          ...(old.options?.format ? { format: old.options.format } : {}),
        },
      });
    } else if (old.type === "chart") {
      widgets.push({
        ...common,
        type: "chart",
        options: {
          mark: old.options?.mark ?? "bar",
          ...(old.options?.x ? { x: resultName(old, old.options.x) } : {}),
          ...(old.options?.y ? { y: resultName(old, old.options.y) } : {}),
          ...(old.options?.series ? { series: resultName(old, old.options.series) } : {}),
          ...(old.options?.format ? { format: old.options.format } : {}),
        },
      });
    } else {
      widgets.push({ ...common, type: "table" });
    }
  }
  return {
    version: DASHBOARD_VERSION,
    ...(title ? { title } : {}),
    ...(pageFilters.length > 0
      ? {
          filters: pageFilters.map((filter) => ({
            name: nameOf(filter.id),
            label: filter.label,
            type: filter.type === "date" ? ("date_range" as const) : ("text" as const),
          })),
        }
      : {}),
    widgets,
  };
}

/** What a group or a total of an old widget is called in the new query's result. */
function resultName(old: PageWidget, name: string): string {
  const group = old.summary?.groupBy.find((one) => one.column === name);
  return group ? groupName(group) : name;
}

function visualOf(old: PageWidget): VisualQuery {
  const filters = conditionsOf(old.filter);
  const sort = (old.sort ?? []).map((one) => ({
    by: resultName(old, one.column),
    ...(one.desc ? { descending: true } : {}),
  }));
  const shared = {
    table: old.table as string,
    ...(filters.length > 0 ? { filters } : {}),
    ...(sort.length > 0 ? { sort } : {}),
  };
  if (old.summary) {
    return {
      ...shared,
      ...(old.summary.groupBy.length > 0 ? { groupBy: old.summary.groupBy } : {}),
      measures: old.summary.aggregates,
    };
  }
  const columns = (old.fields ?? [])
    .map((field) => field.column)
    .filter((name) => !SYSTEM.has(name));
  return {
    ...shared,
    ...(columns.length > 0 ? { columns } : {}),
    limit: Math.min(old.pageSize ?? 100, 1000),
  };
}

/** Whether what a dashboard holds is the page of an interface, as before phase 18. */
export function isOldDashboard(body: unknown): body is InterfacePage {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { version?: unknown }).version !== DASHBOARD_VERSION &&
    Array.isArray((body as { widgets?: unknown }).widgets)
  );
}
