/**
 * What the builder does with containers (phase 27, M6): pure functions over a page's
 * flat list of widgets, where a widget in a Section or a tab of Tabs says `in` and has
 * its `at` on the container's own grid. One level deep: a container is never in one.
 *
 * Each function returns new widgets and leaves its arguments alone. The editor emits
 * `fitContainers(...)` after every change, so a container is always as tall as what it
 * holds (`containerHeight`).
 */
import {
  childrenOf,
  containerHeight,
  MAX_PAGE_WIDGETS,
  PAGE_COLUMNS,
  type PageWidget,
  tabsOf,
  topLevel,
} from "@volvel/manifest";
import { isContainer } from "@volvel/manifest/parts";
import { withoutWidget } from "../../kit/inspector/model.ts";
import { definitionOf } from "./registry.ts";
import { placed } from "./renderer.ts";

/** Who is a container: the platform's registry says so, as it does for the served page. */
export interface RoleOf {
  get(type: string): { role?: "container" | "filters" | undefined } | undefined;
}
export const registryRoles: RoleOf = { get: (type) => definitionOf(type) };

/** Where a widget can be put: the page (no target), a Section, or a tab of Tabs. */
export interface Target {
  widget: string;
  tab?: string;
}

const sameGroup = (a: PageWidget["in"], b: PageWidget["in"]): boolean =>
  a?.widget === b?.widget && a?.tab === b?.tab;

/** The widgets that share a grid with one placed `in` the container: the page's own, or a container's (tab's) own. */
const grid = (widgets: readonly PageWidget[], where: PageWidget["in"]): PageWidget[] =>
  widgets.filter((one) => sameGroup(one.in, where));

/** The bottom row of a grid. */
const bottomOf = (widgets: readonly PageWidget[]): number =>
  widgets.reduce((low, one) => Math.max(low, one.at.y + one.at.h), 0);

/** `next` merged into `widgets`: each widget of `next` replaces the one with its id; the order is kept. */
const merged = (widgets: readonly PageWidget[], next: readonly PageWidget[]): PageWidget[] => {
  const byId = new Map(next.map((one) => [one.id, one]));
  return widgets.map((one) => byId.get(one.id) ?? one);
};

