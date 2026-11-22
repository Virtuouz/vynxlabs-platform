import { MoveHorizontal } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

/**
 * A box that scrolls sideways, and says so: while what is inside is wider than the box, a line
 * above it says to scroll, and a fading edge shows on the side that has more. Nothing shows when
 * it all fits. The box takes the keyboard (arrow keys scroll it) while it overflows.
 */
export function SidewaysScroll({
  children,
  label,
  className = "",
  outerClassName = "",
  style,
  hint = "Wider than this window: scroll sideways to see all of it.",
  ...data
}: {
  children: ReactNode;
  /** What the box is, for a screen reader, when it can be scrolled. */
  label: string;
  className?: string;
  /** The box that holds the line and the scroller: where it sits in its parent. */
  outerClassName?: string;
  style?: CSSProperties | undefined;
  hint?: string;
  [key: `data-${string}`]: string | undefined;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ more: false, left: false, right: false });
  // What is inside changes with each render (a tablet's width, a new widget): measured again each time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: every render
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const more = element.scrollWidth > element.clientWidth + 2;
    setEdges((before) =>
      before.more === more
        ? before
        : {
            more,
            left: more && element.scrollLeft > 1,
            right: more && element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
          },
    );
  });
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      const more = element.scrollWidth > element.clientWidth + 2;
      setEdges((before) => {
        const next = {
          more,
          left: more && element.scrollLeft > 1,
          right: more && element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
        };
        return before.more === next.more && before.left === next.left && before.right === next.right
          ? before
          : next;
      });
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    for (const child of Array.from(element.children)) watch.observe(child);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      watch.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);
  return (
    <div className={`flex min-w-0 flex-col ${outerClassName}`}>
      {edges.more ? (
        <p
          data-scroll-sign=""
          className="m-0 mb-1 flex items-center gap-1.5 text-meta text-ink-muted"
        >
          <MoveHorizontal aria-hidden="true" size={14} className="shrink-0" />
          {hint}
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <div
          ref={box}
          {...data}
          className={`h-full ${className}`}
          style={style}
          {...(edges.more
            ? { tabIndex: 0, role: "region" as const, "aria-label": `${label}, scrolls sideways` }
            : {})}
        >
          {children}
        </div>
        {edges.left ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-5 rounded-l-panel bg-linear-to-r from-ink/15 to-transparent"
          />
        ) : null}
        {edges.right ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-5 rounded-r-panel bg-linear-to-l from-ink/15 to-transparent"
          />
        ) : null}
      </div>
    </div>
  );
}
