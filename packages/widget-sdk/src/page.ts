import type { Action, WidgetRules } from "./action.js";

/**
 * Pages of widgets, as an app's pages and a dashboard are written: types, and the names and limits
 * they are made of. The schemas and the checks are `@volvel/manifest`'s.
 */

// ---------------------------------------------------------------------------
// The query a data input asks

export const VISUAL_FUNCTIONS = ["count", "count_distinct", "sum", "avg", "min", "max"] as const;
/** One of the functions a visual query works a value out with: count, sum, average and the rest. */
export type VisualFunction = (typeof VISUAL_FUNCTIONS)[number];
/** How long the periods are when a visual query groups by a date or a time. */
export const VISUAL_BUCKETS = ["day", "week", "month", "quarter", "year"] as const;
/** One of `VISUAL_BUCKETS`. */
export type VisualBucket = (typeof VISUAL_BUCKETS)[number];
/** The comparisons a visual query's filter may make. */
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
  "last",
  "between",
] as const;
/** The units a filter of the last so many days, weeks or months counts in. */
export const LAST_UNITS = ["day", "week", "month", "quarter", "year"] as const;
/** One of `LAST_UNITS`. */
export type LastUnit = (typeof LAST_UNITS)[number];
/** The value of `last`: "in the last 30 days", counted back from today, today included. */
export interface LastValue {
  count: number;
  unit: LastUnit;
}
/** One of `VISUAL_OPERATORS`. */
export type VisualOperator = (typeof VISUAL_OPERATORS)[number];

/** A column of the query's table, or of a table it joins: `fee`, or `device.name`. */
export type VisualColumn = string;

