import { type ReactNode, useCallback, useRef, useState } from "react";

/**
 * Wide content that scrolls sideways inside its card, never the page. It says so: a soft edge
 * shows at the side that has more, and the region is a stop for the keyboard (arrows scroll it)
 * while it does scroll. `label` names the region for a screen reader.
 */
export function ScrollsSideways({ label, children }: { label: string; children: ReactNode }) {
  const [edges, setEdges] = useState({ start: false, end: false });
  const [wide, setWide] = useState(false);
  const node = useRef<HTMLDivElement | null>(null);
  const watching = useRef<ResizeObserver | undefined>(undefined);
  const look = useCallback(() => {
    const el = node.current;
    if (!el) return;
    const room = el.scrollWidth - el.clientWidth;
    setWide(room > 1);
    setEdges({ start: el.scrollLeft > 1, end: el.scrollLeft < room - 1 });
  }, []);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      watching.current?.disconnect();
      node.current = el;
      if (!el || typeof ResizeObserver !== "function") return;
      watching.current = new ResizeObserver(look);
      watching.current.observe(el);
      for (const child of Array.from(el.children)) watching.current.observe(child);
      look();
    },
    [look],
  );
  const shade = "pointer-events-none absolute inset-y-0 w-6 from-ink/15 to-transparent";
  return (
    <div className="relative min-w-0" data-scrolls-sideways={wide ? "" : undefined}>
      <div
        ref={ref}
        role={wide ? "region" : undefined}
        aria-label={wide ? label : undefined}
        tabIndex={wide ? 0 : undefined}
        onScroll={look}
        className="overflow-x-auto rounded-inner outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
      >
        {children}
      </div>
      {edges.start ? <div aria-hidden="true" className={`${shade} left-0 bg-linear-to-r`} /> : null}
      {edges.end ? <div aria-hidden="true" className={`${shade} right-0 bg-linear-to-l`} /> : null}
    </div>
  );
}
