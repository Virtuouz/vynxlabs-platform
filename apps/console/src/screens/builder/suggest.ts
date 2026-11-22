/**
 * What "Add to page" suggests, and what grouping does (phase 27, M8): each is a pure
 * change, an `Edit` the editor applies as one step that Undo takes back whole. A search
 * bar bound to what the page reads; buttons made one Action group; the numbers held in
 * a Section; a Record detail's buttons moved above it.
 */
import {
  containerHeight,
  FILTER_WIDGET,
  filterWidgets,
  type PageWidget,
  topLevel,
  widgetRegistry,
} from "@volvel/manifest";
import {
  bindHolderFilters,
  type Catalog,
  newSearch,
  withPageFilters,
} from "../../kit/inspector/model.ts";
import { nextId } from "./containers.ts";
import type { Action } from "./contract.ts";
import {
  type Edit,
  GROUP_MAX,
  manyOf,
  type PageContext,
  type Suggestion,
  suggestionEdit,
  type TableInfo,
} from "./records.ts";

// ----- Where a widget is -----

/** Whether two widgets are placed in the same place: the page itself, or the same container and tab. */
const sameHome = (a: PageWidget, b: PageWidget): boolean =>
  (a.in?.widget ?? "") === (b.in?.widget ?? "") && (a.in?.tab ?? "") === (b.in?.tab ?? "");

const byPlace = (a: PageWidget, b: PageWidget) => a.at.y - b.at.y || a.at.x - b.at.x;

type Place = PageWidget["at"];

const overlaps = (a: Place, b: Place) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The page's own widgets, in order, each pushed down below what it lies on. Only what is
 * on the page's grid: what a container holds is on its own.
 */
function settleTop(widgets: readonly PageWidget[]): PageWidget[] {
  const top = topLevel(widgets).toSorted(byPlace);
  const kept = new Map<string, PageWidget>();
  const placed: PageWidget[] = [];
  for (const widget of top) {
    let at = widget.at;
    for (let lying = placed.find((one) => overlaps(one.at, at)); lying; ) {
      at = { ...at, y: lying.at.y + lying.at.h };
      lying = placed.find((one) => overlaps(one.at, at));
    }
    const next = at === widget.at ? widget : { ...widget, at };
    kept.set(widget.id, next);
    placed.push(next);
  }
  return widgets.map((one) => kept.get(one.id) ?? one);
}

// ----- Search -----

/**
 * "Search invoices": a Search and filter widget at the top of the page (or a search added
 * to the one it has) whose search is bound, as the inspector binds one, to every widget
 * that reads a table that has text to look in. The filters the page already has stay.
 */
export function searchEdit(context: PageContext, table: TableInfo, catalog: Catalog): Edit {
  const filter = newSearch(
    table.name,
    context.filters.map((one) => one.name),
  );
  const definition = widgetRegistry().get(FILTER_WIDGET);
  const widgets = bindHolderFilters(
    withPageFilters(context.widgets, [filter], definition, catalog),
    [filter],
    catalog,
  );
  const holder = filterWidgets(widgets, widgetRegistry())[0];
  return {
    widgets,
    addPages: [],
    ...(holder ? { select: holder.id } : {}),
    told: `A search bar is added at the top, looking in the text of ${manyOf(table.name)}.`,
  };
}

// ----- Sections -----

/**
 * The widgets `ids` held by a new Section titled `title`, which takes the place of the
 * first of them. The section is as wide as the page, and what it holds keeps its columns,
 * its rows made relative to the section's grid (which starts under its heading). What lay
 * below rises or sinks with it, and nothing is left lying on the section.
 * Only widgets on the page's own grid are held; a container is never put in one.
 */
