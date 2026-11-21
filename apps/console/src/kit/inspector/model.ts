/**
 * What the inspector does with a widget, with no React in it so it can be
 * tested by itself. It reads a widget's definition (`@volvel/widgets`) and
 * knows nothing about any widget type in particular: a pack's widgets are
 * drawn from their hints (S9, decision 0005).
 */
import {
  type DataInputDeclaration,
  type InspectorHint,
  type Surface,
  TABS,
  type Tab,
  type WidgetDefinition,
} from "@volvel/widgets";
import {
  groupName,
  type DataInput,
  type PageFilter,
  type PageWidget,
  type VisualQuery,
  PAGE_COLUMNS,
  MAX_WIDGET_HEIGHT,
} from "@volvel/manifest";

/** A column of a table, as the workspace's schema says. */
export interface CatalogColumn {
  name: string;
  type: string;
  references: string | null;
}
export interface CatalogTable {
  name: string;
  columns: CatalogColumn[];
}
/** What a widget can ask questions of: the tables, the saved queries, and whether SQL may be written. */
export interface Catalog {
  tables: CatalogTable[];
  queries: { path: string; description: string }[];
  maySql: boolean;
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
      level: one.level ?? "main",
    })),
  );
}

/** The widget's configuration with its definition's defaults filled in. */
export function configOf(definition: WidgetDefinition, widget: PageWidget): Record<string, unknown> {
  return { ...(definition.defaults ?? {}), ...(widget.config ?? {}) };
}

/** `when`: equality only, against the configuration as the view sees it. */
export function isShown(hint: InspectorHint, config: Record<string, unknown>): boolean {
  return Object.entries(hint.when ?? {}).every(([name, value]) => config[name] === value);
}

/** Whether a tab has anything to draw. Rules and Actions say what is so even when nothing can be set. */
export function tabsOf(definition: WidgetDefinition): Tab[] {
  return TABS.filter((tab) => {
    if (tab === "data") return dataParts(definition).length > 0 || configSettings(definition, tab).length > 0;
    if (tab === "display") return true; // the title and the line under it are every widget's
    if (tab === "actions") return Object.keys(definition.events).length > 0 || configSettings(definition, tab).length > 0;
    return true; // who can see it is said for every widget
  });
}

/** A number shown beside a tab's name, when there is one. */
export function tabCount(definition: WidgetDefinition, widget: PageWidget, tab: Tab): number | undefined {
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
  const empty =
    value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) delete config[name];
  else config[name] = value;
  const { config: _before, ...rest } = widget;
  return Object.keys(config).length > 0 ? { ...rest, config } : rest;
}

/** A widget with one data input replaced, or taken away. */
export function withInput(widget: PageWidget, name: string, input: DataInput | undefined): PageWidget {
  const data = { ...(widget.data ?? {}) };
  if (input) data[name] = input;
  else delete data[name];
  const { data: _before, ...rest } = widget;
  return Object.keys(data).length > 0 ? { ...rest, data } : rest;
}

/** A widget with its title or subtitle set. */
export function withText(widget: PageWidget, field: "title" | "subtitle", value: string): PageWidget {
  const { [field]: _before, ...rest } = widget;
  return value.trim() === "" && field === "subtitle" ? rest : { ...rest, [field]: value };
}

export const visualOf = (input: DataInput | undefined): VisualQuery | undefined =>
  input && "visual" in input.source ? input.source.visual : undefined;

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
  return (declared?.sources ?? (surface === "dashboard" ? ["table", "query", "sql"] : ["table", "query"])) as readonly (
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
  return [...(visual.groupBy ?? []).map(groupName), ...(visual.measures ?? []).map((measure) => measure.as)];
}

