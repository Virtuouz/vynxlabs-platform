import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFlip } from "../useFlip.ts";

/** `motion-base` and `--ease-out` (tokens.css), for motion that script starts. */
const MOVE_MS = 180;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
/** How near an edge of the scroller the pointer must be before the list scrolls, and its top speed. */
const EDGE = 48;
const SPEED = 16;

const still = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const moved = (ids: readonly string[], from: number, to: number) => {
  const next = [...ids];
  const [one] = next.splice(from, 1);
  if (one !== undefined) next.splice(to, 0, one);
  return next;
};

interface Slot {
  top: number;
  height: number;
}

interface Drag {
  id: string;
  /** The ids as they were when it was picked up. */
  from: string[];
  /** The ids as the pointer has them now. */
  to: string[];
  /** How far the pointer has taken the row, in pixels, scrolling included. */
  dy: number;
  /** Let go and sliding into place (or back, when cancelled). */
  settling?: "place" | "back";
}

export interface UseSortable<E extends HTMLElement = HTMLUListElement> {
  /** The element that holds the rows (the `ul`). */
  list: RefObject<E | null>;
  /** Spread on each row. */
  row: (id: string) => {
    ref: (node: HTMLElement | null) => void;
    style: CSSProperties;
    "data-flip-key": string;
    "data-sortable-row": "";
    "data-dragging"?: "";
  };
  /** Spread on each row's drag handle (a button). */
  handle: (id: string) => {
    "data-handle": "";
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
    onClickCapture: (event: MouseEvent<HTMLElement>) => void;
    onKeyDown: (event: KeyboardEvent) => void;
    style: CSSProperties;
  };
  /** For the row's own key handler: Alt+Up and Alt+Down move it. Handles move with Up and Down alone. */
  rowKeyDown: (event: KeyboardEvent, id: string) => void;
  /** The row being dragged, if one is. */
  dragging: string | undefined;
  /** What a screen reader is told of the last move. */
  said: string;
}

/**
 * Rows that are put in order by hand, one behaviour for every list in the console that has a
 * drag handle. Dragging: the row follows the pointer, lifted; the others slide out of its way
 * over `motion-base`; let go, it slides into its place and only then is the new order handed over,
 * so nothing pops. Esc slides it back. The list scrolls when the pointer is near the edge of its
 * scroller. From the keyboard Alt+Up and Alt+Down on a row, and Up and Down on its handle, move it
 * one place, and `useFlip` slides the move. Nothing moves under reduced motion. Each move is said.
 *
 * `ids` are the rows that can be moved, in order; give `onReorder` the new order. Put `list` on the
 * element that holds the rows and `row(id)` on each row, `handle(id)` on its handle.
 */
