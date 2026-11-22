import { type ReactNode, useCallback, useEffect, useRef } from "react";

/**
 * The height, from the top of a box, at which it should end so that no row is cut: the bottom of
 * the last row that fits in `room`. `undefined` when everything fits already, or not even the
 * first row does (then the box is left as it is, and the first row is partly seen rather than
 * none). `bottoms` are the rows' bottom edges from the top of the box, in order.
 */
export function endBetweenRows(
  bottoms: readonly number[],
  room: number,
  natural: number,
): number | undefined {
  if (natural <= room + 1) return undefined;
  const fits = bottoms.filter((one) => one <= room + 0.5);
  const last = fits.at(-1);
  return last === undefined ? undefined : Math.floor(last);
}

/**
 * Rows in a widget's box (a table's, a list's) that end between two rows: the box is as tall as
 * the cell gives it, and what scrolls inside it is cut at a row's edge, never through one.
 * Rows say so with `data-box-row`. The room is what the widget's body has left over after what
 * else it holds (the buttons above, a "Show more" below).
 */
export function RowsBox({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => {
    const node = box.current;
    const body = node?.parentElement;
    if (!node || !body) return;
    node.style.height = "";
    node.style.overflowY = "";
    const others = body.scrollHeight - node.offsetHeight;
    const room = body.clientHeight - others;
    const top = node.getBoundingClientRect().top - node.scrollTop;
    const bottoms = [...node.querySelectorAll("[data-box-row]")].map(
      (row) => row.getBoundingClientRect().bottom - top,
    );
    const height = endBetweenRows(bottoms, room, node.scrollHeight);
    if (height !== undefined) {
      node.style.height = `${height}px`;
      node.style.overflowY = "auto";
    }
  }, []);
  useEffect(() => {
    const node = box.current;
    const body = node?.parentElement;
    if (!node || !body || typeof ResizeObserver !== "function") return;
    const watching = new ResizeObserver(fit);
    watching.observe(body);
    return () => watching.disconnect();
  }, [fit]);
  // Rows came, went or changed height: ended again between rows.
  useEffect(fit);
  return (
    <div ref={box} className="min-w-0 shrink-0">
      {children}
    </div>
  );
}
