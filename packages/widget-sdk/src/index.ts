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
 * - `record`: one row.
 */
export const DATA_SHAPES = ["rows", "summary", "record"] as const;
export type DataShape = (typeof DATA_SHAPES)[number];

/** Where a data input may come from. SQL is never offered on an app's page. */
export const SOURCE_KINDS = ["table", "query", "sql"] as const;
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
  /** Only shown when other properties of config have these values. Equality only. */
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
  /** The name of an icon from the kit's set. */
  icon: string;
  surfaces: readonly Surface[];
  data: Readonly<Record<string, DataInputDeclaration>>;
  /** The Data tab's controls for each input, in order. */
  dataHints?: readonly DataHints[];
  config: ConfigSchema;
  /** What the widget is when it is added, before anyone changes it. */
  defaults?: Readonly<Record<string, unknown>>;
  events: Readonly<Record<string, EventDeclaration>>;
  layout: LayoutDeclaration;
}

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
}

export interface RowsData {
  shape: "rows";
  columns: readonly ColumnInfo[];
  rows: readonly Record<string, unknown>[];
  /** Asks for the next page, when there is one. */
  more?: () => void;
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
  /** For a figure with a trend: its first value over the time it covers, oldest first. `at` is a day. */
  trend?: readonly { at: string; value: number }[];
}

export interface RecordData {
  shape: "record";
  columns: readonly ColumnInfo[];
  record: Readonly<Record<string, unknown>> | null;
}

export type WidgetData = RowsData | SummaryData | RecordData;

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
}

/** The JSON Schema of a `format` setting. A pack spreads it into its config with an `x-volvel` hint. */
export const FORMAT_SCHEMA = {
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

/** A number from a value: totals can arrive as text, from the database's exact numbers. */
export function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** `12.5%`, `$1,234.56`, `1,204`, in US English. Undefined for a value that is not a number. */
export function formatValue(value: unknown, format: ValueFormat | undefined): string | undefined {
  const found = numberOf(value);
  if (found === undefined) return undefined;
  const scaled = format?.minorUnits ? found / 100 : found;
  const options: Intl.NumberFormatOptions =
    format?.style === "currency"
      ? { style: "currency", currency: format.currency ?? "USD" }
      : format?.style === "percent"
        ? { style: "percent", maximumFractionDigits: 1 }
        : { maximumFractionDigits: 2 };
  if (format?.decimals !== undefined) {
    options.minimumFractionDigits = format.decimals;
    options.maximumFractionDigits = format.decimals;
  }
  try {
    return new Intl.NumberFormat("en-US", options).format(scaled);
  } catch {
    // A currency code the runtime does not know: the number, and the code after it.
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(scaled)} ${format?.currency ?? ""}`.trim();
  }
}

/** A number as a person reads it; anything else as it is, and nothing as a dash. */
export function formatNumber(value: unknown, format?: ValueFormat): string {
  const written = formatValue(value, format);
  if (written !== undefined) return written;
  return value === null || value === undefined ? "—" : String(value);
}

/**
 * A pack as a page renderer takes it: its definitions, and a view for each.
 * `View` is the renderer's component type (React's, for the platform's own).
 */
export interface WidgetPack<View = unknown> {
  definitions: readonly WidgetDefinition[];
  views: Readonly<Record<string, View>>;
}
