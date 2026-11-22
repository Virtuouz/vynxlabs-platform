import { PAGE_COLUMNS, type PageWidget } from "@volvel/manifest";
import { withoutWidget } from "../../kit/inspector/model.ts";
import { placed } from "./renderer.ts";

/** Whether two widgets lie on the same grid: the page's, or one tab of one container. */
const together = (a: PageWidget, b: PageWidget) =>
  a.in?.widget === b.in?.widget && a.in?.tab === b.in?.tab;

/** Widgets in reading order: by row, then by column. */
export const reading = (list: readonly PageWidget[]) =>
  [...list].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);

/** The widgets on the same grid as `id`, in reading order. */
export const siblingsOf = (widgets: readonly PageWidget[], id: string): PageWidget[] => {
  const one = widgets.find((other) => other.id === id);
  return one ? reading(widgets.filter((other) => together(other, one))) : [];
};

/**
 * The widgets with `id` put just before or after `target` in reading order: it takes the place
 * the target has (or the row under it), and the canvas's own rule (`placed`) makes room, so a
 * move in the outline settles exactly as a drag on the page does. Both must lie on the same
 * grid; otherwise nothing moves (`undefined`).
 */
export function reordered(
  widgets: readonly PageWidget[],
  id: string,
  target: string,
  side: "before" | "after",
): PageWidget[] | undefined {
  const one = widgets.find((other) => other.id === id);
  const next = widgets.find((other) => other.id === target);
  if (!one || !next || one.id === next.id || !together(one, next)) return undefined;
  // The others as they lie once it is lifted out (what it left is closed up), then it is put at the
  // target's row, or the row under it: the canvas's rule makes the room.
  const rest = withoutWidget(widgets, id);
  const there = rest.find((other) => other.id === target);
  if (!there) return undefined;
  const x = Math.min(there.at.x, Math.max(0, PAGE_COLUMNS - one.at.w));
  const y = side === "before" ? there.at.y : there.at.y + there.at.h;
  return placed(widgets, id, { ...one.at, x, y });
}

/** One step earlier or later among the widgets on the same grid: the keyboard's way (Alt+↑, Alt+↓). */
export function stepped(
  widgets: readonly PageWidget[],
  id: string,
  by: -1 | 1,
): PageWidget[] | undefined {
  const group = siblingsOf(widgets, id);
  const at = group.findIndex((one) => one.id === id);
  const other = group[at + by];
  return other ? reordered(widgets, id, other.id, by === 1 ? "after" : "before") : undefined;
}

/** Whether anything on the page runs a step when pressed: a button, a row action, a form's submit. */
export const runsActions = (widgets: readonly PageWidget[]): boolean =>
  widgets.some(
    (one) =>
      (one.on && Object.keys(one.on).length > 0) ||
      (Array.isArray(one.config?.rowActions) && one.config.rowActions.length > 0) ||
      (Array.isArray(one.config?.actions) && one.config.actions.length > 0) ||
      one.config?.submit !== undefined,
  );
