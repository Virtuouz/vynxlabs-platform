import { placed, without } from "@volvel/screens";
/**
 * What the inspector does with a widget, with no React in it so it can be
 * tested by itself. It reads a widget's definition (`@volvel/widgets`) and
 * knows nothing about any widget type in particular: a pack's widgets are
 * drawn from their hints (S9, decision 0005).
 */

import {
  type DataInput,
  displayGuess,
  FILTER_WIDGET,
  type FilterBinding,
  groupName,
  MAX_WIDGET_HEIGHT,
  PAGE_COLUMNS,
  type Page,
  type PageFilter,
  type PageWidget,
  type VisualQuery,
} from "@volvel/manifest";
import {
  type DataInputDeclaration,
  type InspectorHint,
  type Surface,
  TABS,
  type Tab,
  type WidgetDefinition,
} from "@volvel/widgets";
import { DEFAULT_COLUMNS, defaultColumns, SYSTEM_COLUMNS } from "@volvel/widgets-core/views";
import { drawersFor } from "./custom.ts";

/** A column of a table, as the workspace's schema says. */
export interface CatalogColumn {
  name: string;
  type: string;
  references: string | null;
  /** NOT NULL, as the table says: a row must give it unless it has a default. */
  required?: boolean;
  /** What a row gets when it gives none. */
  default?: unknown;
  /** What the column holds, as its table's definition says. */
  description?: string;
  /** How many different values the column holds, when the schema says. Orders a breakdown's choices. */
  distinct?: number;
  /** The count above is a floor: the column has more values than the server counts. */
  distinctMore?: boolean;
  /** A choice column's values, with how many rows each has, when the schema says. */
  values?: { value: string; count?: number; label?: string; color?: string }[];
}
export interface CatalogTable {
  name: string;
  columns: CatalogColumn[];
  /** How many rows it has, when the schema says. */
  rows?: number;
}
/** What a widget can ask questions of: the tables, the saved queries, and whether SQL may be written. */
export interface Catalog {
  /** The workspace's path, for what an editor asks of a table (a column's values). */
  root?: string;
  tables: CatalogTable[];
  queries: { path: string; description: string }[];
  maySql: boolean;
}
/** A flow that can be started by hand, and what its manual trigger takes (JSON Schema). */
export interface FlowChoice {
  path: string;
  /** What the workflow is called, where it has a name of its own. */
  title?: string | null;
  manualInput?: { properties?: Record<string, unknown> } | null;
}
/** A script of the workspace, and what it takes. */
export interface ScriptChoice {
  path: string;
  inputSchema?: { properties?: Record<string, unknown> } | null;
}
export const EMPTY_CATALOG: Catalog = { tables: [], queries: [], maySql: false };

const SYSTEM: CatalogColumn[] = [
  { name: "id", type: "uuid", references: null },
  { name: "created_at", type: "timestamp", references: null },
  { name: "updated_at", type: "timestamp", references: null },
];
/** Every table has these, whether the schema lists them or not. */
export function withSystemColumns(columns: CatalogColumn[]): CatalogColumn[] {
  const have = new Set(columns.map((column) => column.name));
  return [...SYSTEM.filter((column) => !have.has(column.name)), ...columns];
}

/** Whether a column holds a few named things: a choice, a yes or no, or text the server counted to a dozen values. */
export function isChoiceLike(column: CatalogColumn | undefined): boolean {
  if (!column) return false;
  return (
    column.type === "enum" ||
    column.type === "boolean" ||
    (column.values?.length ?? 0) > 0 ||
    (column.type === "text" &&
      column.distinct !== undefined &&
      column.distinct > 1 &&
      column.distinct <= 12)
  );
}

/** What a choice is called to people: the widgets' own words for it, so a drawer says it as the page does. */
export { choiceWords } from "@volvel/widgets";

