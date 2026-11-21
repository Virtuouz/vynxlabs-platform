import type { PageWidget } from "@volvel/manifest";
import {
  detailEdit,
  detailPageFor,
  type Edit,
  isRowsWidget,
  manyOf,
  oneOf,
  openRecord,
  type PageContext,
  type TableInfo,
  tableOf,
  withArticle,
  withRowClick,
} from "./records.ts";

/**
 * What a table or list that does nothing when a row is clicked can be offered:
 * "Open record detail" when the app has a page that shows one record of its
 * table, else "Make an Invoice detail", which makes one. This is the one
 * helper the inspector's Actions tab calls for the `rowClick` event, and the
 * builder's own offer beside the inspector (`RowClickOffer`) calls too.
 */
export function rowClickOffer(
  context: PageContext,
  widget: PageWidget,
  table: TableInfo | undefined,
): { label: string; made: boolean; edit: Edit } | undefined {
  const name = tableOf(widget);
  if (!isRowsWidget(widget) || !name || widget.on?.rowClick) return undefined;
  const existing = detailPageFor(context.pages, name);
  if (existing) {
    return {
      label: "Open record detail",
      made: false,
      edit: {
        widgets: context.widgets.map((one) =>
          one.id === widget.id ? withRowClick(one, openRecord(existing.id)) : one,
        ),
        filters: [...context.filters],
        addPages: [],
        select: widget.id,
        told: `A click on a row of ${widget.title || manyOf(name)} opens ${existing.title}.`,
      },
    };
  }
  if (!table) return undefined;
  return {
    label: `Make ${withArticle(oneOf(name))} detail`,
    made: true,
    edit: detailEdit(context, widget, table),
  };
}
