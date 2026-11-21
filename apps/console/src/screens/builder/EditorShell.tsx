import { Panel, SideSheet, useLast } from "@volvel/ui";
import type { ReactNode } from "react";
import { useShortcut } from "../../kit/keys.ts";
import { useWide, WIDE } from "../../kit/layout.tsx";
import { PageHeader } from "../../kit/PageHeader.tsx";
import { SplitPane } from "../../kit/SplitPane.tsx";
import { UndoRedo } from "../../kit/UndoRedo.tsx";
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
 * The one shell around the one page editor, in an app's builder and in a
 * dashboard (08 §3.20, S9): one toolbar with the name, how it is saved, undo and redo and the
 * step that makes it reach people (Publish for an app, Share for a
 * dashboard); then the page in the middle, what is on it and what can be
 * added on the left, and the chosen widget's settings on the right, in a pane
 * whose width can be dragged.
 *
 * On a screen narrower than the panel needs, the chosen widget's settings
 * are a sheet over the page instead, which opens when a widget is chosen.
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
  inspectorOpen,
  onCloseInspector,
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
  /** The settings of the chosen widget, or what to do to choose one. */
  inspector: ReactNode;
  /** Whether a widget is chosen: on a narrow screen, whether the sheet of its settings is open. */
  inspectorOpen: boolean;
  onCloseInspector: () => void;
}) {
  useNavigationGuard(saving !== "saved", "A change is not saved yet.");
  const docked = useWide(WIDE.panel);
  // The sheet keeps showing what it showed while it closes.
  const lastInspector = useLast(inspectorOpen ? inspector : undefined);
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
            <UndoRedo history={history} />
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
        {docked ? (
          <SplitPane
            id="page-editor"
            label="Resize the page and its settings"
            initial={72}
            className="min-w-0 flex-1"
            first={
              <div data-canvas className="min-w-0 lg:pr-1">
                {canvas}
              </div>
            }
            second={
              <Panel
                as="aside"
                aria-label="Settings"
                className="p-3 lg:sticky lg:top-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-auto"
              >
                {inspector}
              </Panel>
            }
          />
        ) : (
          <div data-canvas className="min-w-0 flex-1">
            {canvas}
          </div>
        )}
      </div>
      {docked ? null : (
        <SideSheet open={inspectorOpen} onClose={onCloseInspector} title="Settings">
          {lastInspector}
        </SideSheet>
      )}
    </section>
  );
}
