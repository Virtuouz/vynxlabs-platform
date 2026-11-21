import { type WidgetDefinition, WidgetRegistry } from "@volvel/widgets";
import { CORE_WIDGETS } from "@volvel/widgets-core";
import { LABS_WIDGETS } from "@volvel/widgets-labs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { KindDefinition, ManifestIssue } from "./registry.js";
import type { TableBody } from "./table.js";

/**
 * Pages of widgets: what an app made in the console is, and what a dashboard
 * is (S9, decision 0006). An `interface` holds pages; a `dashboard` is one
 * page whose widgets only read.
 *
 * A widget names its `type` from a pack (`core/chart`), and holds:
 * - `data`: each data input its definition declares, as a query (a table read
 *   from menus, a saved query, or SQL on a dashboard), and the page filters
 *   that narrow it. The platform reads it on the server, from the stored page.
 * - `config`: everything else, checked against its definition's schema.
 * - `at`: where it is on the page's twelve columns.
 */

/** Every table has these, as `kinds.ts` says; repeated here so this file is not part of a cycle. */
const SYSTEM_COLUMNS = ["id", "created_at", "updated_at"] as const;

// ---------------------------------------------------------------------------
// The query a data input asks

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

/** A column of the query's table, or of a table it joins: `fee`, or `device.name`. */
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
  /** References of that table to follow, by the column that holds each. */
  joins?: string[];
  /** Conditions every row must meet ("Only include"). */
  filters?: VisualCondition[];
  /** The breakdowns: what rows are gathered by. A date or a time can be gathered into periods. */
  groupBy?: { column: VisualColumn; bucket?: VisualBucket }[];
  /** The values: what is worked out for each group, or for all the rows when there are no groups. */
  measures?: { fn: VisualFunction; column?: VisualColumn; as: string }[];
  /** Without groups or measures: the columns read. Left out, every column of the table. */
  columns?: VisualColumn[];
  /** By a column read, a group, or a measure's name. */
  sort?: { by: string; descending?: boolean }[];
  limit?: number;
}

export type WidgetSource =
  | { visual: VisualQuery }
  | { query: string; values?: Record<string, unknown> }
  | { sql: string; values?: unknown[] };

/**
 * How a data input takes a page filter.
 * - For a visual query: the column the filter narrows.
 * - For a saved query or SQL: the parameter it fills. A date range fills two: `from` and `to`.
 */
export interface FilterBinding {
  filter: string;
  column?: VisualColumn;
  parameter?: string;
  part?: "from" | "to";
}

/** One data input of a widget: what it asks, and which of the page's filters narrow it. */
export interface DataInput {
  source: WidgetSource;
  filters?: FilterBinding[];
}

// ---------------------------------------------------------------------------
// Filters set by whoever reads the page

export const PAGE_FILTER_TYPES = ["date_range", "choice", "text", "number"] as const;
export type PageFilterType = (typeof PAGE_FILTER_TYPES)[number];

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

export interface PageFilter {
  /** What data inputs refer to it by. */
  name: string;
  label?: string;
  type: PageFilterType;
  /**
   * What it is when nobody has set it: for a date range one of `RELATIVE_RANGES`
   * or `{ from, to }` (both days included); for the others a value. Left out, it narrows nothing.
   */
  default?: unknown;
  /** For a choice: the values offered. Left out with `from`, they are read from the table. */
  choices?: string[];
  /** For a choice: the table and column whose values are offered. */
  from?: { table: string; column: string };
}

// ---------------------------------------------------------------------------
// Widgets and pages

export const VALUE_FORMAT_STYLES = ["number", "currency", "percent"] as const;

/** How a number is written. Money kept in cents is shown with `minorUnits`. */
export interface ValueFormat {
  style: (typeof VALUE_FORMAT_STYLES)[number];
  /** ISO 4217, for `currency`. Default `USD`. */
  currency?: string;
  minorUnits?: boolean;
  decimals?: number;
}

