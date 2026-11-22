import type { PageWidget } from "@volvel/manifest";
import type { WidgetDefinition } from "@volvel/widgets";
import { copied, LAST_ROW } from "./layout.ts";
import type { Box } from "./placement.ts";

/**
 * Smaller screens (phase 28, boards 6 and 9). The rules, apart from the drawing of them:
 * - `layout.narrow` says what a phone does with a widget: `full` and `stack` give it a row of its
 *   own, `hide` leaves it out (while building it is a dashed place-holder). Left out, it is
 *   automatic: a small widget (a quarter of the desktop's row or less) shares a row, another takes it.
 * - `layout.priority`: a higher one stays nearer the top when the page stacks.
 * - `layout.phone.at` and `layout.tablet.at`: set by hand. The tablet draws the twelve columns,
 *   narrowed, with these places; the phone reads widgets in the order of its places (it has
 *   one or two columns, so a phone place sets where a widget comes, not its size).
 */

/** The screen sizes a page is drawn for. A served page knows its own by the room it is given; the builder says. */
export type Device = "desktop" | "tablet" | "phone";

type Laid = Pick<PageWidget, "layout" | "at">;

/** A widget on a phone is hidden when its own layout says so, or else when its definition does. */
export function hiddenOnPhone(
  widget: Pick<PageWidget, "layout">,
  definition: Pick<WidgetDefinition, "layout"> | undefined,
): boolean {
  const own = widget.layout?.narrow;
  return own !== undefined ? own === "hide" : definition?.layout.phone === "hide";
}

/** How many of the phone's two columns a widget takes. */
export function phoneSpan(widget: Laid): 1 | 2 {
  const how = widget.layout?.narrow;
  if (how === "full" || how === "stack") return 2;
  // A place set by hand speaks in the twelve columns: half the row or less is one of the phone's two.
  const own = widget.layout?.phone?.at;
  if (own) return own.w <= 6 ? 1 : 2;
  return widget.at.w <= 3 ? 1 : 2;
}

/**
 * What a device's place is while it is automatic, so that "Custom" starts from what the person
 * was looking at: the desktop's on a tablet; on a phone, its row in the reading order, taking
 * half the row (6 of 12 columns) or all of it.
 */
export function automaticAt(
  widgets: readonly PageWidget[],
  widget: PageWidget,
  device: Device,
): Box {
  if (device !== "phone") return { ...widget.at };
  const plain = widgets
    .filter((one) => !one.in)
    .map((one) => {
      const { phone: _phone, ...layout } = one.layout ?? {};
      return { ...one, layout };
    });
  const mine = plain.find((one) => one.id === widget.id);
  const index = phoneOrder(plain).findIndex((one) => one.id === widget.id);
  const half = mine !== undefined && phoneSpan(mine) === 1;
  return { x: 0, y: Math.max(0, index), w: half ? 6 : 12, h: widget.at.h };
}

/** The place a widget has on the phone: set by hand, or else where it is on the desktop. */
const phoneAt = (widget: Laid): Box => widget.layout?.phone?.at ?? widget.at;

/**
 * The widgets in the order a phone reads them: higher priority first, then by place (the phone's
 * own, when it was set by hand, else the desktop's: top to bottom, left to right). Two that share
 * a place: the one set by hand first.
 */
export function phoneOrder<T extends Laid>(widgets: readonly T[]): T[] {
  const keyed = widgets.map((widget, index) => ({ widget, index }));
  keyed.sort((a, b) => {
    const pa = a.widget.layout?.priority ?? 0;
    const pb = b.widget.layout?.priority ?? 0;
    if (pa !== pb) return pb - pa;
    const at = phoneAt(a.widget);
    const to = phoneAt(b.widget);
    const byHand = (a.widget.layout?.phone ? 0 : 1) - (b.widget.layout?.phone ? 0 : 1);
    return at.y - to.y || at.x - to.x || byHand || a.index - b.index;
  });
  return keyed.map((one) => one.widget);
}

/**
 * The widgets with one put before another in the phone's reading order (or last, with no
 * `before`): the one that moved gets a phone place at the place of the one it now precedes.
 * Nothing else is touched, so only it is "changed by hand".
 */
export function phoneMoved<T extends PageWidget>(
  widgets: readonly T[],
  id: string,
  before: string | undefined,
): T[] {
  const next = copied(widgets);
  const one = next.find((widget) => widget.id === id);
  if (!one) return next;
  const rest = phoneOrder(next.filter((widget) => widget.id !== id && !widget.in));
  const target = before ? rest.find((widget) => widget.id === before) : undefined;
  const end = rest.reduce((low, widget) => Math.max(low, phoneAt(widget).y), -1) + 1;
  const place = target ? phoneAt(target) : { x: 0, y: Math.min(LAST_ROW, end) };
  one.layout = {
    ...one.layout,
    phone: { at: { x: place.x, y: place.y, w: one.at.w, h: one.at.h } },
  };
  return next;
}

/** The widgets as a tablet draws them: each at the place set for it, else the desktop's. */
export function onTablet<T extends PageWidget>(widgets: readonly T[]): T[] {
  return widgets.map((widget) =>
    widget.layout?.tablet && !widget.in
      ? { ...widget, at: { ...widget.layout.tablet.at } }
      : widget,
  );
}

const sameBox = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * What was changed on the tablet's drawing, written as the tablet's own places: a widget whose
 * place differs from the one it was drawn at keeps its desktop place and takes the new one as
 * `layout.tablet.at`. Widgets that are new, or in a container, stay as they are.
 */
export function intoTablet<T extends PageWidget>(
  original: readonly T[],
  drawn: readonly T[],
  next: readonly T[],
): T[] {
  const was = new Map(original.map((widget) => [widget.id, widget]));
  const shown = new Map(drawn.map((widget) => [widget.id, widget]));
  return next.map((widget) => {
    const first = was.get(widget.id);
    const before = shown.get(widget.id);
    if (!first || !before || widget.in) return widget;
    if (sameBox(widget.at, before.at)) {
      // As drawn: its own place stays what it was, tablet place included.
      return { ...widget, at: { ...first.at } };
    }
    return {
      ...widget,
      at: { ...first.at },
      layout: { ...widget.layout, tablet: { at: { ...widget.at } } },
    };
  });
}

/** How many widgets were arranged by hand for a device (a place of its own, not the desktop's). */
export function changedByHand(widgets: readonly PageWidget[], device: "tablet" | "phone"): number {
  return widgets.filter((widget) => widget.layout?.[device] !== undefined).length;
}

/** One widget without the place set by hand for a device: it is automatic again. */
export function backToAutomatic<T extends PageWidget>(
  widgets: readonly T[],
  id: string,
  device: "tablet" | "phone",
): T[] {
  return widgets.map((widget) => {
    if (widget.id !== id || !widget.layout?.[device]) return widget;
    const { [device]: _gone, ...layout } = widget.layout;
    const { layout: _old, ...rest } = widget;
    return (Object.keys(layout).length > 0 ? { ...rest, layout } : rest) as T;
  });
}
