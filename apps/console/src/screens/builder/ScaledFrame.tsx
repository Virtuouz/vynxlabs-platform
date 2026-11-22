import { type ReactNode, useEffect, useRef, useState } from "react";

const HANDLE_ROOM = 24;

/**
 * A frame drawn at its true width (a Large sheet is 960 wide, a tablet 768) and scaled down to
 * fit the room it has, with the scale said ("62 %") so that what is seen is known to be smaller.
 * It is never scaled up. The handle is given the scale, for a drag measured on the screen to be
 * turned into the frame's own pixels; it sits on the frame's edge, outside what is scaled.
 */
export function ScaledFrame({
  width,
  held = false,
  children,
  handle,
}: {
  /** The frame's own width, in pixels; or `room`, all there is (Full), drawn at its true size. */
  width: number | "room";
  /** It is being sized by its edge: the scale stays as it was when it was taken hold of. */
  held?: boolean;
  children: ReactNode;
  handle?: ((scale: number) => ReactNode) | undefined;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<number>();
  const [tall, setTall] = useState(0);
  useEffect(() => {
    const box = outer.current?.parentElement;
    const frame = inner.current;
    if (!box || !frame) return;
    const measure = () => {
      // The room is what is inside the padding.
      const style = getComputedStyle(box);
      setRoom(
        box.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight) -
          // The handle on the frame's edge, and what a finger can hit around it, stay inside the room.
          HANDLE_ROOM,
      );
      setTall(frame.offsetHeight);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(box);
    watch.observe(frame);
    return () => watch.disconnect();
  }, []);
  const own = width === "room" ? room : width;
  const fits = room !== undefined && room > 0 && own ? Math.min(1, room / own) : 1;
  const last = useRef(fits);
  if (!held) last.current = fits;
  const scale = last.current;
  const percent = Math.round(scale * 100);
  return (
    <div
      ref={outer}
      data-scaled-frame={percent}
      className={`relative mx-auto ${scale < 1 ? "mt-6" : ""}`}
      style={{
        width: own === undefined ? undefined : own * scale,
        height: tall ? tall * scale : undefined,
      }}
    >
      <div
        ref={inner}
        // Out of the flow, so that its own width does not widen what holds the frame.
        className="absolute top-0 left-0"
        style={{
          width: own ?? "100%",
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
      {scale < 1 ? (
        <span
          data-scale-said=""
          className="pointer-events-none absolute -top-5 left-0 font-mono text-meta text-ink-muted"
        >
          Drawn at {percent} %
        </span>
      ) : null}
      {handle?.(scale)}
    </div>
  );
}
