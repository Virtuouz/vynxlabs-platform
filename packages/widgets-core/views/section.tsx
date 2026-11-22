import { ChevronDown } from "@volvel/ui/icons";
import type { WidgetViewProps } from "@volvel/widgets";
import { type ReactNode, useEffect, useId, useState } from "react";

const MOTION_MS = 180;

const still = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A Section: what is placed in it, on its grid, under its heading (the frame draws the title and
 * its line). When it folds, a button at the end of the heading's row folds that away, in a short slide that reduced motion leaves out. The host keeps
 * whether it is folded (for whoever is reading, across a reload) and gives it as `config.folded`.
 */
export function SectionView({
  config,
  place,
  building,
  emit,
  title,
}: WidgetViewProps<{ folds?: boolean; folded?: boolean }>) {
  const folds = config.folds === true;
  const folded = folds && config.folded === true;
  const body = useId();
  // What it holds is kept while it slides shut, and let go after: nothing hidden is read.
  const [present, setPresent] = useState(!folded);
  useEffect(() => {
    if (!folded) {
      setPresent(true);
      return;
    }
    if (still()) {
      setPresent(false);
      return;
    }
    const wait = setTimeout(() => setPresent(false), MOTION_MS + 40);
    return () => clearTimeout(wait);
  }, [folded]);
  return (
    <div className="flex flex-col">
      {folds ? (
        // On the heading's row, at its end: the cell is what it is placed against.
        <button
          type="button"
          aria-expanded={!folded}
          aria-controls={body}
          aria-label={`${folded ? "Unfold" : "Fold"} ${title ?? "this section"}`}
          disabled={building}
          title={building ? "Folds on the page, not here" : undefined}
          onClick={() => emit("fold", { group: { folded: !folded } })}
          className="absolute top-0 right-0 flex h-7 items-center gap-1 rounded-control px-2 text-body-sm text-ink-muted hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50"
        >
          {folded ? "Unfold" : "Fold"}
          <ChevronDown
            aria-hidden="true"
            size={16}
            className={`transition-transform duration-[180ms] motion-reduce:transition-none ${folded ? "-rotate-90" : ""}`}
          />
        </button>
      ) : null}
      <div
        id={body}
        className="grid transition-[grid-template-rows] duration-[180ms] motion-reduce:transition-none"
        style={{ gridTemplateRows: folded ? "0fr" : "1fr" }}
        inert={folded}
      >
        <div className={`min-h-0 ${building ? "" : "overflow-hidden"}`}>
          {present ? ((place?.() as ReactNode) ?? null) : null}
        </div>
      </div>
    </div>
  );
}
