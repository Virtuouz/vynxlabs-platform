import { useEffect, useRef, useState } from "react";

export interface CodeEditorProps {
  /** Names the editor for screen readers: "Source of orders/sync". */
  label: string;
  value: string;
  onChange?: (value: string) => void;
  language: "typescript" | "json" | "yaml" | "plaintext";
  /** Identifies the document. Change it to open another one in the same editor. */
  path: string;
  readOnly?: boolean;
  /** A CSS length. */
  height?: string;
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
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "plain">("loading");
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const editor = useRef<{
    getValue(): string;
    setValue(text: string): void;
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
          ariaLabel: label,
          padding: { top: 10, bottom: 10 },
        });
        editor.current = created;
        const listening = created.onDidChangeModelContent(() =>
          latest.current.onChange?.(created.getValue()),
        );
        // The theme follows the system and the person's own choice.
        const media = matchMedia("(prefers-color-scheme: dark)");
        media.addEventListener("change", applyTheme);
        const watching = new MutationObserver(applyTheme);
        watching.observe(document.documentElement, { attributeFilter: ["data-theme"] });
        cleanup = () => {
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
  }, [path, language, label, readOnly]);

  // Text set from outside, such as a draft that was reloaded, replaces what the editor shows.
  useEffect(() => {
    const current = editor.current;
    if (current && current.getValue() !== value) current.setValue(value);
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
          readOnly={readOnly || state === "loading"}
          spellCheck={false}
          onChange={(event) => onChange?.(event.currentTarget.value)}
          className="size-full resize-none bg-transparent p-3 font-mono text-[13px] text-ink outline-none"
        />
      )}
      <div ref={host} className={state === "ready" ? "size-full" : "hidden"} />
    </div>
  );
}