/** Where a widget is on the page's twelve columns, in cells. A row is 40 pixels and the gap 12. */
export interface WidgetPlace {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PAGE_COLUMNS = 12;
export const MAX_WIDGET_HEIGHT = 40;
export const MAX_PAGE_ROWS = 400;
export const MAX_PAGES = 20;
export const MAX_PAGE_WIDGETS = 30;
export const MAX_PAGE_FILTERS = 8;

export interface PageWidget {
  /** Unique on its page. */
  id: string;
  /** `pack/name`, from a registered pack. */
  type: string;
  title?: string;
  /** A line under the title: what the numbers are, or what to notice. */
  subtitle?: string;
  at: WidgetPlace;
  /** Each data input the definition declares, by its name. */
  data?: Record<string, DataInput>;
  /** Checked against the definition's schema. */
  config?: Record<string, unknown>;
}

/** Only `page` is drawn in phase 25; `record`, `sheet` and `modal` open on one record from phase 26. */
export const PAGE_KINDS = ["page"] as const;

export interface Page {
  id: string;
  title: string;
  kind?: (typeof PAGE_KINDS)[number];
  /** The topic of the workspace documentation's page that is this page's help. */
  help?: string;
  filters?: PageFilter[];
  widgets: PageWidget[];
}

/** The body of an `interface`: an app's pages. */
export interface InterfaceBody {
  title: string;
  description?: string;
  pages: Page[];
}

export const DASHBOARD_REFRESH = ["off", 1, 5, 15, 60] as const;
export type DashboardRefresh = (typeof DASHBOARD_REFRESH)[number];
export const DEFAULT_DASHBOARD_REFRESH: DashboardRefresh = 5;

/** The body of a `dashboard`, and what a member's own dashboard holds: one page that reads. */
export interface DashboardBody {
  title?: string;
  description?: string;
  /** How often its widgets ask again while it is on show, in minutes, or `off`. Default 5. */
  refresh?: DashboardRefresh;
  filters?: PageFilter[];
  widgets: PageWidget[];
}

// ---------------------------------------------------------------------------
// Schemas

const NAME = "^[a-z][a-z0-9_]{0,54}$";
const SLUG = "^[a-z][a-z0-9_-]{0,39}$";
const COLUMN = "^[a-z][a-z0-9_]{0,62}(\\.[a-z][a-z0-9_]{0,62})?$";
const PATH = "^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$";
const TYPE = "^[a-z][a-z0-9-]{0,30}/[a-z][a-z0-9-]{0,40}$";

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

const sourceSchema = {
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
} as const;

const dataInputSchema = {
  type: "object",
  properties: {
    source: sourceSchema,
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
  },
  required: ["source"],
  additionalProperties: false,
} as const;

export const pageFilterSchema = {
  type: "object",
  properties: {
    name: { type: "string", pattern: NAME },
    label: { type: "string", minLength: 1, maxLength: 100 },
    type: { enum: [...PAGE_FILTER_TYPES] },
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
} as const;

export const pageWidgetSchema = {
  type: "object",
  properties: {
    id: { type: "string", pattern: SLUG },
    type: { type: "string", pattern: TYPE },
    title: { type: "string", maxLength: 100 },
    subtitle: { type: "string", maxLength: 200 },
    at: {
      type: "object",
      properties: {
        x: { type: "integer", minimum: 0, maximum: PAGE_COLUMNS - 1 },
        y: { type: "integer", minimum: 0, maximum: MAX_PAGE_ROWS - 1 },
        w: { type: "integer", minimum: 1, maximum: PAGE_COLUMNS },
        h: { type: "integer", minimum: 1, maximum: MAX_WIDGET_HEIGHT },
      },
      required: ["x", "y", "w", "h"],
      additionalProperties: false,
    },
    data: {
      type: "object",
      maxProperties: 4,
      propertyNames: { pattern: "^[a-z][a-zA-Z0-9]{0,40}$" },
      additionalProperties: dataInputSchema,
    },
    config: { type: "object" },
  },
  required: ["id", "type", "at"],
  additionalProperties: false,
} as const;

const filtersSchema = {
  type: "array",
  maxItems: MAX_PAGE_FILTERS,
  items: pageFilterSchema,
} as const;
const widgetsSchema = {
  type: "array",
  maxItems: MAX_PAGE_WIDGETS,
  items: pageWidgetSchema,
} as const;

export const pageSchema = {
  type: "object",
  properties: {
    id: { type: "string", pattern: SLUG },
    title: { type: "string", minLength: 1, maxLength: 100 },
    kind: { enum: [...PAGE_KINDS] },
    help: { type: "string", minLength: 1, maxLength: 255 },
    filters: filtersSchema,
    widgets: widgetsSchema,
  },
  required: ["id", "title", "widgets"],
  additionalProperties: false,
} as const;

export const interfaceBodySchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100 },
    description: { type: "string", maxLength: 500 },
    pages: { type: "array", minItems: 1, maxItems: MAX_PAGES, items: pageSchema },
  },
  required: ["title", "pages"],
  additionalProperties: false,
} as const;

