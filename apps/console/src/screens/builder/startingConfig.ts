/**
 * What a widget starts with when it is added to a page that reads a table: the places of a List,
 * the fields of a Record detail and where it gets its record. Written into the widget's own
 * configuration, so the drawer shows what the page draws and a publish has something to check; a
 * person changes them as they would any setting. Pure, so it is tested by itself.
 */
import type { Page, PageWidget } from "@volvel/manifest";
import { moneyFormatOf } from "@volvel/widgets";
import type { CatalogColumn, CatalogTable } from "../../kit/inspector/model.ts";
import { detailWidget, infoFromCatalog, isRowsWidget, isSystem, tableOf } from "./records.ts";

/** The columns that name a row, most telling first. */
const NAMING = ["name", "title", "number", "code", "reference", "ref", "label", "subject"];
const STATUS = ["status", "state", "stage"];
const WHEN = ["starts_at", "date", "due_on", "due_at", "scheduled_at", "scheduled_for", "on"];

/** The columns a List may place: the table's own, not JSON and not the ones the platform sets. */
const placeable = (column: CatalogColumn) =>
  !isSystem(column.name) && column.type !== "json" && column.type !== "enum_list";

export interface Places {
  title?: string;
  subtitle?: string;
  right?: string;
  badge?: string;
}

/**
 * Where a row's columns go: what names it (name, title, number) as the title, its status as the
 * badge, the amount (else the date) at the right, and a line under the title of what it is
 * about (the thing it refers to, else its next text). A column goes in one place only.
 */
export function placesFor(table: CatalogTable): Places {
  const columns = table.columns.filter(placeable);
  const taken = new Set<string>();
  const take = (column: CatalogColumn | undefined): string | undefined => {
    if (!column || taken.has(column.name)) return undefined;
    taken.add(column.name);
    return column.name;
  };
  const named = (names: readonly string[]) =>
    names.flatMap((name) => columns.filter((column) => column.name.toLowerCase() === name))[0];

  const title = take(
    named(NAMING) ??
      columns.find((column) => column.type === "text" && !column.references) ??
      columns[0],
  );
  const badge = take(
    named(STATUS) ?? columns.find((column) => column.type === "enum" && !taken.has(column.name)),
  );
  const right = take(
    columns.find((column) => !taken.has(column.name) && moneyFormatOf(column)) ??
      named(WHEN) ??
      columns.find(
        (column) =>
          !taken.has(column.name) && (column.type === "date" || column.type === "timestamp"),
      ) ??
      columns.find(
        (column) =>
          !taken.has(column.name) && (column.type === "integer" || column.type === "number"),
      ),
  );
  const subtitle = take(
    columns.find((column) => !taken.has(column.name) && column.references) ??
      columns.find((column) => !taken.has(column.name) && column.type === "text"),
  );
  return {
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(right ? { right } : {}),
    ...(badge ? { badge } : {}),
  };
}

/** What a widget starts with beyond its definition's defaults, on the table the page reads. */
export function startingConfigFor(
  widget: PageWidget,
  table: CatalogTable | undefined,
  page: Pick<Page, "widgets" | "kind" | "record"> & { widgets: readonly PageWidget[] },
): PageWidget {
  if (!table) return widget;
  if (widget.type === "core/list") {
    const places = placesFor(table);
    return { ...widget, config: { ...places, ...widget.config } };
  }
  if (widget.type === "core/detail") {
    const info = infoFromCatalog({ tables: [table], queries: [], maySql: false }, table.name);
    const made = info ? detailWidget(info, widget.at) : undefined;
    const source = widget.data?.record?.source;
    // On a page that is not open on a record, a Record detail follows the table the page shows.
    const follows = page.widgets.find((one) => isRowsWidget(one) && tableOf(one) === table.name);
    const needs = source === undefined || !("record" in source || "selected" in source);
    return {
      ...widget,
      config: { ...made?.config, ...widget.config },
      ...(needs && follows && !(page.record && (page.kind ?? "page") !== "page")
        ? { data: { record: { source: { selected: follows.id } } } }
        : {}),
    };
  }
  return widget;
}
