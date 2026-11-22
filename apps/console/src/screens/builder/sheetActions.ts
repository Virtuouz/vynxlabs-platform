/**
 * "Shown at the end of the row on hover, and in the detail sheet" (board 13): the row actions of a
 * table or list are also the toolbar of the sheet its click opens. The sheet holds them as its
 * Record detail's own actions, written for the record the sheet is open on, so they run, are
 * greyed with a reason and ask to confirm there as they do on the row. One writer keeps the two in
 * step: whatever changes a table's row actions changes the sheet's, and nothing is written twice
 * (an Action group already on the sheet that holds an action keeps it; the detail does not).
 */
import type { Page, PageWidget } from "@volvel/manifest";
import type { Action } from "./contract.ts";
import { isRowsWidget, onThisRecord } from "./records.ts";

interface Labelled {
  id: string;
  label: string;
  tone?: string;
  action: Action;
}

const MOST_ACTIONS = 6;

const rowActionsOf = (widget: PageWidget | undefined): Labelled[] => {
  const held = widget?.config?.rowActions;
  return Array.isArray(held) ? (held as Labelled[]) : [];
};

/** The pages a table or list opens when a row is clicked, by the `open` step of its `rowClick`. */
export function pagesOpenedBy(widget: PageWidget, pages: readonly Page[]): Page[] {
  const opened = (widget.on?.rowClick?.steps ?? []).flatMap((step) =>
    step.do === "open" ? [step.page] : [],
  );
  return pages.filter(
    (page) => opened.includes(page.id) && (page.kind === "sheet" || page.kind === "record"),
  );
}

/** The ids and labels of what the Action groups of a page already hold. */
function heldByGroups(page: Page): { ids: Set<string>; labels: Set<string> } {
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const widget of page.widgets) {
    if (widget.type !== "core/actions") continue;
    const actions = widget.config?.actions;
    for (const one of Array.isArray(actions) ? (actions as Labelled[]) : []) {
      ids.add(one.id);
      labels.add(one.label.trim().toLowerCase());
    }
  }
  return { ids, labels };
}

/** The detail actions a row's actions become on a sheet: written for its own record, danger kept. */
export function sheetActionsFor(rowActions: readonly Labelled[], page: Page) {
  const held = heldByGroups(page);
  return rowActions
    .filter((one) => !held.ids.has(one.id) && !held.labels.has(one.label.trim().toLowerCase()))
    .map((one) => ({
      id: one.id,
      label: one.label,
      ...(one.tone === "danger" ? { tone: "danger" } : {}),
      action: onThisRecord(one.action),
    }));
}

/**
 * After `pageId`'s widgets changed from `before`: for each table or list whose row actions changed,
 * the Record detail of the sheet its click opens carries the new ones (and drops the old ones it
 * carried), keeping the actions a person added to the detail by hand. Edits `pages` in place; it
 * is called on the draft the editor is changing, so it is one step to Undo.
 */
export function syncSheetActions(
  pages: Page[],
  pageId: string,
  before: readonly PageWidget[],
): void {
  const page = pages.find((one) => one.id === pageId);
  if (!page) return;
  for (const widget of page.widgets) {
    if (!isRowsWidget(widget)) continue;
    const was = rowActionsOf(before.find((one) => one.id === widget.id));
    const now = rowActionsOf(widget);
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    const gone = new Set(was.map((one) => one.id));
    for (const sheet of pagesOpenedBy(widget, pages)) {
      for (const detail of sheet.widgets) {
        if (detail.type !== "core/detail") continue;
        const source = detail.data?.record?.source;
        if (!source || !("record" in source)) continue;
        const own = Array.isArray(detail.config?.actions)
          ? (detail.config?.actions as Labelled[])
          : [];
        const made = sheetActionsFor(now, sheet);
        const ids = new Set(made.map((one) => one.id));
        const kept = own.filter((one) => !gone.has(one.id) && !ids.has(one.id));
        const actions = [...made, ...kept].slice(0, MOST_ACTIONS);
        const { actions: _before, ...config } = (detail.config ?? {}) as Record<string, unknown>;
        detail.config = actions.length > 0 ? { ...config, actions } : config;
      }
    }
  }
}
