import type { WidgetIn } from "@volvel/manifest";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { fit, type Limits } from "./layout.ts";

/** Where something is on a grid of twelve columns, and how big: all in cells. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The grid's measures in pixels, which the stylesheet also has to draw: a row and the gap. */
export const GRID = { columns: 12, row: 40, gap: 12, rows: 400, tallest: 40 } as const;

/** How far a pointer travels before a press on a widget is a drag and not a click, in pixels. */
export const DRAG_FROM = 4;

/** How near the edge of what scrolls a held pointer starts scrolling it, and how fast at the very edge. */
const EDGE = 56;
const FASTEST = 18;

/** The key a widget being carried onto the page is drawn under, before it is a widget. */
export const CARRIED = "__carried";

const same = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const moved = (at: Box, dx: number, dy: number, limits: Limits): Box =>
  fit({ ...at, x: at.x + dx, y: at.y + dy }, limits);
const stretched = (at: Box, dx: number, dy: number, limits: Limits): Box =>
  fit({ ...at, w: at.w + dx, h: at.h + dy }, limits);

/** Whether a press or a key is for something typed into or pressed, which the page's moves leave alone. */
export const isControl = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  target.closest("button, a, input, select, textarea, [contenteditable='true']") !== null;

export type HowMoved = "move" | "stretch";

/** Something not yet on the page, carried onto it from "Add to page". */
export interface Card {
  /** What it will be called, and what kind of thing it is: drawn on the card. */
  title: string;
  kind: string;
  /** How big it lands. */
  size: { w: number; h: number };
  limits: Limits;
}

export interface Carrying {
  card: Card;
  /** Where the pointer is, in the window. */
  pointer: { x: number; y: number };
  /** Where it would land; absent while it is not over the page. */
  at: Box | undefined;
}

/** A grid inside a container, which something can be dropped on. */
export interface Target {
  into: WidgetIn;
  /** The element that is the grid: where its cells are counted from. */
  node: HTMLElement;
}

const sameIn = (a: WidgetIn | undefined, b: WidgetIn | undefined) =>
  a?.widget === b?.widget && a?.tab === b?.tab;

export interface Placement {
  /** For the element that is the grid. Each thing on it carries `data-flip-key`. */
  grid: RefObject<HTMLDivElement | null>;
  /** What is being dragged or stretched, and where it would land. */
  held: { id: string; at: Box; how: HowMoved; in: WidgetIn | undefined } | undefined;
  /** What is being carried onto the page, and where it would land. */
  carrying: Carrying | undefined;
  /** Where to draw a thing: where it would land while it is held, its own place otherwise. */
  at: (id: string, own: Box) => Box;
  /** Start a drag (`move`) from anywhere on a thing, or a stretch from its corner. */
  grab: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    own: Box,
    how: HowMoved,
    /** The container it is in; left out for a widget on the page's own grid. */
    from?: WidgetIn,
  ) => void;
  /**
   * Carry something onto the page from where the pointer is now, until it is let go:
   * `onDrop` is told where it landed, or nothing when it was let go off the page or Esc
   * was pressed. `endRow` is the first free row, where it lands on a page laid out in one
   * column (a phone's width), which has no places to choose between.
   */
  carry: (
    card: Card,
    from: { x: number; y: number },
    onDrop: (at: Box | undefined) => void,
    how: { narrow: () => boolean; endRow: () => number },
  ) => void;
  /** For the thing that has focus when it is chosen: the arrows move it a cell, and with Shift change its size. */
  keys: (
    id: string,
    name: string,
    own: Box,
    /** The container it is in, which the keys keep it in. */
    from?: WidgetIn,
  ) => {
    "aria-keyshortcuts": string;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  };
  /** What a screen reader is told after a move from the keyboard. Put it in a `role="status"`. */
  said: string;
}