export function useSortable<E extends HTMLElement = HTMLUListElement>({
  ids,
  onReorder,
  nameOf,
  focus = "[data-main], [data-handle]",
}: {
  ids: readonly string[];
  /** The ids in their new order, and which one was moved. */
  onReorder: (ids: string[], moved: string) => void;
  /** Said with each move: "Moved Price to position 2 of 5". */
  nameOf?: (id: string) => string;
  /** What gets the focus back after a keyboard move (the row may be remade). */
  focus?: string;
}): UseSortable<E> {
  const [said, setSaid] = useState("");
  const [drag, setDrag] = useState<Drag | undefined>();
  const rows = useRef(new Map<string, HTMLElement>());
  const list = useRef<E | null>(null);
  const slots = useRef(new Map<string, Slot>());
  const gap = useRef(0);
  const pointer = useRef({
    startY: 0,
    y: 0,
    startScroll: 0,
    scroller: undefined as Element | undefined,
  });
  const pressedAt = useRef(0);
  const refocus = useRef<{ id: string; handle: boolean } | undefined>(undefined);
  const frame = useRef(0);
  const dragRef = useRef<Drag | undefined>(undefined);
  dragRef.current = drag;
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const changed = useRef(onReorder);
  changed.current = onReorder;

  useFlip(ids.join("\n"), { paused: drag !== undefined, ref: list });

  // A reorder may remake the row's element: put the focus back where it was.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after every reorder
  useEffect(() => {
    const again = refocus.current;
    if (!again) return;
    refocus.current = undefined;
    const node = rows.current.get(again.id);
    (again.handle
      ? node?.querySelector<HTMLElement>("[data-handle]")
      : node?.querySelector<HTMLElement>(focus)
    )?.focus();
  }, [ids.join("\n")]);

  const say = useCallback(
    (id: string, to: number, count: number) => {
      setSaid(`Moved ${nameOf?.(id) ?? "the row"} to position ${to + 1} of ${count}`);
    },
    [nameOf],
  );

  const nudge = (event: KeyboardEvent, id: string, plain: boolean) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (!event.altKey && !plain) return;
    event.preventDefault();
    const now = [...idsRef.current];
    const from = now.indexOf(id);
    if (from < 0) return;
    const to = Math.min(now.length - 1, Math.max(0, from + (event.key === "ArrowUp" ? -1 : 1)));
    if (to === from) return;
    refocus.current = {
      id,
      handle: Boolean((event.target as HTMLElement).closest("[data-handle]")),
    };
    say(id, to, now.length);
    changed.current(moved(now, from, to), id);
  };

  const scrollerOf = (node: HTMLElement): Element => {
    for (let up = node.parentElement; up; up = up.parentElement) {
      const overflow = getComputedStyle(up).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && up.scrollHeight > up.clientHeight) {
        return up;
      }
    }
    return document.scrollingElement ?? document.documentElement;
  };

  /** Where the dragged row would sit among the others, from where the pointer has it now. */
  const place = (id: string, from: string[], dy: number) => {
    const mine = slots.current.get(id);
    if (!mine) return from;
    // Its edge that leads, in the way it is going, has to pass the middle of another row to change places.
    const top = mine.top + dy;
    const bottom = top + mine.height;
    const was = from.indexOf(id);
    const others = from.filter((one) => one !== id);
    let to = 0;
    for (const one of others) {
      const slot = slots.current.get(one);
      if (!slot) continue;
      const middle = slot.top + slot.height / 2;
      if (from.indexOf(one) < was ? top >= middle : bottom > middle) to += 1;
    }
    const next = [...others];
    next.splice(to, 0, id);
    return next;
  };

  /** How far each row is from where it was, once the rows are in `to`. */
  const offsets = (from: string[], to: string[]) => {
    const out = new Map<string, number>();
    const first = slots.current.get(from[0] as string);
    if (!first) return out;
    let top = first.top;
    for (const id of to) {
      const slot = slots.current.get(id);
      if (!slot) continue;
      out.set(id, top - slot.top);
      top += slot.height + gap.current;
    }
    return out;
  };

  const finish = (settling: "place" | "back") => {
    const now = dragRef.current;
    if (!now || now.settling) return;
    cancelAnimationFrame(frame.current);
    const final = settling === "place" ? now.to : now.from;
    const apply = () => {
      document.body.style.removeProperty("user-select");
      setDrag(undefined);
      if (final.join("\n") !== now.from.join("\n")) {
        say(now.id, final.indexOf(now.id), final.length);
        changed.current(final, now.id);
      }
    };
    if (still()) {
      apply();
      return;
    }
    setDrag({ ...now, settling });
    window.setTimeout(apply, MOVE_MS + 20);
  };

  // Esc puts it back.
  const holding = drag !== undefined && !drag.settling;
  // biome-ignore lint/correctness/useExhaustiveDependencies: finish reads the refs
  useEffect(() => {
    if (!holding) return;
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      finish("back");
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [holding]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      document.body.style.removeProperty("user-select");
    },
    [],
  );

  const follow = () => {
    const now = dragRef.current;
    if (!now || now.settling) return;
    const { startY, y, startScroll, scroller } = pointer.current;
    const scrolled = scroller ? scroller.scrollTop - startScroll : 0;
    const mine = slots.current.get(now.id);
    const all = [...slots.current.values()];
    const topmost = Math.min(...all.map((slot) => slot.top));
    const bottom = Math.max(...all.map((slot) => slot.top + slot.height));
    let dy = y - startY + scrolled;
    if (mine) dy = Math.min(bottom - mine.height - mine.top, Math.max(topmost - mine.top, dy));
    const to = place(now.id, now.from, dy);
    setDrag({ ...now, dy, to });
  };

  // Near the top or bottom of the scroller, it scrolls, and goes on while the pointer stays there.
  const autoscroll = () => {
    const now = dragRef.current;
    const { scroller, y } = pointer.current;
    if (!now || now.settling || !scroller) return;
    const box =
      scroller === document.scrollingElement || scroller === document.documentElement
        ? { top: 0, bottom: window.innerHeight }
        : scroller.getBoundingClientRect();
    let by = 0;
    if (y < box.top + EDGE) by = -SPEED * Math.min(1, (box.top + EDGE - y) / EDGE);
    else if (y > box.bottom - EDGE) by = SPEED * Math.min(1, (y - (box.bottom - EDGE)) / EDGE);
    if (by !== 0) {
      const before = scroller.scrollTop;
      scroller.scrollTop += by;
      if (scroller.scrollTop !== before) follow();
    }
    frame.current = requestAnimationFrame(autoscroll);
  };

  const start = (event: PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || dragRef.current) return;
    const current = [...idsRef.current];
    const node = rows.current.get(id);
    if (!node) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    slots.current.clear();
    for (const one of current) {
      const box = rows.current.get(one)?.getBoundingClientRect();
      if (box) slots.current.set(one, { top: box.top, height: box.height });
    }
    const a = slots.current.get(current[0] as string);
    const z = slots.current.get(current[current.length - 1] as string);
    const heights = current.reduce((sum, one) => sum + (slots.current.get(one)?.height ?? 0), 0);
    gap.current =
      a && z && current.length > 1
        ? (z.top + z.height - a.top - heights) / (current.length - 1)
        : 0;
    const scroller = scrollerOf(node);
    pointer.current = {
      startY: event.clientY,
      y: event.clientY,
      startScroll: scroller.scrollTop,
      scroller,
    };
    document.body.style.userSelect = "none";
    setDrag({ id, from: current, to: current, dy: 0 });
    frame.current = requestAnimationFrame(autoscroll);
  };
  const over = (event: PointerEvent<HTMLElement>) => {
    if (!dragRef.current || dragRef.current.settling) return;
    pointer.current.y = event.clientY;
    follow();
  };

  const settledOffsets = drag
    ? offsets(drag.from, drag.settling === "back" ? drag.from : drag.to)
    : undefined;

  return {
    list,
    dragging: drag?.id,
    said,
    rowKeyDown: (event, id) => {
      if (!(event.target as HTMLElement).closest("[data-handle]")) nudge(event, id, false);
    },
    row: (id) => {
      const style: CSSProperties = {};
      if (drag && settledOffsets) {
        const mine = drag.id === id;
        const reduced = still();
        if (mine) {
          style.position = "relative";
          style.zIndex = 10;
          if (drag.settling) {
            style.transform = `translateY(${settledOffsets.get(id) ?? 0}px)`;
            style.transition = reduced ? "none" : `transform ${MOVE_MS}ms ${EASE}`;
          } else {
            style.transform = `translateY(${drag.dy}px)`;
            style.transition = "none";
          }
          style.touchAction = "none";
        } else {
          style.transform = `translateY(${settledOffsets.get(id) ?? 0}px)`;
          style.transition = reduced ? "none" : `transform ${MOVE_MS}ms ${EASE}`;
        }
      }
      return {
        ref: (node: HTMLElement | null) => {
          if (node) rows.current.set(id, node);
          else rows.current.delete(id);
        },
        style,
        "data-flip-key": id,
        "data-sortable-row": "" as const,
        ...(drag?.id === id ? { "data-dragging": "" as const } : {}),
      };
    },
    handle: (id) => ({
      "data-handle": "" as const,
      onPointerDown: (event) => {
        pressedAt.current = event.clientY;
        start(event, id);
      },
      onPointerMove: over,
      onPointerUp: (event) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        finish("place");
      },
      onPointerCancel: () => finish("back"),
      // A drag that ends over its handle is not a press of it.
      onClickCapture: (event) => {
        if (Math.abs(event.clientY - pressedAt.current) < 4) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onKeyDown: (event) => nudge(event, id, true),
      style: { touchAction: "none", userSelect: "none" },
    }),
  };
}

/** Classes that lift the dragged row: put them on each row that `row(id)` is spread on. */
export const LIFTED = "data-[dragging]:bg-raised data-[dragging]:shadow-drag";
