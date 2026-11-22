import { Button } from "@volvel/ui";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MarkdownEditor } from "../../kit/markdown/MarkdownEditor.tsx";

interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
  /** A phone's whole screen: a sheet, not a panel at the widget. */
  full: boolean;
}

/** The least height the editor is worked in. */
const LEAST_HEIGHT = 380;

/**
 * Where the panel goes: at the widget's cell, inside the canvas (never over the builder's bar or
 * header), as wide as the editor needs and as tall as the canvas allows; on a phone, the whole screen.
 */
function placeOver(cell: Element | null): Place {
  const room = window.innerWidth;
  if (room < 640) return { left: 0, top: 0, width: room, height: window.innerHeight, full: true };
  const canvas = document.querySelector("[data-canvas]")?.getBoundingClientRect();
  const bounds = canvas ?? new DOMRect(8, 8, room - 16, window.innerHeight - 16);
  const box = cell?.getBoundingClientRect();
  const width = Math.min(bounds.width - 16, Math.max(box?.width ?? 0, 680));
  const left = Math.max(bounds.left + 8, Math.min(box?.left ?? 0, bounds.right - width - 8));
  const available = bounds.height - 16;
  const height = Math.min(available, Math.max(LEAST_HEIGHT, Math.min(560, available)));
  const top = Math.max(
    bounds.top + 8,
    Math.min(box?.top ?? bounds.top, bounds.bottom - height - 8),
  );
  return { left, top, width, height, full: false };
}

/**
 * A Text widget written where it is on the canvas: the documentation's
 * Markdown editor opens over the widget, with the text as readers will see it
 * beside or under the source. Done keeps what was written as one change to
 * undo; Esc, or Cancel, leaves the text as it was.
 */
export function TextOnPage({
  widget,
  title,
  text,
  onDone,
  onCancel,
}: {
  widget: string;
  title: string;
  text: string;
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const [written, setWritten] = useState(text);
  const [place, setPlace] = useState<Place>(() =>
    placeOver(document.querySelector(`[data-widget-cell="${widget}"]`)),
  );
  useLayoutEffect(() => {
    const again = () =>
      setPlace(placeOver(document.querySelector(`[data-widget-cell="${widget}"]`)));
    again();
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, [widget]);

  return createPortal(
    <div
      // overlay-allowed: not modal. It sits over the widget being written, anchored to it, and Esc leaves it.
      role="dialog"
      aria-label={`Edit ${title} on the page`}
      style={{ left: place.left, top: place.top, width: place.width, height: place.height }}
      className={`layer-popover fixed flex flex-col overflow-hidden border-line-strong bg-raised shadow-drag ${place.full ? "" : "rounded-panel border"}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <MarkdownEditor
        profile="page"
        label={`Text of ${title}`}
        value={written}
        onChange={setWritten}
        height={`${place.height - (place.full ? 112 : 52)}px`}
        autoFocus
        modes={["source", "split", "preview"]}
        path={`widget/${widget}.md`}
      />
      <div className="flex shrink-0 items-center justify-end gap-2 border-line border-t px-3 py-2">
        <span className="mr-auto text-meta text-ink-muted">Esc leaves the text as it was.</span>
        <Button size="small" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="small" variant="primary" onClick={() => onDone(written)}>
          Done
        </Button>
      </div>
    </div>,
    document.body,
  );
}
