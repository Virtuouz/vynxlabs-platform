import { Button, Panel, SideSheet, useLast } from "@volvel/ui";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useShortcut } from "../../kit/keys.ts";
import { useWide, WIDE } from "../../kit/layout.tsx";
import { PageHeader } from "../../kit/PageHeader.tsx";
import { SplitPane } from "../../kit/SplitPane.tsx";
import { UndoRedo } from "../../kit/UndoRedo.tsx";
import { usePreference } from "../../prefs.ts";
import { useNavigationGuard } from "../../router.tsx";
import { RenameButton, RenameField } from "./BuilderHeader.tsx";

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
  onRename,
  pill,
  tools,
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
  bleed = false,
}: {
  /** The panes run edge to edge under the toolbar, separated by hairlines, each scrolling on its own (the app builder's workbench). */
  bleed?: boolean;
  title: string;
  /** Renames in place, with a pencil beside the name. Left out where the name is not changed here. */
  onRename?: ((title: string) => void) | undefined;
  /** Beside the name: "3 draft changes". */
  pill?: ReactNode;
  /** In the row's right-hand group, before undo: the screen sizes, who it is viewed as. */
  tools?: ReactNode;
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
  const [renaming, setRenaming] = useState(false);
  // The two side panes fold away, and stay as they were left. The inspector's is the split's own setting.
  const [outlineFolded, foldOutline] = usePreference<boolean>("split:builder-outline", false);
  const [kept, keep] = usePreference<number | { size: number; collapsed?: "first" | "second" }>(
    "split:page-editor",
    70,
  );
  const settingsFolded = typeof kept === "object" && kept?.collapsed === "second";
  const foldSettings = () => {
    const size = typeof kept === "number" ? kept : (kept?.size ?? 70);
    keep(settingsFolded ? size : { size, collapsed: "second" });
  };
  useNavigationGuard(saving !== "saved", "A change is not saved yet.");
  const docked = useWide(WIDE.panel);
  // The sheet keeps showing what it showed while it closes.
  const lastInspector = useLast(inspectorOpen ? inspector : undefined);
  const { undo, redo } = history;
  useShortcut("undo", undo);
  useShortcut("redo", redo);
  useShortcut("save", () => saveNow?.(), { enabled: saveNow !== undefined });

  return (
    <section className={`flex min-h-0 flex-1 flex-col ${bleed ? "" : "gap-3"}`}>
      {/* One row under the breadcrumbs (board 1): the name and what is waiting on the left; the size, who it is seen as, undo, preview and publish on the right. */}
      <PageHeader
        compact
        bar={bleed}
        title={
          renaming && onRename ? (
            <RenameField
              title={title}
              onDone={(next) => {
                setRenaming(false);
                if (next) onRename(next);
              }}
            />
          ) : (
            title
          )
        }
        state={
          <>
            {onRename && !renaming ? <RenameButton onClick={() => setRenaming(true)} /> : null}
            {pill}
            <span
              role="status"
              className={`text-body-sm max-xl:sr-only ${typeof saving === "object" ? "text-danger" : "text-ink-muted"}`}
            >
              {savingWords(saving, savedWords)}
            </span>
          </>
        }
        actions={
          <>
            {tools}
            <UndoRedo history={history} />
            {more}
            {primary}
            {bleed && docked ? (
              <span className="flex items-center gap-0.5">
                <Button
                  variant="quiet"
                  aria-label={outlineFolded ? "Show pages and widgets" : "Hide pages and widgets"}
                  aria-pressed={outlineFolded}
                  tooltip={outlineFolded ? "Show pages and widgets" : "Hide pages and widgets"}
                  onClick={() => foldOutline(!outlineFolded)}
                >
                  {outlineFolded ? (
                    <PanelLeftOpen aria-hidden="true" size={16} />
                  ) : (
                    <PanelLeftClose aria-hidden="true" size={16} />
                  )}
                </Button>
                <Button
                  variant="quiet"
                  aria-label={settingsFolded ? "Show the settings" : "Hide the settings"}
                  aria-pressed={settingsFolded}
                  tooltip={settingsFolded ? "Show the settings" : "Hide the settings"}
                  onClick={foldSettings}
                >
                  {settingsFolded ? (
                    <PanelRightOpen aria-hidden="true" size={16} />
                  ) : (
                    <PanelRightClose aria-hidden="true" size={16} />
                  )}
                </Button>
              </span>
            ) : null}
          </>
        }
        after={after}
      />
      {notices}
      <div
        className={
          bleed
            ? "flex min-h-0 flex-1 flex-col max-lg:overflow-y-auto lg:flex-row"
            : "flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start"
        }
      >
        {bleed && docked && outlineFolded ? (
          <div className="flex w-9 shrink-0 items-start justify-center border-line border-t border-r bg-structure p-1">
            <Button
              variant="quiet"
              aria-label="Show pages and widgets"
              tooltip="Show pages and widgets"
              onClick={() => foldOutline(false)}
            >
              <PanelLeftOpen aria-hidden="true" size={16} />
            </Button>
          </div>
        ) : (
          <nav
            aria-label="On this page"
            className={
              bleed
                ? "flex shrink-0 flex-col gap-4 border-line border-t bg-structure px-2 py-4 max-lg:max-h-[45vh] max-lg:overflow-y-auto lg:w-58 lg:overflow-y-auto lg:border-r"
                : "flex shrink-0 flex-col gap-3 lg:sticky lg:top-0 lg:max-h-[calc(100vh-8rem)] lg:w-60 lg:overflow-y-auto lg:border-r lg:border-line lg:pr-3"
            }
          >
            {outline}
          </nav>
        )}
        {docked ? (
          <SplitPane
            id="page-editor"
            label="Resize the page and its settings"
            // The settings take about 400 px at 1440, as boards 8 to 19 draw them (36%).
            initial={bleed ? 63.7 : 74}
            {...(bleed ? { minSecond: 300 } : {})}
            {...(bleed
              ? {
                  collapsible: "second" as const,
                  paneLabels: { first: "the page", second: "the settings" },
                }
              : {})}
            className="min-w-0 flex-1"
            first={
              <div
                data-canvas
                className={
                  bleed
                    ? "min-h-0 min-w-0 flex-1 overflow-auto border-line border-t p-4 lg:[container-type:size]"
                    : "min-w-0 lg:pr-1"
                }
              >
                {canvas}
              </div>
            }
            second={
              bleed ? (
                <aside
                  aria-label="Settings"
                  className="min-h-0 flex-1 overflow-auto border-line border-t border-l bg-structure p-4"
                >
                  {inspector}
                </aside>
              ) : (
                <Panel
                  as="aside"
                  aria-label="Settings"
                  className="p-3 lg:sticky lg:top-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-auto"
                >
                  {inspector}
                </Panel>
              )
            }
          />
        ) : (
          <div data-canvas className={bleed ? "min-w-0 flex-1 p-4" : "min-w-0 flex-1"}>
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