export function wrapInSection(
  widgets: readonly PageWidget[],
  ids: readonly string[],
  title: string,
): { widgets: PageWidget[]; section: PageWidget } | undefined {
  const held = topLevel(widgets).filter(
    (one) => ids.includes(one.id) && one.type !== "core/section" && one.type !== "core/tabs",
  );
  const first = held.toSorted(byPlace)[0];
  if (!first) return undefined;
  const top = Math.min(...held.map((one) => one.at.y));
  const bottom = Math.max(...held.map((one) => one.at.y + one.at.h));
  const id = nextId("core/section", widgets);
  const inside = new Set(held.map((one) => one.id));
  const children = widgets.filter((one) => inside.has(one.id));
  const asChildren = children.map(
    (one): PageWidget => ({
      ...one,
      at: { ...one.at, y: one.at.y - top },
      in: { widget: id },
    }),
  );
  const shell: PageWidget = {
    id,
    type: "core/section",
    title,
    at: { x: 0, y: top, w: 12, h: 2 },
    config: { folds: false },
  };
  const height = containerHeight(shell, asChildren);
  const section: PageWidget = { ...shell, at: { ...shell.at, h: height } };
  // What lay below the held widgets moves down by what the heading adds.
  const grows = height - (bottom - top);
  const next = widgets
    .map((one): PageWidget => {
      if (inside.has(one.id)) return asChildren.find((child) => child.id === one.id) ?? one;
      if (one.in) return one;
      return one.at.y >= bottom ? { ...one, at: { ...one.at, y: one.at.y + grows } } : one;
    })
    .toSpliced(
      widgets.findIndex((one) => one.id === first.id),
      0,
      section,
    );
  // What lay in the band the held widgets stood in, beside them, is pushed below the section.
  const settled = settleTop(
    next.map((one) =>
      !one.in && one.id !== id && !inside.has(one.id) && overlaps(one.at, section.at)
        ? { ...one, at: { ...one.at, y: section.at.y + section.at.h } }
        : one,
    ),
  );
  return { widgets: settled, section };
}

/** "A section for the numbers": the stats on the page, held by a Section. */
export function sectionEdit(context: PageContext, ids: readonly string[], title: string): Edit {
  const made = wrapInSection(context.widgets, ids, title);
  if (!made) {
    return { widgets: [...context.widgets], addPages: [], told: "" };
  }
  return {
    widgets: made.widgets,
    addPages: [],
    select: made.section.id,
    told: `${ids.length} widgets are now in a section called “${title}”.`,
  };
}

// ----- Action groups -----

/** What a button does when it is pressed; a button with nothing set says so, as an Action group would. */
const clickOf = (button: PageWidget): Action =>
  button.on?.click ?? { steps: [{ do: "message", text: "Done" }] };

const toneOf = (button: PageWidget): "primary" | "default" | "danger" | undefined => {
  const tone = button.config?.tone;
  return tone === "primary" || tone === "default" || tone === "danger" ? tone : undefined;
};

/** The other buttons of the page that can join this one: those in the same place, those on its row first. */
export function groupCandidates(widgets: readonly PageWidget[], button: PageWidget): PageWidget[] {
  const others = widgets.filter(
    (one) => one.id !== button.id && one.type === "core/button" && sameHome(one, button),
  );
  const onRow = (one: PageWidget) =>
    one.at.y < button.at.y + button.at.h && button.at.y < one.at.y + one.at.h;
  return [
    ...others.filter(onRow).toSorted(byPlace),
    ...others.filter((one) => !onRow(one)).toSorted(byPlace),
  ];
}

/**
 * The buttons `ids` made one Action group at the place of the first of them (in the page's
 * order), holding their actions in that order: each button's label and tone kept, its
 * `on.click` the action. Returns undefined when fewer than two buttons are given.
 */
export function groupButtons(
  widgets: readonly PageWidget[],
  ids: readonly string[],
): { widgets: PageWidget[]; group: PageWidget } | undefined {
  const buttons = widgets
    .filter((one) => one.type === "core/button" && ids.includes(one.id))
    .toSorted(byPlace)
    .slice(0, GROUP_MAX);
  const first = buttons[0];
  if (!first || buttons.length < 2) return undefined;
  const id = nextId("core/actions", widgets);
  const w = Math.min(
    12,
    Math.max(
      3,
      buttons.reduce((sum, one) => sum + one.at.w, 0),
    ),
  );
  const group: PageWidget = {
    id,
    type: "core/actions",
    title: "Actions",
    at: { x: Math.min(first.at.x, 12 - w), y: first.at.y, w, h: 1 },
    ...(first.in ? { in: first.in } : {}),
    config: {
      actions: buttons.map((one) => {
        const tone = toneOf(one);
        return {
          id: one.id,
          label: String(one.config?.label ?? one.title ?? one.id),
          ...(tone ? { tone } : {}),
          action: clickOf(one),
        };
      }),
      align: "start",
    },
  };
  const gone = new Set(buttons.map((one) => one.id));
  const at = widgets.findIndex((one) => one.id === first.id);
  const kept = widgets.filter((one) => !gone.has(one.id));
  const index = kept.length - widgets.slice(at).filter((one) => !gone.has(one.id)).length;
  return { widgets: kept.toSpliced(index, 0, group), group };
}

