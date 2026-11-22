/**
 * What the builder writes for records (phase 26): the detail a table's rows
 * open, the form that makes or changes a record, and the next steps "Add to
 * page" suggests. Each is a pure change: the page's widgets as
 * they should become, with the pages it also adds. The editor applies one as a
 * single step that Undo takes back whole.
 */
import {
  displayGuess,
  FILTER_WIDGET,
  type Page,
  type PageFilter,
  type PageWidget,
  topLevel,
  widgetRegistry,
} from "@volvel/manifest";
import {
  bindHolderFilters,
  type Catalog,
  heading,
  visualOf,
  withPageFilters,
} from "../../kit/inspector/model.ts";
import { nextId } from "./containers.ts";
import type { Action, Condition, Step } from "./contract.ts";
import { kindOf, uniquePageId } from "./pageKinds.ts";

// ----- What a table is -----

export interface InfoColumn {
  name: string;
  type: string;
  required: boolean;
  references?: string;
  /** For an enum: its values. */
  values: string[];
}
export interface TableInfo {
  name: string;
  columns: InfoColumn[];
}

/** What `GET …/tables/<name>` says, as far as a form needs it. */
interface RawTable {
  columns: {
    name: string;
    type: string;
    required?: boolean;
    status?: string;
    references?: string | null;
    values?: (string | { value: string })[];
  }[];
}

export function tableInfo(name: string, raw: RawTable): TableInfo {
  return {
    name,
    columns: raw.columns
      .filter((column) => column.status !== "retired")
      .map((column) => ({
        name: column.name,
        type: column.type,
        required: column.required === true,
        ...(column.references ? { references: column.references } : {}),
        values: (column.values ?? []).map((one) => (typeof one === "string" ? one : one.value)),
      })),
  };
}

/** A table's own columns, from what the catalog knows when the table's definition is not to hand. */
export function infoFromCatalog(catalog: Catalog, name: string): TableInfo | undefined {
  const found = catalog.tables.find((one) => one.name === name);
  if (!found) return undefined;
  return {
    name,
    columns: found.columns.map((column) => ({
      name: column.name,
      type: column.type,
      required: false,
      ...(column.references ? { references: column.references } : {}),
      values: [],
    })),
  };
}

/** Every table has these, and they are set by the platform: never asked, never drawn as a field. */
export const SYSTEM_COLUMNS = ["id", "created_at", "updated_at"] as const;
export const isSystem = (column: string) => (SYSTEM_COLUMNS as readonly string[]).includes(column);

/** The last word of a table's path: `billing/invoices` is `invoices`. */
const lastName = (table: string) => table.split("/").pop() ?? table;

