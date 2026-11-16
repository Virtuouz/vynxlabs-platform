import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const MIN = 20;
const MAX = 80;
const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

function readSize(id: string, fallback: number): number {
  try {
    const kept = Number(localStorage.getItem(`vx-split:${id}`));
    return Number.isFinite(kept) && kept >= MIN && kept <= MAX ? kept : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Two panes side by side with a divider between them that can be dragged, or
 * moved with the arrow keys once focused. The size is kept in this browser per
 * `id`, so it is as it was left after a reload. Below a laptop's width the panes
 * stack, the first above the second.
 */
export function SplitPane({
  id,
  label,
  first,
  second,
  initial = 60,
  className = "",
}: {
  /** Keeps the size: one per place the split is used. */
  id: string;
  /** Names the divider: "Resize the code and the test pane". */
  label: string;
  first: ReactNode;
  second: ReactNode;
  /** The first pane's share of the width, in percent, before anyone moves the divider. */
  initial?: number;
  className?: string;
}) {
  const [size, setSize] = useState(() => readSize(id, initial));
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const keep = useCallback(
    (next: number) => {
      const value = clamp(next);
      setSize(value);
      try {
        localStorage.setItem(`vx-split:${id}`, String(Math.round(value * 10) / 10));
      } catch {
        // Storage that cannot be reached keeps the size for this visit only.
      }
    },
    [id],
  );

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current || !box.current) return;
      const rect = box.current.getBoundingClientRect();
      if (rect.width > 0) keep(((event.clientX - rect.left) / rect.width) * 100);
    };
    const stop = () => {
      dragging.current = false;
      document.body.style.removeProperty("user-select");
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", stop);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", stop);
    };
  }, [keep]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") keep(size - step);
    else if (event.key === "ArrowRight") keep(size + step);
    else if (event.key === "Home") keep(MIN);
    else if (event.key === "End") keep(MAX);
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={box}
      className={`flex min-h-0 flex-col gap-3 lg:flex-row lg:gap-0 ${className}`}
      style={{ "--vx-split": `${size}%` } as React.CSSProperties}
    >
      <div className="flex min-h-0 min-w-0 flex-col lg:w-[var(--vx-split)] lg:shrink-0">
        {first}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a separator that moves is a widget, not an hr */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={Math.round(size)}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = true;
          document.body.style.setProperty("user-select", "none");
        }}
        onDoubleClick={() => keep(initial)}
        className="group hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center outline-none lg:flex"
      >
        <span className="w-px bg-line group-hover:w-0.5 group-hover:bg-action group-focus-visible:w-0.5 group-focus-visible:bg-focus" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{second}</div>
    </div>
  );
}