/** "Group the buttons" (or "Group with other buttons…"): one undoable step, said in a sentence. */
export function groupEdit(context: PageContext, ids: readonly string[]): Edit {
  const made = groupButtons(context.widgets, ids);
  if (!made) {
    return { widgets: [...context.widgets], addPages: [], told: "" };
  }
  const count = (made.group.config as { actions: unknown[] }).actions.length;
  return {
    widgets: made.widgets,
    addPages: [],
    select: made.group.id,
    told: `${count} buttons are now one Action group.`,
  };
}

/** A Record detail's actions, which can move out to an Action group above it. */
export const detailActionsOf = (widget: PageWidget): Record<string, unknown>[] => {
  const actions = widget.config?.actions;
  return widget.type === "core/detail" && Array.isArray(actions)
    ? (actions as Record<string, unknown>[])
    : [];
};

/**
 * "Move these buttons to an Action group above it": the detail's actions become an Action
 * group that takes the detail's place, the detail and what is beside or under it moving
 * down a row. The detail keeps none. Undefined when there are none, or too many for a group.
 */
export function detailActionsToGroup(
  widgets: readonly PageWidget[],
  detailId: string,
): { widgets: PageWidget[]; group: PageWidget } | undefined {
  const detail = widgets.find((one) => one.id === detailId);
  const actions = detail ? detailActionsOf(detail) : [];
  if (!detail || actions.length === 0 || actions.length > GROUP_MAX) return undefined;
  const id = nextId("core/actions", widgets);
  const group: PageWidget = {
    id,
    type: "core/actions",
    title: "Actions",
    at: { x: detail.at.x, y: detail.at.y, w: detail.at.w, h: 1 },
    ...(detail.in ? { in: detail.in } : {}),
    config: { actions: structuredClone(actions), align: "start" },
  };
  const next = widgets.map((one): PageWidget => {
    if (one.id === detail.id) {
      const { actions: _moved, ...config } = (detail.config ?? {}) as Record<string, unknown>;
      return { ...one, at: { ...one.at, y: one.at.y + 1 }, config };
    }
    if (sameHome(one, detail) && one.at.y >= detail.at.y) {
      return { ...one, at: { ...one.at, y: one.at.y + 1 } };
    }
    return one;
  });
  const at = next.findIndex((one) => one.id === detail.id);
  return { widgets: next.toSpliced(at, 0, group), group };
}

export function detailActionsEdit(context: PageContext, detailId: string): Edit {
  const made = detailActionsToGroup(context.widgets, detailId);
  if (!made) {
    return { widgets: [...context.widgets], addPages: [], told: "" };
  }
  const count = (made.group.config as { actions: unknown[] }).actions.length;
  return {
    widgets: made.widgets,
    addPages: [],
    select: made.group.id,
    told: `${count} buttons moved from the record detail to an Action group above it.`,
  };
}

// ----- The suggestions -----

/** The title of the section "A section for the numbers" makes. */
export const NUMBERS_TITLE = "The numbers";

/** What picking a suggestion that needs nothing asked writes. The form is the one that asks, in its dialog. */
export function suggestedEdit(
  context: PageContext,
  suggestion: Exclude<Suggestion, { key: "form" }>,
  table: TableInfo,
  catalog: Catalog,
): Edit {
  switch (suggestion.key) {
    case "search":
      return searchEdit(context, table, catalog);
    case "group":
      return groupEdit(context, suggestion.ids);
    case "section":
      return sectionEdit(context, suggestion.ids, NUMBERS_TITLE);
    default:
      return suggestionEdit(context, suggestion, table, catalog);
  }
}
