/**
 * The widget contract (decision 0005, S9).
 *
 * A widget is two halves kept apart:
 *
 * - a **definition**: data, with no browser code, which the manifest, the CLI
 *   and the control plane read to check a page and to draw the builder's
 *   inspector and "Add to page";
 * - a **view**: a component that is given its configuration, the data the
 *   platform read for it under the viewer's permissions, and a way to raise
 *   the events its definition declares. Nothing else.
 *
 * The platform's own widgets are a pack (`core/…`) written against exactly
 * this. A widget that needs more than the contract offers is answered by the
 * contract growing, for every widget.
 */

import { readerLocale, usableLocale } from "./locale.js";

/** Where a widget is offered. A dashboard only reads. */
export const SURFACES = ["app", "dashboard"] as const;
export type Surface = (typeof SURFACES)[number];

/** What a widget is for, which is how "Add to page" groups widgets. */
export const CATEGORIES = ["records", "action", "understand", "organize", "content"] as const;
export type Category = (typeof CATEGORIES)[number];

/** What "Add to page" calls each category. */
export const CATEGORY_TITLES: Record<Category, string> = {
  records: "Work with records",
  action: "Take action",
  understand: "Understand data",
  organize: "Organize",
  content: "Content",
};

/**
 * The shape of data a widget takes, read for it by the platform:
 *
 * - `rows`: rows of a table or a query, a page at a time;
 * - `summary`: rows gathered into groups with values worked out for each
 *   (a total, a count, an average), or one line of values with no groups;
 * - `record`: one row;
 * - `approvals`: the steps of the workspace's flows that wait for someone's decision (a
 *   widget that reads this is read for a member only, by `approval:read`, and decides by its
 *   own route: decision 0007).
 */
export const DATA_SHAPES = ["rows", "summary", "record", "approvals"] as const;
export type DataShape = (typeof DATA_SHAPES)[number];

