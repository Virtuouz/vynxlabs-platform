import { useFlip } from "@volvel/ui";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useState,
} from "react";

/** Where something is on a grid of twelve columns, and how big: all in cells. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The grid's measures in pixels, which the stylesheet also has to draw: a row and the gap. */
export const GRID = { columns: 12, row: 40, gap: 12, rows: 200, tallest: 40 } as const;

const same = (a: Box, b: Box) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const moved = (at: Box, dx: number, dy: number): Box => ({
  ...at,
  x: Math.min(GRID.columns - at.w, Math.max(0, at.x + dx)),
  y: Math.min(GRID.rows - 1, Math.max(0, at.y + dy)),
});
const stretched = (at: Box, dx: number, dy: number, least: { w: number; h: number }): Box => ({
  ...at,
  w: Math.min(GRID.columns - at.x, Math.max(least.w, at.w + dx)),
  h: Math.min(GRID.tallest, Math.max(least.h, at.h + dy)),
});

export interface Placement {
  /** For the element that is the grid. Each thing on it carries `data-flip-key`. */
  grid: RefObject<HTMLDivElement | null>;
  /** What is being dragged or stretched, and where it would land. */
  held: { id: string; at: Box } | undefined;
  /** Where to draw a thing: where it would land while it is held, its own place otherwise. */
  at: (id: string, own: Box) => Box;
  /** Start a drag (`move`) from a thing's heading, or a stretch from its corner. */
  grab: (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    own: Box,
    how: "move" | "stretch",
  ) => void;
  /**
   * For the control that has focus when a thing is chosen: the arrow keys
   * move it a cell, and with Shift change its size.
   */
  keys: (
    id: string,
    name: string,
    own: Box,
  ) => {
    "aria-keyshortcuts": string;
    title: string;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  };
  /** What a screen reader is told after a move from the keyboard. Put it in a `role="status"`. */
  said: string;
}

/**
 * Things placed on a grid of twelve columns by dragging them: an app page's
 * widgets in the builder, a dashboard's widgets. A thing is dragged by its
 * heading and stretched by its corner, and shown where it would land before
 * it is let go. From the keyboard the arrows do the same a cell at a time.
 * Whatever else has to move out of the way is seen to move (`useFlip`).
 *
 * The one who uses this draws the grid: `GRID.columns` columns, rows of
 * `GRID.row` pixels, `GRID.gap` between. `onMove` is told once, when a thing
 * is let go somewhere new; it is for the caller to make room (`settle`).
 */
export function usePlacement({
  places,
  onMove,
  least = { w: 1, h: 1 },
}: {
  /** Every thing's place, as text: when it changes, things are played to their new places. */
  places: string;
  /** `by` says whether it was dragged or moved a cell with a key, for what counts as one step to undo. */
  onMove: ((id: string, at: Box, by: "pointer" | "keys") => void) | undefined;
  /** The smallest a thing may be made. */
  least?: { w: number; h: number };
}): Placement {
  const [held, setHeld] = useState<{ id: string; at: Box }>();
  const [said, setSaid] = useState("");
  // A drag is its own motion: what is held follows the pointer, and is not played.
  const grid = useFlip<HTMLDivElement>(places, { paused: held !== undefined });

  const grab: Placement["grab"] = (event, id, own, how) => {
    const box = grid.current?.getBoundingClientRect();
    if (!onMove || !box || event.button !== 0) return;
    // A press on a button in the heading is that button's, not the start of a drag.
    if (how === "move" && (event.target as HTMLElement).closest("button, a, input, select")) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const column = (box.width + GRID.gap) / GRID.columns;
    const row = GRID.row + GRID.gap;
    const from = { x: event.clientX, y: event.clientY };
    let latest = own;
    const follow = (pointer: PointerEvent) => {
      const across = Math.round((pointer.clientX - from.x) / column);
      const down = Math.round((pointer.clientY - from.y) / row);
      latest = how === "move" ? moved(own, across, down) : stretched(own, across, down, least);
      setHeld({ id, at: latest });
    };
    const drop = () => {
      handle.removeEventListener("pointermove", follow);
      handle.removeEventListener("pointerup", drop);
      handle.removeEventListener("pointercancel", drop);
      setHeld(undefined);
      if (!same(latest, own)) onMove(id, latest, "pointer");
    };
    handle.addEventListener("pointermove", follow);
    handle.addEventListener("pointerup", drop);
    handle.addEventListener("pointercancel", drop);
  };

  const keys: Placement["keys"] = (id, name, own) => ({
    "aria-keyshortcuts": "ArrowLeft ArrowRight ArrowUp ArrowDown",
    title: "Arrow keys move it. Shift and arrow keys change its size.",
    onKeyDown: (event) => {
      const step: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const by = step[event.key];
      if (!by || !onMove) return;
      event.preventDefault();
      const next = event.shiftKey ? stretched(own, by[0], by[1], least) : moved(own, by[0], by[1]);
      if (same(next, own)) return;
      onMove(id, next, "keys");
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