/** An id for a new widget that no widget on the page has (and none of `also`, ids about to be added). */
export function nextId(
  type: string,
  widgets: readonly { id: string }[],
  also: readonly { id: string }[] = [],
): string {
  const base =
    (type.split("/")[1] ?? type).replace(/[^a-z0-9_-]/g, "-").replace(/^[^a-z]+/, "") || "widget";
  const taken = new Set([...widgets, ...also].map((one) => one.id));
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** What a widget is called to a person: its title, or its kind. */
export const nameOf = (widget: PageWidget): string =>
  widget.title || definitionOf(widget.type)?.title || widget.id;

/**
 * Every container as tall as what it holds, and what lay under one that grew moved out
 * of its way (what lay under one that shrank rises), by the canvas's own rule.
 */
export function fitContainers(
  widgets: readonly PageWidget[],
  roles: RoleOf = registryRoles,
): PageWidget[] {
  let next = widgets.map((one) => ({ ...one, at: { ...one.at } }));
  for (const container of widgets.filter((one) => isContainer(one, roles))) {
    const now = next.find((one) => one.id === container.id);
    if (!now || now.in) continue;
    const h = containerHeight(now, next);
    if (h === now.at.h) continue;
    const top = placed(topLevel(next), now.id, { ...now.at, h });
    next = merged(next, top);
  }
  return next;
}

/** The widgets a container holds, with their count in words: "3 widgets", "1 widget". */
export const widgetsWords = (count: number): string => `${count} widget${count === 1 ? "" : "s"}`;

/** What a container holds, for its header and the history: "Section · holds 3 widgets". */
export function holds(
  widgets: readonly PageWidget[],
  container: PageWidget,
  roles: RoleOf = registryRoles,
): string | undefined {
  if (!isContainer(container, roles)) return undefined;
  const count = childrenOf(widgets, container.id).length;
  if (count === 0) return "holds nothing yet";
  const tabs = tabsOf(container);
  return tabs.length > 0
    ? `holds ${widgetsWords(count)} in ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`
    : `holds ${widgetsWords(count)}`;
}

// ---------------------------------------------------------------------------
// Where a widget can go

export interface Place {
  /** Stable, for a key. */
  key: string;
  /** "The page", "Orders", "Views › By status". */
  label: string;
  target: Target | undefined;
}

/**
 * Every place a widget could be moved to, except where it is: the page, each Section,
 * each tab of each Tabs. A container goes only to the page (one level deep), so for it
 * there is none beyond where it already is.
 */
export function placesFor(
  widgets: readonly PageWidget[],
  id: string,
  roles: RoleOf = registryRoles,
): Place[] {
  const widget = widgets.find((one) => one.id === id);
  if (!widget || isContainer(widget, roles)) return [];
  const places: Place[] = [];
  if (widget.in) places.push({ key: "page", label: "The page", target: undefined });
  for (const container of widgets) {
    if (container.id === id || container.in || !isContainer(container, roles)) continue;
    const tabs = tabsOf(container);
    if (tabs.length === 0) {
      if (widget.in?.widget !== container.id) {
        places.push({
          key: container.id,
          label: nameOf(container),
          target: { widget: container.id },
        });
      }
      continue;
    }
    for (const tab of tabs) {
      if (widget.in?.widget === container.id && widget.in.tab === tab.id) continue;
      places.push({
        key: `${container.id}/${tab.id}`,
        label: `${nameOf(container)} › ${tab.title}`,
        target: { widget: container.id, tab: tab.id },
      });
    }
  }
  return places;
}

/** The words of a target, for "Added to …" and "Moved … to …". */
export function targetWords(widgets: readonly PageWidget[], target: Target | undefined): string {
  if (!target) return "the page";
  const container = widgets.find((one) => one.id === target.widget);
  if (!container) return "the page";
  const tab = tabsOf(container).find((one) => one.id === target.tab);
  return tab ? `${nameOf(container)} › ${tab.title}` : nameOf(container);
}

/** Where a new widget goes when `selected` is chosen: into it if it is a container, beside what is chosen if it is in one. */
export function targetOfSelection(
  widgets: readonly PageWidget[],
  selected: string | undefined,
  roles: RoleOf = registryRoles,
): Target | undefined {
  const chosen = widgets.find((one) => one.id === selected);
  if (!chosen) return undefined;
  if (chosen.in) return chosen.in;
  if (!isContainer(chosen, roles)) return undefined;
  // The open tab is the canvas's; without it, the first.
  const first = tabsOf(chosen)[0];
  return first ? { widget: chosen.id, tab: first.id } : { widget: chosen.id };
}

/** Where the next widget of a grid goes: the bottom of it. */
export const bottomOfTarget = (
  widgets: readonly PageWidget[],
  target: Target | undefined,
): number => bottomOf(grid(widgets, target ? targetIn(target) : undefined));

const targetIn = (target: Target): NonNullable<PageWidget["in"]> =>
  target.tab !== undefined ? { widget: target.widget, tab: target.tab } : { widget: target.widget };

/** Whether a target names a container (and a tab of it, for Tabs) that is on the page. */
function validTarget(
  widgets: readonly PageWidget[],
  target: Target,
  roles: RoleOf,
): string | undefined {
  const container = widgets.find((one) => one.id === target.widget);
  if (!container || !isContainer(container, roles)) return "That place is no longer on the page.";
  if (container.in) return "A Section or Tabs can't go inside another.";
  const tabs = tabsOf(container);
  if (tabs.length > 0 && !tabs.some((tab) => tab.id === target.tab)) {
    return `${nameOf(container)} has no such tab.`;
  }
  return undefined;
}

/** `target` made whole: a Tabs without a named tab means its first. */
export function resolved(
  widgets: readonly PageWidget[],
  target: Target | undefined,
): Target | undefined {
  if (!target) return undefined;
  const container = widgets.find((one) => one.id === target.widget);
  if (!container) return target;
  const tabs = tabsOf(container);
  if (tabs.length === 0) return { widget: container.id };
  const tab = target.tab ?? tabs[0]?.id;
  return tab === undefined ? { widget: container.id } : { widget: container.id, tab };
}

/** The widget put where a new one goes in `target`: at the bottom of its grid, on the left. */
export function placedAtBottom(
  widgets: readonly PageWidget[],
  widget: PageWidget,
  target: Target | undefined,
): PageWidget {
  const at = target ? resolved(widgets, target) : undefined;
  const { in: _before, ...rest } = widget;
  const w = Math.min(widget.at.w, PAGE_COLUMNS);
  const y = bottomOf(
    grid(widgets, at ? targetIn(at) : undefined).filter((one) => one.id !== widget.id),
  );
  return { ...rest, ...(at ? { in: targetIn(at) } : {}), at: { ...widget.at, x: 0, y, w } };
}

// ---------------------------------------------------------------------------
// Moving

export interface Moved {
  widgets: PageWidget[];
  moved: boolean;
  /** Why nothing moved. */
  reason?: string;
}

/**
 * The widget put at the bottom of the target's grid (or of the page's, with no target),
 * keeping its width. A container is refused a container: one level deep.
 */
export function moveInto(
  widgets: readonly PageWidget[],
  id: string,
  target: Target | undefined,
  roles: RoleOf = registryRoles,
): Moved {
  const keep = (reason: string): Moved => ({ widgets: [...widgets], moved: false, reason });
  const widget = widgets.find((one) => one.id === id);
  if (!widget) return keep("That widget is no longer on the page.");
  if (target) {
    if (target.widget === id) return keep("A widget can't be put inside itself.");
    if (isContainer(widget, roles)) {
      return keep("A Section or Tabs can't go inside another. Put its widgets in one instead.");
    }
    const problem = validTarget(widgets, resolved(widgets, target) ?? target, roles);
    if (problem) return keep(problem);
  }
  const to = resolved(widgets, target);
  if (sameGroup(widget.in, to ? targetIn(to) : undefined)) {
    return keep(`It is already in ${targetWords(widgets, to)}.`);
  }
  const put = placedAtBottom(widgets, widget, to);
  const next = merged(widgets, [put]);
  // What was under it, where it was, rises.
  const from = grid(next, widget.in).filter((one) => one.id !== id);
  const settled = from.length > 0 ? merged(next, withoutWidget([...from, widget], id)) : next;
  return { widgets: fitContainers(settled, roles), moved: true };
}

// ---------------------------------------------------------------------------
// Duplicating and removing

export type Duplicated =
  | { widgets: PageWidget[]; id: string; count: number }
  | { widgets: PageWidget[]; id?: undefined; count: 0; reason: string };

/** A copy of a widget just below it. A container is copied with all it holds: new ids, the children pointing at the copy. */
export function duplicateWidget(
  widgets: readonly PageWidget[],
  id: string,
  roles: RoleOf = registryRoles,
): Duplicated {
  const none = (reason: string): Duplicated => ({ widgets: [...widgets], count: 0, reason });
  const source = widgets.find((one) => one.id === id);
  if (!source) return none("That widget is no longer on the page.");
  const held = isContainer(source, roles) ? childrenOf(widgets, id) : [];
  if (widgets.length + 1 + held.length > MAX_PAGE_WIDGETS) {
    return none(`A page holds at most ${MAX_PAGE_WIDGETS} widgets.`);
  }
  const made: PageWidget[] = [];
  const copyId = nextId(source.type, widgets);
  const copy: PageWidget = {
    ...structuredClone(source),
    id: copyId,
    ...(source.title ? { title: `${source.title} copy` } : {}),
    at: { ...source.at, y: source.at.y + source.at.h },
  };
  made.push(copy);
  for (const child of held) {
    made.push({
      ...structuredClone(child),
      id: nextId(child.type, widgets, made),
      in: { ...child.in, widget: copyId } as NonNullable<PageWidget["in"]>,
    });
  }
  // The copy settles among those it shares a grid with; its children are on its own grid.
  const all = [...widgets, ...made];
  const group = placed(grid(all, source.in), copyId, copy.at);
  return {
    widgets: fitContainers(merged(all, group), roles),
    id: copyId,
    count: made.length,
  };
}

export interface Removed {
  widgets: PageWidget[];
  /** What went: the widget, then what it held. */
  removed: PageWidget[];
}

/** The widget removed, a container with all it holds. What was under it rises. */
export function removeWidget(
  widgets: readonly PageWidget[],
  id: string,
  roles: RoleOf = registryRoles,
): Removed {
  const widget = widgets.find((one) => one.id === id);
  if (!widget) return { widgets: [...widgets], removed: [] };
  const held = isContainer(widget, roles) ? childrenOf(widgets, id) : [];
  const gone = new Set([id, ...held.map((one) => one.id)]);
  const rest = widgets.filter((one) => !gone.has(one.id));
  const group = grid(widgets, widget.in).filter((one) => !gone.has(one.id));
  const rise = withoutWidget([...group, widget], id);
  return {
    widgets: fitContainers(merged(rest, rise), roles),
    removed: [widget, ...held],
  };
}

/** The history's words for a removal: "Orders and the 3 widgets in it". */
export function removalWords(removed: readonly PageWidget[]): string {
  const [first, ...held] = removed;
  if (!first) return "nothing";
  const name = first.title
    ? `“${first.title}”`
    : `the ${(definitionOf(first.type)?.title ?? "widget").toLowerCase()}`;
  return held.length === 0
    ? name
    : `${name} and the ${held.length === 1 ? "widget" : `${held.length} widgets`} in it`;
}

/**
 * Widgets whose container is gone (taken away by a change the canvas made, such as the
 * Delete key on a container) removed too. Returns what went, to be said.
 */
export function withoutOrphans(widgets: readonly PageWidget[]): {
  widgets: PageWidget[];
  orphans: PageWidget[];
} {
  const ids = new Set(widgets.map((one) => one.id));
  const orphans = widgets.filter((one) => one.in && !ids.has(one.in.widget));
  if (orphans.length === 0) return { widgets: [...widgets], orphans };
  const gone = new Set(orphans.map((one) => one.id));
  return { widgets: widgets.filter((one) => !gone.has(one.id)), orphans };
}

// ---------------------------------------------------------------------------
// Tabs

export interface TabRemoved {
  widgets: PageWidget[];
  /** `moved`: its widgets went to `to`; `removed`: they were removed with it; `refused`: nothing changed. */
  what: "moved" | "removed" | "refused";
  /** The tab its widgets went to. */
  to?: string;
  /** How many widgets the tab held. */
  count: number;
  /** In plain words, for the history and the toast. */
  words: string;
}

/**
 * A tab taken out of a Tabs. Its widgets go to `into` (a tab, by id) at the bottom of its
 * grid, keeping how they were arranged; `into: null` removes them with it. Left out,
 * they go to the tab before it (the one after, for the first). The last tab can't be taken.
 */
export function removeTab(
  widgets: readonly PageWidget[],
  container: string,
  tab: string,
  into?: string | null,
  roles: RoleOf = registryRoles,
): TabRemoved {
  const holder = widgets.find((one) => one.id === container);
  const tabs = holder ? tabsOf(holder) : [];
  const at = tabs.findIndex((one) => one.id === tab);
  const refuse = (words: string): TabRemoved => ({
    widgets: [...widgets],
    what: "refused",
    count: 0,
    words,
  });
  if (!holder || at < 0) return refuse("That tab is no longer there.");
  if (tabs.length < 2) return refuse(`${nameOf(holder)} keeps at least one tab.`);
  const title = tabs[at]?.title ?? tab;
  const held = childrenOf(widgets, container, tab);
  const without = tabs.filter((one) => one.id !== tab);
  const config = { ...holder.config, tabs: without };
  const withTabs = widgets.map((one) => (one.id === container ? { ...one, config } : one));
  if (into === null || held.length === 0) {
    const gone = new Set(held.map((one) => one.id));
    return {
      widgets: fitContainers(
        withTabs.filter((one) => !gone.has(one.id)),
        roles,
      ),
      what: "removed",
      count: held.length,
      words:
        held.length === 0
          ? `Removed the tab “${title}”.`
          : `Removed the tab “${title}” and the ${held.length === 1 ? "widget" : `${held.length} widgets`} in it.`,
    };
  }
  const neighbour = (tabs[at - 1] ?? tabs[at + 1])?.id;
  const to = into !== undefined && without.some((one) => one.id === into) ? into : neighbour;
  if (!to) return refuse(`${nameOf(holder)} keeps at least one tab.`);
  const toTitle = tabs.find((one) => one.id === to)?.title ?? to;
  const top = Math.min(...held.map((one) => one.at.y));
  const base = bottomOf(childrenOf(withTabs, container, to));
  const moved = held.map((one) => ({
    ...one,
    in: { widget: container, tab: to },
    at: { ...one.at, y: base + one.at.y - top },
  }));
  return {
    widgets: fitContainers(merged(withTabs, moved), roles),
    what: "moved",
    to,
    count: held.length,
    words: `Removed the tab “${title}”. The ${held.length === 1 ? "widget" : `${held.length} widgets`} in it went to “${toTitle}”.`,
  };
}
