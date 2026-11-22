/**
 * "+ Page" from a table (phase 27, M8): a page made with its widgets, and the pages it
 * opens, in one change. "A list of Invoices" is a search, a table, a side sheet that a
 * click on a row opens and a New invoice button that opens a form; "An Invoice record
 * page" is a page on one record, with the rows of each table that refers to it. Pure: the
 * builder adds what is returned as one step that Undo takes back whole.
 */
import { FILTER_WIDGET, type Page, type PageWidget, widgetRegistry } from "@volvel/manifest";
import { type Catalog, insertFilterWidget, newSearch } from "../../kit/inspector/model.ts";
import { uniquePageId } from "./pageKinds.ts";
import {
  defaultPlan,
  detailPageFor,
  detailWidget,
  formModal,
  makeDetail,
  manyOf,
  oneOf,
  openButton,
  openRecord,
  type TableInfo,
  tableOf,
  textColumns,
  withArticle,
  withRowClick,
} from "./records.ts";

export type Start = "blank" | "list" | "record";

/** What a start makes: its pages (the one to open first), and what to say about it. */
export interface Started {
  pages: Page[];
  /** The page the builder shows after. */
  open: string;
  told: string;
}

/** The most tables a record page lists the rows of: a page holds at most thirty widgets. */
const MOST_RELATED = 6;

const upper = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** The words of the choices: "A blank page", "A list of Invoices", "An Invoice record page". */
export const startWords = (start: Start, table: string | undefined): string => {
  if (start === "blank" || !table) return "A blank page";
  return start === "list"
    ? `A list of ${manyOf(table)}`
    : upper(`${withArticle(oneOf(table))} record page`);
};

/** What a page of this start is called until it is named. */
export const startTitle = (start: Start, table: string | undefined): string => {
  if (start === "blank" || !table) return "";
  return start === "list" ? manyOf(table) : `${oneOf(table)} record`;
};

/** What the catalog would say of one table: enough for a search to find its text columns. */
const catalogOf = (table: TableInfo): Catalog => ({
  tables: [
    {
      name: table.name,
      columns: table.columns.map((column) => ({
        name: column.name,
        type: column.type,
        references: column.references ?? null,
      })),
    },
  ],
  queries: [],
  maySql: false,
});

export function blankPage(title: string, pages: readonly Page[]): Started {
  const id = uniquePageId(pages, title);
  return { pages: [{ id, title, widgets: [] }], open: id, told: "" };
}

/** A modal of the app that makes a record of the table, if it has one. */
const createModalFor = (pages: readonly Page[], table: string): Page | undefined =>
  pages.find(
    (page) =>
      page.kind === "modal" &&
      page.widgets.some((widget) => widget.type === "core/form" && tableOf(widget) === table),
  );

/**
 * "A list of Invoices": a Search and filter with a search over the text columns, a button
 * "New invoice" that opens a create form, and a Table of every column whose rows open the
 * Invoice detail side sheet. A detail sheet or form the app already has is used, not made again.
 */
export function listPage(table: TableInfo, title: string, pages: readonly Page[]): Started {
  const noun = oneOf(table.name);
  const words = textColumns(table);
  const page: Page = { id: uniquePageId(pages, title), title, widgets: [] };
  const taken = [...pages, page];
  const search = words.length > 0;

  const grid: PageWidget = {
    id: "table",
    type: "core/table",
    title: manyOf(table.name),
    at: { x: 0, y: 1, w: 12, h: 10 },
    data: { rows: { source: { visual: { table: table.name } } } },
    config: { pageSize: 25 },
  };
  const existing = detailPageFor(pages, table.name);
  const sheet = existing ? undefined : makeDetail(grid, table, taken);
  const click = existing ? openRecord(existing.id) : (sheet as NonNullable<typeof sheet>).click;
  const added: Page[] = [page];
  if (sheet) {
    added.push(sheet.page);
    taken.push(sheet.page);
  }

  const form = createModalFor(pages, table.name);
  const plan = defaultPlan(table);
  const modal = form ?? formModal(plan, taken);
  if (!form) added.push(modal);

  const body: PageWidget[] = [
    openButton("new", form ? `New ${noun.toLowerCase()}` : plan.title, modal.id, {
      x: 0,
      y: 0,
      w: 3,
      h: 1,
    }),
    withRowClick(grid, click),
  ];
  // The search bar goes at the top and binds itself to what reads the table, as the inspector does.
  const filter = widgetRegistry().get(FILTER_WIDGET);
  page.widgets =
    search && filter
      ? insertFilterWidget(body, filter, [newSearch(table.name, [])], catalogOf(table)).widgets
      : body;
  const made = [
    search ? "a search" : undefined,
    "a table",
    existing ? undefined : sheet?.page.title,
    `a “${plan.title}” button`,
  ].filter(Boolean);
  return {
    pages: added,
    open: page.id,
    told: `${title} is added, with ${made.slice(0, -1).join(", ")} and ${made.at(-1)}.`,
  };
}

/**
 * "An Invoice record page": a page of kind `record` on the table, with a Record detail
 * and, for each table that refers to it, a Table of those rows, filtered to this record.
 */
export function recordPage(
  table: TableInfo,
  title: string,
  pages: readonly Page[],
  catalog: Catalog,
): Started {
  const noun = oneOf(table.name);
  const widgets: PageWidget[] = [
    detailWidget(table, `${noun} detail`, { x: 0, y: 0, w: 12, h: 9 }),
  ];
  const related = catalog.tables
    .flatMap((other) =>
      other.columns
        .filter((column) => column.references === table.name)
        .map((column) => ({ table: other.name, column: column.name })),
    )
    .slice(0, MOST_RELATED);
  let y = 9;
  for (const [at, one] of related.entries()) {
    widgets.push({
      id: at === 0 ? "table" : `table-${at + 1}`,
      type: "core/table",
      title: manyOf(one.table),
      at: { x: 0, y, w: 12, h: 7 },
      data: {
        rows: {
          source: {
            visual: {
              table: one.table,
              filters: [{ column: one.column, op: "eq", value: { record: "id" } }],
            },
          },
        },
      },
      config: { pageSize: 25 },
    });
    y += 7;
  }
  const page: Page = {
    id: uniquePageId(pages, title),
    title,
    kind: "record",
    record: { table: table.name },
    widgets,
  };
  const lists =
    related.length === 0
      ? ""
      : `, and the rows of ${related.map((one) => manyOf(one.table)).join(", ")} that refer to it`;
  return {
    pages: [page],
    open: page.id,
    told: `${title} is added: the ${noun.toLowerCase()}'s details${lists}.`,
  };
}
