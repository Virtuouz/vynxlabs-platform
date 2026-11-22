import type { PageWidget, WidgetIn } from "@volvel/manifest";
import {
  CONTAINER_HEAD_ROWS,
  containerHeight,
  isContainer,
  type Roles,
} from "@volvel/manifest/parts";
import type { WidgetDefinition } from "@volvel/widgets";
import type { Box } from "./placement.ts";

/**
 * Anything with a place on the grid: a page's widget, a dashboard's. A widget in a container
 * (`in`) is placed on that container's own grid, not the page's.
 */
type Placed = { id: string; at: Box; in?: WidgetIn | undefined };

/** The grid a widget is on: the page's (""), or one container's, one tab of it. */
export const gridOf = (widget: { in?: WidgetIn | undefined }): string =>
  widget.in ? `${widget.in.widget}/${widget.in.tab ?? ""}` : "";

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The last row a widget may begin on. */
export const LAST_ROW = 399;

/**
 * Makes room for a widget that was just moved, stretched or added: every
 * widget it now lies on is pushed down until nothing overlaps, and then each
 * of the others rises as far as it can, so the page has no holes a person did
 * not make. The widget that was moved stays where it was put.
 *
 * Changes the widgets it is given.
 */
export function settle<T extends Placed>(widgets: T[], moved: string | undefined): void {
  const pinned = widgets.find((widget) => widget.id === moved);
  // From the top down, so that what is pushed pushes what is under it in turn.
  const rest = widgets
    .filter((widget) => widget !== pinned)
    .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  const placed: T[] = pinned ? [pinned] : [];
  for (const widget of rest) {
    // As high as it will go without lying on anything already placed.
    let y = 0;
    for (;;) {
      const under = placed.find((other) => overlap({ ...widget.at, y }, other.at));
      if (!under) break;
      y = under.at.y + under.at.h;
    }
    widget.at.y = Math.min(LAST_ROW, y);
    placed.push(widget);
  }
}

/**
 * `settle`, once for each grid the widgets are on: the page's, and each container's tab. A
 * widget lying in a container is not in the way of one on the page.
 */
export function settleGrids<T extends Placed>(widgets: T[], moved: string | undefined): void {
  const grids = new Map<string, T[]>();
  for (const widget of widgets) {
    const key = gridOf(widget);
    grids.set(key, [...(grids.get(key) ?? []), widget]);
  }
  for (const group of grids.values()) settle(group, moved);
}

/** How small and how large a widget may be made, in cells. */
export interface Limits {
  min: { w: number; h: number };
  max: { w: number; h: number };
}

/** What a definition allows. A type nobody knows may be any size. */
export function limitsOf(definition: WidgetDefinition | undefined): Limits {
  const layout = definition?.layout;
  return {
    min: layout?.min ?? { w: 1, h: 1 },
    max: layout?.max ?? { w: 12, h: 40 },
  };
}

/** A box held to its limits and to the grid: not smaller than the least, not larger than the most, not off the page. */
export function fit(at: Box, limits: Limits, columns = 12): Box {
  const w = Math.min(columns, limits.max.w, Math.max(limits.min.w, at.w));
  const h = Math.min(limits.max.h, Math.max(limits.min.h, at.h));
  return {
    w,
    h,
    x: Math.min(columns - w, Math.max(0, at.x)),
    y: Math.min(LAST_ROW, Math.max(0, at.y)),
  };
}

/**
 * Where something dragged over the page's own grid lands when that would lie on a container: a
 * container is not pushed away by what comes near it, or it could not be dragged into. Above it
 * the thing lands above it, below it below, beside it beside; and on its top edge it takes its
 * place. `pointer` is in cells.
 */
export function besideContainers(
  at: Box,
  pointer: { x: number; y: number },
  containers: readonly Box[],
): Box {
  let next = at;
  for (const one of containers) {
    if (!overlap(next, one)) continue;
    if (pointer.y >= one.y + one.h - 0.5) {
      next = { ...next, y: Math.max(next.y, one.y + one.h) };
    } else if (pointer.x < one.x && one.x - next.w >= 0) {
      next = { ...next, x: one.x - next.w };
    } else if (pointer.x >= one.x + one.w && one.x + one.w + next.w <= 12) {
      next = { ...next, x: one.x + one.w };
    } else if (pointer.y < one.y) {
      next = { ...next, y: Math.max(0, one.y - next.h) };
    } else if (pointer.x >= one.x && pointer.x < one.x + one.w) {
      next = { ...next, y: one.y };
    }
  }
  return next;
}

/** A Text whose height is the one it was given; any other is as tall as its words, and no less than its place. */
export const hasSetHeight = (widget: PageWidget) =>
  widget.type === "core/text" && widget.config?.height === "set";

/** A widget whose height was changed by hand: a Text keeps that height from then on. */
export const sizedByHand = <T extends PageWidget>(widget: T, wasTall: number): T =>
  widget.type === "core/text" && widget.at.h !== wasTall
    ? { ...widget, config: { ...widget.config, height: "set" } }
    : widget;

/** The widgets copied, with their places copied too, so that settling them changes nothing of the originals. */
export const copied = <T extends Placed>(widgets: readonly T[]): T[] =>
  widgets.map((widget) => ({ ...widget, at: { ...widget.at } }));