export const dashboardBodySchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1, maxLength: 100 },
    description: { type: "string", maxLength: 500 },
    refresh: { enum: [...DASHBOARD_REFRESH] },
    filters: filtersSchema,
    widgets: widgetsSchema,
  },
  required: ["widgets"],
  additionalProperties: false,
} as const;

/** Pages built in the console with no code, served by an app that names the interface. */
export const interfaceKind: KindDefinition = {
  kind: "interface",
  schemaVersion: 2,
  body: interfaceBodySchema,
};

/** A dashboard kept as a resource: versioned, deployed and promoted with the rest of a workspace. */
export const dashboardKind: KindDefinition = {
  kind: "dashboard",
  schemaVersion: 3,
  body: dashboardBodySchema,
};

// ---------------------------------------------------------------------------
// Checks beyond the schema

/** The widgets the platform knows: the core pack and the platform's other packs (labs). */
const platformPacks = (): WidgetRegistry => new WidgetRegistry([...CORE_WIDGETS, ...LABS_WIDGETS]);
let platformWidgets: WidgetRegistry = platformPacks();

/** The registry pages are checked against. A pack the platform ships is added once, at start. */
export function widgetRegistry(): WidgetRegistry {
  return platformWidgets;
}

/** Adds a pack's definitions to the registry pages are checked against. */
export function registerWidgets(definitions: Iterable<WidgetDefinition>): void {
  for (const definition of definitions) {
    if (!platformWidgets.get(definition.type)) platformWidgets.add(definition);
  }
}

/** For tests: back to the platform's packs alone. */
export function resetWidgets(): void {
  platformWidgets = platformPacks();
}

const configAjv = new Ajv2020({ allErrors: true, strict: false });
configAjv.addKeyword("x-volvel");
const configCheckers = new WeakMap<WidgetDefinition, ReturnType<typeof configAjv.compile>>();
function configChecker(definition: WidgetDefinition) {
  let check = configCheckers.get(definition);
  if (!check) {
    check = configAjv.compile(definition.config);
    configCheckers.set(definition, check);
  }
  return check;
}

/** The name a group has in a visual query's result: its column, and its period when it has one. */
export function groupName(group: { column: string; bucket?: string }): string {
  const base = group.column.replace(".", "_");
  return group.bucket ? `${base}_${group.bucket}` : base;
}

/** Every table a data input reads from menus. A saved query or SQL names its own. */
export function inputTables(input: DataInput): string[] {
  return "visual" in input.source ? [input.source.visual.table] : [];
}

/** Every table the widgets read from menus. */
export function widgetTables(widgets: readonly PageWidget[]): string[] {
  return [
    ...new Set(widgets.flatMap((widget) => Object.values(widget.data ?? {}).flatMap(inputTables))),
  ];
}

/** Every table an interface's pages read from menus. */
export function interfaceTables(body: InterfaceBody): string[] {
  return widgetTables(body.pages.flatMap((page) => page.widgets));
}

/** Every saved query a set of widgets reads. */
export function widgetQueries(widgets: readonly PageWidget[]): string[] {
  return [
    ...new Set(
      widgets.flatMap((widget) =>
        Object.values(widget.data ?? {}).flatMap((input) =>
          "query" in input.source ? [input.source.query] : [],
        ),
      ),
    ),
  ];
}

export interface CheckContext {
  /** Where the page is offered: an app's, or a dashboard's. */
  surface: "app" | "dashboard";
  /** A table's definition, when it is known. A table made in the console is in no bundle, and is not checked. */
  tableOf?: (path: string) => TableBody | undefined;
  registry?: WidgetRegistry;
}

