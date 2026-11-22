import { PAGE_SIZES, type PageSize } from "@volvel/manifest";
import { useRef, useState } from "react";
import { SIZE_NAMES, SIZE_WIDTH } from "./pageKinds.ts";

/**
 * The handle on the right edge of a side sheet's or modal's frame while building. Dragging it
 * resizes the frame and snaps to the five sizes (the size's name is shown while dragging);
 * from the keyboard it is a slider, and the left and right arrows step through the sizes. Each
 * change is told once, so it is one undoable step.
 */
export function SizeHandle({
  size,
  onDrag,
  onSize,
  snap,
  scale = 1,
}: {
  size: PageSize;
  /** How much smaller than its own width the frame is drawn: a drag on the screen is that much larger in its pixels. */
  scale?: number;
  /** The width the frame is drawn at while it is dragged, or nothing when it is let go. */
  onDrag: (pixels: number | undefined) => void;
  onSize: (size: PageSize, key?: string) => void;
  snap: (pixels: number) => PageSize;
}) {
  const start = useRef<{ x: number; width: number } | undefined>(undefined);
  const [shown, setShown] = useState<PageSize>();
  const index = PAGE_SIZES.indexOf(size);
  const named = shown ?? size;
  const move = (event: React.PointerEvent<HTMLElement>) => {
    if (!start.current) return;
    // The frame is centred, so its edge travels half as far as the pointer does.
    const pixels = (start.current.width + 2 * (event.clientX - start.current.x)) / scale;
    const next = snap(pixels);
    setShown(next);
    onDrag(Math.max(320, pixels));
  };
  const end = (event: React.PointerEvent<HTMLElement>, keep: boolean) => {
    if (!start.current) return;
    const pixels = (start.current.width + 2 * (event.clientX - start.current.x)) / scale;
    start.current = undefined;
    setShown(undefined);
    onDrag(undefined);
    const next = snap(pixels);
    if (keep && next !== size) onSize(next);
  };
  return (
    <>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Size"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={PAGE_SIZES.length - 1}
        aria-valuenow={index}
        aria-valuetext={SIZE_NAMES[size]}
        title="Drag to change its size"
        className="absolute top-1/2 -right-3 flex h-12 w-3 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-inner bg-action text-action-ink outline-none after:absolute after:-inset-2 after:content-[''] focus-visible:ring-2 focus-visible:ring-focus"
        onPointerDown={(event) => {
          const frame = event.currentTarget.parentElement;
          start.current = {
            x: event.clientX,
            width: frame?.getBoundingClientRect().width || SIZE_WIDTH[size] || 720,
          };
          setShown(size);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(event) => end(event, true)}
        onPointerCancel={(event) => end(event, false)}
        onKeyDown={(event) => {
          const by = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
          const edge =
            event.key === "Home" ? 0 : event.key === "End" ? PAGE_SIZES.length - 1 : undefined;
          if (by === 0 && edge === undefined) return;
          event.preventDefault();
          const next = PAGE_SIZES[edge ?? Math.min(PAGE_SIZES.length - 1, Math.max(0, index + by))];
          if (next && next !== size) onSize(next, "page-size");
        }}
      >
        <span aria-hidden="true" className="h-5 w-0.5 rounded-full bg-action-ink/70" />
      </div>
      {shown ? (
        <span
          role="status"
          className="pointer-events-none absolute top-2 right-2 layer-sticky rounded-inner border border-line-strong bg-raised px-2 py-0.5 font-mono text-meta text-ink"
        >
          {SIZE_NAMES[named]}
        </span>
      ) : (
        <span role="status" className="sr-only">
          {`Size ${SIZE_NAMES[size]}`}
        </span>
      )}
    </>
  );
}
