import { Button } from "@vynxlabs/ui";
import { Redo2, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { keysOf, useShortcut } from "../../kit/keys.ts";
import { PageHeader } from "../../kit/PageHeader.tsx";
import { SplitPane } from "../../kit/SplitPane.tsx";
import { useNavigationGuard } from "../../router.tsx";

/** How a change stands: saved, about to be, being saved, or not saved and why. */
export type Saving = "saved" | "waiting" | "saving" | { failed: string };

/** What the save state says, for the toolbar and for a screen reader. */
export function savingWords(saving: Saving, saved: string): string {
  if (saving === "saved") return saved;
  if (saving === "waiting" || saving === "saving") return "Saving…";
  return `Not saved: ${saving.failed}`;
}

/**
 * The one shell around both page editors, an app's and a dashboard's (08
 * §3.20): one toolbar with the name, how it is saved, undo and redo and the
 * step that makes it reach people (Publish for an app, Share for a
 * dashboard); then the page in the middle, what is on it and what can be
 * added on the left, and the chosen widget's settings on the right, in a pane
 * whose width can be dragged.
 *
 * Changes save by themselves. ⌘Z and ⇧⌘Z undo and redo them, outside a field
 * being typed in. Leaving while a change is not yet saved asks first.
 */
export function EditorShell({
  title,
  saving,
  savedWords,
  history,
  primary,
  more,
  after,
  notices,
  outline,
  canvas,
  inspector,
  saveNow,
}: {
  title: string;
  saving: Saving;
  /** What "saved" means here: "Saved. Not published yet." */
  savedWords: string;
  history: {
    undo: () => void;
    redo: () => void;
    undoLabel: string | undefined;
    redoLabel: string | undefined;
  };
  /** The step that makes it reach people. */
  primary: ReactNode;
  /** Anything else the toolbar holds, such as a link to the app or a menu. */
  more?: ReactNode;
  /** Under the toolbar: the field that names it. */
  after?: ReactNode;
  notices?: ReactNode;
  /** Saves at once, rather than a moment after the last change: ⌘S. */
  saveNow?: () => void;
  outline: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
}) {
  useNavigationGuard(saving !== "saved", "A change is not saved yet.");
  const { undo, redo } = history;
  useShortcut("undo", undo);
  useShortcut("redo", redo);
  useShortcut("save", () => saveNow?.(), { enabled: saveNow !== undefined });

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <PageHeader
        compact
        title={title}
        state={
          <span
            role="status"
            className={`text-body-sm ${typeof saving === "object" ? "text-danger" : "text-ink-muted"}`}
          >
            {savingWords(saving, savedWords)}
          </span>
        }
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1">
              <Button
                size="small"
                variant="quiet"
                aria-label={history.undoLabel ? `Undo ${history.undoLabel}` : "Undo"}
                tooltip={history.undoLabel ? `Undo ${history.undoLabel}` : "Nothing to undo"}
                keys={keysOf("undo")}
                disabled={!history.undoLabel}
                onClick={undo}
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
                onClick={redo}
              >
                <Redo2 aria-hidden="true" size={16} />
              </Button>
            </span>
            {more}
            {primary}
          </span>
        }
        after={after}
      />
      {notices}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start">
        <nav
          aria-label="On this page"
          className="flex shrink-0 flex-col gap-3 lg:sticky lg:top-0 lg:max-h-[calc(100vh-8rem)] lg:w-44 lg:overflow-y-auto"
        >
          {outline}
        </nav>
        <SplitPane
          id="page-editor"
          label="Resize the page and its settings"
          initial={74}
          className="min-w-0 flex-1"
          first={
            <div data-canvas className="min-w-0 lg:pr-1">
              {canvas}
            </div>
          }
          second={
            <aside
              aria-label="Settings"
              className="rounded-panel border border-line bg-surface p-3 lg:sticky lg:top-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-auto"
            >
              {inspector}
            </aside>
          }
        />
      </div>
    </section>
  );
}