/** The nearest thing that scrolls the grid up and down: a pane, or the page itself. */
function scrollerOf(node: HTMLElement): HTMLElement {
  for (let at = node.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if ((overflowY === "auto" || overflowY === "scroll") && at.scrollHeight > at.clientHeight) {
      return at;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/**
 * While a pointer is held, scrolls what holds the grid when the pointer is
 * near its top or bottom, faster the nearer, and says so after each step so
 * that what is held keeps up. Returns how to stop.
 */
function scrollAtEdges(
  grid: HTMLElement,
  pointer: () => { x: number; y: number },
  scrolled: () => void,
): () => void {
  const scroller = scrollerOf(grid);
  const page = scroller === document.scrollingElement || scroller === document.documentElement;
  let frame = 0;
  const step = () => {
    const top = page ? 0 : scroller.getBoundingClientRect().top;
    const bottom = page ? window.innerHeight : scroller.getBoundingClientRect().bottom;
    const { y } = pointer();
    const by =
      y < top + EDGE
        ? -Math.ceil(((top + EDGE - y) / EDGE) * FASTEST)
        : y > bottom - EDGE
          ? Math.ceil(((y - (bottom - EDGE)) / EDGE) * FASTEST)
          : 0;
    if (by !== 0) {
      const before = scroller.scrollTop;
      scroller.scrollTop += by;
      if (scroller.scrollTop !== before) scrolled();
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

/**
 * Things placed on a grid of twelve columns by dragging them: a page's
 * widgets in the builder. A thing is dragged by itself and stretched by its
 * corner, and shown where it would land before it is let go; something new is
 * carried onto the page the same way. From the keyboard the arrows do the same
 * a cell at a time. Near the top or bottom of the window a held pointer
 * scrolls the page, so a place out of sight can be reached.
 *
 * The one who uses this draws the grid on `grid`: `GRID.columns` columns,
 * rows of `GRID.row` pixels, `GRID.gap` between, and plays what moves out of
 * the way (`useFlip`). `onMove` is told once, when a thing is let go somewhere
 * new; it is for the caller to make room (`settle`).
 */
export function usePlacement({
  grid,
  onMove,
  limits,
  onGrabbed,
  targets,
}: {
  grid: RefObject<HTMLDivElement | null>;
  /**
   * `by` says whether it was dragged or moved a cell with a key, for what counts as one step to
   * undo. `into` is the container whose grid it landed on, or nothing for the page's own.
   */
  onMove:
    | ((
        id: string,
        at: Box,
        by: "pointer" | "keys",
        how: HowMoved,
        into: WidgetIn | undefined,
      ) => void)
    | undefined;
  /** The grids inside containers that a thing may be dropped on; a container itself has none. */
  targets?: (id: string) => Target[];
  /** How small and how large each thing may be made. */
  limits: (id: string) => Limits;
  /** Called when a press on a thing has become a drag. */
  onGrabbed?: (id: string) => void;
}): Placement {
  const [held, setHeld] = useState<Placement["held"]>();
  const [carrying, setCarrying] = useState<Carrying>();
  const [said, setSaid] = useState("");
  const grabbed = useRef(onGrabbed);
  grabbed.current = onGrabbed;
  // A gesture still going when the page goes away is ended with it.
  const ending = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => ending.current?.(), []);

  /** Where a point of the window is on the grid, in cells, as fractions. */
  const cellOf = (point: { x: number; y: number }, on: HTMLElement | null = grid.current) => {
    const node = on;
    if (!node) return undefined;
    const box = node.getBoundingClientRect();
    const column = (box.width + GRID.gap) / GRID.columns;
    const row = GRID.row + GRID.gap;
    return {
      x: (point.x - box.left) / column,
      y: (point.y - box.top) / row,
      over:
        point.x >= box.left &&
        point.x <= box.right &&
        point.y >= box.top - row &&
        // A little below the last widget is still the page: the place after everything.
        point.y <= box.bottom + 3 * row,
    };
  };

  /** The grid under a point: that of the container it is over, if any. */
  const gridUnder = (id: string, point: { x: number; y: number }): Target | undefined => {
    for (const target of targets?.(id) ?? []) {
      // Anywhere over the container counts, its heading too, so that it can be dragged down inside it.
      const area = (
        target.node.closest("[data-widget-cell]") ?? target.node
      ).getBoundingClientRect();
      if (
        point.x >= area.left &&
        point.x <= area.right &&
        point.y >= area.top &&
        point.y <= area.bottom
      )
        return target;
    }
    return undefined;
  };

  const grab: Placement["grab"] = (event, id, own, how, origin) => {
    const node = grid.current;
    if (!onMove || !node || event.button !== 0) return;
    // A press on a button, a link or a field is that control's, not the start of a drag.
    if (isControl(event.target)) return;
    const from = { x: event.clientX, y: event.clientY };
    // Cells are counted on the grid it is on: the page's, or its container's.
    const home = origin
      ? ((event.target as HTMLElement).closest("[data-widget-cell]")?.parentElement ?? node)
      : node;
    const start = cellOf(from, home);
    if (!start) return;
    // Where in the widget it was taken, in cells, so that it lands under the pointer as it was held.
    const holdX = start.x - own.x;
    const holdY = start.y - own.y;
    let latestIn = origin;
    const least = limits(id);
    let pointer = from;
    let latest = own;
    let dragging = how === "stretch";
    let stopScrolling: (() => void) | undefined;
    if (how === "stretch") event.preventDefault();
    const place = () => {
      if (how === "stretch") {
        const now = cellOf(pointer, home);
        if (!now) return;
        latest = stretched(own, Math.round(now.x - start.x), Math.round(now.y - start.y), least);
        setHeld({ id, at: latest, how, in: origin });
        return;
      }
      const under = gridUnder(id, pointer);
      const now = cellOf(pointer, under ? under.node : node);
      if (!now) return;
      latestIn = under?.into;
      latest = fit(
        { x: Math.round(now.x - holdX), y: Math.round(now.y - holdY), w: own.w, h: own.h },
        least,
      );
      setHeld({ id, at: latest, how, in: latestIn });
    };
    const follow = (moving: PointerEvent) => {
      pointer = { x: moving.clientX, y: moving.clientY };
      if (!dragging) {
        if (Math.hypot(pointer.x - from.x, pointer.y - from.y) < DRAG_FROM) return;
        dragging = true;
        grabbed.current?.(id);
        stopScrolling = scrollAtEdges(node, () => pointer, place);
      }
      place();
    };
    const end = () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
      stopScrolling?.();
      ending.current = undefined;
      setHeld(undefined);
    };
    const drop = () => {
      end();
      if (dragging && (!same(latest, own) || !sameIn(latestIn, origin)))
        onMove(id, latest, "pointer", how, latestIn);
    };
    if (how === "stretch") stopScrolling = scrollAtEdges(node, () => pointer, place);
    ending.current = end;
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
  };

  const carry: Placement["carry"] = (card, from, onDrop, how) => {
    const node = grid.current;
    if (!node) {
      onDrop(undefined);
      return;
    }
    let pointer = from;
    let landing: Box | undefined;
    const place = () => {
      const now = cellOf(pointer);
      if (!now?.over) {
        landing = undefined;
      } else if (how.narrow()) {
        landing = { x: 0, y: how.endRow(), w: card.size.w, h: card.size.h };
      } else {
        // The pointer holds the card by the middle of its top edge.
        landing = fit(
          {
            x: Math.round(now.x - card.size.w / 2),
            y: Math.floor(now.y),
            w: card.size.w,
            h: card.size.h,
          },
          card.limits,
        );
      }
      setCarrying({ card, pointer, at: landing });
    };
    const follow = (moving: PointerEvent) => {
      pointer = { x: moving.clientX, y: moving.clientY };
      place();
    };
    const end = () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onEscape, true);
      stopScrolling();
      ending.current = undefined;
      setCarrying(undefined);
    };
    const drop = () => {
      end();
      onDrop(landing);
    };
    const cancel = () => {
      end();
      onDrop(undefined);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    const stopScrolling = scrollAtEdges(node, () => pointer, place);
    ending.current = end;
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onEscape, true);
    place();
  };

  const keys: Placement["keys"] = (id, name, own, from) => ({
    "aria-keyshortcuts":
      "ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown",
    onKeyDown: (event) => {
      const step: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const by = step[event.key];
      // A key typed into a field, or meant for a button, is not a move.
      if (!by || !onMove || isControl(event.target)) return;
      event.preventDefault();
      const least = limits(id);
      const next = event.shiftKey
        ? stretched(own, by[0], by[1], least)
        : moved(own, by[0], by[1], least);
      if (same(next, own)) return;
      onMove(id, next, "keys", event.shiftKey ? "stretch" : "move", from);
      setSaid(
        event.shiftKey
          ? `${name} is ${next.w} wide and ${next.h} tall.`
          : `${name} is at column ${next.x + 1}, row ${next.y + 1}.`,
      );
    },
  });

  return {
    grid,
    held,
    carrying,
    at: (id, own) => (held?.id === id ? held.at : own),
    grab,
    carry,
    keys,
    said,
  };
}
