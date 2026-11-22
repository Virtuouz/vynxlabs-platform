import type { WidgetIn } from "@volvel/manifest";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { besideContainers, fit, type Limits } from "./layout.ts";

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

/** How far into a container, in rows, a pointer is before it is in it: its edges are for what goes above and below. */
const INSIDE = 0.35;

/** How long a pointer rests over a container before it makes room, in milliseconds: passing over one is not resting. */
const REST_MS = 220;

/** Whether the grid that is come over is open, and telling when one that is rested over opens. */
function resting(home: WidgetIn | undefined, opened: () => void) {
  let at = home;
  let open = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    over: (into: WidgetIn | undefined, atOnce: boolean): boolean => {
      if (sameIn(into, at)) {
        if (atOnce) open = true;
        return open;
      }
      at = into;
      clearTimeout(timer);
      open = atOnce || into === undefined || sameIn(into, home);
      if (!open)
        timer = setTimeout(() => {
          open = true;
          opened();
        }, REST_MS);
      return open;
    },
    end: () => clearTimeout(timer),
  };
}

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
  /** A Section or Tabs, which is never put in another. */
  container?: boolean;
}

export interface Carrying {
  card: Card;
  /** Where the pointer is, in the window. */
  pointer: { x: number; y: number };
  /** Where it would land; absent while it is not over the page. */
  at: Box | undefined;
  /** The container's grid it would land on; absent for the page's own. */
  in?: WidgetIn | undefined;
  /** That grid makes room for it: one it has only just come over does not yet. */
  open: boolean;
}

/** A grid inside a container, which something can be dropped on. */
export interface Target {
  into: WidgetIn;
  /** The element that is the grid: where its cells are counted from. */
  node: HTMLElement;
  /**
   * For a tab of Tabs that is not open: its name in the strip. Held over it, the tab opens
   * (`onOpen`), and a thing let go there lands at the bottom of that tab.
   */
  header?: HTMLElement;
  /** The first free row under what is on it: nothing lands lower than that. */
  bottom: number;
  /** Where its container is on the page's grid when nothing is held. */
  rest: Box;
}

const sameIn = (a: WidgetIn | undefined, b: WidgetIn | undefined) =>
  a?.widget === b?.widget && a?.tab === b?.tab;

