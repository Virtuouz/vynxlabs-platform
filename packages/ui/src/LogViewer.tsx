import { observeElementRect, useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface LogLine {
  /** Orders the lines and identifies each one. */
  seq: number;
  /** When it was written, as an ISO date and time. */
  time: string;
  level: string;
  message: string;
  fields?: Record<string, unknown>;
  /** The attempt that wrote it, for a run that was tried more than once. */
  attempt?: number;
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
  /** Fills the height of a flex container instead, for a viewer that is the page's main content. */
  fill?: boolean;
  /**
   * The number of the first line given, for a log whose earlier lines were left
   * out. Line numbers, and `#L42` links, then count from the start of the whole log.
   */
  firstLine?: number;
  /**
   * Replaces the download of the lines given, for a log that has more lines
   * than it was given, such as one whose oldest lines were left out.
   */
  onDownload?: (() => void) | undefined;
}

const LEVEL: Record<string, string> = {
  error: "text-danger",
  warn: "text-attention",
  debug: "text-ink-muted",
};
const LEVELS = ["error", "warn", "info", "debug"] as const;
const LEVEL_NAME: Record<string, string> = {
  error: "Errors",
  warn: "Warnings",
  info: "Info",
  debug: "Debug",
};
/** Below this many rows every line is drawn, so the browser's own find still works. */
const VIRTUAL_AFTER = 500;

const clock = (iso: string) => {
  const date = new Date(iso);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};
const fieldsText = (line: LogLine) =>
  line.fields && Object.keys(line.fields).length > 0 ? JSON.stringify(line.fields) : "";
const levelOf = (line: LogLine) => (LEVELS.includes(line.level as never) ? line.level : "info");
const lineText = (line: LogLine) =>
  `${line.time} ${line.level.padEnd(5)} ${line.message} ${fieldsText(line)}`.trimEnd();

/** Log lines as a text file has them: one per line, time, level, message and fields. */
export function logText(lines: readonly LogLine[]): string {
  return `${lines.map(lineText).join("\n")}\n`;
}

/** Offers text to the person as a file to save. */
export function saveText(text: string, fileName: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The line a `#L42` address points at, if any. */
function linkedLine(): number | undefined {
  if (typeof location !== "object") return undefined;
  const found = /^#L(\d+)$/.exec(location.hash);
  return found ? Number(found[1]) : undefined;
}

/** The text with each match of `needle` marked; the current match marked more strongly. */
function marked(text: string, needle: string, current: boolean): ReactNode {
  if (!needle) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark
        key={at}
        className={`rounded-inner text-ink ${current ? "bg-attention" : "bg-attention-soft"}`}
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

type Row =
  | { kind: "line"; line: LogLine; number: number }
  | { kind: "attempt"; attempt: number; key: string };

/**
 * A run's log: search that finds and steps through matches, levels to show,
 * line numbers that can be linked to, copy, structured fields that open in
 * place, a mark where each attempt begins, and following new lines until the
 * reader scrolls up. Long logs draw only the lines in view.
 */
export function LogViewer({
  lines,
  live = false,
  empty = "Nothing was logged.",
  fileName = "log.txt",
  maxHeight = "min(70vh, 48rem)",
  fill = false,
  firstLine = 1,
  onDownload,
}: LogViewerProps) {
  const [query, setQuery] = useState("");
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [wrap, setWrap] = useState(true);
  const [follow, setFollow] = useState(true);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [current, setCurrent] = useState(0);
  const [marked_, setMarked] = useState<number | undefined>(() => linkedLine());
  const [said, setSaid] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const needle = query.trim().toLowerCase();
  const counts = useMemo(() => {
    const by: Record<string, number> = { error: 0, warn: 0, info: 0, debug: 0 };
    for (const line of lines) by[levelOf(line)] = (by[levelOf(line)] ?? 0) + 1;
    return by;
  }, [lines]);
  const matches = useCallback(
    (line: LogLine) =>
      needle !== "" &&
      (line.message.toLowerCase().includes(needle) ||
        fieldsText(line).toLowerCase().includes(needle)),
    [needle],
  );

  const shown = useMemo(
    () =>
      lines
        .map((line, index) => ({ line, number: firstLine + index }))
        .filter(
          ({ line }) =>
            !hidden.has(levelOf(line)) && (!onlyMatching || needle === "" || matches(line)),
        ),
    [lines, hidden, onlyMatching, needle, firstLine, matches],
  );
  const rows = useMemo(() => {
    const out: Row[] = [];
    let attempt: number | undefined;
    for (const { line, number } of shown) {
      if (line.attempt !== undefined && attempt !== undefined && line.attempt !== attempt) {
        out.push({ kind: "attempt", attempt: line.attempt, key: `attempt-${number}` });
      }
      if (line.attempt !== undefined) attempt = line.attempt;
      out.push({ kind: "line", line, number });
    }
    return out;
  }, [shown]);
  /** Rows that match the search, by their place in `rows`. */
  const found = useMemo(
    () =>
      needle === ""
        ? []
        : rows.flatMap((row, index) => (row.kind === "line" && matches(row.line) ? [index] : [])),
    [rows, needle, matches],
  );
  // A new search starts again at its first match.
  const [searched, setSearched] = useState(needle);
  if (searched !== needle) {
    setSearched(needle);
    setCurrent(0);
  }

  const virtual = rows.length > VIRTUAL_AFTER;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => list.current,
    estimateSize: () => 22,
    // A row that measures nothing, as where nothing is laid out, keeps its estimated height.
    measureElement: (element) => element.getBoundingClientRect().height || 22,
    // Draws a first screenful before the list has been measured, or where it measures nothing.
    initialRect: { width: 800, height: 600 },
    observeElementRect: (instance, report) =>
      observeElementRect(instance, (rect) =>
        report(rect.height > 0 ? rect : { width: rect.width || 800, height: 600 }),
      ),
    overscan: 20,
  });

  const scrollTo = useCallback(
    (index: number) => {
      if (virtual) {
        // Rows are measured as they are drawn: a second go lands where the first aimed.
        virtualizer.scrollToIndex(index, { align: "center" });
        requestAnimationFrame(() => virtualizer.scrollToIndex(index, { align: "center" }));
      } else
        list.current?.querySelector(`[data-row="${index}"]`)?.scrollIntoView?.({ block: "center" });
    },
    [virtual, virtualizer],
  );
  // A new search shows its first match.
  const shownFor = useRef("");
  useEffect(() => {
    if (needle === shownFor.current) return;
    shownFor.current = needle;
    const first = found[0];
    if (first === undefined) return;
    setFollow(false);
    scrollTo(first);
  }, [needle, found, scrollTo]);
  const step = (by: 1 | -1) => {
    if (found.length === 0) return;
    const next = (current + by + found.length) % found.length;
    setCurrent(next);
    setFollow(false);
    scrollTo(found[next] as number);
  };

  // A `#L42` address opens with that line in view and marked.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || marked_ === undefined || rows.length === 0) return;
    const index = rows.findIndex((row) => row.kind === "line" && row.number === marked_);
    if (index === -1) return;
    opened.current = true;
    setFollow(false);
    requestAnimationFrame(() => scrollTo(index));
  }, [rows, marked_, scrollTo]);

  // Following keeps the newest line in view while lines arrive, and through the last
  // ones, which may come just after the log stops being live.
  const count = rows.length;
  const followed = useRef(false);
  if (live) followed.current = follow;
  useEffect(() => {
    const element = list.current;
    if (!(live ? follow : followed.current) || !element || count === 0) return;
    if (virtual) virtualizer.scrollToIndex(count - 1, { align: "end" });
    // And to the very bottom once the rows there are measured.
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });
  }, [live, follow, count, virtual, virtualizer]);
  // Scrolling up to read stops following; reaching the end again picks it up.
  const onScroll = () => {
    const element = list.current;
    if (!element) return;
    const atEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
    if (!live) {
      // A finished log that followed to its end stops following once read upward.
      if (!atEnd) followed.current = false;
      return;
    }
    if (!atEnd && follow) setFollow(false);
    if (atEnd && !follow) setFollow(true);
  };

  const download = onDownload ?? (() => saveText(logText(lines), fileName));
  const copyShown = async () => {
    const selection = typeof getSelection === "function" ? getSelection() : null;
    const picked =
      selection && !selection.isCollapsed && root.current?.contains(selection.anchorNode)
        ? selection.toString()
        : "";
    const ok = await copy(picked || logText(shown.map((one) => one.line)));
    setSaid(
      ok
        ? picked
          ? "Selection copied."
          : `${shown.length} ${shown.length === 1 ? "line" : "lines"} copied.`
        : "The clipboard could not be reached.",
    );
  };
  const linkTo = (number: number) => {
    history.replaceState(history.state, "", `${location.pathname}${location.search}#L${number}`);
    setMarked(number);
    void copy(`${location.origin}${location.pathname}${location.search}#L${number}`).then((ok) =>
      setSaid(ok ? `A link to line ${number} was copied.` : `Line ${number} is in the address.`),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // ⌘F or Ctrl+F inside the log finds in the log: long logs draw only the lines in view,
    // where the browser's own find cannot reach.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      search.current?.focus();
      search.current?.select();
    }
  };

  const control = "h-7 rounded-control border border-line-control bg-surface px-2 text-body-sm";
  const toggle = (on: boolean) =>
    `${control} ${on ? "border-action bg-action-soft text-action" : "text-ink-muted hover:text-ink"}`;

  const drawRow = (row: Row, index: number) => {
    if (row.kind === "attempt") {
      return (
        <div className="my-1 flex items-center gap-2 font-sans text-meta text-ink-muted">
          <span className="h-px flex-1 bg-line" />
          Attempt {row.attempt}
          <span className="h-px flex-1 bg-line" />
        </div>
      );
    }
    const { line, number } = row;
    const fields = fieldsText(line);
    const expanded = open.has(line.seq);
    const isCurrent = found[current] === index;
    const here = marked_ === number;
    return (
      <div
        className={`group flex gap-3 rounded-inner ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"} ${
          LEVEL[line.level] ?? ""
        } ${here ? "bg-action-soft" : ""}`}
      >
        <button
          type="button"
          onClick={() => linkTo(number)}
          aria-label={`Link to line ${number}`}
          className="w-12 shrink-0 text-right text-ink-subtle tabular-nums hover:text-action"
        >
          {number}
        </button>
        <span className="shrink-0 text-ink-muted">{clock(line.time)}</span>
        <span className="w-10 shrink-0 uppercase">{line.level}</span>
        <span className="min-w-0 flex-1">
          {marked(line.message, needle, isCurrent)}
          {fields ? (
            <>
              {" "}
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={expanded ? "Fold the fields" : "Open the fields"}
                onClick={() => {
                  const next = new Set(open);
                  if (expanded) next.delete(line.seq);
                  else next.add(line.seq);
                  setOpen(next);
                }}
                className="text-ink-muted hover:text-ink"
              >
                {expanded ? (
                  <ChevronDown aria-hidden="true" size={14} />
                ) : (
                  <ChevronRight aria-hidden="true" size={14} />
                )}
              </button>
              {expanded ? (
                <span className="mt-0.5 block rounded-inner bg-surface px-2 py-1 whitespace-pre text-ink-muted">
                  {JSON.stringify(line.fields, null, 2)}
                </span>
              ) : (
                <span className="text-ink-muted"> {marked(fields, needle, isCurrent)}</span>
              )}
            </>
          ) : null}
        </span>
        <button
          type="button"
          aria-label={`Copy line ${number}`}
          onClick={() =>
            void copy(lineText(line)).then((ok) =>
              setSaid(ok ? `Line ${number} copied.` : "The clipboard could not be reached."),
            )
          }
          className="shrink-0 font-sans text-meta text-ink-subtle opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          Copy
        </button>
      </div>
    );
  };

  const items = virtual
    ? virtualizer.getVirtualItems()
    : rows.map((_, index) => ({ index, start: 0, key: index }));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ⌘F inside the log, see onKeyDown
    <div
      ref={root}
      onKeyDown={onKeyDown}
      className={`flex flex-col gap-2 ${fill ? "min-h-0 flex-1" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={search}
          type="search"
          aria-label="Search the log"
          placeholder="Search the log"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              step(event.shiftKey ? -1 : 1);
            }
          }}
          className={`${control} min-w-40 flex-1`}
        />
        {needle ? (
          <>
            <span className="text-meta text-ink-muted tabular-nums">
              {found.length === 0
                ? "No match"
                : `${current + 1} of ${found.length} ${found.length === 1 ? "match" : "matches"}`}
            </span>
            <button
              type="button"
              className={toggle(false)}
              aria-label="Previous match"
              disabled={found.length === 0}
              onClick={() => step(-1)}
            >
              <ArrowUp aria-hidden="true" size={14} />
            </button>
            <button
              type="button"
              className={toggle(false)}
              aria-label="Next match"
              disabled={found.length === 0}
              onClick={() => step(1)}
            >
              <ArrowDown aria-hidden="true" size={14} />
            </button>
            <button
              type="button"
              aria-pressed={onlyMatching}
              className={toggle(onlyMatching)}
              onClick={() => setOnlyMatching(!onlyMatching)}
            >
              Only matching
            </button>
          </>
        ) : null}
        <fieldset className="m-0 flex flex-wrap items-center gap-1 border-0 p-0">
          <legend className="sr-only">Levels to show</legend>
          {LEVELS.filter((level) => (counts[level] ?? 0) > 0).map((level) => {
            const on = !hidden.has(level);
            return (
              <button
                key={level}
                type="button"
                aria-pressed={on}
                className={toggle(on)}
                onClick={() => {
                  const next = new Set(hidden);
                  if (on) next.add(level);
                  else next.delete(level);
                  setHidden(next);
                }}
              >
                {LEVEL_NAME[level]} <span className="tabular-nums opacity-80">{counts[level]}</span>
              </button>
            );
          })}
        </fieldset>
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
          disabled={shown.length === 0}
          onClick={() => void copyShown()}
        >
          Copy
        </button>
        <button
          type="button"
          className={`${control} text-ink-muted hover:text-ink disabled:opacity-50`}
          disabled={lines.length === 0}
          onClick={download}
        >
          Download
        </button>
        <span className="text-meta text-ink-muted" aria-live="polite">
          {shown.length === lines.length
            ? `${lines.length} ${lines.length === 1 ? "line" : "lines"}`
            : `${shown.length} of ${lines.length} lines`}
        </span>
        <span className="sr-only" role="status">
          {said}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="m-0 rounded-control border border-line bg-sunken p-3 text-ink-muted">
          {lines.length === 0 ? empty : "No line matches."}
        </p>
      ) : (
        <div className={`relative ${fill ? "flex min-h-0 flex-1 flex-col" : ""}`}>
          <section
            ref={list}
            aria-label="Log lines"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a list that scrolls must be reachable by keyboard
            tabIndex={0}
            onScroll={onScroll}
            style={fill ? undefined : { maxHeight }}
            className={`overflow-auto rounded-control border border-line bg-sunken p-3 font-mono text-code-sm leading-relaxed ${
              fill ? "min-h-64 flex-1" : ""
            }`}
          >
            <ol
              className="m-0 list-none p-0"
              style={
                virtual ? { height: virtualizer.getTotalSize(), position: "relative" } : undefined
              }
            >
              {items.map((item) => {
                const row = rows[item.index] as Row;
                return (
                  <li
                    key={row.kind === "line" ? row.line.seq : row.key}
                    data-row={item.index}
                    data-index={item.index}
                    ref={virtual ? virtualizer.measureElement : undefined}
                    style={
                      virtual
                        ? {
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            transform: `translateY(${item.start}px)`,
                          }
                        : undefined
                    }
                  >
                    {drawRow(row, item.index)}
                  </li>
                );
              })}
            </ol>
          </section>
          {live && !follow ? (
            <button
              type="button"
              onClick={() => setFollow(true)}
              className="absolute right-4 bottom-3 rounded-control border border-line bg-surface px-3 py-1 font-sans text-body-sm shadow-overlay hover:bg-sunken"
            >
              Jump to latest ↓
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
