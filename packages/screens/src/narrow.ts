import type { PageWidget } from "@volvel/manifest";
import type { WidgetDefinition } from "@volvel/widgets";
import { copied, LAST_ROW } from "./layout.ts";
import type { Box } from "./placement.ts";

/**
 * Smaller screens (phase 28, boards 6 and 9). The rules, apart from the drawing of them:
 * - `layout.narrow` says what a phone does with a widget. Left out, it is automatic: a small widget
 *   (a quarter of the desktop's row or less) shares a row with the next small one, another takes
 *   the row. `keep` keeps its share of the row (half the desktop's or less sits two to a row),
 *   `full` takes the whole row where it comes, `stack` takes the whole row too but is read after
 *   everything that is not stacked ("stack below"), and `hide` leaves it out (while building it
 *   is a dashed place-holder).
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
  if (how === "keep") return widget.at.w <= 6 ? 1 : 2;
  return widget.at.w <= 3 ? 1 : 2;
}

/**
 * The columns each widget takes on a phone, in the order it is read: `phoneSpan`, except that a
 * widget that would sit alone in a row, with nothing small after it to share it, takes the whole
 * row (the third stat of four is as wide as the page, not half of it). `breaks` says which
 * widgets stand in the way of a pairing: a place-holder or anything else that takes a row of its own.
 */
export function phoneSpans<T extends Laid & { id: string }>(
  ordered: readonly T[],
  breaks: (widget: T) => boolean = () => false,
): Map<string, 1 | 2> {
  const spans = new Map<string, 1 | 2>();
  let open: T | undefined;
  // "Keep the desktop layout" is the choice to keep its share of the row: alone, it keeps it.
  const alone = (widget: T): 1 | 2 => (widget.layout?.narrow === "keep" ? 1 : 2);
  for (const widget of ordered) {
    const span = breaks(widget) ? 2 : phoneSpan(widget);
    if (span === 2) {
      if (open) spans.set(open.id, alone(open));
      open = undefined;
      spans.set(widget.id, 2);
    } else if (open) {
      spans.set(open.id, 1);
      spans.set(widget.id, 1);
      open = undefined;
    } else {
      open = widget;
    }
  }
  if (open) spans.set(open.id, alone(open));
  return spans;
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
    // "Stack below": after everything that is not stacked, unless it was put somewhere by hand.
    const sa = a.widget.layout?.narrow === "stack" && !a.widget.layout.phone ? 1 : 0;
    const sb = b.widget.layout?.narrow === "stack" && !b.widget.layout.phone ? 1 : 0;
    if (sa !== sb) return sa - sb;
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
  // A higher priority reads first whatever the place, so a move into another band joins it: it
  // takes the priority of the one it now precedes (or, last, the lowest there is).
  const priority = target
    ? (target.layout?.priority ?? 0)
    : rest.reduce((low, widget) => Math.min(low, widget.layout?.priority ?? 0), 0);
  const { priority: _was, ...layout } = one.layout ?? {};
  one.layout = {
    ...layout,
    ...(priority !== 0 ? { priority } : {}),
    phone: { at: { x: place.x, y: place.y, w: one.at.w, h: one.at.h } },
  };
  return next;
}

/**
 * The widgets as a tablet draws them: each at the place set for it, else the desktop's, and what
 * lies on a place set by hand is moved aside (down, as on the desktop) rather than written.
 */
export function onTablet<T extends PageWidget>(widgets: readonly T[]): T[] {
  const drawn = widgets.map((widget) =>
    widget.layout?.tablet && !widget.in
      ? { ...widget, at: { ...widget.layout.tablet.at } }
      : widget,
  );
  if (!drawn.some((widget) => widget.layout?.tablet && !widget.in)) return drawn;
  // The page's own grid only: what is in a container is laid out by the container.
  const top = drawn
    .filter((widget) => !widget.in)
    .map((widget) => ({ ...widget, at: { ...widget.at } }));
  const hand = new Set(top.filter((widget) => widget.layout?.tablet).map((widget) => widget.id));
  settleAround(top, hand);
  const placed = new Map(top.map((widget) => [widget.id, widget.at]));
  return drawn.map((widget) => {
    const at = placed.get(widget.id);
    return at && !hand.has(widget.id) && !sameBox(at, widget.at)
      ? { ...widget, at: { ...at } }
      : widget;
  });
}

/**
 * `settle` with several widgets held where they are: the rest are pushed down off them, in turn,
 * and not lifted into holes (what was not moved is not moved for being near what was).
 */
function settleAround(widgets: PageWidget[], pinned: ReadonlySet<string>) {
  const placed = widgets.filter((widget) => pinned.has(widget.id));
  const rest = widgets
    .filter((widget) => !pinned.has(widget.id))
    .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  const overlap = (a: Box, b: Box) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const widget of rest) {
    let y = widget.at.y;
    for (;;) {
      const under = placed.find((other) => overlap({ ...widget.at, y }, other.at));
      if (!under) break;
      y = under.at.y + under.at.h;
    }
    widget.at.y = Math.min(LAST_ROW, y);
    placed.push(widget);
  }
}

/** How many widgets a tablet draws away from the desktop's place for one set by hand, which were not set by hand. */
export function movedAside(widgets: readonly PageWidget[]): number {
  const drawn = onTablet(widgets);
  return drawn.filter((widget, at) => {
    const own = widgets[at] as PageWidget;
    return !own.layout?.tablet && !own.in && !sameBox(widget.at, own.at);
  }).length;
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
  /** The one the person moved or stretched: only it takes a place of its own; what was pushed aside is drawn aside. */
  moved?: string,
): T[] {
  const was = new Map(original.map((widget) => [widget.id, widget]));
  const shown = new Map(drawn.map((widget) => [widget.id, widget]));
  return next.map((widget) => {
    const first = was.get(widget.id);
    const before = shown.get(widget.id);
    if (!first || !before || widget.in) return widget;
    if (moved !== undefined && widget.id !== moved) {
      // Moved aside by the one that was moved: drawn aside, and nothing of its own written.
      return { ...widget, at: { ...first.at } };
    }
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
  return widgets.filter((widget) => {
    const own = widget.layout;
    if (own?.[device] !== undefined) return true;
    // What a phone does with a widget, and which it keeps nearer the top, is set by hand too.
    return device === "phone" && (own?.narrow !== undefined || own?.priority !== undefined);
  }).length;
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

/** Every widget without a place of its own for a device: the page is automatic again for it. */
export function allAutomatic<T extends PageWidget>(
  widgets: readonly T[],
  device: "tablet" | "phone",
): T[] {
  return widgets.map((widget) => {
    const layout = widget.layout;
    if (!layout) return widget;
    const { [device]: _gone, ...rest } = layout;
    const kept =
      device === "phone" ? (({ narrow: _n, priority: _p, ...others }) => others)(rest) : rest;
    const { layout: _old, ...bare } = widget;
    return (Object.keys(kept).length > 0 ? { ...bare, layout: kept } : bare) as T;
  });
}