/**
 * What is wrong with a page's widgets and filters that their shape alone does
 * not show: a type no pack declares, a widget offered elsewhere, a
 * configuration its definition refuses, a data input missing or extra, a
 * filter that isn't there, a column a known table doesn't have.
 */
export function checkWidgets(
  widgets: readonly PageWidget[],
  filters: readonly PageFilter[],
  context: CheckContext,
  at = "/body",
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const registry = context.registry ?? platformWidgets;
  const byName = new Map(filters.map((filter) => [filter.name, filter]));
  if (byName.size !== filters.length)
    issues.push({ path: `${at}/filters`, message: "two filters have the same name" });

  const columnType = (table: string, column: string): string | null | undefined => {
    const known = context.tableOf?.(table);
    if (!known) return null;
    if ((SYSTEM_COLUMNS as readonly string[]).includes(column))
      return column === "id" ? "uuid" : "timestamp";
    if (column.includes(".")) return null; // a joined table's column is checked when the query is compiled
    return known.columns[column]?.type;
  };

  const ids = new Set<string>();
  widgets.forEach((widget, index) => {
    const here = `${at}/widgets/${index}`;
    const say = (path: string, message: string) => issues.push({ path: `${here}${path}`, message });
    if (ids.has(widget.id)) say("/id", `"${widget.id}" is used twice`);
    ids.add(widget.id);
    if (widget.at.x + widget.at.w > PAGE_COLUMNS) {
      say(
        "/at",
        `it starts at column ${widget.at.x + 1} and is ${widget.at.w} wide, which is past the twelfth`,
      );
    }

    const definition = registry.get(widget.type);
    if (!definition) {
      say("/type", `there is no widget called "${widget.type}"`);
      return;
    }
    if (!definition.surfaces.includes(context.surface)) {
      say(
        "/type",
        `${definition.title} can't be used on ${context.surface === "app" ? "an app's page" : "a dashboard"}`,
      );
    }
    const { min, max } = definition.layout;
    if (widget.at.w < min.w || widget.at.h < min.h) {
      say("/at", `${definition.title} is at least ${min.w} wide and ${min.h} high`);
    }
    if (max && (widget.at.w > max.w || widget.at.h > max.h)) {
      say("/at", `${definition.title} is at most ${max.w} wide and ${max.h} high`);
    }

    const check = configChecker(definition);
    if (!check(widget.config ?? {})) {
      for (const error of check.errors ?? []) {
        say(`/config${error.instancePath}`, error.message ?? "is not allowed");
      }
    }

    const data = widget.data ?? {};
    for (const name of Object.keys(data)) {
      if (!(name in definition.data))
        say(`/data/${name}`, `${definition.title} takes no data called "${name}"`);
    }
    for (const [name, declared] of Object.entries(definition.data)) {
      const input = data[name];
      const where = `/data/${name}`;
      if (!input) {
        if (declared.required !== false)
          say(where, `${definition.title} needs ${declared.label ?? "a source"} to show`);
        continue;
      }
      const source = input.source;
      const kind = "visual" in source ? "table" : "query" in source ? "query" : "sql";
      const allowed = declared.sources ?? ["table", "query", "sql"];
      if (!allowed.includes(kind) || (kind === "sql" && context.surface === "app")) {
        say(
          `${where}/source`,
          kind === "sql"
            ? "SQL is written on dashboards, not on an app's page"
            : `${definition.title} can't read a ${kind}`,
        );
      }
      if ("visual" in source) {
        const visual = source.visual;
        const measures = visual.measures ?? [];
        const groups = visual.groupBy ?? [];
        if (declared.shape === "summary") {
          const values = declared.values ?? { min: 1, max: 1 };
          const breakdowns = declared.breakdowns ?? { min: 0, max: 1 };
          if (measures.length < values.min || measures.length > values.max) {
            say(
              `${where}/source/visual/measures`,
              values.min === values.max
                ? `works out ${values.min === 1 ? "one value" : `${values.min} values`}`
                : `works out ${values.min} to ${values.max} values`,
            );
          }
          if (groups.length < breakdowns.min || groups.length > breakdowns.max) {
            say(
              `${where}/source/visual/groupBy`,
              breakdowns.max === 0
                ? "isn't broken down"
                : `is broken down ${breakdowns.min === breakdowns.max ? `${breakdowns.min}` : `${breakdowns.min} to ${breakdowns.max}`} way${breakdowns.max === 1 ? "" : "s"}`,
            );
          }
        } else if (measures.length > 0 && declared.shape === "record") {
          say(`${where}/source/visual/measures`, "one record has no values worked out");
        }
        const names = measures.map((measure) => measure.as);
        if (new Set(names).size !== names.length)
          say(`${where}/source/visual/measures`, "two values have the same name");
        measures.forEach((measure, which) => {
          if (measure.fn !== "count" && !measure.column) {
            say(`${where}/source/visual/measures/${which}`, `${measure.fn} is of a column`);
          }
        });
        const table = visual.table;
        const known = (path: string, column: string) => {
          if (columnType(table, column) === undefined)
            say(path, `there is no column "${column}" in the table "${table}"`);
        };
        for (const [which, measure] of measures.entries()) {
          if (measure.column)
            known(`${where}/source/visual/measures/${which}/column`, measure.column);
        }
        for (const [which, group] of groups.entries()) {
          known(`${where}/source/visual/groupBy/${which}/column`, group.column);
        }
        for (const [which, condition] of (visual.filters ?? []).entries()) {
          known(`${where}/source/visual/filters/${which}/column`, condition.column);
        }
        for (const [which, column] of (visual.columns ?? []).entries()) {
          known(`${where}/source/visual/columns/${which}`, column);
        }
      }
      (input.filters ?? []).forEach((binding, bound) => {
        const path = `${where}/filters/${bound}`;
        const filter = byName.get(binding.filter);
        if (!filter) {
          say(`${path}/filter`, `the page has no filter "${binding.filter}"`);
          return;
        }
        if ("visual" in source) {
          if (!binding.column) say(path, "says which column the filter narrows");
          else known2(path, source.visual.table, binding.column);
        } else if (!binding.parameter) {
          say(path, "says which parameter the filter fills");
        } else if (filter.type === "date_range" && !binding.part) {
          say(path, "a range of dates fills two parameters: say whether this is `from` or `to`");
        }
      });
    }
    const compared = widget.config?.compareTo;
    if (typeof compared === "string" && byName.get(compared)?.type !== "date_range") {
      say("/config/compareTo", `is compared across a range of dates, and "${compared}" is not one`);
    }

    function known2(path: string, table: string, column: string) {
      if (columnType(table, column) === undefined)
        say(`${path}/column`, `there is no column "${column}" in the table "${table}"`);
    }
  });
  return issues;
}