/** "invoices" as one of them: "invoice". */
export function singular(table: string): string {
  const name = lastName(table).toLowerCase();
  if (/ies$/.test(name)) return `${name.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(name)) return name;
  if (/(ches|shes|xes|sses)$/.test(name)) return name.slice(0, -2);
  if (/s$/.test(name)) return name.slice(0, -1);
  return name;
}
/** "Invoice": one of the table, as a title. */
export const oneOf = (table: string): string => heading(singular(table));
/** "Invoices": the table, as a title. */
export const manyOf = (table: string): string => heading(lastName(table));
/** "an Invoice" or "a Customer": for "Make an Invoice detail". */
export const withArticle = (noun: string): string =>
  `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;

/** The table a widget reads its rows or record from. */
export function tableOf(widget: PageWidget): string | undefined {
  for (const input of Object.values(widget.data ?? {})) {
    const table = visualOf(input)?.table;
    if (table) return table;
  }
  return undefined;
}

export const isRowsWidget = (widget: PageWidget): boolean =>
  widget.type === "core/table" || widget.type === "core/list";

// ----- What a change is -----

/** The row under the lowest widget on the page's own grid (what is in a container is on the container's). */
export const bottomOf = (widgets: readonly PageWidget[]): number =>
  topLevel(widgets).reduce((low, one) => Math.max(low, one.at.y + one.at.h), 0);

/** What a builder change makes of a page: its widgets (its filters are those of its Search and filter widgets), the pages it adds, and what it says. */
export interface Edit {
  widgets: PageWidget[];
  addPages: Page[];
  /** The widget to choose after. */
  select?: string;
  /** What is said aloud, and in the words of Undo. */
  told: string;
}

export interface PageContext {
  widgets: readonly PageWidget[];
  filters: readonly PageFilter[];
  /** Every page of the app. */
  pages: readonly Page[];
  /** The page being built. */
  page: Page;
}

// ----- The detail a table's rows open -----

/** A side sheet or record page that shows one record of the table, if the app has one. */
export const detailPageFor = (pages: readonly Page[], table: string): Page | undefined =>
  pages.find(
    (page) =>
      (page.kind === "sheet" || page.kind === "record") &&
      page.record?.table === table &&
      page.widgets.some((widget) => widget.type === "core/detail"),
  );

/** What happens when a row is clicked and the record opens. */
export const openRecord = (page: string): Action => ({
  steps: [{ do: "open", page, record: "event" }],
});

/** An action written for a clicked row, as it reads on the record's own page: "the row" is "this record". */
export function onThisRecord(action: Action): Action {
  const value = (set: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(set).map(([name, one]) => [
        name,
        one && typeof one === "object" && "record" in one && (one as { of?: string }).of === "event"
          ? { ...(one as object), of: "this" }
          : one,
      ]),
    );
  const steps = action.steps.map((step): Step => {
    if (step.do === "update") {
      return {
        ...step,
        record: step.record === "event" ? "this" : step.record,
        set: value(step.set) as typeof step.set,
      };
    }
    if (step.do === "delete")
      return { ...step, record: step.record === "event" ? "this" : step.record };
    if (step.do === "create") return { ...step, set: value(step.set) as typeof step.set };
    if (step.do === "open" && step.record === "event") return { ...step, record: "this" };
    return step;
  });
  const when = action.when?.map(
    (one): Condition => ("field" in one && one.of === "event" ? { ...one, of: "this" } : one),
  );
  return { ...action, steps, ...(when ? { when } : {}) };
}

/**
 * "Make an Invoice detail": a side sheet that shows one record of the table.
 * It has a Record detail with the heading, the status and every column as a
 * field, and the table's row actions as its own; and the click on a row opens
 * it. Returns the page and the action the click should run.
 */
export function makeDetail(
  list: PageWidget,
  table: TableInfo,
  pages: readonly Page[],
): { page: Page; click: Action } {
  const title = `${oneOf(table.name)} detail`;
  const id = uniquePageId(pages, `${singular(table.name)}-detail`);
  const rowActions =
    (list.config?.rowActions as
      | { id: string; label: string; tone?: string; action: Action }[]
      | undefined) ?? [];
  const detail = detailWidget(table, { x: 0, y: 0, w: 12, h: 12 }, rowActions);
  return {
    page: { id, title, kind: "sheet", record: { table: table.name }, widgets: [detail] },
    click: openRecord(id),
  };
}

/**
 * A Record detail of one record of the table: the heading, the status and every column as
 * a field, and `rowActions` (written for a clicked row) as its own actions, read on the record.
 */
export function detailWidget(
  table: TableInfo,
  at: PageWidget["at"],
  rowActions: readonly { id: string; label: string; tone?: string; action: Action }[] = [],
): PageWidget {
  const shown = table.columns.filter(
    (column) => !isSystem(column.name) || column.name === "created_at",
  );
  const heading_ = displayGuess(table.columns) ?? shown[0]?.name ?? "id";
  const status = table.columns.find((column) => column.type === "enum")?.name;
  return {
    id: "detail",
    type: "core/detail",
    // The sheet says what it is in its own header; the record's heading is the first thing it shows.
    at,
    data: { record: { source: { record: "this" } } },
    config: {
      heading: heading_,
      ...(status ? { status } : {}),
      fields: shown
        .filter((column) => column.name !== heading_ && column.name !== status)
        .map((column) => ({ column: column.name })),
      ...(rowActions.length > 0
        ? {
            actions: rowActions.map((one) => ({
              id: one.id,
              label: one.label,
              ...(one.tone === "danger" ? { tone: "danger" } : {}),
              action: onThisRecord(one.action),
            })),
          }
        : {}),
    },
  };
}

/** Every rows widget of the page on this table that does nothing when a row is clicked. */
export const withoutRowClick = (widgets: readonly PageWidget[], table: string): PageWidget[] =>
  widgets.filter((one) => isRowsWidget(one) && tableOf(one) === table && !one.on?.rowClick);

export const withRowClick = (widget: PageWidget, click: Action): PageWidget => ({
  ...widget,
  on: { ...widget.on, rowClick: click },
});

/** The Edit for "Make an Invoice detail" from one table or list: the sheet, and the click that opens it. */
export function detailEdit(context: PageContext, widget: PageWidget, table: TableInfo): Edit {
  const made = makeDetail(widget, table, context.pages);
  return {
    widgets: context.widgets.map((one) =>
      one.id === widget.id ? withRowClick(one, made.click) : one,
    ),
    addPages: [made.page],
    select: widget.id,
    told: `${made.page.title} is made, and a click on a row of ${widget.title || manyOf(table.name)} opens it.`,
  };
}

// ----- Forms -----

/** How a column is drawn as a field, in words. */
export function controlWords(column: InfoColumn, mode: "create" | "edit" = "create"): string {
  switch (column.type) {
    case "reference":
      return `Picker · ${column.references ? manyOf(column.references).toLowerCase() : "records"}`;
    case "enum":
      return column.values.length > 0 ? `Choice · ${column.values.length} to pick from` : "Choice";
    case "enum_list":
      return "Several choices";
    case "boolean":
      return "Yes or no";
    case "date":
      return mode === "create" ? "Date · today by default" : "Date";
    case "timestamp":
      return "Date and time";
    case "integer":
    case "number":
      return "Number";
    case "long_text":
      return "Long text";
    default:
      return "Text";
  }
}

/** The columns a person fills in: not the ones the platform sets, and not json. */
export const askable = (table: TableInfo): InfoColumn[] =>
  table.columns.filter((column) => !isSystem(column.name) && column.type !== "json");

export interface FormPlan {
  mode: "create" | "edit";
  table: TableInfo;
  /** The columns asked, in order. */
  fields: string[];
  where: "modal" | "page";
  /** The modal's title, and the button that opens it. */
  title: string;
  /** What is said after saving. */
  message: string;
}

export function defaultPlan(table: TableInfo, mode: "create" | "edit" = "create"): FormPlan {
  const noun = oneOf(table.name).toLowerCase();
  return {
    mode,
    table,
    fields: askable(table).map((column) => column.name),
    where: "modal",
    title: mode === "create" ? `New ${noun}` : `Edit ${noun}`,
    message: mode === "create" ? `${oneOf(table.name)} created` : `${oneOf(table.name)} saved`,
  };
}

/** The action a form runs when it is sent. */
export function submitAction(plan: FormPlan): Action {
  const set = Object.fromEntries(plan.fields.map((name) => [name, { asked: name }]));
  const steps: Step[] = [
    plan.mode === "create"
      ? { do: "create", table: plan.table.name, set }
      : { do: "update", record: "this", set },
  ];
  if (plan.where === "modal") steps.push({ do: "close" });
  if (plan.message.trim()) steps.push({ do: "message", text: plan.message.trim() });
  return { steps };
}

/** The form itself, as a widget that fills `at`. */
export function formWidget(plan: FormPlan, id: string, at: PageWidget["at"]): PageWidget {
  const noun = oneOf(plan.table.name).toLowerCase();
  return {
    id,
    type: "core/form",
    // In a modal the modal's own title says it; on the page the form carries its heading.
    ...(plan.where === "page" ? { title: plan.title } : {}),
    at,
    data: {
      record: {
        source:
          plan.mode === "create" ? { visual: { table: plan.table.name } } : { record: "this" },
      },
    },
    config: {
      mode: plan.mode,
      fields: plan.fields.map((name) => {
        const column = plan.table.columns.find((one) => one.name === name);
        return {
          column: name,
          ...(column?.required ? { required: true } : {}),
          // A new record's date starts at today; the person filling it in may change it.
          ...(plan.mode === "create" && column?.type === "date"
            ? { initial: { kind: "today" } }
            : {}),
        };
      }),
      submitLabel: plan.mode === "create" ? `Create ${noun}` : "Save",
      submit: submitAction(plan),
    },
  };
}

/** The modal a form opens in: a page of its own, on a record when it edits one. */
export function formModal(plan: FormPlan, pages: readonly Page[]): Page {
  return {
    id: uniquePageId(pages, plan.title),
    title: plan.title,
    kind: "modal",
    ...(plan.mode === "edit" ? { record: { table: plan.table.name } } : {}),
    widgets: [formWidget(plan, "form", { x: 0, y: 0, w: 12, h: 10 })],
  };
}

/** A button that opens a page, on this record when it is passed along. */
export function openButton(
  id: string,
  label: string,
  page: string,
  at: PageWidget["at"],
  onThisRecord_ = false,
): PageWidget {
  return {
    id,
    type: "core/button",
    title: label,
    at,
    config: { label, tone: "primary" },
    on: {
      click: {
        steps: [{ do: "open", page, ...(onThisRecord_ ? { record: "this" as const } : {}) }],
      },
    },
  };
}

/** The most buttons a table's heading line holds (its schema's limit). */
const TABLE_BUTTONS_MAX = 5;

/** Where the button that opens a form goes, and what it is. */
export type FormPlacement =
  | { kind: "table-button"; table: PageWidget; several: boolean }
  | { kind: "row-action"; table: PageWidget; several: boolean }
  | { kind: "page-button" }
  | { kind: "none" };

/**
 * Where a modal form's opening button goes. A form that makes a record gets a button on the
 * heading line of the table of that record on this page (the one it was added from, else the
 * first), written into that table's `buttons`; one that changes a record gets an action on each
 * of that table's rows. A page with no such table gets a button at the end of the page, when
 * the form can be opened from it, and none else.
 */
export function formPlacement(
  context: PageContext,
  plan: FormPlan,
  from?: string | undefined,
): FormPlacement {
  if (plan.where === "page") return { kind: "none" };
  const table = plan.table.name;
  const tables = context.widgets.filter(
    (one) =>
      one.type === "core/table" &&
      tableOf(one) === table &&
      (plan.mode === "create"
        ? ((one.config?.buttons as unknown[] | undefined)?.length ?? 0) < TABLE_BUTTONS_MAX
        : true),
  );
  const target = tables.find((one) => one.id === from) ?? tables[0];
  if (target) {
    return {
      kind: plan.mode === "create" ? "table-button" : "row-action",
      table: target,
      several: tables.length > 1,
    };
  }
  if (plan.mode === "create" || context.page.record?.table === table)
    return { kind: "page-button" };
  return { kind: "none" };
}

/** A table's name for the people building: "Invoices" for the table "invoices", else its heading. */
const nameOfTable = (widget: PageWidget) => widget.title || manyOf(tableOf(widget) ?? "rows");

/** What the line under Add a form says about the button, true of what `formEdit` then does. */
export function formLine(plan: FormPlan, placement: FormPlacement): string {
  const table = manyOf(plan.table.name);
  const noun = oneOf(plan.table.name).toLowerCase();
  if (plan.where === "page") return "The form is added at the end of this page.";
  switch (placement.kind) {
    case "table-button":
      return `Also adds a “${plan.title}” button to the ${table} table${
        placement.several
          ? ` (the ${nameOfTable(placement.table)} table you chose, else the first)`
          : ""
      }.`;
    case "row-action":
      return `Also adds “${plan.title}” to each row of the ${table} table${
        placement.several
          ? ` (${nameOfTable(placement.table)}, the one you chose, else the first)`
          : ""
      }.`;
    case "page-button":
      return plan.mode === "create"
        ? `This page has no ${table} table, so a “${plan.title}” button is added at the end of the page.`
        : `Also adds a “${plan.title}” button at the end of this page, which opens on the ${noun}.`;
    default:
      return `No button is added here: this page has no ${table} table and is not open on a ${noun}. Open the form from a button on one that is.`;
  }
}

/**
 * "Add a form": the form; for a modal, the page it opens as and the button that opens it, put
 * where `formPlacement` says. One edit, so one undo.
 */
export function formEdit(context: PageContext, plan: FormPlan, from?: string): Edit {
  const { widgets, pages } = context;
  const table = plan.table.name;
  if (plan.where === "page") {
    const id = nextId("core/form", widgets);
    const y = bottomOf(widgets);
    return {
      widgets: [...widgets, formWidget(plan, id, { x: 0, y, w: 12, h: 10 })],
      addPages: [],
      select: id,
      told: `The form for ${manyOf(table)} is added at the end of the page.`,
    };
  }
  const modal = formModal(plan, pages);
  const pageId = modal.id;
  const placement = formPlacement(context, plan, from);
  let next = [...widgets];
  let select: string | undefined;
  let told: string;
  if (placement.kind === "table-button" || placement.kind === "row-action") {
    const key = placement.kind === "table-button" ? "buttons" : "rowActions";
    const held = (placement.table.config?.[key] as { id: string }[] | undefined) ?? [];
    const id = uniqueId(
      placement.kind === "table-button" ? "new" : "edit",
      held.map((one) => one.id),
    );
    const added = {
      id,
      label: plan.title,
      ...(placement.kind === "table-button" ? { tone: "primary" } : {}),
      action: {
        steps: [
          {
            do: "open",
            page: pageId,
            ...(placement.kind === "row-action" ? { record: "event" } : {}),
          },
        ],
      },
    };
    next = next.map((one) =>
      one.id === placement.table.id
        ? { ...one, config: { ...one.config, [key]: [...held, added] } }
        : one,
    );
    select = placement.table.id;
    told =
      placement.kind === "table-button"
        ? `The form “${plan.title}” is made as a modal, with a button above the ${manyOf(table)} table that opens it.`
        : `The form “${plan.title}” is made as a modal, and each row of the ${manyOf(table)} table can open it.`;
  } else if (placement.kind === "page-button") {
    const id = nextId("core/button", widgets);
    const y = bottomOf(widgets);
    next.push(openButton(id, plan.title, pageId, { x: 0, y, w: 3, h: 1 }, plan.mode === "edit"));
    select = id;
    told = `The form “${plan.title}” is made as a modal, with a button at the end of the page that opens it.`;
  } else {
    told = `The form “${plan.title}” is made as a modal. Open it from a button on a record's page.`;
  }
  return {
    widgets: next,
    addPages: [modal],
    ...(select ? { select } : {}),
    told,
  };
}

/** `base`, or `base-2`, `base-3` … the first not among `taken`. */
function uniqueId(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
}

// ----- "Add to page": next steps -----

const DONE = /^(paid|done|complete|completed|closed|resolved|shipped|delivered|approved)$/i;

/** The enum column and value a "Mark … button" would set. */
export function markable(table: TableInfo): { column: string; value: string } | undefined {
  for (const column of table.columns) {
    if (column.type !== "enum") continue;
    const value = column.values.find((one) => DONE.test(one));
    if (value) return { column: column.name, value };
  }
  return undefined;
}

export type Suggestion = { hint: string } & (
  | { key: "search"; label: string; columns: string[] }
  | { key: "detail"; label: string; widget: PageWidget }
  | { key: "form"; label: string }
  | { key: "mark"; label: string; column: string; value: string }
  | { key: "filter"; label: string; column: string }
  | { key: "group"; label: string; ids: string[] }
  | { key: "section"; label: string; ids: string[] }
);

/** The columns of the table a search looks in: the ones that hold words. */
export const textColumns = (table: TableInfo): string[] =>
  table.columns
    .filter(
      (column) => (column.type === "text" || column.type === "long_text") && !isSystem(column.name),
    )
    .map((column) => column.name);

/** The most buttons an Action group holds. */
export const GROUP_MAX = 8;

/** The table the page is about: the one most of it reads, or the one it opens on. */
export function pageTable(context: PageContext, mostRead: string | undefined): string | undefined {
  return context.page.record?.table ?? mostRead;
}

/** What is worth offering after what the page already has. */
export function suggestionsFor(context: PageContext, table: TableInfo | undefined): Suggestion[] {
  if (!table) return [];
  const { widgets, filters, pages, page } = context;
  const out: Suggestion[] = [];
  const noun = oneOf(table.name);
  const onRecord = page.record?.table === table.name;
  const reads = widgets.some((widget) => tableOf(widget) === table.name);
  const words = textColumns(table);
  if (
    kindOf(page) === "page" &&
    reads &&
    words.length > 0 &&
    !filters.some((one) => one.type === "search")
  ) {
    out.push({
      key: "search",
      label: `Search ${manyOf(table.name).toLowerCase()}`,
      columns: words,
      hint: `A search bar over ${words.slice(0, 3).join(", ")}`,
    });
  }
  const rows = withoutRowClick(widgets, table.name)[0];
  if (rows && !detailPageFor(pages, table.name)) {
    out.push({
      key: "detail",
      label: `${noun} detail`,
      widget: rows,
      hint: "A side sheet a click on a row opens",
    });
  }
  const hasForm = pages.some(
    (one) =>
      one.kind === "modal" &&
      one.widgets.some((widget) => widget.type === "core/form" && tableOf(widget) === table.name),
  );
  if (!hasForm) {
    out.push({
      key: "form",
      label: `New ${noun.toLowerCase()} form`,
      hint: "A button that opens a form",
    });
  }
  const mark = markable(table);
  if (mark) {
    const label = `Mark ${mark.value.toLowerCase()}`;
    const there = onRecord
      ? widgets.some((widget) => widget.type === "core/button" && widget.config?.label === label)
      : widgets.some(
          (widget) =>
            isRowsWidget(widget) &&
            tableOf(widget) === table.name &&
            ((widget.config?.rowActions as { label: string }[] | undefined) ?? []).some(
              (one) => one.label === label,
            ),
        );
    const canPlace =
      onRecord || widgets.some((widget) => isRowsWidget(widget) && tableOf(widget) === table.name);
    if (!there && canPlace) {
      out.push({
        key: "mark",
        label: `${label} button`,
        ...mark,
        hint: onRecord ? "A button on the record" : "A button on each row",
      });
    }
  }
  const status = table.columns.find((column) => column.type === "enum");
  if (
    status &&
    !onRecord &&
    !filters.some((one) => one.name === status.name || one.from?.column === status.name) &&
    widgets.some((widget) => tableOf(widget) === table.name)
  ) {
    out.push({
      key: "filter",
      label: `${heading(status.name)} filter`,
      column: status.name,
      hint: `Narrow the page by ${status.name.replace(/_/g, " ")}`,
    });
  }
  const buttons = topLevel(widgets).filter((widget) => widget.type === "core/button");
  if (buttons.length >= 2 && buttons.length <= GROUP_MAX) {
    out.push({
      key: "group",
      label: "Group the buttons",
      ids: buttons.map((one) => one.id),
      hint: `One toolbar for ${buttons.length} buttons`,
    });
  }
  const stats = topLevel(widgets).filter((widget) => widget.type === "core/stat");
  if (stats.length >= 2) {
    out.push({
      key: "section",
      label: "A section for the numbers",
      ids: stats.map((one) => one.id),
      hint: `Holds the ${stats.length} numbers under a heading`,
    });
  }
  return out;
}

/** What "Mark paid" does: set the column, when it is not already so. */
export function markAction(mark: { column: string; value: string }, of: "event" | "this"): Action {
  return {
    steps: [
      {
        do: "update",
        record: of,
        set: { [mark.column]: { value: mark.value } },
      },
    ],
    when: [{ field: mark.column, of, test: "is_not", value: mark.value }],
    done: `Marked ${mark.value.toLowerCase()}.`,
  };
}

/** Applies a suggestion that needs nothing asked. The form is the one that asks, in its dialog. */
export function suggestionEdit(
  context: PageContext,
  suggestion: Extract<Suggestion, { key: "detail" | "mark" | "filter" }>,
  table: TableInfo,
  catalog: Catalog,
): Edit {
  const { widgets, page } = context;
  if (suggestion.key === "detail") return detailEdit(context, suggestion.widget, table);
  if (suggestion.key === "filter") {
    const filter: PageFilter = {
      name: suggestion.column,
      label: heading(suggestion.column),
      type: "choice",
      from: { table: table.name, column: suggestion.column },
    };
    return {
      widgets: bindHolderFilters(
        withPageFilters(widgets, [filter], widgetRegistry().get(FILTER_WIDGET), catalog),
        [filter],
        catalog,
      ),
      addPages: [],
      told: `A ${heading(suggestion.column).toLowerCase()} filter is added.`,
    };
  }
  const label = `Mark ${suggestion.value.toLowerCase()}`;
  if (page.record?.table === table.name) {
    const id = nextId("core/button", widgets);
    const y = bottomOf(widgets);
    return {
      widgets: [
        ...widgets,
        {
          id,
          type: "core/button",
          title: label,
          at: { x: 0, y, w: 3, h: 1 },
          config: { label, tone: "primary" },
          on: { click: markAction(suggestion, "this") },
        },
      ],
      addPages: [],
      select: id,
      told: `A “${label}” button is added at the end of the page.`,
    };
  }
  // On a page of rows the button belongs to each row.
  const target = widgets.find((one) => isRowsWidget(one) && tableOf(one) === table.name);
  const next = widgets.map((one) => {
    if (one !== target) return one;
    const rowActions = (one.config?.rowActions as unknown[] | undefined) ?? [];
    return {
      ...one,
      config: {
        ...one.config,
        rowActions: [
          ...rowActions,
          {
            id: `mark-${suggestion.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            label,
            action: markAction(suggestion, "event"),
          },
        ],
      },
    };
  });
  return {
    widgets: next,
    addPages: [],
    ...(target ? { select: target.id } : {}),
    told: `“${label}” is added to each row of ${target?.title || manyOf(table.name)}.`,
  };
}
