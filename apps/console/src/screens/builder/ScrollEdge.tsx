import { ChevronsRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * The sign that the canvas scrolls sideways: while there is more page to the right of what is
 * shown, a soft edge and a chevron sit on the canvas's right side, and go when its end is reached.
 * It takes no room (it is sticky, and as tall as nothing), so the page is drawn as it is.
 *
 * Put as the first thing inside the scrolling canvas (`[data-canvas]`).
 */
export function ScrollEdge() {
  const mark = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const scroller = mark.current?.closest<HTMLElement>("[data-canvas]");
    if (!scroller) return;
    const look = () => {
      setMore(scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 4);
      setBox((before) =>
        before.w === scroller.clientWidth && before.h === scroller.clientHeight
          ? before
          : { w: scroller.clientWidth, h: scroller.clientHeight },
      );
    };
    look();
    scroller.addEventListener("scroll", look, { passive: true });
    const watch = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(look);
    watch?.observe(scroller);
    for (const child of Array.from(scroller.children)) watch?.observe(child);
    return () => {
      scroller.removeEventListener("scroll", look);
      watch?.disconnect();
    };
  }, []);
  return (
    <div
      ref={mark}
      aria-hidden="true"
      data-scroll-edge={more ? "more" : "end"}
      className="pointer-events-none sticky left-0 z-10 h-0 overflow-visible"
      style={{ width: box.w || undefined }}
    >
      {more ? (
        <span
          className="absolute top-0 right-0 flex items-center justify-end bg-linear-to-r from-transparent to-action/25 pr-1 forced-colors:border-r-4 forced-colors:border-[Highlight] forced-colors:bg-transparent"
          style={{ height: box.h, width: 44 }}
        >
          <span className="flex size-6 items-center justify-center rounded-full border border-line-strong bg-raised text-ink shadow-raised forced-colors:border-[CanvasText]">
            <ChevronsRight size={14} />
          </span>
        </span>
      ) : null}
    </div>
  );
}