/** Checks an interface's pages beyond their schema. */
export function checkInterface(
  body: InterfaceBody,
  tableOf?: (path: string) => TableBody | undefined,
  registry?: WidgetRegistry,
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const seen = new Set<string>();
  body.pages.forEach((page, index) => {
    if (seen.has(page.id))
      issues.push({ path: `/body/pages/${index}/id`, message: `"${page.id}" is used twice` });
    seen.add(page.id);
    issues.push(
      ...checkWidgets(
        page.widgets,
        page.filters ?? [],
        { surface: "app", ...(tableOf ? { tableOf } : {}), ...(registry ? { registry } : {}) },
        `/body/pages/${index}`,
      ),
    );
  });
  return issues;
}

/** Checks a dashboard beyond its schema. */
export function checkDashboard(
  body: DashboardBody,
  tableOf?: (path: string) => TableBody | undefined,
  registry?: WidgetRegistry,
): ManifestIssue[] {
  return checkWidgets(body.widgets, body.filters ?? [], {
    surface: "dashboard",
    ...(tableOf ? { tableOf } : {}),
    ...(registry ? { registry } : {}),
  });
}

/**
 * A widget of `type` as "Add to page" places it: the definition's default
 * size and configuration, below everything else on the page.
 */
export function newWidget(
  definition: WidgetDefinition,
  id: string,
  below: readonly PageWidget[],
): PageWidget {
  const y = below.reduce((low, widget) => Math.max(low, widget.at.y + widget.at.h), 0);
  return {
    id,
    type: definition.type,
    title: definition.title,
    at: { x: 0, y, w: definition.layout.default.w, h: definition.layout.default.h },
    ...(definition.defaults ? { config: { ...definition.defaults } } : {}),
  };
}
