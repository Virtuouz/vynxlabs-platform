import { useEffect, useMemo, useRef, useState } from "react";

export interface LogLine {
  /** Orders the lines and identifies each one. */
  seq: number;
  /** When it was written, as an ISO date and time. */
  time: string;
  level: string;
  message: string;
  fields?: Record<string, unknown>;
}

export interface LogViewerProps {
  lines: readonly LogLine[];
  /** Whether more lines may still arrive. The view then keeps to the newest line. */
  live?: boolean;
  /** What to say when there are no lines at all. */
  empty?: string;
  /** The file name offered when the log is downloaded. */
  fileName?: string;
  /** The tallest the list grows before it scrolls, as a CSS length. */
  maxHeight?: string;
}

const LEVEL: Record<string, string> = {
  error: "text-danger",
  warn: "text-attention",
  debug: "text-ink-muted",
};
const RANK: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const clock = (iso: string) => {
  const date = new Date(iso);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};
const fieldsText = (line: LogLine) =>
  line.fields && Object.keys(line.fields).length > 0 ? JSON.stringify(line.fields) : "";

/** Log lines with a search box, a lowest level to show, wrapping, and a download. */
export function LogViewer({
  lines,
  live = false,
  empty = "Nothing was logged.",
  fileName = "log.txt",
  maxHeight = "28rem",
}: LogViewerProps) {
  const [query, setQuery] = useState("");
  const [least, setLeast] = useState("debug");
  const [wrap, setWrap] = useState(true);
  const [follow, setFollow] = useState(true);
  const list = useRef<HTMLOListElement>(null);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      lines.filter(
        (line) =>
          (RANK[line.level] ?? 1) >= (RANK[least] ?? 0) &&
          (needle === "" ||
            line.message.toLowerCase().includes(needle) ||
            fieldsText(line).toLowerCase().includes(needle)),
      ),
    [lines, least, needle],
  );

  const count = shown.length;
  useEffect(() => {
    const element = list.current;
    if (live && follow && element && count > 0) element.scrollTop = element.scrollHeight;
  }, [live, follow, count]);

  const download = () => {
    const text = lines
      .map((line) =>
        `${line.time} ${line.level.padEnd(5)} ${line.message} ${fieldsText(line)}`.trimEnd(),
      )
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain" }));
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const control = "h-7 rounded-control border border-line bg-surface px-2 text-[13px]";
  const toggle = (on: boolean) =>
    `${control} ${on ? "border-action bg-action-soft text-action" : "text-ink-muted hover:text-ink"}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search the log"
          placeholder="Search the log"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          className={`${control} min-w-40 flex-1`}
        />
        <select
          aria-label="Lowest level to show"
          value={least}
          onChange={(event) => setLeast(event.currentTarget.value)}
          className={control}
        >
          <option value="debug">All levels</option>
          <option value="info">Info and above</option>
          <option value="warn">Warnings and errors</option>
          <option value="error">Errors only</option>
        </select>
        <button
          type="button"
          aria-pressed={wrap}
          className={toggle(wrap)}
          onClick={() => setWrap(!wrap)}
        >
          Wrap
        </button>
        {live ? (
          <button
            type="button"
            aria-pressed={follow}
            className={toggle(follow)}
            onClick={() => setFollow(!follow)}
          >
            Follow
          </button>
        ) : null}
        <button
          type="button"
          className={`${control} text-ink-muted hover:text-ink disabled:opacity-50`}
          disabled={lines.length === 0}
          onClick={download}
        >
          Download
        </button>
        <span className="text-[12px] text-ink-muted" aria-live="polite">
          {shown.length === lines.length
            ? `${lines.length} ${lines.length === 1 ? "line" : "lines"}`
            : `${shown.length} of ${lines.length} lines`}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="m-0 rounded-control border border-line bg-sunken p-3 text-ink-muted">
          {lines.length === 0 ? empty : "No line matches."}
        </p>
      ) : (
        <ol
          ref={list}
          aria-label="Log"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a list that scrolls must be reachable by keyboard
          tabIndex={0}
          style={{ maxHeight }}
          className="m-0 list-none overflow-auto rounded-control border border-line bg-sunken p-3 font-mono text-[12.5px] leading-relaxed"
        >
          {shown.map((line) => (
            <li
              key={line.seq}
              className={`flex gap-3 ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"} ${LEVEL[line.level] ?? ""}`}
            >
              <span className="shrink-0 text-ink-muted">{clock(line.time)}</span>
              <span className="w-10 shrink-0 uppercase">{line.level}</span>
              <span className="min-w-0">
                {line.message}
                {fieldsText(line) ? (
                  <span className="text-ink-muted"> {fieldsText(line)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
