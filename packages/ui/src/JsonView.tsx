import { type ReactNode, useState } from "react";

const TONES = {
  key: "text-action",
  string: "text-success",
  number: "text-attention",
  literal: "text-ink-muted",
};

/** Splits pretty-printed JSON into colored pieces. Text that is not JSON is left as it is. */
function paint(text: string): ReactNode[] {
  const pieces: ReactNode[] = [];
  const token =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(token)) {
    const at = match.index ?? 0;
    if (at > last) pieces.push(text.slice(last, at));
    const [whole, quoted, colon, literal] = match;
    const tone = quoted
      ? colon
        ? TONES.key
        : TONES.string
      : literal
        ? TONES.literal
        : TONES.number;
    pieces.push(
      <span key={index++} className={tone}>
        {quoted ?? whole}
      </span>,
    );
    if (colon) pieces.push(colon);
    last = at + whole.length;
  }
  if (last < text.length) pieces.push(text.slice(last));
  return pieces;
}

export interface JsonViewProps {
  /** Any value that JSON can hold. `undefined` shows as a dash. */
  value: unknown;
  /** Names the block for screen readers: "Input". */
  label: string;
  tone?: "plain" | "danger";
  /** The tallest the block grows before it scrolls, as a CSS length. */
  maxHeight?: string;
}

/** A value shown as indented, colored JSON, with a button to copy it. */
export function JsonView({ value, label, tone = "plain", maxHeight = "18rem" }: JsonViewProps) {
  const [copied, setCopied] = useState(false);
  const text = value === undefined ? "" : JSON.stringify(value, null, 2);
  return (
    <div
      className={`group relative rounded-control border ${
        tone === "danger" ? "border-danger/40 bg-danger-soft" : "border-line bg-sunken"
      }`}
    >
      {text ? (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 rounded-[4px] border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink-muted opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // No clipboard here: the text can still be selected.
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
      <section
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a block that scrolls must be reachable by keyboard
        tabIndex={0}
        style={{ maxHeight }}
        className="overflow-auto"
      >
        <pre className="m-0 p-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap">
          {text ? paint(text) : <span className="text-ink-muted">—</span>}
        </pre>
      </section>
    </div>
  );
}
