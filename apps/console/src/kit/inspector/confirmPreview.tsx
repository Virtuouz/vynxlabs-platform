/**
 * "What people will see · Step 1" (board 4): while the Ask-to-confirm step is open in the drawer,
 * the confirmation is drawn over the canvas beside the widget, as it will appear: its title and
 * text with the sample record's values written in, and Cancel and the confirming button.
 *
 * `ConfirmPreview` renders into the body, anchored to the widget's cell on the canvas
 * (`[data-widget-cell="<id>"]`, which `packages/screens` draws), so the builder places nothing.
 * It draws nothing where there is no such cell. The sample record comes from
 * `SampleRecordProvider`, which the builder may wrap the inspector in; without it, a field is
 * drawn by its name.
 */
import { confirmWords } from "@volvel/screens";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fillTokens } from "./timelineModel.ts";

const SampleRecord = createContext<Readonly<Record<string, unknown>> | undefined>(undefined);

/** The record the builder shows on the canvas (the page's sample record), for the preview's words. */
export function SampleRecordProvider({
  record,
  children,
}: {
  record: Readonly<Record<string, unknown>> | undefined;
  children: ReactNode;
}) {
  return <SampleRecord.Provider value={record}>{children}</SampleRecord.Provider>;
}

export interface PreviewConfirm {
  title: string;
  text?: string | undefined;
  button?: string | undefined;
}

const WIDTH = 330;

/**
 * Where the popover goes, over the canvas and never over the settings: left of the widget if
 * there is room in the canvas, else right, else under it.
 */
function place(anchor: DOMRect) {
  const at = placeAt(anchor);
  // Never below the window: the card is about 210 px tall.
  return { left: at.left, top: Math.max(8, Math.min(at.top, window.innerHeight - 230)) };
}

function placeAt(anchor: DOMRect) {
  const canvas = document.querySelector("[data-canvas]")?.getBoundingClientRect();
  const from = Math.max(canvas?.left ?? 0, 0) + 8;
  const to = Math.min(canvas?.right ?? window.innerWidth, window.innerWidth) - 8;
  if (anchor.left - WIDTH - 12 >= from) {
    return { left: anchor.left - WIDTH - 12, top: Math.max(8, anchor.top) };
  }
  if (anchor.right + 12 + WIDTH <= to) {
    return { left: anchor.right + 12, top: Math.max(8, anchor.top) };
  }
  const left = Math.max(from, Math.min(anchor.left, to - WIDTH));
  const top = Math.min(anchor.bottom + 12, Math.max(8, window.innerHeight - 200));
  return { left, top };
}

export function ConfirmPreview({
  widgetId,
  confirm,
  step = 1,
  record,
  label,
  table,
}: {
  /** The widget whose cell the preview sits beside. */
  widgetId: string;
  confirm: PreviewConfirm;
  step?: number;
  record?: Readonly<Record<string, unknown>> | undefined;
  /** What the action's button says, and the table of its record: the words made when none are written. */
  label?: string | undefined;
  table?: string | undefined;
}) {
  const sample = useContext(SampleRecord);
  const [at, setAt] = useState<{ left: number; top: number } | undefined>(undefined);

  useEffect(() => {
    const measure = () => {
      const cell = Array.from(document.querySelectorAll("[data-widget-cell]")).find(
        (one) => one.getAttribute("data-widget-cell") === widgetId,
      );
      if (!cell || window.innerWidth < 640) return setAt(undefined);
      setAt(place(cell.getBoundingClientRect()));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [widgetId]);

  if (!at) return null;
  const values = record ?? sample;
  // The words the served app draws (`confirmWords`), with the sample record's values.
  const words = confirmWords({ label, confirm, table, row: values });
  return createPortal(
    <aside
      aria-label={`What people will see, step ${step}`}
      style={{ left: at.left, top: at.top, width: WIDTH }}
      className="layer-popover pointer-events-none fixed rounded-panel border border-line bg-raised p-4 text-ink shadow-overlay"
    >
      <p className="m-0 text-label font-semibold tracking-wide text-ink-muted uppercase">
        What people will see · Step {step}
      </p>
      <p className="m-0 mt-2 text-body font-semibold">{fillTokens(words.title, values)}</p>
      {words.text ? (
        <p className="m-0 mt-2 text-body-sm text-ink-muted">{fillTokens(words.text, values)}</p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <span className="inline-flex h-8 items-center rounded-control border border-line-control px-3 text-body-sm">
          {words.dismiss}
        </span>
        <span className="inline-flex h-8 items-center rounded-control bg-action px-3 text-body-sm font-medium text-action-ink">
          {words.button}
        </span>
      </div>
      <p className="m-0 mt-3 text-meta text-ink-muted">
        Written from the steps. Edit the wording in step {step}.
      </p>
    </aside>,
    document.body,
  );
}