/** The widgets with one at a new place, and everything made room around it. */
export function placed<T extends Placed>(widgets: readonly T[], id: string, at: Box): T[] {
  const next = copied(widgets);
  const one = next.find((widget) => widget.id === id);
  if (one) one.at = { ...at };
  settleGrids(next, id);
  return next;
}

/**
 * The widgets with one put at a place on a grid: the page's (`into` left out), or a
 * container's, one tab of it. Everything on the grid it lands on is made room around it, and
 * what it left rises. A container is never put in a container. What a container holds is
 * placed relative to it, so moving the container moves it all.
 */
export function putAt<T extends Placed>(
  widgets: readonly T[],
  id: string,
  at: Box,
  into: WidgetIn | undefined,
  roles: Roles,
): T[] {
  const next = copied(widgets);
  const one = next.find((widget) => widget.id === id);
  if (!one) return next;
  one.at = { ...at };
  const lands = into && !isContainer(one as unknown as PageWidget, roles) ? into : undefined;
  if (lands) one.in = { ...lands };
  else delete one.in;
  settleGrids(next, id);
  return next;
}

/** The widgets without one, and what was under it risen. What it holds goes with it. */
export function without<T extends Placed>(widgets: readonly T[], id: string): T[] {
  const next = copied(widgets.filter((widget) => widget.id !== id && widget.in?.widget !== id));
  settleGrids(next, undefined);
  return next;
}

/** The rows a folded container is drawn: its heading, and a line. */
export const FOLDED_ROWS = CONTAINER_HEAD_ROWS + 1;

/**
 * The widgets with each container as tall as it must be: its heading and what it holds
 * (`containerHeight`), which is what the builder keeps its `at.h` at. A served page draws a
 * container at least that tall (`grow`: never shorter than its own `at.h`), and a folded one
 * (`folded`) short. Whatever lay below one that changed height is made room for or risen.
 * Gives back the same array when nothing changed.
 */
export function fitContainers<T extends PageWidget>(
  widgets: readonly T[],
  roles: Roles,
  how: {
    grow?: boolean;
    folded?: (id: string) => boolean;
    pin?: string;
    /** The rows a widget needs at the width it is drawn (a Search and filter whose bar wraps): it is drawn at least so tall. */
    least?: (id: string) => number | undefined;
  } = {},
): readonly T[] {
  let next: T[] | undefined;
  for (const [index, widget] of widgets.entries()) {
    const needs = how.least?.(widget.id);
    if (
      needs !== undefined &&
      needs > widget.at.h &&
      !isContainer(widget, roles) &&
      !hasSetHeight(widget)
    ) {
      next ??= copied(widgets);
      (next[index] as T).at.h = Math.min(needs, 40);
      continue;
    }
    if (widget.in || !isContainer(widget, roles)) continue;
    // A container is always as tall as what it draws: what its widgets need at the width they are drawn
    // (their stats wrap on a narrow page) holds it open past what their places say.
    const drawn = Math.min(40, needs ?? 0);
    const fits = Math.max(containerHeight(widget, widgets), drawn);
    const h = how.folded?.(widget.id) ? FOLDED_ROWS : how.grow ? Math.max(widget.at.h, fits) : fits;
    if (h === widget.at.h) continue;
    next ??= copied(widgets);
    (next[index] as T).at.h = h;
  }
  if (!next) return widgets;
  // The one that was just put somewhere stays where it was put.
  settleGrids(next, how.pin);
  return next;
}

const ID_LENGTH = 55;

/** An id for a copy of `id` that no other widget has: `chart_copy`, `chart_copy2`. */
export function copyId(id: string, taken: ReadonlySet<string>): string {
  const base = id.replace(/_copy\d*$/, "");
  for (let count = 1; ; count++) {
    const suffix = count === 1 ? "_copy" : `_copy${count}`;
    const found = `${base.slice(0, ID_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(found)) return found;
  }
}

/** The widgets with a copy of one, right under it, and everything made room around the copy. */
export function duplicated<T extends Placed & { title?: string }>(
  widgets: readonly T[],
  id: string,
): { widgets: T[]; copy: T } | undefined {
  const original = widgets.find((widget) => widget.id === id);
  if (!original) return undefined;
  const copy = structuredClone(original);
  copy.id = copyId(id, new Set(widgets.map((widget) => widget.id)));
  if (original.title) copy.title = `${original.title} copy`;
  copy.at = { ...original.at, y: Math.min(LAST_ROW, original.at.y + original.at.h) };
  const next = [...copied(widgets), copy];
  // What a container holds is copied with it, to the copy.
  const taken = new Set([...widgets.map((widget) => widget.id), copy.id]);
  for (const held of widgets.filter((widget) => widget.in?.widget === id)) {
    const child = structuredClone(held);
    child.id = copyId(held.id, taken);
    taken.add(child.id);
    if (child.in) child.in.widget = copy.id;
    next.push(child);
  }
  settleGrids(next, copy.id);
  return { widgets: next, copy };
}

/** What the chip says: how big, and where. */
export const sizeWords = (at: Box) => `${at.w} × ${at.h} · col ${at.x + 1} · row ${at.y + 1}`;

/** How wide a side sheet or modal opens, as its page says: in pixels, or the window. Left out, medium. */
const OVERLAY_WIDTH = { small: 480, medium: 720, large: 960, xlarge: 1200, full: "full" } as const;
export const overlayWidth = (page: { size?: keyof typeof OVERLAY_WIDTH }) =>
  OVERLAY_WIDTH[page.size ?? "medium"];
