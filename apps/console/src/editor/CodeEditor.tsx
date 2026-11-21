import { type RefObject, useEffect, useRef, useState } from "react";
import { openHelp } from "../help/store.ts";
import { openPalette } from "../kit/keys.ts";

export interface CodeEditorProps {
  /** Names the editor for screen readers: "Source of orders/sync". */
  label: string;
  value: string;
  onChange?: (value: string) => void;
  language: "typescript" | "json" | "yaml" | "plaintext" | "sql" | "markdown";
  /** Identifies the document. Change it to open another one in the same editor. */
  path: string;
  readOnly?: boolean;
  /** A CSS length. */
  height?: string;
  /** A line to scroll to and select when the document opens, such as where something is defined. */
  revealLine?: number | undefined;
  /**
   * Called on ⌘↵ or Ctrl+Enter while the code has focus. Monaco keeps that key
   * for itself otherwise, so a page-level shortcut never sees it.
   */
  onRun?: (() => void) | undefined;
  /** Called on ⌘S or Ctrl+S while the code has focus, in place of the browser saving the page. */
  onSave?: (() => void) | undefined;
  /** Called with the editor's diagnostics each time they change: type errors and the like. */
  onMarkers?: ((markers: Marker[]) => void) | undefined;
  /**
   * Problems found by something other than the editor, to mark on their lines:
   * a page of documentation is checked by the code that will serve it, not by
   * a language service. They are shown beside the editor's own, never in place of them.
   */
  problems?: readonly Marker[] | undefined;
  /** Wraps long lines, for prose. Code is left to scroll. */
  wrap?: boolean | undefined;
  /**
   * A place to show: the editor scrolls to it, selects the line and takes focus.
   * A new `at` asks again for the same line.
   */
  reveal?: { line: number; column?: number; at: number } | undefined;
  /** Filled with a way to work the editor from outside: undo, redo, and text put where the cursor is. */
  handle?: RefObject<CodeEditorHandle | null> | undefined;
  /** Called as the cursor moves, with its line and column, counted from 1. */
  onCursor?: ((at: { line: number; column: number }) => void) | undefined;
  /** Called when what can be undone or redone changes. */
  onHistory?: ((can: { undo: boolean; redo: boolean }) => void) | undefined;
  /** Called when `/` is typed at the start of an empty line: a writer asking what to insert. */
  onSlash?: (() => void) | undefined;
  /**
   * For a page with a top of its own between two lines of `---`: folds it, and
   * says beside it what it holds. The top is still the text's, and opens again.
   */
  frontmatter?: { hint: string } | undefined;
}

/** The editor, worked from outside. Every change it makes is a step that Undo takes back. */
export interface CodeEditorHandle {
  undo(): void;
  redo(): void;
  /** Where the selection starts and ends, as offsets into the text. */
  selection(): { start: number; end: number };
  /**
   * Makes the text this, as one step of the history, changing only what
   * differs, and puts the selection where it is given.
   */
  apply(next: string, select?: { start: number; end: number }): void;
  focus(): void;
}

/** Who the problems given from outside belong to, among the document's markers. */
const GIVEN = "volvel";

/** One diagnostic of the code, as the editor's language service reports it. */
export interface Marker {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
}

/**
 * A code editor. Monaco is fetched the first time one is shown. Until it
 * arrives, and wherever it cannot load, a plain text box holds the same text,
 * so the code is never out of reach.
 */
