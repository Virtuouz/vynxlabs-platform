import { useEffect, useRef, useState } from "react";
import { openPalette } from "../kit/keys.ts";

export interface CodeEditorProps {
  /** Names the editor for screen readers: "Source of orders/sync". */
  label: string;
  value: string;
  onChange?: (value: string) => void;
  language: "typescript" | "json" | "yaml" | "plaintext" | "sql";
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
   * A place to show: the editor scrolls to it, selects the line and takes focus.
   * A new `at` asks again for the same line.
   */
  reveal?: { line: number; column?: number; at: number } | undefined;
}

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
  reveal,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "plain">("loading");
  const latest = useRef({ value, onChange, revealLine, onRun, onSave, onMarkers, label });
  latest.current = { value, onChange, revealLine, onRun, onSave, onMarkers, label };
  const runs = onRun !== undefined;
  const saves = onSave !== undefined;
  const goTo = useRef<(line: number, column: number) => void>(() => {});
  /** What the editor reported lately, oldest first. */
  const typed = useRef<string[]>([]);
  const editor = useRef<{
    getValue(): string;
    setValue(text: string): void;
    hasTextFocus(): boolean;
    updateOptions(options: object): void;
    dispose(): void;
  }>(null);

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
        goTo.current = (to, column) => {
          const at = Math.min(Math.max(1, to), model.getLineCount());
          created.revealLineInCenter(at);
          created.setSelection(new monaco.Range(at, 1, at, model.getLineMaxColumn(at)));
          created.setPosition({ lineNumber: at, column: Math.max(1, column) });
          created.focus();
        };
        // The language service's diagnostics for this document, each time they change.
        const SEVERITY: Record<number, Marker["severity"]> = {
          [monaco.MarkerSeverity.Error]: "error",
          [monaco.MarkerSeverity.Warning]: "warning",
        };
        const report = () =>
          latest.current.onMarkers?.(
            monaco.editor
              .getModelMarkers({ resource: uri })
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
        const listening = created.onDidChangeModelContent(() => {
          const now = created.getValue();
          // Remembered, so that this text coming back as `value` is known for what it is.
          typed.current.push(now);
          if (typed.current.length > 200) typed.current.shift();
          latest.current.onChange?.(now);
        });
        // The theme follows the system and the person's own choice.
        const media = matchMedia("(prefers-color-scheme: dark)");
        media.addEventListener("change", applyTheme);
        const watching = new MutationObserver(applyTheme);
        watching.observe(document.documentElement, { attributeFilter: ["data-theme"] });
        cleanup = () => {
          marking.dispose();
          goTo.current = () => {};
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
  }, [path, language, readOnly, runs, saves]);

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
  useEffect(() => {
    const current = editor.current;
    if (!current || current.getValue() === value) return;
    if (current.hasTextFocus() && typed.current.includes(value)) return;
    typed.current = [];
    current.setValue(value);
  }, [value]);

  return (
    <div
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
          onChange={(event) => onChange?.(event.currentTarget.value)}
          className="size-full resize-none bg-transparent p-3 font-mono text-code text-ink outline-none"
        />
      )}
      <div ref={host} className={state === "ready" ? "size-full" : "hidden"} />
    </div>
  );
}
