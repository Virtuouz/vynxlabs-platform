import { type RefObject, useLayoutEffect, useRef } from "react";

/** `motion-base` and `--ease-out` (tokens.css), for motion that script starts. */
const MOVE_MS = 180;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

const still = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Things that change places move to their new place and are not just found
 * there: a column moved up with its arrow, a widget moved along a row from the
 * keyboard. Without it the list is redrawn in its new order in one frame, and
 * the reader has to find what moved.
 *
 * Give the returned ref to the element that holds them, and each thing that
 * can move a `data-flip-key` that stays with it. Whenever `order` changes,
 * each is played from where it was to where it is, over `motion-base`. Nothing
 * moves under reduced motion, or while `paused` (a pointer is dragging, and
 * the drag is the motion).
 *
 * Every reordering that is not a drag goes through this: `MoveButtons` are the
 * buttons for it, and `enforce.test.ts` holds new ones to both.
 */
export function useFlip<E extends HTMLElement>(
  order: string,
  options: {
    paused?: boolean;
    /** The holder, when the caller already has a ref for it: a canvas that measures it too. */
    ref?: RefObject<E | null>;
  } = {},
): RefObject<E | null> {
  const own = useRef<E>(null);
  const holder = options.ref ?? own;
  const before = useRef<{ order: string; places: Map<string, { x: number; y: number }> }>({
    order,
    places: new Map(),
  });
  const paused = options.paused === true;

  const playing = useRef(new Map<string, Animation>());

  // After every draw, not only a reordering: where things were is as of the last draw.
  useLayoutEffect(() => {
    const node = holder.current;
    if (!node) return;
    node.setAttribute("data-flip-holder", "");
    const origin = node.getBoundingClientRect();
    // A holder drawn scaled down (a sheet in the builder's canvas) is moved in its own pixels.
    const scale = node.offsetWidth > 0 && origin.width > 0 ? origin.width / node.offsetWidth : 1;
    const places = new Map<string, { x: number; y: number }>();
    const moved: [HTMLElement, string, number, number][] = [];
    const reordered = before.current.order !== order;
    for (const child of node.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      // Only its own: a list inside a list moves its own things.
      if (child.closest("[data-flip-holder]") !== node) continue;
      const key = child.dataset.flipKey as string;
      // One still on its way is seen where its motion has got to, and is laid out where it goes:
      // the two are kept apart, so that a move that interrupts a move starts from what is seen.
      const running = playing.current.get(key);
      const shift =
        running && typeof DOMMatrixReadOnly === "function"
          ? new DOMMatrixReadOnly(getComputedStyle(child).transform)
          : undefined;
      const carried = { x: (shift?.e ?? 0) * scale, y: (shift?.f ?? 0) * scale };
      const box = child.getBoundingClientRect();
      // From the holder's corner, so that scrolling the page between draws moves nothing.
      const place = { x: box.left - origin.left - carried.x, y: box.top - origin.top - carried.y };
      places.set(key, place);
      const was = before.current.places.get(key);
      // Less than a pixel is rounding, not a move.
      if (reordered && was && (Math.abs(was.x - place.x) >= 1 || Math.abs(was.y - place.y) >= 1)) {
        moved.push([
          child,
          key,
          (was.x - place.x + carried.x) / scale,
          (was.y - place.y + carried.y) / scale,
        ]);
      }
    }
    before.current = { order, places };
    if (paused || still()) return;
    for (const [child, key, dx, dy] of moved) {
      child.dataset.flipMoving = "";
      const played = child.animate?.(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: MOVE_MS, easing: EASE },
      );
      const last = playing.current.get(key);
      if (played) playing.current.set(key, played);
      // The one it takes over from ends now; the new one starts where that one was.
      last?.cancel();
      const done = () => {
        if (played && playing.current.get(key) !== played) return;
        playing.current.delete(key);
        delete child.dataset.flipMoving;
      };
      if (played) played.finished.then(done, done);
      else done();
    }
  });

  return holder;
}

let made = 0;

/**
 * A name for each place in a list whose items have none of their own, such
 * as the cases of a branch while their names are being typed. The name stays
 * with the item when it is moved, so it is the item that moves and what is
 * being typed into it keeps focus. Tell it of every move and removal.
 */
export function useKeys(count: number): {
  keys: string[];
  move: (from: number, to: number) => void;
  remove: (at: number) => void;
} {
  const keys = useRef<string[]>([]);
  while (keys.current.length < count) keys.current.push(`k${++made}`);
  if (keys.current.length > count) keys.current.length = count;
  return {
    keys: keys.current,
    move: (from, to) => {
      const [taken] = keys.current.splice(from, 1);
      if (taken !== undefined) keys.current.splice(to, 0, taken);
    },
    remove: (at) => {
      keys.current.splice(at, 1);
    },
  };
}