/** A column's name as a heading: `customer_id` as "Customer id". */
export function heading(name: string): string {
  const words = name.replace(/[_.]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---------------------------------------------------------------------------
// Which settings a tab holds

export interface ConfigSetting {
  name: string;
  hint: InspectorHint;
  schema: Record<string, unknown>;
}

/** The config properties a definition draws on a tab, in the order its hints give. */
export function configSettings(definition: WidgetDefinition, tab: Tab): ConfigSetting[] {
  const found: (ConfigSetting & { at: number })[] = [];
  Object.entries(definition.config.properties).forEach(([name, schema], at) => {
    const hint = schema["x-volvel"];
    if (hint && hint.tab === tab) found.push({ name, hint, schema, at });
  });
  return found
    .sort((a, b) => (a.hint.order ?? 1000) - (b.hint.order ?? 1000) || a.at - b.at)
    .map(({ at: _at, ...rest }) => rest);
}

export interface DataPart {
  input: string;
  control: "source" | "measure" | "breakdown" | "conditions" | "sort" | "limit";
  label: string;
  help?: string | undefined;
  level: "main" | "more";
}

/** The data controls of every input a definition declares, in the order its hints give. */
export function dataParts(definition: WidgetDefinition): DataPart[] {
  return (definition.dataHints ?? []).flatMap((hints) =>
    hints.controls.map((one) => ({
      input: hints.of,
      control: one.control,
      label: one.label,
      help: one.help,
      // Sort and limit are always rows of "Rows it uses" (board 13): nothing hides behind
      // "More data options" any more.
      level: "main" as const,
    })),
  );
}

/** The widget's configuration with its definition's defaults filled in. */
export function configOf(
  definition: WidgetDefinition,
  widget: PageWidget,
): Record<string, unknown> {
  return { ...(definition.defaults ?? {}), ...(widget.config ?? {}) };
}

/**
 * `when`: equality against the configuration as the view sees it; a list is "any of these",
 * and `null` in it stands for a setting left unset.
 */
export function isShown(hint: InspectorHint, config: Record<string, unknown>): boolean {
  return Object.entries(hint.when ?? {}).every(([name, value]) =>
    Array.isArray(value) ? value.includes(config[name] ?? null) : config[name] === value,
  );
}

/** Widgets that only do things: their Data tab says they read no rows. */
export const READS_NO_ROWS: ReadonlySet<string> = new Set(["core/button", "core/actions"]);

/** Whether a tab has anything to draw. Rules and Actions say what is so even when nothing can be set. */
export function tabsOf(definition: WidgetDefinition): Tab[] {
  return TABS.filter((tab) => {
    // A widget's own drawer pieces (Approvals' "Which requests") make a tab as a setting does.
    if (drawersFor(definition.type, tab).length > 0) return true;
    if (tab === "data") {
      // A button and an action group read no rows, and still have the tab, as board 17 draws it: it says so.
      if (READS_NO_ROWS.has(definition.type)) return true;
      return dataParts(definition).length > 0 || configSettings(definition, tab).length > 0;
    }
    if (tab === "display") return true; // the title and the line under it are every widget's
    if (tab === "actions")
      return (
        Object.keys(definition.events).length > 0 || configSettings(definition, tab).length > 0
      );
    return true; // who can see it is said for every widget
  });
}

/** A number shown beside a tab's name, when there is one. */
export function tabCount(
  definition: WidgetDefinition,
  widget: PageWidget,
  tab: Tab,
): number | undefined {
  if (tab !== "data") return undefined;
  let count = 0;
  for (const input of Object.values(widget.data ?? {})) {
    if ("visual" in input.source) count += input.source.visual.filters?.length ?? 0;
  }
  void definition;
  return count > 0 ? count : undefined;
}

// ---------------------------------------------------------------------------
// Writing

/** A widget with one config property set; an empty value takes the property out. */
export function withConfig(widget: PageWidget, name: string, value: unknown): PageWidget {
  const config = { ...(widget.config ?? {}) };
  const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) delete config[name];
  else config[name] = value;
  const { config: _before, ...rest } = widget;
  return Object.keys(config).length > 0 ? { ...rest, config } : rest;
}

/** A widget with one data input replaced, or taken away. */
export function withInput(
  widget: PageWidget,
  name: string,
  input: DataInput | undefined,
): PageWidget {
  const data = { ...(widget.data ?? {}) };
  if (input) data[name] = input;
  else delete data[name];
  const { data: _before, ...rest } = widget;
  return Object.keys(data).length > 0 ? { ...rest, data } : rest;
}

/** A widget with its title or subtitle set. */
export function withText(
  widget: PageWidget,
  field: "title" | "subtitle",
  value: string,
): PageWidget {
  const { [field]: _before, ...rest } = widget;
  return value.trim() === "" && field === "subtitle" ? rest : { ...rest, [field]: value };
}

export const visualOf = (input: DataInput | undefined): VisualQuery | undefined =>
  input && "visual" in input.source ? input.source.visual : undefined;

/**
 * The table an input reads, whichever way it is wired: a table from menus, the record the page
 * opens on (the page's record table), the row selected in a table or list of the page (that
 * widget's table), or the user's own row (its table). A column control asks this, so a detail
 * or form wired to a record offers that table's columns as one wired to the table does.
 */
export function tableOfInput(
  input: DataInput | undefined,
  page: { record?: { table: string } | undefined } | undefined,
  widgets: readonly PageWidget[] = [],
): string | undefined {
  const visual = visualOf(input);
  if (visual) return visual.table;
  const source = input?.source;
  if (!source) return undefined;
  if ("record" in source) return page?.record?.table;
  if ("own" in source) return source.own.table;
  if ("selected" in source) {
    const followed = widgets.find((one) => one.id === source.selected);
    for (const given of Object.values(followed?.data ?? {})) {
      const table = visualOf(given)?.table;
      if (table) return table;
    }
  }
  return undefined;
}

/** Whether a page is opened on one record: a record page, a side sheet or a modal with its table. */
export const opensOnRecord = (page: Page | undefined): boolean =>
  Boolean(page?.record) && (page?.kind ?? "page") !== "page";

/**
 * A widget that reads one record, put where the page's record is: a new Record detail on a record
 * page, a side sheet or a modal, and a Form that is changed to edit a record, start on the record
 * the page opens with, so nothing is left to wire. A widget already wired is left as it is.
 */
export function onThePagesRecord(widget: PageWidget, page: Page | undefined): PageWidget {
  if (!opensOnRecord(page)) return widget;
  const table = page?.record?.table;
  // A form changed back to making records reads the table again, as it did before it was wired.
  if (
    widget.type === "core/form" &&
    table &&
    (widget.config as { mode?: string } | undefined)?.mode !== "edit"
  ) {
    const source = widget.data?.record?.source;
    return source && "record" in source
      ? { ...widget, data: { ...widget.data, record: { source: { visual: { table } } } } }
      : widget;
  }
  const wants =
    widget.type === "core/detail" ||
    (widget.type === "core/form" &&
      (widget.config as { mode?: string } | undefined)?.mode === "edit");
  if (!wants) return widget;
  const have = widget.data?.record?.source;
  if (have && ("record" in have || "selected" in have || "own" in have)) return widget;
  return { ...widget, data: { ...widget.data, record: { source: { record: "this" } } } };
}

/** A visual query with the parts that came empty taken out, so a page holds nothing it need not. */
export function tidyVisual(visual: VisualQuery): VisualQuery {
  const next: VisualQuery = { ...visual };
  for (const key of ["filters", "groupBy", "measures", "columns", "sort", "joins"] as const) {
    if (next[key] !== undefined && next[key]?.length === 0) delete next[key];
  }
  if (next.limit === undefined) delete next.limit;
  return next;
}

/** An input as its definition declares it: where it may come from, by default. */
export function sourcesOf(declared: DataInputDeclaration | undefined, surface: Surface) {
  return (declared?.sources ??
    (surface === "dashboard" ? ["table", "query", "sql"] : ["table", "query"])) as readonly (
    | "table"
    | "query"
    | "sql"
  )[];
}

// ---------------------------------------------------------------------------
// Names a widget's result has

/** The columns a visual summary gives: its groups, then its values. */
export function resultNames(input: DataInput | undefined): string[] {
  const visual = visualOf(input);
  if (!visual) return [];
  return [
    ...(visual.groupBy ?? []).map(groupName),
    ...(visual.measures ?? []).map((measure) => measure.as),
  ];
}

/** A name for a measure, from what it works out. */
export function measureName(
  fn: string,
  column: string | undefined,
  taken: readonly string[],
): string {
  const base =
    fn === "count" && !column
      ? "count"
      : `${fn === "count_distinct" ? "distinct" : fn}_${(column ?? "rows").replace(".", "_")}`;
  let name = base;
  for (let n = 2; taken.includes(name); n += 1) name = `${base}_${n}`;
  return name;
}

/** A widget whose config named a result column by its old name now names it by its new one. */
export function renamedResult(
  definition: WidgetDefinition,
  widget: PageWidget,
  input: string,
  from: string,
  to: string,
): PageWidget {
  let next = widget;
  for (const [name, schema] of Object.entries(definition.config.properties)) {
    const hint = schema["x-volvel"];
    if (
      hint?.control === "column" &&
      (hint.of ?? input) === input &&
      next.config?.[name] === from
    ) {
      next = withConfig(next, name, to);
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Page filters

/** The column a page filter narrows: the one it reads its values from, else the one it is named for. */
export const filterColumn = (filter: PageFilter): string => filter.from?.column ?? filter.name;

const hasColumn = (catalog: Catalog, table: string, column: string) =>
  withSystemColumns(catalog.tables.find((one) => one.name === table)?.columns ?? []).some(
    (one) => one.name === column,
  );

/** The most columns a search looks in for one widget (the server allows 12). */
export const MAX_SEARCH_COLUMNS = 8;

/**
 * The text columns of `table` that a search looks in for a widget: the ones it shows. A table
 * names them in its columns, or draws the first eight of the default ones when it names none; a list shows its title, subtitle and right-hand columns, or its first column when it
 * names none. Else the table's display column. At most `MAX_SEARCH_COLUMNS`.
 */
export function searchColumns(widget: PageWidget, table: string, catalog: Catalog): string[] {
  const columns = withSystemColumns(
    catalog.tables.find((one) => one.name === table)?.columns ?? [],
  );
  const text = new Set(columns.filter((one) => one.type === "text").map((one) => one.name));
  const config = widget.config ?? {};
  const byDefault = defaultColumns(columns).map((one) => one.name);
  const named =
    Array.isArray(config.columns) && config.columns.length > 0
      ? (config.columns as { column?: unknown; hidden?: boolean }[])
          .filter((one) => one.hidden !== true)
          .map((one) => one.column)
      : undefined;
  const shown: unknown[] =
    named ??
    (widget.type === "core/table"
      ? byDefault.slice(0, DEFAULT_COLUMNS)
      : widget.type === "core/list"
        ? [config.title ?? byDefault[0], config.subtitle, config.right]
        : [config.title, config.subtitle, config.right]);
  const picked = [
    ...new Set(shown.filter((one): one is string => typeof one === "string" && text.has(one))),
  ].slice(0, MAX_SEARCH_COLUMNS);
  if (picked.length > 0) return picked;
  const display = displayGuess(columns.map((one) => ({ name: one.name, type: one.type })));
  return display && text.has(display) ? [display] : [];
}

/**
 * Binds a page filter to every data input of a widget whose table has the
 * filter's column (contract, "Page filters"). An input already bound to it,
 * and one that is a saved query or SQL (which fills a parameter it names), is left as it is.
 * A search is bound to the text columns the widget shows (`searchColumns`).
 */
export function bindFilter(
  widget: PageWidget,
  filter: PageFilter,
  catalog: Catalog,
  /** The page's other widgets: a filter already narrowing a table on this page narrows it the same way here. */
  neighbours: readonly PageWidget[] = [],
): PageWidget {
  if (!widget.data) return widget;
  const named = filterColumn(filter);
  /** The column this filter narrows on `table`: as the page's other widgets bind it, else the filter's own. */
  const columnFor = (table: string): string | undefined => {
    for (const other of neighbours) {
      for (const input of Object.values(other.data ?? {})) {
        if (visualOf(input)?.table !== table) continue;
        const bound = (input.filters ?? []).find((binding) => binding.filter === filter.name);
        if (bound?.column) return bound.column;
      }
    }
    return hasColumn(catalog, table, named) ? named : undefined;
  };
  let changed = false;
  const data: Record<string, DataInput> = {};
  for (const [name, input] of Object.entries(widget.data)) {
    const visual = visualOf(input);
    const bound = (input.filters ?? []).some((binding) => binding.filter === filter.name);
    let binding: FilterBinding | undefined;
    if (visual && !bound) {
      if (filter.type === "search") {
        const columns = searchColumns(widget, visual.table, catalog);
        if (columns.length > 0) binding = { filter: filter.name, columns };
      } else {
        const column = columnFor(visual.table);
        if (column) binding = { filter: filter.name, column };
      }
    }
    if (binding) {
      data[name] = { ...input, filters: [...(input.filters ?? []), binding] };
      changed = true;
    } else data[name] = input;
  }
  return changed ? { ...widget, data } : widget;
}

/** A filter that is gone is gone from every input that named it, and from a `compareTo`. */
export function unbindFilter(widget: PageWidget, filterName: string): PageWidget {
  let next = widget;
  if (widget.data) {
    const data: Record<string, DataInput> = {};
    for (const [name, input] of Object.entries(widget.data)) {
      const kept = (input.filters ?? []).filter((binding) => binding.filter !== filterName);
      const { filters: _before, ...rest } = input;
      data[name] = kept.length > 0 ? { ...rest, filters: kept } : rest;
    }
    next = { ...next, data };
  }
  if (next.config?.compareTo === filterName) next = withConfig(next, "compareTo", undefined);
  return next;
}

// ---------------------------------------------------------------------------
// The filters of a Search and filter widget

/** A name made from words and kept unique among `taken`: `Search invoices` as `search_invoices`. */
export function uniqueName(
  words: string,
  taken: readonly string[],
  fallback: string,
  separator: "_" | "-" = "_",
): string {
  const cleaned = words
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^[^a-z]+|${separator}+$`, "g"), "")
    .slice(0, 30);
  const base = cleaned || fallback;
  let name = base;
  for (let n = 2; taken.includes(name); n += 1) name = `${base}${separator}${n}`;
  return name;
}

/** What a column suggests a filter on it is: a range of dates, one of a list, a number, or text. */
export function filterTypeFor(column: CatalogColumn): PageFilter["type"] {
  if (column.type === "date" || column.type === "timestamp") return "date_range";
  if (column.type === "integer" || column.type === "number") return "number";
  if (column.type === "enum" || column.type === "boolean" || column.references) return "choice";
  return "text";
}

/** What the page's tables are called in a sentence: "invoices" for `invoices`, "clinic visits" for `clinic_visits`. */
export const tableWords = (table: string): string => table.replace(/[_.-]+/g, " ").toLowerCase();

/** A new search: "Search invoices" when the page's table is known, else "Search". */
export function newSearch(table: string | undefined, taken: readonly string[]): PageFilter {
  const label = table ? `Search ${tableWords(table)}` : "Search";
  return { name: uniqueName(label, taken, "search"), label, type: "search" };
}

/**
 * A new filter by a column. It is named for the column (that is the column it narrows on
 * every widget whose table has it), and the name is never changed after, so bindings hold.
 */
export function newColumnFilter(
  column: CatalogColumn,
  table: string,
  taken: readonly string[],
): PageFilter {
  const type = filterTypeFor(column);
  return {
    name: uniqueName(column.name, taken, "filter"),
    label: heading(column.name.replace(/_at$|_on$/, "")),
    type,
    ...(type === "date_range" ? { default: "last_30_days" } : {}),
    ...(type === "choice" ? { from: { table, column: column.name } } : {}),
  };
}

/** Every widget of the page, with each filter of `holder` bound where its column or text is (a new filter, or a new holder). */
export function bindHolderFilters(
  widgets: readonly PageWidget[],
  filters: readonly PageFilter[],
  catalog: Catalog,
): PageWidget[] {
  return widgets.map((widget) =>
    filters.reduce(
      (one, filter) =>
        bindFilter(
          one,
          filter,
          catalog,
          widgets.filter((other) => other.id !== widget.id),
        ),
      widget,
    ),
  );
}

/** The widgets of a page with a Search and filter widget added at the top, and what is on the page's own grid moved down under it. */
export function insertFilterWidget(
  widgets: readonly PageWidget[],
  definition: WidgetDefinition,
  filters: readonly PageFilter[] | undefined,
  catalog: Catalog,
): { widgets: PageWidget[]; id: string } {
  const id = newId(definition.type, widgets);
  const { w, h } = definition.layout.default;
  const added: PageWidget = {
    id,
    type: definition.type,
    title: definition.title,
    at: { x: 0, y: 0, w, h },
    config: {
      ...(definition.defaults ?? {}),
      ...(filters ? { filters: [...filters] } : {}),
    },
  };
  const taken = filtersOfWidgets(widgets).map((one) => one.name);
  // A name the page already has is not declared twice.
  const own = (added.config?.filters as PageFilter[] | undefined) ?? [];
  const named = own.map((one) => {
    const name = taken.includes(one.name) ? uniqueName(one.name, taken, "filter") : one.name;
    taken.push(name);
    return name === one.name ? one : { ...one, name };
  });
  added.config = { ...added.config, filters: named };
  const moved = widgets.map((one) =>
    one.in ? one : { ...one, at: { ...one.at, y: one.at.y + h } },
  );
  return { widgets: bindHolderFilters([added, ...moved], named, catalog), id };
}

/** The filters every Search and filter widget of `widgets` declares (the platform's own definition). */
function filtersOfWidgets(widgets: readonly PageWidget[]): PageFilter[] {
  return widgets
    .filter((one) => one.type === FILTER_WIDGET)
    .flatMap((one) =>
      Array.isArray(one.config?.filters) ? (one.config.filters as PageFilter[]) : [],
    );
}

/**
 * The page's widgets with `filters` as what its Search and filter widget holds: for a
 * change that still speaks of the page's filters as one list (a suggestion). Added
 * ones are put in the first widget, or in a new one at the top.
 */
export function withPageFilters(
  widgets: readonly PageWidget[],
  filters: readonly PageFilter[],
  definition: WidgetDefinition | undefined,
  catalog: Catalog,
): PageWidget[] {
  const have = new Set(filtersOfWidgets(widgets).map((one) => one.name));
  const added = filters.filter((one) => !have.has(one.name));
  if (added.length === 0) return [...widgets];
  const holder = widgets.find((one) => one.type === FILTER_WIDGET);
  if (!holder) {
    return definition
      ? insertFilterWidget(widgets, definition, added, catalog).widgets
      : [...widgets];
  }
  return widgets.map((one) =>
    one.id === holder.id
      ? {
          ...one,
          config: {
            ...one.config,
            filters: [...(Array.isArray(one.config?.filters) ? one.config.filters : []), ...added],
          },
        }
      : one,
  );
}

// ---------------------------------------------------------------------------
// The tabs of a container

/** What becomes of the widgets of a tab that is removed: moved to another tab, or removed with it. */
export type TabFate = { move: string } | { remove: true };

/** The tabs a container holds. */
export function tabsFor(widget: PageWidget | undefined): { id: string; title: string }[] {
  const tabs = widget?.config?.tabs;
  return Array.isArray(tabs) ? (tabs as { id: string; title: string }[]) : [];
}

// ---------------------------------------------------------------------------
// Adding a widget

/** A widget's id on a page: its type's name, made unique. */
export function newId(type: string, widgets: readonly PageWidget[]): string {
  const base =
    (type.split("/")[1] ?? type).replace(/[^a-z0-9_-]/g, "-").replace(/^[^a-z]+/, "") || "widget";
  let id = base;
  for (let n = 2; widgets.some((one) => one.id === id); n += 1) id = `${base}-${n}`;
  return id;
}

/** The table most of a page reads, which is what a new widget most likely reads. */
export function mainTable(widgets: readonly PageWidget[], catalog: Catalog): string | undefined {
  const counts = new Map<string, number>();
  for (const widget of widgets) {
    for (const input of Object.values(widget.data ?? {})) {
      const table = visualOf(input)?.table;
      if (table) counts.set(table, (counts.get(table) ?? 0) + 1);
    }
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? (catalog.tables.length === 1 ? catalog.tables[0]?.name : undefined);
}

const TEMPORAL = new Set(["date", "timestamp"]);
/** Columns that hold a handful of named things, so that they make a grid's headings. */
const GROUPING = /^(status|state|stage|type|kind|category|clinic|channel|priority|species|role)$/;
/** When a row was made or is due: the date a grid is cut by. */
const WHEN_MADE = /(^|_)(issued|created|starts?|date|due|on|scheduled|opened|booked)(_|$)/;
/** What happens to some rows only (chased, paid, sent, cancelled…): a poor heading. */
const MOSTLY_EMPTY = /(chased|paid|sent|cancel+ed|completed|closed|deleted|resolved|reminded)/;

/** The data inputs a new widget starts with when the page's table is obvious: a count, by the first date or kind. */
export function defaultInputs(
  definition: WidgetDefinition,
  table: string | undefined,
  catalog: Catalog,
): Record<string, DataInput> {
  if (!table) return {};
  const columns = withSystemColumns(
    catalog.tables.find((one) => one.name === table)?.columns ?? [],
  );
  const inputs: Record<string, DataInput> = {};
  for (const [name, declared] of Object.entries(definition.data)) {
    if (declared.required === false) continue;
    if (!sourcesOf(declared, "dashboard").includes("table")) continue;
    const visual: VisualQuery = { table };
    if (declared.shape === "summary") {
      const values = declared.values ?? { min: 1, max: 1 };
      const breakdowns = declared.breakdowns ?? { min: 0, max: 1 };
      if (values.min > 0) visual.measures = [{ fn: "count", as: "count" }];
      if (breakdowns.min > 1) {
        // A grid (a Pivot) wants one breakdown down the side and another across the top: the
        // table's choices and references first, then its dates by month, then its text.
        const kinds = (test: (column: CatalogColumn) => boolean) =>
          columns.filter((column) => !SYSTEM_COLUMNS.has(column.name) && test(column));
        // A few named things to put down the side (a status, a clinic), then when something was
        // made or is due, then what it refers to; a column that is mostly empty is no heading.
        const across = [
          ...kinds((column) => column.type === "enum"),
          ...kinds((column) => column.type === "text" && GROUPING.test(column.name)),
          ...kinds((column) => TEMPORAL.has(column.type) && WHEN_MADE.test(column.name)),
          ...kinds((column) => column.references !== null),
          ...kinds((column) => TEMPORAL.has(column.type) && !MOSTLY_EMPTY.test(column.name)),
          ...kinds((column) => column.type === "text"),
        ]
          .filter((column, at, all) => all.findIndex((one) => one.name === column.name) === at)
          .slice(0, breakdowns.min);
        if (across.length > 0) {
          visual.groupBy = across.map((column) => ({
            column: column.name,
            ...(TEMPORAL.has(column.type) ? { bucket: "month" as const } : {}),
          }));
        }
      } else if (breakdowns.min > 0) {
        const by =
          columns.find((column) => column.name !== "updated_at" && TEMPORAL.has(column.type)) ??
          columns.find((column) => column.type === "enum") ??
          columns.find((column) => column.type === "text");
        if (by) {
          visual.groupBy = [
            { column: by.name, ...(TEMPORAL.has(by.type) ? { bucket: "week" as const } : {}) },
          ];
        }
      }
    }
    inputs[name] = { source: { visual } };
  }
  return inputs;
}

// ---------------------------------------------------------------------------
// Places

export interface Place {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A place clamped to what the definition allows and to the twelve columns. */
export function clampPlace(definition: WidgetDefinition | undefined, want: Place): Place {
  const min = definition?.layout.min ?? { w: 1, h: 1 };
  const max = definition?.layout.max ?? { w: PAGE_COLUMNS, h: MAX_WIDGET_HEIGHT };
  const whole = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);
  const w = Math.min(Math.max(whole(want.w), min.w), Math.min(max.w, PAGE_COLUMNS));
  const h = Math.min(Math.max(whole(want.h), min.h), Math.min(max.h, MAX_WIDGET_HEIGHT));
  const x = Math.min(Math.max(whole(want.x), 0), PAGE_COLUMNS - w);
  const y = Math.max(whole(want.y), 0);
  return { x, y, w, h };
}

/**
 * The widgets with `movedId` where it is, whatever it now lies on pushed out of its
 * way, and the rest risen as far as they go: the canvas's own rule (`placed`), so a
 * place typed in the Layout panel settles exactly as a drag does (POLISH-013).
 */
export function settleOnGrid(widgets: readonly PageWidget[], movedId: string): PageWidget[] {
  const moved = widgets.find((one) => one.id === movedId);
  return moved ? placed(widgets, movedId, moved.at) : widgets.map((one) => ({ ...one }));
}

/** What the widgets would be if one were removed: what was under it rises into the room it leaves. */
export function withoutWidget(widgets: readonly PageWidget[], id: string): PageWidget[] {
  return without(widgets, id);
}

/** A copy of a widget just under the original, with an id of its own. */
export function duplicated(
  widgets: readonly PageWidget[],
  id: string,
): { widgets: PageWidget[]; id: string } | undefined {
  const source = widgets.find((one) => one.id === id);
  if (!source) return undefined;
  const copyId = newId(source.type, widgets);
  const copy: PageWidget = {
    ...structuredClone(source),
    id: copyId,
    ...(source.title ? { title: `${source.title} copy` } : {}),
    at: { ...source.at, y: source.at.y + source.at.h },
  };
  return { widgets: settleOnGrid([...widgets, copy], copyId), id: copyId };
}

/**
 * The widgets of a page once `gone` (a Search and filter widget that was taken off it) is
 * not there: what followed the filters it declared, and no other widget declares, follows
 * nothing.
 */
export function unbindDeclared(widgets: readonly PageWidget[], gone: PageWidget): PageWidget[] {
  const still = new Set(filtersOfWidgets(widgets).map((one) => one.name));
  const lost = filtersOfWidgets([gone])
    .map((one) => one.name)
    .filter((name) => !still.has(name));
  return widgets.map((one) => lost.reduce((next, name) => unbindFilter(next, name), one));
}

/** A Text's own heading when it has none set: the words in bold that begin it ("**In dollars.** Every…"). */
export function textHeading(text: unknown): string | undefined {
  if (typeof text !== "string") return undefined;
  const found = /^\s*(?:#{1,6}\s+(.+?)\s*(?:\n|$)|\*\*(.+?)\*\*)/.exec(text);
  const said = (found?.[1] ?? found?.[2] ?? "")
    .replace(/[*_`]/g, "")
    .replace(/[.:]\s*$/, "")
    .trim();
  if (said === "") return undefined;
  return said.length > 40 ? `${said.slice(0, 39).trimEnd()}…` : said;
}

/** What a widget is called where it is named: its title, a Text's heading, else what it is. */
export function widgetName(
  widget: {
    id: string;
    type: string;
    title?: string | undefined;
    config?: Record<string, unknown> | undefined;
  },
  definition: { title: string } | undefined,
): string {
  if (widget.title) return widget.title;
  if (widget.type === "core/text") {
    const heading_ = textHeading(widget.config?.text);
    if (heading_) return heading_;
  }
  return definition?.title || widget.id;
}

/** A page's title inside a sentence: a leading "The" is not a capital there ("Open the visit chosen"). */
export const named = (title: string): string => title.replace(/^The /, "the ");
