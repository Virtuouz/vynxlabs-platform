import type { WidgetDefinition } from "@volvel/widgets";
import type { Box } from "./placement.ts";

/** Anything with a place on the grid: a page's widget, a dashboard's. */
type Placed = { id: string; at: Box };

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

/** The widgets copied, with their places copied too, so that settling them changes nothing of the originals. */
export const copied = <T extends Placed>(widgets: readonly T[]): T[] =>
  widgets.map((widget) => ({ ...widget, at: { ...widget.at } }));

/** The widgets with one at a new place, and everything made room around it. */
export function placed<T extends Placed>(widgets: readonly T[], id: string, at: Box): T[] {
  const next = copied(widgets);
  const one = next.find((widget) => widget.id === id);
  if (one) one.at = { ...at };
  settle(next, id);
  return next;
}

/** The widgets without one, and what was under it risen. */
export function without<T extends Placed>(widgets: readonly T[], id: string): T[] {
  const next = copied(widgets.filter((widget) => widget.id !== id));
  settle(next, undefined);
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
  settle(next, copy.id);
  return { widgets: next, copy };
}

/** What the chip says: how big, and where. */
export const sizeWords = (at: Box) => `${at.w} × ${at.h} · col ${at.x + 1} · row ${at.y + 1}`;