export function CodeEditor({
  label,
  value,
  onChange,
  language,
  path,
  readOnly = false,
  height = "28rem",
  revealLine,
  onRun,
  onSave,
  onMarkers,
  problems,
  wrap = false,
  reveal,
  handle,
  onCursor,
  onHistory,
  onSlash,
  frontmatter,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "plain">("loading");
  const latest = useRef({
    value,
    onChange,
    revealLine,
    onRun,
    onSave,
    onMarkers,
    label,
    onCursor,
    onHistory,
    onSlash,
    frontmatter,
  });
  latest.current = {
    value,
    onChange,
    revealLine,
    onRun,
    onSave,
    onMarkers,
    label,
    onCursor,
    onHistory,
    onSlash,
    frontmatter,
  };
  /** Sets the hint beside a folded top. Set once the editor is there. */
  const hintTop = useRef<() => void>(() => {});
  /** The text box's own history, while Monaco is not there: what it held before each change. */
  const past = useRef<string[]>([]);
  const ahead = useRef<string[]>([]);
  const wanted = useRef<{ start: number; end: number }>(undefined);
  const runs = onRun !== undefined;
  const saves = onSave !== undefined;
  const goTo = useRef<(line: number, column: number) => void>(() => {});
  /** What the editor reported lately, oldest first. */
  const typed = useRef<string[]>([]);
  /** Marks problems given from outside on the document. Set once the editor is there. */
  const mark = useRef<(problems: readonly Marker[]) => void>(() => {});
  const editor = useRef<{
    getValue(): string;
    setValue(text: string): void;
    hasTextFocus(): boolean;
    updateOptions(options: object): void;
    dispose(): void;
  }>(null);
  /** Replaces the text with what is given, as an undoable step. Set once the editor is there. */
  const replace = useRef<(next: string, select?: { start: number; end: number }) => void>(() => {});

  useEffect(() => {
    let gone = false;
    let cleanup = () => {};
    import("./monaco.ts").then(
      ({ monaco, applyTheme }) => {
        if (gone || !host.current) return;
        applyTheme();
        const uri = monaco.Uri.parse(`file:///${path}`);
        const model =
          monaco.editor.getModel(uri) ??
          monaco.editor.createModel(latest.current.value, language, uri);
        if (model.getValue() !== latest.current.value) model.setValue(latest.current.value);
        const created = monaco.editor.create(host.current, {
          model,
          readOnly,
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: wrap ? "on" : "off",
          ariaLabel: latest.current.label,
          padding: { top: 10, bottom: 10 },
        });
        editor.current = created;
        const line = latest.current.revealLine;
        if (line && line <= model.getLineCount()) {
          created.revealLineInCenter(line);
          created.setSelection(new monaco.Range(line, 1, line, model.getLineMaxColumn(line)));
        }
        if (runs) {
          created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
            latest.current.onRun?.(),
          );
        }
        if (saves) {
          created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
            latest.current.onSave?.(),
          );
        }
        // The editor keeps ⌘K for its own chords; the console's palette is worth more here.
        created.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, openPalette);
        // F1 is the editor's own list of commands. Here it is help, as everywhere else in the console.
        created.addCommand(monaco.KeyCode.F1, () => openHelp());
        goTo.current = (to, column) => {
          const at = Math.min(Math.max(1, to), model.getLineCount());
          created.revealLineInCenter(at);
          created.setSelection(new monaco.Range(at, 1, at, model.getLineMaxColumn(at)));
          created.setPosition({ lineNumber: at, column: Math.max(1, column) });
          created.focus();
        };
        const history = () =>
          latest.current.onHistory?.({ undo: model.canUndo(), redo: model.canRedo() });
        const select = (at: { start: number; end: number }) => {
          const start = model.getPositionAt(at.start);
          const end = model.getPositionAt(at.end);
          created.setSelection(
            new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          );
          created.revealPositionInCenterIfOutsideViewport(end);
        };
        replace.current = (next, at) => {
          const now = model.getValue();
          if (now === next) {
            if (at) select(at);
            return;
          }
          // Only what differs is replaced, so that marks and folds elsewhere stay where they are.
          let head = 0;
          while (head < now.length && head < next.length && now[head] === next[head]) head++;
          let tail = 0;
          while (
            tail < now.length - head &&
            tail < next.length - head &&
            now[now.length - 1 - tail] === next[next.length - 1 - tail]
          )
            tail++;
          const from = model.getPositionAt(head);
          const to = model.getPositionAt(now.length - tail);
          model.pushStackElement();
          model.pushEditOperations(
            created.getSelections(),
            [
              {
                range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column),
                text: next.slice(head, next.length - tail),
              },
            ],
            () => null,
          );
          model.pushStackElement();
          if (at) select(at);
        };
        if (handle) {
          handle.current = {
            undo: () => {
              created.trigger("toolbar", "undo", null);
              created.focus();
            },
            redo: () => {
              created.trigger("toolbar", "redo", null);
              created.focus();
            },
            selection: () => {
              const at = created.getSelection();
              if (!at) return { start: 0, end: 0 };
              return {
                start: model.getOffsetAt(at.getStartPosition()),
                end: model.getOffsetAt(at.getEndPosition()),
              };
            },
            apply: (next, at) => {
              replace.current(next, at);
              created.focus();
            },
            focus: () => created.focus(),
          };
        }
        const cursor = created.onDidChangeCursorPosition((moved) =>
          latest.current.onCursor?.({
            line: moved.position.lineNumber,
            column: moved.position.column,
          }),
        );
        // The top of a page folds, and says what it holds.
        const tops = monaco.languages.registerFoldingRangeProvider("markdown", {
          provideFoldingRanges: (folded) => {
            if (folded !== model || folded.getLineContent(1).trim() !== "---") return [];
            for (let line = 2; line <= folded.getLineCount(); line++) {
              if (folded.getLineContent(line).trim() === "---") return [{ start: 1, end: line }];
            }
            return [];
          },
        });
        const hint = created.createDecorationsCollection();
        hintTop.current = () => {
          const said = latest.current.frontmatter?.hint;
          hint.set(
            said && model.getLineContent(1).trim() === "---"
              ? [
                  {
                    range: new monaco.Range(1, 1, 1, 1),
                    options: {
                      after: { content: `  ${said}`, inlineClassName: "vx-editor-hint" },
                    },
                  },
                ]
              : [],
          );
        };
        hintTop.current();
        if (latest.current.frontmatter) {
          // Folded once the folding model has read the page.
          setTimeout(() => {
            if (!gone) created.trigger("open", "editor.fold", { selectionLines: [0] });
          }, 50);
        }
        history();
        // The language service's diagnostics for this document, each time they change.
        const SEVERITY: Record<number, Marker["severity"]> = {
          [monaco.MarkerSeverity.Error]: "error",
          [monaco.MarkerSeverity.Warning]: "warning",
        };
        mark.current = (given) =>
          monaco.editor.setModelMarkers(
            model,
            GIVEN,
            given.map((one) => {
              const line = Math.min(Math.max(1, one.line), model.getLineCount());
              return {
                startLineNumber: line,
                startColumn: Math.max(1, one.column),
                endLineNumber: line,
                // To the end of the line: where on it the problem ends is not known.
                endColumn: model.getLineMaxColumn(line),
                message: one.message,
                severity:
                  one.severity === "error"
                    ? monaco.MarkerSeverity.Error
                    : one.severity === "warning"
                      ? monaco.MarkerSeverity.Warning
                      : monaco.MarkerSeverity.Info,
              };
            }),
          );
        const report = () =>
          latest.current.onMarkers?.(
            monaco.editor
              .getModelMarkers({ resource: uri })
              // What was given from outside is the caller's already.
              .filter((marker) => marker.owner !== GIVEN)
              .filter((marker) => marker.severity >= monaco.MarkerSeverity.Warning)
              .map((marker) => ({
                line: marker.startLineNumber,
                column: marker.startColumn,
                message: marker.message,
                severity: SEVERITY[marker.severity] ?? "info",
              })),
          );
        const marking = monaco.editor.onDidChangeMarkers((changed) => {
          if (changed.some((one) => one.toString() === uri.toString())) report();
        });
        report();
        const listening = created.onDidChangeModelContent((changed) => {
          // A slash typed on a line that holds nothing else asks what to insert. It is taken out.
          const only = changed.changes.length === 1 ? changed.changes[0] : undefined;
          if (only?.text === "/" && latest.current.onSlash && !changed.isUndoing) {
            const line = only.range.startLineNumber;
            if (model.getLineContent(line).trim() === "/") {
              setTimeout(() => {
                if (model.getLineContent(line).trim() !== "/") return;
                const column = model.getLineContent(line).indexOf("/") + 1;
                model.pushEditOperations(
                  created.getSelections(),
                  [{ range: new monaco.Range(line, column, line, column + 1), text: "" }],
                  () => null,
                );
                latest.current.onSlash?.();
              }, 0);
            }
          }
          const now = created.getValue();
          // Remembered, so that this text coming back as `value` is known for what it is.
          typed.current.push(now);
          if (typed.current.length > 200) typed.current.shift();
          latest.current.onChange?.(now);
          history();
        });
        // The theme follows the system and the person's own choice.
        const media = matchMedia("(prefers-color-scheme: dark)");
        media.addEventListener("change", applyTheme);
        const watching = new MutationObserver(applyTheme);
        watching.observe(document.documentElement, { attributeFilter: ["data-theme"] });
        cleanup = () => {
          cursor.dispose();
          tops.dispose();
          hint.clear();
          hintTop.current = () => {};
          replace.current = () => {};
          if (handle) handle.current = null;
          marking.dispose();
          goTo.current = () => {};
          mark.current = () => {};
          listening.dispose();
          media.removeEventListener("change", applyTheme);
          watching.disconnect();
          created.dispose();
          model.dispose();
          editor.current = null;
        };
        setState("ready");
      },
      () => {
        if (!gone) setState("plain");
      },
    );
    return () => {
      gone = true;
      cleanup();
    };
    // The label is not here: it changes as a path is typed, and a new editor would lose the undo history.
  }, [path, language, readOnly, runs, saves, wrap, handle]);

  // Problems given from outside are marked once the editor is there, and each time they change.
  useEffect(() => {
    if (state === "ready") mark.current(problems ?? []);
  }, [problems, state]);

  // A place asked for is shown, in Monaco or, where it is not loaded, in the text box.
  useEffect(() => {
    if (!reveal) return;
    if (state === "ready") {
      goTo.current(reveal.line, reveal.column ?? 1);
      return;
    }
    const box = host.current?.parentElement?.querySelector("textarea");
    if (!box) return;
    const lines = box.value.split("\n");
    const start =
      lines.slice(0, Math.max(0, reveal.line - 1)).join("\n").length + (reveal.line > 1 ? 1 : 0);
    box.focus();
    box.setSelectionRange(start, start + (lines[reveal.line - 1]?.length ?? 0));
  }, [reveal, state]);

  useEffect(() => {
    editor.current?.updateOptions({ ariaLabel: label });
  }, [label]);

  // Text set from outside, such as a draft that was reloaded, replaces what the editor shows.
  // Text the editor itself reported is not from outside, even when it arrives late: someone
  // typing faster than the page draws has already typed past it, and putting it back would
  // lose what they typed since and send the cursor to the start.
  // It is a step of the history, so that Undo takes back a change made from outside, such as
  // one made by a form beside the editor.
  useEffect(() => {
    const current = editor.current;
    if (!current || current.getValue() === value) return;
    if (current.hasTextFocus() && typed.current.includes(value)) return;
    typed.current = [];
    replace.current(value);
  }, [value]);

  const said = frontmatter?.hint;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the hint is read from `latest` when it changes.
  useEffect(() => {
    if (state === "ready") hintTop.current();
  }, [said, state]);

  // The text box works from outside too, with a history of its own.
  useEffect(() => {
    if (!handle || state === "ready") return;
    const box = () => host.current?.parentElement?.querySelector("textarea") ?? null;
    const change = (next: string) => {
      past.current.push(latest.current.value);
      ahead.current = [];
      latest.current.onChange?.(next);
      latest.current.onHistory?.({ undo: true, redo: false });
    };
    handle.current = {
      undo: () => {
        const before = past.current.pop();
        if (before === undefined) return;
        ahead.current.push(latest.current.value);
        latest.current.onChange?.(before);
        latest.current.onHistory?.({ undo: past.current.length > 0, redo: true });
      },
      redo: () => {
        const after = ahead.current.pop();
        if (after === undefined) return;
        past.current.push(latest.current.value);
        latest.current.onChange?.(after);
        latest.current.onHistory?.({ undo: true, redo: ahead.current.length > 0 });
      },
      selection: () => {
        const found = box();
        return found
          ? { start: found.selectionStart, end: found.selectionEnd }
          : { start: 0, end: 0 };
      },
      apply: (next, at) => {
        if (next !== latest.current.value) change(next);
        wanted.current = at;
      },
      focus: () => box()?.focus(),
    };
  }, [handle, state]);

  // A selection asked for in the text box is set once its text is there.
  useEffect(() => {
    const at = wanted.current;
    if (!at || state === "ready") return;
    wanted.current = undefined;
    const found = host.current?.parentElement?.querySelector("textarea");
    found?.focus();
    found?.setSelectionRange(at.start, at.end);
  });

  return (
    // A recessed well (07 §7.5), as code is.
    <div
      data-well
      className="overflow-hidden rounded-control border border-line bg-sunken"
      style={{ height }}
    >
      {state === "ready" ? null : (
        <textarea
          aria-label={label}
          value={value}
          onKeyDown={(event) => {
            if (!(event.metaKey || event.ctrlKey)) return;
            if (event.key === "s" && onSave) {
              event.preventDefault();
              onSave();
            } else if (event.key === "Enter" && onRun) {
              event.preventDefault();
              onRun();
            }
          }}
          readOnly={readOnly || state === "loading"}
          spellCheck={false}
          onChange={(event) => {
            past.current.push(value);
            ahead.current = [];
            onHistory?.({ undo: true, redo: false });
            onChange?.(event.currentTarget.value);
          }}
          onSelect={(event) => {
            const box = event.currentTarget;
            const before = box.value.slice(0, box.selectionStart).split("\n");
            onCursor?.({ line: before.length, column: (before.at(-1)?.length ?? 0) + 1 });
          }}
          className="size-full resize-none bg-transparent p-3 font-mono text-code text-ink outline-none"
        />
      )}
      <div ref={host} className={state === "ready" ? "size-full" : "hidden"} />
    </div>
  );
}
