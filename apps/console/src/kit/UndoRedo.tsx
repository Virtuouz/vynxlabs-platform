import { Button } from "@vynxlabs/ui";
import { Redo2, Undo2 } from "lucide-react";
import { keysOf } from "./keys.ts";

/**
 * The pair of buttons for taking a change back and making it again, wherever
 * something is built by hand: an app, a dashboard. Each says what it would
 * undo or redo, and is off when there is nothing. The keys are the caller's
 * to bind (`useShortcut("undo")`, `useShortcut("redo")`), with `useHistory`.
 */
export function UndoRedo({
  history,
}: {
  history: {
    undo: () => void;
    redo: () => void;
    undoLabel: string | undefined;
    redoLabel: string | undefined;
  };
}) {
  return (
    <span className="flex items-center gap-1">
      <Button
        size="small"
        variant="quiet"
        aria-label={history.undoLabel ? `Undo ${history.undoLabel}` : "Undo"}
        tooltip={history.undoLabel ? `Undo ${history.undoLabel}` : "Nothing to undo"}
        keys={keysOf("undo")}
        disabled={!history.undoLabel}
        onClick={history.undo}
      >
        <Undo2 aria-hidden="true" size={16} />
      </Button>
      <Button
        size="small"
        variant="quiet"
        aria-label={history.redoLabel ? `Redo ${history.redoLabel}` : "Redo"}
        tooltip={history.redoLabel ? `Redo ${history.redoLabel}` : "Nothing to redo"}
        keys={keysOf("redo")}
        disabled={!history.redoLabel}
        onClick={history.redo}
      >
        <Redo2 aria-hidden="true" size={16} />
      </Button>
    </span>
  );
}