/** One filter of a visual query: a column, a comparison and what it is compared with. */
export interface VisualCondition {
  column: VisualColumn;
  op: VisualOperator;
  /**
   * What it is compared with. Left out for `is_null` and `not_null`. For `last`, a `{ count, unit }`;
   * for `between`, `[from, to]`: two days (date or timestamp column; both days whole) or two numbers.
   */
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

/** Where a widget's data comes from: a visual query, a saved query, SQL, or the record the page was opened on. */
export type WidgetSource =
  | { visual: VisualQuery }
  | { query: string; values?: Record<string, unknown> }
  | { sql: string; values?: unknown[] }
  /** The record the page was opened on: a record page, side sheet or modal. */
  | { record: "this" }
  /** The row chosen in a table or list on the same page (its id), followed as it changes. */
  | { selected: string }
  /** The current user's own row of `table`, matched by `by` (the user's email against that column). */
  | { own: { table: string; by: string } }
  /**
   * The approval steps of the workspace's flows that wait for a decision (decision 0007):
   * those of the flows named, or of every flow with an approval step. `whose` is the ones the
   * viewer may decide ("mine", the default) or every one they may read ("all").
   */
  | { approvals: { flows?: string[]; whose?: "mine" | "all" } };

/**
 * What a condition of a query built from menus may compare with, besides a
 * constant: a column of the record the page is open on ("payments of this
 * invoice"), or who is looking. Never an expression.
 */
export type ConditionValueRef = { record: string } | { user: "id" };

/**
 * How a data input takes a page filter.
 * - For a visual query: the column the filter narrows.
 * - For a saved query or SQL: the parameter it fills. A date range fills two: `from` and `to`.
 */
export interface FilterBinding {
  filter: string;
  column?: VisualColumn;
  /** For a search over a visual query: the columns it looks in. A row is kept when any holds the words. */
  columns?: VisualColumn[];
  parameter?: string;
  part?: "from" | "to";
}

/** One data input of a widget: what it asks, and which of the page's filters narrow it (by name, as a Search and filter widget declares them). */
export interface DataInput {
  source: WidgetSource;
  filters?: FilterBinding[];
}

// ---------------------------------------------------------------------------
// Filters set by whoever reads the page

/**
 * `search` is the words typed into a search box, looked for in the columns each binding
 * names; `text` is one column's value, as typed.
 */
export const PAGE_FILTER_TYPES = ["date_range", "choice", "text", "number", "search"] as const;
/** What kind of filter a page may have: a date range, a choice, text, a number or a search. */
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
/** A range of dates given in words, such as the last thirty days. */
export type RelativeRange = (typeof RELATIVE_RANGES)[number];

/**
 * A filter whoever reads the page sets. It is declared by a Search and filter widget
 * (`config.filters` of a widget whose definition has `role: "filters"`); a page's filters
 * are those of all its filter widgets (`filtersOf`), each name once.
 */
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

/** How a number may be written: as a number, as money or as a percentage. */
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

/** How many columns the page's grid has. */
export const PAGE_COLUMNS = 12;
/** The most rows high a widget may be. */
export const MAX_WIDGET_HEIGHT = 40;
/** The most rows high a page may be. */
export const MAX_PAGE_ROWS = 400;
/** The most pages an interface may have. */
export const MAX_PAGES = 20;
/** The most widgets a page may hold. */
export const MAX_PAGE_WIDGETS = 30;
/** The most filters a page may have. */
export const MAX_PAGE_FILTERS = 8;
/** The rows a container's heading takes on the page's grid, above the grid of what it holds. */

/** How a widget is placed on smaller screens. */
export interface WidgetLayout {
  tablet?: { at: WidgetPlace };
  phone?: { at: WidgetPlace };
  narrow?: "keep" | "full" | "stack" | "hide";
  priority?: number;
}

/** Where a widget held by a container is: the container, and for one with tabs, the tab. */
export interface WidgetIn {
  widget: string;
  tab?: string;
}

/** A widget as a page keeps it: its type, where it sits, what it reads and its settings. */
export interface PageWidget {
  /** Unique on its page. */
  id: string;
  /** `pack/name`, from a registered pack. */
  type: string;
  /** For a widget of the tenant's own (`x/<name>`): the version it was placed with. */
  version?: string;
  title?: string;
  /** A line under the title: what the numbers are, or what to notice. */
  subtitle?: string;
  at: WidgetPlace;
  /** Each data input the definition declares, by its name. */
  data?: Record<string, DataInput>;
  /** Checked against the definition's schema. */
  config?: Record<string, unknown>;
  /** What happens on each event the definition declares (phase 26). */
  on?: Record<string, Action>;
  /** When it is shown. Only what is drawn: never what someone may read or do. */
  rules?: WidgetRules;
  /**
   * On smaller screens (phase 28, board 9): tablet and phone each automatic (made from the
   * desktop) or placed by hand; on narrow screens full width, stacked, or hidden; and a priority,
   * higher kept nearer the top when the page stacks.
   */
  layout?: WidgetLayout;
  /**
   * The container it is placed in (a Section, or a tab of Tabs), when it is in one. Its `at`
   * is then on the container's own grid of twelve columns. One level: a container is never in one.
   */
  in?: WidgetIn;
}

/**
 * - `page`: a page of the app, in its menu;
 * - `record`: a page of its own, opened on one record (its address names the record);
 * - `sheet`: opened beside the page it was opened from, on one record, which stays in view;
 * - `modal`: opened over the page it was opened from, on one record or none (a form to fill).
 */
export const PAGE_KINDS = ["page", "record", "sheet", "modal"] as const;
/** How big a side sheet or a modal opens: its width, and for a modal its most height too. */
export const PAGE_SIZES = ["small", "medium", "large", "xlarge", "full"] as const;
/** How wide a side sheet or a modal is. */
export type PageSize = (typeof PAGE_SIZES)[number];
/** What a page is: a page of its own, a record page, a side sheet or a modal. */
export type PageKind = (typeof PAGE_KINDS)[number];

/** One page of an interface or a dashboard: its widgets, its filters and where it is opened. */
export interface Page {
  id: string;
  title: string;
  /** Left out: `page`. */
  kind?: PageKind;
  /**
   * For a record page, a side sheet or a modal: the table of the record it is opened on.
   * A modal may have none, when it opens on nothing (a form that makes a new row).
   */
  record?: { table: string };
  /** The topic of the workspace documentation's page that is this page's help. */
  help?: string;
  /** For a side sheet or a modal: how big it opens. Left out, `medium`. */
  size?: PageSize;
  /** The icon beside it in the app's menu, from the kit's set, by name. */
  icon?: string;
  /** Every widget of the page, those placed in a container too (they say so with `in`). */
  widgets: PageWidget[];
}

/** The body of an `interface`: an app's pages. */
export interface InterfaceBody {
  title: string;
  description?: string;
  pages: Page[];
}

/** How often a dashboard may refresh itself, in minutes, or off. */
export const DASHBOARD_REFRESH = ["off", 1, 5, 15, 60] as const;
/** One of `DASHBOARD_REFRESH`. */
export type DashboardRefresh = (typeof DASHBOARD_REFRESH)[number];
/** How often a dashboard refreshes when nobody has said. */
export const DEFAULT_DASHBOARD_REFRESH: DashboardRefresh = 5;

/** The body of a `dashboard`, and what a member's own dashboard holds: one page that reads. */
export interface DashboardBody {
  title?: string;
  description?: string;
  /** How often its widgets ask again while it is on show, in minutes, or `off`. Default 5. */
  refresh?: DashboardRefresh;
  widgets: PageWidget[];
}