/** A name for a measure, from what it works out. */
export function measureName(fn: string, column: string | undefined, taken: readonly string[]): string {
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
    if (hint?.control === "column" && (hint.of ?? input) === input && next.config?.[name] === from) {
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

/**
 * Binds a page filter to every data input of a widget whose table has the
 * filter's column (contract, "Page filters"). An input already bound to it,
 * and one that is a saved query or SQL (which fills a parameter it names), is left as it is.
 */
export function bindFilter(widget: PageWidget, filter: PageFilter, catalog: Catalog): PageWidget {
  if (!widget.data) return widget;
  const column = filterColumn(filter);
  let changed = false;
  const data: Record<string, DataInput> = {};
  for (const [name, input] of Object.entries(widget.data)) {
    const visual = visualOf(input);
    const bound = (input.filters ?? []).some((binding) => binding.filter === filter.name);
    if (visual && !bound && hasColumn(catalog, visual.table, column)) {
      data[name] = { ...input, filters: [...(input.filters ?? []), { filter: filter.name, column }] };
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
// Adding a widget

/** A widget's id on a page: its type's name, made unique. */
export function newId(type: string, widgets: readonly PageWidget[]): string {
  const base = (type.split("/")[1] ?? type).replace(/[^a-z0-9_-]/g, "-").replace(/^[^a-z]+/, "") || "widget";
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

/** The data inputs a new widget starts with when the page's table is obvious: a count, by the first date or kind. */
export function defaultInputs(
  definition: WidgetDefinition,
  table: string | undefined,
  catalog: Catalog,
): Record<string, DataInput> {
  if (!table) return {};
  const columns = withSystemColumns(catalog.tables.find((one) => one.name === table)?.columns ?? []);
  const inputs: Record<string, DataInput> = {};
  for (const [name, declared] of Object.entries(definition.data)) {
    if (declared.required === false) continue;
    if (!sourcesOf(declared, "dashboard").includes("table")) continue;
    const visual: VisualQuery = { table };
    if (declared.shape === "summary") {
      const values = declared.values ?? { min: 1, max: 1 };
      const breakdowns = declared.breakdowns ?? { min: 0, max: 1 };
      if (values.min > 0) visual.measures = [{ fn: "count", as: "count" }];
      if (breakdowns.min > 0) {
        const by =
          columns.find((column) => column.name !== "updated_at" && TEMPORAL.has(column.type)) ??
          columns.find((column) => column.type === "enum") ??
          columns.find((column) => column.type === "text");
        if (by) {
          visual.groupBy = [{ column: by.name, ...(TEMPORAL.has(by.type) ? { bucket: "week" as const } : {}) }];
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

const overlaps = (a: Place, b: Place) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The widgets with `movedId` where it is, and whatever it now lies on pushed
 * down out of its way, and that in turn, so nothing overlaps.
 */
export function settleOnGrid(widgets: readonly PageWidget[], movedId: string): PageWidget[] {
  const next = widgets.map((one) => ({ ...one, at: { ...one.at } }));
  const fixed = next.find((one) => one.id === movedId);
  if (!fixed) return next;
  const queue = [fixed];
  for (let guard = 0; queue.length > 0 && guard < 500; guard += 1) {
    const pusher = queue.shift() as PageWidget;
    for (const other of next) {
      if (other.id === pusher.id || other.id === movedId) continue;
      if (overlaps(pusher.at, other.at)) {
        other.at.y = pusher.at.y + pusher.at.h;
        queue.push(other);
      }
    }
  }
  return next;
}

/** What the widgets would be if one were removed: what was under it rises into the room it leaves. */
export function withoutWidget(widgets: readonly PageWidget[], id: string): PageWidget[] {
  const rest = widgets.filter((one) => one.id !== id).map((one) => ({ ...one, at: { ...one.at } }));
  // Bring each widget up while there is room above it, top to bottom.
  const order = [...rest].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  for (const widget of order) {
    while (
      widget.at.y > 0 &&
      !rest.some((other) => other.id !== widget.id && overlaps({ ...widget.at, y: widget.at.y - 1 }, other.at))
    ) {
      widget.at.y -= 1;
    }
  }
  return rest;
}

/** A copy of a widget just under the original, with an id of its own. */
export function duplicated(widgets: readonly PageWidget[], id: string): { widgets: PageWidget[]; id: string } | undefined {
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
