import type { PageFilter, PageWidget } from "./page.js";

/**
 * What a page's widgets give it: its filters (declared by Search and filter widgets) and
 * its containers (Section and Tabs, which hold other widgets one level deep). Pure, with
 * nothing compiled, so the served app imports it (`@volvel/manifest/parts`) as the
 * platform does. The registry is passed: who is a container is said by each definition.
 */

/** What these functions need of a registry: each type's role. */
export interface Roles {
  get(type: string): { role?: "container" | "filters" | undefined } | undefined;
}

/** The rows a container's heading takes on the page's grid, above the grid of what it holds. */
export const CONTAINER_HEAD_ROWS = 1;

/** The widgets of a page that set its filters: those whose definition's role is `filters`. */
export function filterWidgets(widgets: readonly PageWidget[], roles: Roles): PageWidget[] {
  return widgets.filter((widget) => roles.get(widget.type)?.role === "filters");
}

/**
 * The filters whoever reads the page sets: those every Search and filter widget on it
 * declares, in the page's order. What a data input's `filters` bind to, by name.
 */
export function filtersOf(widgets: readonly PageWidget[], roles: Roles): PageFilter[] {
  return filterWidgets(widgets, roles).flatMap((widget) => {
    const declared = widget.config?.filters;
    return Array.isArray(declared) ? (declared as PageFilter[]) : [];
  });
}

/** Whether a widget holds others: its definition's role is `container`. */
export const isContainer = (widget: Pick<PageWidget, "type">, roles: Roles): boolean =>
  roles.get(widget.type)?.role === "container";

/** The tabs a container holds, by its `config.tabs`; none for a Section. */
export function tabsOf(widget: PageWidget): { id: string; title: string }[] {
  const tabs = widget.config?.tabs;
  return Array.isArray(tabs) ? (tabs as { id: string; title: string }[]) : [];
}

/** The widgets placed in a container (in one tab of it, when `tab` is given), in the page's order. */
export function childrenOf(
  widgets: readonly PageWidget[],
  container: string,
  tab?: string,
): PageWidget[] {
  return widgets.filter(
    (widget) => widget.in?.widget === container && (tab === undefined || widget.in.tab === tab),
  );
}

/** The widgets on the page's own grid: those in no container. */
export const topLevel = (widgets: readonly PageWidget[]): PageWidget[] =>
  widgets.filter((widget) => widget.in === undefined);

/**
 * How tall a container is on the page's grid, in rows: its heading, and the bottom of the
 * lowest widget it holds (on Tabs, in any tab), never less than `least` and never more than
 * forty. The editor keeps a container's `at.h` so; a served page draws it at least so tall.
 */
export function containerHeight(
  container: PageWidget,
  widgets: readonly PageWidget[],
  least = 2,
): number {
  const held = childrenOf(widgets, container.id);
  const bottom = held.reduce((low, widget) => Math.max(low, widget.at.y + widget.at.h), 0);
  return Math.min(40, Math.max(least, CONTAINER_HEAD_ROWS + Math.max(bottom, 1)));
}

/** The type of the platform's Search and filter widget. */
export const FILTER_WIDGET = "core/filter";
