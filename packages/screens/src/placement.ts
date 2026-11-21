import { useFlip } from "@volvel/ui";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
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

export interface Placement {
  /** For the element that is the grid. Each thing on it carries `data-flip-key`. */
  grid: RefObject<HTMLDivElement | null>;
  /** What is being dragged or stretched, and where it would land. */
  held: { id: string; at: Box; how: HowMoved } | undefined;
  /** Where to draw a thing: where it would land while it is held, its own place otherwise. */
  at: (id: string, own: Box) => Box;
  /** Start a drag (`move`) from anywhere on a thing, or a stretch from its corner. */
  grab: (event: ReactPointerEvent<HTMLElement>, id: string, own: Box, how: HowMoved) => void;
  /** For the thing that has focus when it is chosen: the arrows move it a cell, and with Shift change its size. */
  keys: (
    id: string,
    name: string,
    own: Box,
  ) => {
    "aria-keyshortcuts": string;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  };
  /** What a screen reader is told after a move from the keyboard. Put it in a `role="status"`. */
  said: string;
}

/**
 * Things placed on a grid of twelve columns by dragging them: a page's
 * widgets in the builder. A thing is dragged by itself and stretched by its
 * corner, and shown where it would land before it is let go. From the
 * keyboard the arrows do the same a cell at a time. Whatever else has to move
 * out of the way is seen to move (`useFlip`).
 *
 * The one who uses this draws the grid: `GRID.columns` columns, rows of
 * `GRID.row` pixels, `GRID.gap` between. `onMove` is told once, when a thing
 * is let go somewhere new; it is for the caller to make room (`settle`).
 */
export function usePlacement({
  places,
  onMove,
  limits,
  onGrabbed,
}: {
  /** Every thing's place, as text: when it changes, things are played to their new places. */
  places: string;
  /** `by` says whether it was dragged or moved a cell with a key, for what counts as one step to undo. */
  onMove: ((id: string, at: Box, by: "pointer" | "keys", how: HowMoved) => void) | undefined;
  /** How small and how large each thing may be made. */
  limits: (id: string) => Limits;
  /** Called when a press on a thing has become a drag. */
  onGrabbed?: (id: string) => void;
}): Placement {
  const [held, setHeld] = useState<{ id: string; at: Box; how: HowMoved }>();
  const [said, setSaid] = useState("");
  // A drag is its own motion: what is held follows the pointer, and is not played.
  const grid = useFlip<HTMLDivElement>(places, { paused: held !== undefined });
  const grabbed = useRef(onGrabbed);
  grabbed.current = onGrabbed;

  const grab: Placement["grab"] = (event, id, own, how) => {
    const box = grid.current?.getBoundingClientRect();
    if (!onMove || !box || event.button !== 0) return;
    // A press on a button, a link or a field is that control's, not the start of a drag.
    if (isControl(event.target)) return;
    const column = (box.width + GRID.gap) / GRID.columns;
    const row = GRID.row + GRID.gap;
    const from = { x: event.clientX, y: event.clientY };
    const least = limits(id);
    let latest = own;
    let dragging = how === "stretch";
    if (how === "stretch") event.preventDefault();
    const follow = (pointer: PointerEvent) => {
      const dx = pointer.clientX - from.x;
      const dy = pointer.clientY - from.y;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_FROM) return;
        dragging = true;
        grabbed.current?.(id);
      }
      const across = Math.round(dx / column);
      const down = Math.round(dy / row);
      latest =
        how === "move" ? moved(own, across, down, least) : stretched(own, across, down, least);
      setHeld({ id, at: latest, how });
    };
    const drop = () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
      setHeld(undefined);
      if (dragging && !same(latest, own)) onMove(id, latest, "pointer", how);
    };
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
  };

  const keys: Placement["keys"] = (id, name, own) => ({
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
      onMove(id, next, "keys", event.shiftKey ? "stretch" : "move");
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
    at: (id, own) => (held?.id === id ? held.at : own),
    grab,
    keys,
    said,
  };
}
