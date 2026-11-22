import { Button } from "@volvel/ui";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MarkdownEditor } from "../../kit/markdown/MarkdownEditor.tsx";

interface Place {
  left: number;
  top: number;
  width: number;
}

/** Where the panel goes: over the widget's cell, as wide as the editor needs, kept on the screen. */
function placeOver(cell: Element | null): Place {
  const room = window.innerWidth;
  if (room < 640) return { left: 8, top: 56, width: room - 16 };
  const box = cell?.getBoundingClientRect();
  const width = Math.min(room - 16, Math.max(box?.width ?? 0, 520));
  const left = Math.max(8, Math.min(box?.left ?? 8, room - width - 8));
  const top = Math.max(8, Math.min(box?.top ?? 8, window.innerHeight - 440));
  return { left, top, width };
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
      role="dialog"
      aria-label={`Edit ${title} on the page`}
      style={{ left: place.left, top: place.top, width: place.width }}
      className="layer-popover fixed flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-panel border border-line-strong bg-raised shadow-drag"
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
        height="min(46vh, 22rem)"
        autoFocus
        modes={["source", "split", "preview"]}
        path={`widget/${widget}.md`}
      />
      <div className="flex items-center justify-end gap-2 border-line border-t px-3 py-2">
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
