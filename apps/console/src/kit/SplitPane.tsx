import { PanelLeftOpen, PanelRightOpen, PanelTopOpen } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef } from "react";
import { usePreference } from "../prefs.ts";

const MIN = 15;
const MAX = 85;

/** What a split keeps for its member: the first pane's share, and which pane, if any, is folded away. */
type Kept = number | { size: number; collapsed?: "first" | "second" };

/**
 * Two panes with a divider between them that can be dragged, moved with the
 * arrow keys once focused, reset by a double-click, and, where a pane may be
 * folded away, folded by Enter (the WAI-ARIA window splitter) and opened again
 * from the rail it leaves. Size and fold are kept with the member's settings
 * per `id`, so they are as they were left on any browser.
 *
 * Side by side (`horizontal`) the panes stack below a laptop's width, the
 * first above the second; one above the other (`vertical`) they always split.
 */
export function SplitPane({
  id,
  label,
  first,
  second,
  initial = 60,
  orientation = "horizontal",
  collapsible,
  paneLabels = { first: "the first pane", second: "the second pane" },
  minFirst = 160,
  minSecond = 160,
  className = "",
}: {
  /** Keeps the size: one per place the split is used. */
  id: string;
  /** Names the divider: "Resize the code and the test pane". */
  label: string;
  first: ReactNode;
  second: ReactNode;
  /** The first pane's share, in percent, before anyone moves the divider. */
  initial?: number;
  orientation?: "horizontal" | "vertical";
  /** The pane that may be folded away. */
  collapsible?: "first" | "second" | undefined;
  /** What each pane is, for the rail's "Show …" button. */
  paneLabels?: { first: string; second: string };
  /** The least room each pane keeps, in pixels, so neither is dragged out of sight. */
  minFirst?: number;
  minSecond?: number;
  className?: string;
}) {
  const [kept, setKept] = usePreference<Kept>(`split:${id}`, initial);
  const raw = typeof kept === "number" ? kept : kept?.size;
  const collapsed = typeof kept === "object" && kept ? kept.collapsed : undefined;
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const vertical = orientation === "vertical";

  /** The share, kept within the percent bounds and the panes' least room. */
  const bounded = useCallback(
    (value: number) => {
      const rect = box.current?.getBoundingClientRect();
      const length = rect ? (vertical ? rect.height : rect.width) : 0;
      let low = MIN;
      let high = MAX;
      if (length > 0) {
        low = Math.max(low, (minFirst / length) * 100);
        high = Math.min(high, 100 - (minSecond / length) * 100);
      }
      return low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
    },
    [vertical, minFirst, minSecond],
  );
  const size = Number.isFinite(raw) ? Math.min(MAX, Math.max(MIN, raw as number)) : initial;

  const keep = useCallback(
    (next: number, fold: "first" | "second" | undefined = undefined) => {
      const value = Math.round(bounded(next) * 10) / 10;
      setKept(fold ? { size: value, collapsed: fold } : value);
    },
    [bounded, setKept],
  );
  const fold = (which: "first" | "second" | undefined) => keep(size, which);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current || !box.current) return;
      const rect = box.current.getBoundingClientRect();
      const length = vertical ? rect.height : rect.width;
      const at = vertical ? event.clientY - rect.top : event.clientX - rect.left;
      if (length > 0) keep((at / length) * 100);
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
  }, [keep, vertical]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    const less = vertical ? "ArrowUp" : "ArrowLeft";
    const more = vertical ? "ArrowDown" : "ArrowRight";
    if (event.key === less) keep(size - step);
    else if (event.key === more) keep(size + step);
    else if (event.key === "Home") keep(MIN);
    else if (event.key === "End") keep(MAX);
    else if (event.key === "Enter" && collapsible) fold(collapsed ? undefined : collapsible);
    else return;
    event.preventDefault();
  };

  const rail = (which: "first" | "second") => {
    const Icon = vertical ? PanelTopOpen : which === "first" ? PanelLeftOpen : PanelRightOpen;
    return (
      <div
        className={`flex shrink-0 items-start justify-center bg-structure p-1 ${
          vertical ? "h-9 w-full border-line border-t" : "w-9 border-line border-x"
        }`}
      >
        <button
          type="button"
          onClick={() => fold(undefined)}
          className="inline-flex size-7 items-center justify-center rounded-control text-ink-muted hover:bg-sunken hover:text-ink"
          aria-label={`Show ${paneLabels[which]}`}
          title={`Show ${paneLabels[which]}`}
        >
          <Icon aria-hidden="true" size={16} />
        </button>
      </div>
    );
  };

  const shown = collapsed === "first" ? 0 : collapsed === "second" ? 100 : size;
  const along = vertical ? "flex-col" : "flex-col lg:flex-row";
  const firstSize = vertical
    ? "h-[var(--vx-split)] shrink-0"
    : "lg:w-[var(--vx-split)] lg:shrink-0";
  const bar = vertical
    ? "h-3 w-full cursor-row-resize flex-col"
    : "hidden w-3 shrink-0 cursor-col-resize lg:flex";
  const line = vertical
    ? "h-px w-full bg-line group-hover:h-0.5 group-hover:bg-action group-focus-visible:h-0.5 group-focus-visible:bg-focus"
    : "w-px bg-line group-hover:w-0.5 group-hover:bg-action group-focus-visible:w-0.5 group-focus-visible:bg-focus";

  return (
    <div
      ref={box}
      className={`flex min-h-0 ${along} ${vertical ? "" : "gap-3 lg:gap-0"} ${className}`}
      style={{ "--vx-split": `${size}%` } as React.CSSProperties}
    >
      {collapsed === "first" ? (
        rail("first")
      ) : (
        <div
          className={`flex min-h-0 min-w-0 flex-col ${collapsed === "second" ? "flex-1" : firstSize}`}
        >
          {first}
        </div>
      )}
      {collapsed ? null : (
        // biome-ignore lint/a11y/useSemanticElements: a separator that moves is a widget, not an hr
        <div
          role="separator"
          aria-orientation={vertical ? "horizontal" : "vertical"}
          aria-label={label}
          aria-valuenow={Math.round(shown)}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-keyshortcuts={collapsible ? "Enter" : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            event.preventDefault();
            dragging.current = true;
            document.body.style.setProperty("user-select", "none");
          }}
          onDoubleClick={() => keep(initial)}
          className={`group items-stretch justify-center outline-none ${bar} ${vertical ? "flex" : ""}`}
        >
          <span className={line} />
        </div>
      )}
      {collapsed === "second" ? (
        rail("second")
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{second}</div>
      )}
    </div>
  );
}