/** Where a data input may come from. SQL is never offered on an app's page. */
export const SOURCE_KINDS = ["table", "query", "sql", "approvals"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface DataInputDeclaration {
  shape: DataShape;
  /** What the inspector calls it when a widget has more than one. Left out: "Source". */
  label?: string;
  /** A widget can't draw without it. Default true. */
  required?: boolean;
  /** Where it may come from. Default: table and query, and SQL on a dashboard. */
  sources?: readonly SourceKind[];
  /** For a summary: how many values it may work out. Default 1 to 1. */
  values?: { min: number; max: number };
  /** For a summary: how many ways it may be broken down. Default 0 to 1. */
  breakdowns?: { min: number; max: number };
}

/**
 * What an event gives the page when it is raised:
 * - `record`: a row, by its id (a table's row clicked);
 * - `group`: the values of a group's breakdown (a bar or a point clicked);
 * - `nothing`.
 */
export const EVENT_GIVES = ["record", "group", "nothing"] as const;
export type EventGives = (typeof EVENT_GIVES)[number];

export interface EventDeclaration {
  gives: EventGives;
  /** Said in the Actions tab: "When a row is clicked". */
  label: string;
}

/** Sizes in the page's grid: twelve columns, rows of 40 pixels. */
export interface CellSize {
  w: number;
  h: number;
}

/**
 * What a widget does on a narrow screen when nobody has said:
 * - `stack`: full width, in reading order;
 * - `list`: as `stack`, drawn by its view as a list (a table as rows of cards);
 * - `hide`: not shown on phones.
 */
export const PHONE_BEHAVIOURS = ["stack", "list", "hide"] as const;
export type PhoneBehaviour = (typeof PHONE_BEHAVIOURS)[number];

export interface LayoutDeclaration {
  min: CellSize;
  default: CellSize;
  max?: CellSize;
  phone?: PhoneBehaviour;
  /**
   * How the page frames it: `card` (the default) draws it on a card with its title; `none`
   * draws it on the page as it is, as a button stands (its title only while it is renamed).
   */
  frame?: "card" | "none";
}

/** The inspector's tabs, in order. */
export const TABS = ["data", "display", "actions", "rules"] as const;
export type Tab = (typeof TABS)[number];

export const TAB_TITLES: Record<Tab, string> = {
  data: "Data",
  display: "Display",
  actions: "Actions",
  rules: "Rules",
};

/**
 * The controls the inspector draws a setting with. A widget names one; it
 * can't bring its own. Most are drawn for a property of `config`; the data
 * controls (`measure`, `breakdown`, `columns`, `conditions`) are drawn for a
 * data input, named by `of`.
 */
export const CONTROLS = [
  // a property of config
  "text",
  "markdown",
  "number",
  "switch",
  "choice",
  "segmented",
  "format",
  "column",
  "columns",
  /** One of the page's filters, chosen by name: a figure is compared across a range of dates. */
  "filter",
  /** An action: steps run when the widget is used (a button's). Edited in the Actions tab. */
  "action",
  /** A list of labelled actions, each with when it may be pressed (a table's row actions). */
  "actions",
  /** A page of the interface, chosen by name. */
  "page",
  /** A container's tabs, in order, each with its title (Tabs'). */
  "tabs",
  /** The filters whoever reads the page sets, each with its type and what it offers (Search and filter's). */
  "pageFilters",
  /** Where it sits in its own cell: a 3 × 3 grid of positions (a button's, an action group's). */
  "position",
  /** One of a few choices drawn as tiles to choose by looking (a button's style, a chart's type, a text's callout). */
  "tiles",
  /** Columns placed into named places on a sample row (a list's title, line under it, right, badge, picture). */
  "slots",
  /** An icon from the kit's set, by name. */
  "icon",
  /** Groups of people, by path (who may run an action, who sees a widget). */
  "groups",
  /** Fields of a table, in order, each with its label and help (a form's, a record detail's). */
  "fields",
  /** The column a list's or a table's rows are kept together by. */
  "groupRows",
  // a data input's parts
  "source",
  "measure",
  "breakdown",
  "conditions",
  "sort",
  "limit",
] as const;
export type Control = (typeof CONTROLS)[number];

/** How the inspector draws one setting. Kept on a config property as `x-volvel`. */
export interface InspectorHint {
  tab: Tab;
  /**
   * The group of rows it is drawn in, in its tab (board 8: "Rows it uses", "What it shows",
   * "Look", "Compare"). Rows of a group are drawn together, under its name, in `order`.
   */
  group?: string;
  /** `main` is shown at once; `more` under "More … options", one level and no deeper. */
  level?: "main" | "more";
  control: Control;
  label: string;
  help?: string;
  /** For a column or a data control: which data input it belongs to. */
  of?: string;
  /** For a column: only columns of these types are offered. */
  types?: readonly string[];
  /** For `choice` and `segmented`: what each value is called. */
  choices?: Record<string, string>;
  /** Only shown when other properties of config have these values. Equality; a list is any of its values, and `null` in it is the property left unset. */
  when?: Record<string, unknown>;
  /** Where it is in its tab, lower first. */
  order?: number;
}

/** A data input's controls, drawn in the Data tab in this order. */
export interface DataHints {
  of: string;
  controls: readonly {
    control: Extract<Control, "source" | "measure" | "breakdown" | "conditions" | "sort" | "limit">;
    level?: "main" | "more";
    label: string;
    help?: string;
  }[];
}

/** A JSON Schema object for a widget's configuration, with an `x-volvel` hint on each property. */
export interface ConfigSchema {
  type: "object";
  properties: Record<string, Record<string, unknown> & { "x-volvel"?: InspectorHint }>;
  required?: readonly string[];
  additionalProperties?: false;
}

export interface WidgetDefinition {
  /** `pack/name`: `core/chart`. The pack `core` is the platform's, and `labs` its trials. */
  type: string;
  /** Semver. A page names a type; a deploy pins the version it was checked against. */
  version: string;
  title: string;
  /** One line, said in "Add to page": "A trend or a comparison". */
  description: string;
  category: Category;
  /**
   * The name of an icon from the kit's set: the names of the platform's widgets, the page icons
   * (`PAGE_ICONS` in `@volvel/ui`) and `globe`, `radio` and `table-2`. The builder draws any
   * other name as a puzzle piece.
   */
  icon: string;
  surfaces: readonly Surface[];
  data: Readonly<Record<string, DataInputDeclaration>>;
  /** The Data tab's controls for each input, in order. */
  dataHints?: readonly DataHints[];
  config: ConfigSchema;
  /** What the widget is when it is added, before anyone changes it. */
  defaults?: Readonly<Record<string, unknown>>;
  /**
   * The data inputs it is added with, by name, as a page stores them (`{ source: … }`), for a
   * widget whose source needs no choosing: Approvals reads the workspace's approvals.
   */
  initialData?: Readonly<Record<string, { source: unknown }>>;
  events: Readonly<Record<string, EventDeclaration>>;
  layout: LayoutDeclaration;
  /**
   * What the platform gives it beyond its data (the `core` pack only):
   * - `container`: other widgets of the page are placed in it, on its own grid of twelve
   *   columns, one level deep. A container with a `tabs` config holds them by tab.
   * - `filters`: its `config.filters` are filters whoever reads the page sets; the page's
   *   widgets are narrowed by them. Its view is given `filters`.
   */
  role?: WidgetRole;
}

export const WIDGET_ROLES = ["container", "filters"] as const;
export type WidgetRole = (typeof WIDGET_ROLES)[number];

const TYPE = /^[a-z][a-z0-9-]{0,30}\/[a-z][a-z0-9-]{0,40}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const NAME = /^[a-z][a-zA-Z0-9]{0,40}$/;

/** What is wrong with a definition, as sentences; empty when nothing is. */
export function definitionProblems(definition: WidgetDefinition): string[] {
  const problems: string[] = [];
  const say = (message: string) => problems.push(`${definition.type}: ${message}`);
  if (!TYPE.test(definition.type)) say(`a type is "pack/name" in small letters`);
  if (!VERSION.test(definition.version)) say(`version "${definition.version}" is not x.y.z`);
  if (!CATEGORIES.includes(definition.category))
    say(`there is no category "${definition.category}"`);
  if (definition.surfaces.length === 0) say("it is offered nowhere: give it a surface");
  if (definition.role !== undefined) {
    if (!WIDGET_ROLES.includes(definition.role)) say(`there is no role "${definition.role}"`);
    else if (!definition.type.startsWith("core/"))
      say("only the platform's own widgets hold other widgets or set the page's filters");
  }
  for (const name of Object.keys(definition.data)) {
    if (!NAME.test(name)) say(`data input "${name}" is not a name`);
  }
  for (const name of Object.keys(definition.events)) {
    if (!NAME.test(name)) say(`event "${name}" is not a name`);
  }
  const { min, default: size, max } = definition.layout;
  const fits = (s: CellSize) => s.w >= 1 && s.w <= 12 && s.h >= 1 && s.h <= 40;
  if (!fits(min) || !fits(size) || (max && !fits(max))) say("sizes are 1–12 wide and 1–40 high");
  if (size.w < min.w || size.h < min.h) say("its default size is smaller than its smallest");
  if (max && (size.w > max.w || size.h > max.h)) say("its default size is larger than its largest");
  for (const [property, schema] of Object.entries(definition.config.properties)) {
    const hint = schema["x-volvel"];
    if (!hint) {
      say(`config "${property}" has no x-volvel hint, so the inspector can't draw it`);
      continue;
    }
    if (!CONTROLS.includes(hint.control))
      say(`config "${property}": there is no control "${hint.control}"`);
    if (!TABS.includes(hint.tab)) say(`config "${property}": there is no tab "${hint.tab}"`);
    if (hint.of !== undefined && !(hint.of in definition.data)) {
      say(`config "${property}" belongs to data input "${hint.of}", which it doesn't declare`);
    }
  }
  for (const hints of definition.dataHints ?? []) {
    if (!(hints.of in definition.data))
      say(`data hints for "${hints.of}", which it doesn't declare`);
  }
  return problems;
}

/** Declares a widget. Throws when the definition is wrong, so a pack fails when it is built, not when a page is drawn. */
export function defineWidget<const D extends WidgetDefinition>(definition: D): D {
  const problems = definitionProblems(definition);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return definition;
}

/** A set of widget definitions, by type. */
export class WidgetRegistry {
  readonly #byType = new Map<string, WidgetDefinition>();

  constructor(definitions: Iterable<WidgetDefinition> = []) {
    for (const definition of definitions) this.add(definition);
  }

  /** Adds a definition. Two of one type is a mistake, never a replacement. */
  add(definition: WidgetDefinition): this {
    if (this.#byType.has(definition.type)) {
      throw new Error(`${definition.type} is declared twice`);
    }
    this.#byType.set(definition.type, definition);
    return this;
  }

  get(type: string): WidgetDefinition | undefined {
    return this.#byType.get(type);
  }

  /** In the order they were added; offered on `surface` when one is given. */
  list(surface?: Surface): WidgetDefinition[] {
    const all = [...this.#byType.values()];
    return surface ? all.filter((definition) => definition.surfaces.includes(surface)) : all;
  }

  /** The pack a type comes from: `core` for `core/chart`. */
  static packOf(type: string): string {
    return type.split("/")[0] ?? "";
  }
}

// ---------------------------------------------------------------------------
// What a view is given. Kept free of React so the contract has no dependency;
// a pack's views are components of these props.

/** A column of what was read, as the view should draw it. */
export interface ColumnInfo {
  name: string;
  /** What it is called, in the reader's words. */
  label: string;
  /** The column's type: text, integer, number, boolean, date, timestamp, enum, reference, json, uuid. */
  type: string;
  /** What the column holds, as its table's definition says: the help behind its heading. */
  description?: string;
  /** For an enum: its values, and the colour each is drawn in. */
  values?: readonly { value: string; label?: string; color?: string }[];
  /** Whether a row must have a value here, as its table's definition says. Left out for what is not a column of a table. */
  required?: boolean;
  /** What a new row gets when it gives none, as its table's definition says. */
  default?: unknown;
  /** For a reference column: the table it points to, by its path. */
  references?: string;
}

/**
 * Whether a person must give this column a value when they add a row: the data server's own
 * rule, a column that is required (NOT NULL) and has no default. One that has a default is
 * filled in by the server when left out, so it is not asked for, and a form starts with it.
 * Every form, and every list of what a form asks, uses this one rule.
 */
export function mustGive(column: { required?: boolean | undefined; default?: unknown }): boolean {
  return column.required === true && (column.default === undefined || column.default === null);
}

export interface RowsData {
  shape: "rows";
  columns: readonly ColumnInfo[];
  rows: readonly Record<string, unknown>[];
  /** Asks for the next page, when there is one. */
  more?: () => void;
  /** With a next page: how many rows there are in all, as the filters leave them. */
  total?: number;
  /** For rows grouped by a column, with a next page: how many rows each group has in all, by what the group is. */
  groups?: readonly { key: unknown; count: number }[];
  /**
   * A table's rows in the order of one column, read from the server over all its rows, not the
   * page's. Left out when every row is here already and the view may sort them itself.
   */
  sortBy?: (sort: { column: string; descending: boolean } | undefined) => void;
  /** The order the rows were read in, when `sortBy` set one. */
  sorted?: { column: string; descending: boolean };
  /** For a reference column: the name of the row each id points to. */
  names?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface SummaryData {
  shape: "summary";
  /** The breakdowns' columns, then the values', as the view should draw them. */
  columns: readonly ColumnInfo[];
  /** The names of the columns that are breakdowns, in order. */
  breakdowns: readonly string[];
  /** The names of the columns that are values, in order. */
  values: readonly string[];
  rows: readonly Record<string, unknown>[];
  /** For a widget that compares: the same values for the period before. */
  previous?: readonly Record<string, unknown>[];
  /** The function each value is, by the value's name, when the query is a visual one: what a total of it can be made of. */
  measures?: Readonly<
    Record<string, "count" | "sum" | "avg" | "min" | "max" | "count_distinct" | undefined>
  >;
  /** The period each date breakdown is cut into, by the breakdown's name: what "include periods with nothing" steps by. */
  buckets?: Readonly<Record<string, "day" | "week" | "month" | "quarter" | "year">>;
  /** The days the page's date filter gives the first date breakdown, both ends: where a filled chart begins and ends. */
  span?: { from: string; to: string };
  /** For a figure with a trend: its first value over the time it covers, oldest first. `at` is a day. */
  trend?: readonly { at: string; value: number }[];
}

export interface RecordData {
  shape: "record";
  columns: readonly ColumnInfo[];
  record: Readonly<Record<string, unknown>> | null;
  /** For a reference column: the name of the row each id points to. */
  names?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/**
 * One step waiting for a decision, or decided. The fields are the step's detail as the server
 * redacted and limited it; `mayDecide` is the server's answer for this viewer, and the buttons
 * are drawn from it, but the server decides again.
 */
export interface ApprovalItem {
  /** Names the step to `decide`: the flow run and the step. Nothing to read into. */
  id: string;
  title: string;
  flow: { path: string; title: string };
  fields: readonly { name: string; label: string; value: unknown }[];
  /** An ISO time. */
  waitingSince: string;
  timesOutAt: string | null;
  mayDecide: boolean;
  /** Who may decide, in words ("the practice-managers group"), or null when anyone holding the permission may. */
  approvers: string | null;
  /** Set on a decided one. `via` is where: the app, the console, or a link in the mail. */
  decision?: {
    approved: boolean;
    by: string;
    at: string | null;
    comment: string | null;
    via: "app" | "console" | "email";
  };
}

export interface ApprovalsData {
  shape: "approvals";
  /** Set when the requests are decided in the console and not here: where, and what it is called. */
  decideIn?: { console: string; name: string };
  waiting: readonly ApprovalItem[];
  decided: readonly ApprovalItem[];
  /** There are more waiting than were sent. */
  more: boolean;
}

export type WidgetData = RowsData | SummaryData | RecordData | ApprovalsData;

/**
 * What the frame around every widget draws for it, the same for every widget:
 * the view is only drawn when `ready`, and when `empty` it may draw its own
 * empty state with `message`.
 */
export type WidgetState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "empty"; message: string }
  | { status: "failed"; message: string }
  | { status: "forbidden"; message: string };

/**
 * A view is drawn inside a CSS container named `cell`, the widget's own box, so it
 * can size what it draws by the room it has (`@[14rem]/cell:…`) rather than by the
 * window's width or a count of columns.
 */
export interface ViewSize {
  /** In cells. */
  w: number;
  h: number;
  /** The page is a phone's width or so: one column. */
  narrow: boolean;
}

/** What raising an event gives. Checked by the host against the event's declaration. */
export type EventPayload =
  | { record: string }
  | { group: Readonly<Record<string, unknown>> }
  | Record<string, never>;

/**
 * How running an action went. `fields` says what was wrong with what was typed,
 * by field name, for a form to draw beside each field.
 */
export type ActOutcome =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; message: string; fields?: Readonly<Record<string, string>> };

/**
 * How deciding went. A refusal says why in the server's words; a `conflict` is someone else
 * having decided it first, and the words say who and what.
 */
export type DecideOutcome =
  | { ok: true; message: string }
  | { ok: false; conflict: true; message: string }
  | { ok: false; conflict?: false; message: string };

/** A value a reference or choice column offers. */
export interface Choice {
  value: string;
  label: string;
}

/** The props of a widget's view. */
export interface WidgetViewProps<Config = Record<string, unknown>> {
  /** The widget's configuration, with its definition's defaults filled in. */
  config: Config;
  /** Each data input, read, by name. An input not yet read is absent. */
  data: Readonly<Record<string, WidgetData>>;
  size: ViewSize;
  /** Raises a declared event. The host does what the page says, or nothing. */
  emit: (event: string, payload: EventPayload) => void;
  /** Whether the page is being built. A view may draw hints for the builder, never different data. */
  building: boolean;
  /**
   * While building, "View as" a group: an action the group may run is drawn pressable (it still
   * runs nothing here), and one it may not is greyed with the reason, as it will be served.
   */
  viewing?: boolean;
  /** The widget's title, as the page draws it over the view: what a view names its own parts by ("Visits", for a tab strip). */
  title?: string;
  /**
   * Runs an action the widget holds, named by where it is: `on/<event>`, or a config
   * property the definition marks `action` (`config/<property>`) or `actions`
   * (`config/<property>/<index>/action`). The host asks to confirm, runs it on the
   * server, and does what follows (open a page, say something). A form gives what was
   * typed as `inputs`. A table with rows chosen gives their ids as `records`. Absent while building, and on a host that runs no actions.
   */
  act?: (
    at: string,
    given?: {
      record?: string;
      /** Several rows chosen in a table or list: the action runs on each of them. */
      records?: readonly string[];
      inputs?: Readonly<Record<string, unknown>>;
    },
  ) => Promise<ActOutcome>;
  /**
   * Decides a waiting approval of the widget's data, by the item's `id`. The server checks the
   * viewer's own standing and records who decided. Absent while building, and on a host that
   * cannot decide (nothing is then drawn as pressable).
   */
  decide?: (id: string, decision: "approve" | "reject", comment?: string) => Promise<DecideOutcome>;
  /** Reads the widget's data again: when the person comes back from deciding elsewhere. */
  refresh?: () => void;
  /** Whether an action the widget holds may be pressed now, for a row: its `when`, as the host reads it. */
  can?: (at: string, row?: Readonly<Record<string, unknown>>) => boolean;
  /** Why an action can't be pressed now, in the reader's words ("Status is Unpaid"); nothing when it can. */
  why?: (at: string, row?: Readonly<Record<string, unknown>>) => string | undefined;
  /** Closes the side sheet or modal the widget is shown in; absent when it is on a page. */
  close?: () => void;
  /** The person looking, where the host knows who: a form starts a field with them. */
  viewer?: { id: string; email?: string; name?: string };
  /** The record whose side sheet or modal is open over the page: a list marks its row. */
  selectedRecord?: string;
  /** Whether the page does something when this event is raised: then the view draws it as pressable. */
  listens?: (event: string) => boolean;
  /** What a reference or choice column of a data input offers, read for whoever is looking. */
  choices?: (input: string, column: string, search: string) => Promise<readonly Choice[]>;
  /**
   * A container's (`role: "container"`): the host's drawing of the widgets placed in it, on
   * its grid; for a container with tabs, of those in `tab`. A view renders what it returns
   * as a child (it is a React node; the contract does not depend on React).
   */
  place?: (tab?: string) => unknown;
  /**
   * The tab of a container with tabs that is open, as the host keeps it (in the address,
   * so a reload and a link keep it), and how to open another.
   */
  tab?: { open: string | undefined; choose: (tab: string) => void };
  /** A filter widget's (`role: "filters"`): what is set now, and how to set it. */
  filters?: FilterHost;
}

/** What a filter widget is given: the page's values of its filters, and a way to change them. */
export interface FilterHost {
  /** The value of each filter, by name, as the reader set it or as it starts. */
  values: Readonly<Record<string, unknown>>;
  /** Sets one filter. Every widget it narrows is read again. `undefined` puts it back to how it starts. */
  set: (name: string, value: unknown) => void;
  /** Puts every filter of this widget back to how it starts. */
  reset: () => void;
  /** What a choice filter offers when it names the column its values come from, read for whoever is looking. */
  options?: (name: string, search: string) => Promise<readonly Choice[]>;
}

/** What the inspector writes as a measure, a breakdown and a condition. The manifest checks them. */
export const MEASURE_FUNCTIONS = ["count", "count_distinct", "sum", "avg", "min", "max"] as const;
export const BREAKDOWN_CADENCES = ["day", "week", "month", "quarter", "year"] as const;

/** What a measure is called in a sentence: "Sum of Total". */
export const MEASURE_WORDS: Record<(typeof MEASURE_FUNCTIONS)[number], string> = {
  count: "Count",
  count_distinct: "Count of different",
  sum: "Sum",
  avg: "Average",
  min: "Smallest",
  max: "Largest",
};

export const CADENCE_WORDS: Record<(typeof BREAKDOWN_CADENCES)[number], string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  quarter: "Quarterly",
  year: "Yearly",
};

// ---------------------------------------------------------------------------
// Shared by every pack: how a number is written, and the setting that says so.

/** How a number is written. Money kept in cents is shown with `minorUnits`. */
export interface ValueFormat {
  style: "number" | "currency" | "percent";
  /** ISO 4217, for `currency`. Default `USD`. */
  currency?: string;
  minorUnits?: boolean;
  decimals?: number;
  /** `compact` writes 43,120 as 43.1K. */
  notation?: "compact";
  /** `false` writes 43120, not 43,120 (the picker's "Plain"). */
  grouping?: false;
}

/** The JSON Schema of a `format` setting. A pack spreads it into its config with an `x-volvel` hint. */
export const FORMAT_SCHEMA = {
  type: "object",
  properties: {
    style: { enum: ["number", "currency", "percent"] },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
    minorUnits: { type: "boolean" },
    decimals: { type: "integer", minimum: 0, maximum: 6 },
    notation: { enum: ["compact"] },
    grouping: { const: false },
  },
  required: ["style"],
  additionalProperties: false,
} as const;

/** A number from a value: totals can arrive as text, from the database's exact numbers. */
export function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** A count as the reader writes it: 1,204 in the US, 1.204 in Germany. */
export function countText(count: number): string {
  try {
    return count.toLocaleString(readerLocale());
  } catch {
    return count.toLocaleString("en-US");
  }
}

/**
 * `12.5%`, `$1,234.56`, `1,204`, as the reader's locale writes them (US English where it is
 * not known): `1.234,56 €` in German. Undefined for a value that is not a number.
 * `locale` is the reader's, the browser's when left out.
 */
export function formatValue(
  value: unknown,
  format: ValueFormat | undefined,
  locale?: string,
): string | undefined {
  const where = usableLocale(locale);
  const found = numberOf(value);
  if (found === undefined) return undefined;
  const scaled = format?.minorUnits ? found / 100 : found;
  const options: Intl.NumberFormatOptions =
    format?.style === "currency"
      ? { style: "currency", currency: format.currency ?? "USD" }
      : format?.style === "percent"
        ? { style: "percent", maximumFractionDigits: 1 }
        : { maximumFractionDigits: 2 };
  if (format?.grouping === false) options.useGrouping = false;
  if (format?.notation === "compact") {
    options.notation = "compact";
    options.maximumFractionDigits = 1;
  }
  if (format?.decimals !== undefined) {
    options.minimumFractionDigits = format.decimals;
    options.maximumFractionDigits = format.decimals;
  }
  try {
    // The boards write a short number in lower case: $43.1k.
    const written = new Intl.NumberFormat(where, options).format(scaled);
    return where.startsWith("en")
      ? written.replace(
          /(\d)([KMBT])$/,
          (_, digit: string, unit: string) => digit + unit.toLowerCase(),
        )
      : written;
  } catch {
    // A currency code the runtime does not know: the number, and the code after it.
    return `${new Intl.NumberFormat(where, { maximumFractionDigits: 2 }).format(scaled)} ${format?.currency ?? ""}`.trim();
  }
}

/** A number as a person reads it; anything else as it is, and nothing as a dash. */
export function formatNumber(value: unknown, format?: ValueFormat, locale?: string): string {
  const written = formatValue(value, format, locale);
  if (written !== undefined) return written;
  return value === null || value === undefined ? "—" : String(value);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A day as the boards write it: "Nov 20", and "Nov 20, 2025" when it is not this year. The one
 * way every widget and every drawer says a date; `undefined` for text that is not a day.
 */
export function formatDay(value: unknown, now: Date = new Date()): string | undefined {
  if (typeof value !== "string") return undefined;
  const found = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  const month = found ? MONTHS[Number(found[2]) - 1] : undefined;
  if (!found || month === undefined) return undefined;
  const day = Number(found[3]);
  return Number(found[1]) === now.getFullYear()
    ? `${month} ${day}`
    : `${month} ${day}, ${found[1]}`;
}

/** A stored word as a chip reads it: "no_show" is "No show", "paid" is "Paid". */
export function sentenceCase(value: string): string {
  const spaced = value.replace(/_+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * What a choice value is called: the label its table gives it, else the value with a first-letter
 * capital. For choice columns and badges only: free text (a clinic's name) is drawn as it is.
 */
export function choiceWords(
  column: { values?: readonly { value: string; label?: string }[] } | undefined,
  value: unknown,
): string {
  const found = column?.values?.find((one) => one.value === value);
  return found?.label ?? sentenceCase(String(value));
}

/**
 * A pack as a page renderer takes it: its definitions, and a view for each.
 * `View` is the renderer's component type (React's, for the platform's own).
 */
export interface WidgetPack<View = unknown> {
  definitions: readonly WidgetDefinition[];
  views: Readonly<Record<string, View>>;
}

export { readerLocale } from "./locale.js";
export * from "./money.js";