export interface Placement {
  /** For the element that is the grid. Each thing on it carries `data-flip-key`. */
  grid: RefObject<HTMLDivElement | null>;
  /** What is being dragged or stretched, and where it would land. */
  held:
    | {
        id: string;
        at: Box;
        how: HowMoved;
        in: WidgetIn | undefined;
        /**
         * The grid it is over makes room for it. A container it has only just come over does not
         * yet, so that one that is passed over on the way to somewhere else moves nothing.
         */
        open: boolean;
        /** A dragged thing's own size, in pixels: it keeps it while it follows the pointer. */
        size?: { width: number; height: number };
      }
    | undefined;
  /** Where a dragged thing was seen as it was let go, for it to be played from there. Read once. */
  letGo: RefObject<{ id: string; from: DOMRect } | undefined>;
  /** Puts what is dragged under the pointer again: for after each draw, before it is seen. */
  follow: () => void;
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
    /** What it is called, for what is said when it lands or is put back. */
    name?: string,
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
    onDrop: (at: Box | undefined, into?: WidgetIn) => void,
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
 * that what is held keeps up. `each` is told every frame, for what follows the
 * pointer over a page that is moving under it. Returns how to stop.
 */
function scrollAtEdges(
  grid: HTMLElement,
  pointer: () => { x: number; y: number },
  scrolled: () => void,
  each?: () => void,
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
    each?.();
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
  onOpen,
  isContainer: isHeldContainer = () => false,
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
  /** Whether a thing is itself a container, which is moved among the others and never into one. */
  isContainer?: (id: string) => boolean;
  /** A tab's name was held over while dragging: its tab is opened, so what it holds is seen. */
  onOpen?: (into: WidgetIn) => void;
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
  const trailing = useRef<(() => void) | undefined>(undefined);
  const letGo = useRef<{ id: string; from: DOMRect } | undefined>(undefined);
  useEffect(() => () => ending.current?.(), []);

  /** Where a point of the window is on the grid, in cells, as fractions. */
  const cellOf = (point: { x: number; y: number }, on: HTMLElement | null = grid.current) => {
    const node = on;
    if (!node) return undefined;
    const box = node.getBoundingClientRect();
    // A grid drawn scaled down (a Large sheet in a narrow canvas) is smaller on the screen than
    // in its own pixels: a cell is that much smaller too.
    const k = node.offsetWidth > 0 ? box.width / node.offsetWidth : 1;
    const column = (box.width + GRID.gap * k) / GRID.columns;
    const row = (GRID.row + GRID.gap) * k;
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

  /**
   * The grid under a point: that of the container it is over, if any. Containers are counted
   * where they are when nothing is held, and not where they have been pushed to: one that moved
   * aside as it was reached could never be reached. The one it is already in counts as it is
   * drawn, which is taller while it makes room.
   */
  const gridUnder = (
    over: readonly Target[],
    point: { x: number; y: number },
    cell: { x: number; y: number },
    now: WidgetIn | undefined,
  ): Target | undefined => {
    for (const target of over) {
      const box = target.header?.getBoundingClientRect();
      if (
        box &&
        point.x >= box.left &&
        point.x <= box.right &&
        point.y >= box.top &&
        point.y <= box.bottom
      )
        return target;
    }
    return over.find((target) => {
      if (target.header) return false;
      const { rest } = target;
      let bottom = rest.y + rest.h;
      if (now?.widget === target.into.widget) {
        const drawn = target.node.closest("[data-widget-cell]")?.getBoundingClientRect();
        const low = drawn ? cellOf({ x: point.x, y: drawn.bottom })?.y : undefined;
        if (low !== undefined) bottom = Math.max(bottom, low);
      }
      return (
        cell.x >= rest.x &&
        cell.x < rest.x + rest.w &&
        cell.y >= rest.y + INSIDE &&
        cell.y < bottom - INSIDE
      );
    });
  };

  /** Where something `w` by `h`, held `holdX` and `holdY` cells in from its corner, would land. */
  const landingFor = (
    over: readonly Target[],
    point: { x: number; y: number },
    hold: { x: number; y: number },
    size: { w: number; h: number },
    least: Limits,
    now: WidgetIn | undefined,
    container: boolean,
  ): { at: Box; into: WidgetIn | undefined; header: boolean } | undefined => {
    const cell = cellOf(point);
    if (!cell) return undefined;
    const under = gridUnder(over, point, cell, now);
    if (under?.header) {
      // Over a tab's name: the thing goes to the bottom of that tab.
      return { at: fit({ x: 0, y: under.bottom, ...size }, least), into: under.into, header: true };
    }
    if (under) {
      const inner = cellOf(point, under.node);
      if (!inner) return undefined;
      const at = fit(
        {
          x: Math.round(inner.x - hold.x),
          // No lower than right under what is there: a Section does not grow with the pointer.
          y: Math.min(under.bottom, Math.max(0, Math.round(inner.y - hold.y))),
          ...size,
        },
        least,
      );
      return { at, into: under.into, header: false };
    }
    const at = fit(
      { x: Math.round(cell.x - hold.x), y: Math.round(cell.y - hold.y), ...size },
      least,
    );
    return {
      at: container
        ? at
        : besideContainers(
            at,
            cell,
            over.filter((one) => !one.header).map((one) => one.rest),
          ),
      into: undefined,
      header: false,
    };
  };

  const grab: Placement["grab"] = (event, id, own, how, origin, name = "The widget") => {
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
    // The thing itself, which follows the pointer while what would become of the page is drawn under it.
    const card = node.querySelector<HTMLElement>(`[data-widget-cell="${CSS.escape(id)}"]`);
    const was = card?.getBoundingClientRect();
    const homeScale = () => {
      const box = home.getBoundingClientRect();
      return { box, k: home.offsetWidth > 0 ? box.width / home.offsetWidth : 1 };
    };
    const { k: startScale } = homeScale();
    const taken = was
      ? { x: (from.x - was.left) / startScale, y: (from.y - was.top) / startScale }
      : undefined;
    const size =
      was && how === "move"
        ? { width: was.width / startScale, height: was.height / startScale }
        : undefined;
    const trail = () => {
      // Until it is drawn lifted out of the grid, moving it would move it from its place.
      if (!card?.hasAttribute("data-lifted") || !taken || !dragging) return;
      const { box, k } = homeScale();
      card.style.translate = `${(pointer.x - box.left) / k - taken.x}px ${(pointer.y - box.top) / k - taken.y}px`;
    };
    const least = limits(id);
    let pointer = from;
    let latest = own;
    let dragging = how === "stretch";
    let stopScrolling: (() => void) | undefined;
    if (how === "stretch") event.preventDefault();
    trailing.current = trail;
    /** Told only when where it would land changes: the page is drawn again for that, not for every pixel. */
    const tell = (at: Box, into: WidgetIn | undefined, open = true) =>
      setHeld((before) =>
        before?.id === id && same(before.at, at) && sameIn(before.in, into) && before.open === open
          ? before
          : { id, at, how, in: into, open, ...(size ? { size } : {}) },
      );
    const rest = resting(origin, () => place());
    const place = () => {
      if (how === "stretch") {
        const now = cellOf(pointer, home);
        if (!now) return;
        latest = stretched(own, Math.round(now.x - start.x), Math.round(now.y - start.y), least);
        tell(latest, origin);
        return;
      }
      const over = targets?.(id) ?? [];
      const found = landingFor(
        over,
        pointer,
        { x: holdX, y: holdY },
        { w: own.w, h: own.h },
        least,
        latestIn,
        isHeldContainer(id),
      );
      if (!found) return;
      if (found.header && found.into && !sameIn(latestIn, found.into)) onOpen?.(found.into);
      latestIn = found.into;
      latest = found.at;
      tell(latest, latestIn, rest.over(latestIn, found.header));
    };
    const follow = (moving: PointerEvent) => {
      pointer = { x: moving.clientX, y: moving.clientY };
      if (!dragging) {
        if (Math.hypot(pointer.x - from.x, pointer.y - from.y) < DRAG_FROM) return;
        dragging = true;
        grabbed.current?.(id);
        stopScrolling = scrollAtEdges(node, () => pointer, place, trail);
      }
      place();
      trail();
    };
    const end = () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", onEscape, true);
      stopScrolling?.();
      rest.end();
      ending.current = undefined;
      if (card && dragging && how === "move") {
        letGo.current = { id, from: card.getBoundingClientRect() };
        card.style.translate = "";
      }
      trailing.current = undefined;
      setHeld(undefined);
    };
    const drop = () => {
      end();
      if (dragging && (!same(latest, own) || !sameIn(latestIn, origin))) {
        onMove(id, latest, "pointer", how, latestIn);
        setSaid(
          how === "stretch"
            ? `${name} is ${latest.w} wide and ${latest.h} tall.`
            : `${name} moved to column ${latest.x + 1}, row ${latest.y + 1}.`,
        );
      }
    };
    // Esc, a cancelled pointer and a window that loses the pointer put everything back.
    const cancel = () => {
      const was = dragging;
      end();
      if (was)
        setSaid(
          `${how === "stretch" ? "Resize" : "Move"} cancelled. ${name} is back where it was.`,
        );
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !dragging) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    if (how === "stretch") stopScrolling = scrollAtEdges(node, () => pointer, place);
    ending.current = end;
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", onEscape, true);
  };

  const carry: Placement["carry"] = (card, from, onDrop, how) => {
    const node = grid.current;
    if (!node) {
      onDrop(undefined);
      return;
    }
    let pointer = from;
    let landing: Box | undefined;
    let into: WidgetIn | undefined;
    let intoBefore: WidgetIn | undefined;
    let open = true;
    const tell = () =>
      setCarrying((before) =>
        // Over the page it is drawn where it would land, and only that changes what is drawn.
        before?.at &&
        landing &&
        same(before.at, landing) &&
        sameIn(before.in, into) &&
        before.open &&
        open
          ? before
          : { card, pointer, at: landing, in: into, open },
      );
    const rest = resting(undefined, () => place());
    const place = () => {
      const now = cellOf(pointer);
      into = undefined;
      if (!now?.over) {
        landing = undefined;
      } else if (how.narrow()) {
        landing = { x: 0, y: how.endRow(), w: card.size.w, h: card.size.h };
      } else {
        // The pointer holds the card by the middle of its top edge.
        const found = landingFor(
          card.container ? [] : (targets?.(CARRIED) ?? []),
          pointer,
          { x: card.size.w / 2, y: 0.5 },
          card.size,
          card.limits,
          intoBefore,
          card.container === true,
        );
        landing = found?.at;
        into = found?.into;
        if (found?.header && into && !sameIn(intoBefore, into)) onOpen?.(into);
        intoBefore = into;
        open = rest.over(into, found?.header === true);
      }
      tell();
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
      rest.end();
      ending.current = undefined;
      setCarrying(undefined);
    };
    const drop = () => {
      end();
      if (into) onDrop(landing, into);
      else onDrop(landing);
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
          : `${name} moved to column ${next.x + 1}, row ${next.y + 1}.`,
      );
    },
  });

  return {
    grid,
    held,
    letGo,
    follow: () => trailing.current?.(),
    carrying,
    at: (id, own) => (held?.id === id ? held.at : own),
    grab,
    carry,
    keys,
    said,
  };
}

/**
 * Who should have focus when `id` is removed: the widget after it in the same grid (reading
 * order), else the one before, else nothing, which is the canvas.
 */
export function neighbourOf(
  widgets: readonly { id: string; at: Box; in?: WidgetIn | undefined }[],
  id: string,
): string | undefined {
  const own = widgets.find((one) => one.id === id);
  if (!own) return undefined;
  const around = widgets
    .filter((one) => sameIn(one.in, own.in))
    .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  const at = around.findIndex((one) => one.id === id);
  return (around[at + 1] ?? around[at - 1])?.id;
}

/** Puts focus on a widget (once it is drawn), or on the canvas when there is none. */
export function focusWidget(id: string | undefined) {
  requestAnimationFrame(() => {
    const found = id ? document.querySelector<HTMLElement>(`[data-widget-cell="${id}"]`) : null;
    (found ?? document.querySelector<HTMLElement>("[data-canvas]"))?.focus({ preventScroll: true });
  });
}
