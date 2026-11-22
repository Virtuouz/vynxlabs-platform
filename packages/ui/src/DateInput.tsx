import { Popover as Base } from "@base-ui/react/popover";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyboardEvent, Ref } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  compareYmd,
  datePattern,
  daysInMonth,
  firstDayOf,
  formatDay,
  formatTime,
  formatWall,
  type Hm,
  hmText,
  localeOf,
  monthNames,
  parseEntry,
  parseTime,
  readWall,
  sameDay,
  todayYmd,
  weekdayNames,
  weekdayOf,
  type Ymd,
  ymdText,
} from "./dates.ts";

const box =
  "h-control w-full rounded-control border border-line-control bg-field ps-3 pe-11 text-ink placeholder:text-ink-muted/70 disabled:opacity-60 aria-[invalid=true]:border-danger";
/** For a drawer's editors, whose boxes are a little lower. */
const compactBox =
  "h-9 w-full rounded-control border border-line-control bg-surface ps-2 pe-9 text-body-sm text-ink placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60 aria-[invalid=true]:border-danger";

/** A filter bar's box: as high as its selects, the label inside. */
const inlineBox =
  "h-[34px] w-full rounded-control border border-line-control bg-sunken pe-9 text-body-sm text-ink placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-action disabled:opacity-60 aria-[invalid=true]:border-danger";

/** The part of a wall string a field compares on: the day, or the day and the minute. */
const trimWall = (text: string | undefined, withTime: boolean) =>
  text ? text.slice(0, withTime ? 16 : 10) : "";

const WHOLE_ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?$/i;

export interface DateInputProps {
  /** `2026-11-21`, or with `withTime` `2026-11-21T14:30`: no zone, the wall clock the field shows. */
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  /** Earliest and latest, in the same form as `value`. */
  min?: string | undefined;
  max?: string | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  /** For a form posted as it is: the box is named and holds the value as `formValue`. */
  name?: string | undefined;
  formValue?: string | undefined;
  /** Said under the box when what was typed can't be read. Without it, the box says so itself. */
  onProblem?: (problem: string | undefined) => void;
  /** What a surrounding field gives its control: id, aria-*, ref, focus handlers. */
  boxProps?: Record<string, unknown> | undefined;
  /** For a box that stands without a field: its name. */
  "aria-label"?: string | undefined;
  id?: string | undefined;
  compact?: boolean;
  /** A word inside the box, before the date ("From"), as a filter bar's other controls say theirs. */
  inlineLabel?: string;
}

function useCoarse(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    const read = () => setCoarse(query.matches);
    read();
    query.addEventListener?.("change", read);
    return () => query.removeEventListener?.("change", read);
  }, []);
  return coarse;
}

/**
 * A date, or a date and a time, in a box the person types in: "Nov 21, 2026" in their locale, with
 * a calendar behind the button at its end. What is typed is read by the locale's order, ISO, month
 * names, "today", "tomorrow", "yesterday"; what can't be read is said and left as it was typed.
 * The value in and out is a wall string. On a touch screen the button opens the phone's own picker.
 */
export function DateInput({
  value,
  onChange,
  withTime = false,
  min,
  max,
  required,
  disabled,
  name,
  formValue,
  onProblem,
  boxProps,
  id,
  compact = false,
  inlineLabel,
  ...rest
}: DateInputProps) {
  const locale = useMemo(localeOf, []);
  const wall = trimWall(value, withTime);
  const [text, setText] = useState(() => formatWall(wall, locale, withTime));
  const [own, setProblem] = useState<string | undefined>();
  const lastSent = useRef(wall);
  const input = useRef<HTMLInputElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const native = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const coarse = useCoarse();
  const problemId = useId();

  const say = useCallback(
    (next: string | undefined) => {
      setProblem(next);
      onProblem?.(next);
    },
    [onProblem],
  );

  // A value that comes from outside, such as a Clear button, replaces what was typed. The value
  // this box itself sent does not: the box already shows what it means.
  useEffect(() => {
    if (wall === lastSent.current) return;
    lastSent.current = wall;
    setText(formatWall(wall, locale, withTime));
    say(undefined);
  }, [wall, locale, withTime, say]);

  const minWall = trimWall(min, withTime);
  const maxWall = trimWall(max, withTime);
  const range = (candidate: string): string | undefined => {
    const shown = (edge: string) => formatWall(edge, locale, withTime);
    if (minWall && candidate < minWall) return `Pick a date on or after ${shown(minWall)}.`;
    if (maxWall && candidate > maxWall) return `Pick a date on or before ${shown(maxWall)}.`;
    return undefined;
  };

  const send = (next: string) => {
    lastSent.current = next;
    onChange(next);
  };

  const wallOf = (day: Ymd, time: Hm | undefined) =>
    withTime
      ? `${ymdText(day)}T${hmText(time ?? readWall(wall)?.time ?? { h: 0, mi: 0 })}`
      : ymdText(day);

  /** Reads the box. `settle` says it is final: the person left it or pressed Enter. */
  const read = (typed: string, settle: boolean) => {
    if (typed.trim() === "") {
      say(undefined);
      if (wall !== "") send("");
      if (settle) setText("");
      return;
    }
    const entry = parseEntry(typed, withTime, locale);
    if (!entry) {
      if (!settle) return;
      const sample = formatDay(todayYmd(), locale);
      say(`Couldn't read "${typed.trim()}" as a date. Try ${sample} or ${ymdText(todayYmd())}.`);
      if (wall !== "") send("");
      return;
    }
    const next = wallOf(entry.day, entry.time);
    const outside = range(next);
    if (outside) {
      if (!settle) return;
      say(outside);
      if (wall !== "") send("");
      return;
    }
    say(undefined);
    if (next !== wall) send(next);
    if (settle) setText(formatWall(next, locale, withTime));
  };

  const problem = own;
  const hint = datePattern(locale, withTime);
  const { onBlur, onFocus, ...forwarded } = (boxProps ?? {}) as {
    onBlur?: (event: unknown) => void;
    onFocus?: (event: unknown) => void;
    ref?: Ref<HTMLInputElement>;
  } & Record<string, unknown>;
  const { ref: boxRef, ...aria } = forwarded as { ref?: Ref<HTMLInputElement> } & Record<
    string,
    unknown
  >;
  const describedBy =
    [aria["aria-describedby"], onProblem === undefined && problem ? problemId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  const toggle = (next: boolean) => {
    if (next && coarse && native.current) {
      try {
        native.current.showPicker();
        return;
      } catch {
        // No native picker here: the calendar is the fallback.
      }
    }
    setOpen(next);
  };

  return (
    <div className="flex flex-col gap-1">
      <div ref={wrapper} className="relative">
        {inlineLabel ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-body-sm text-ink-muted"
          >
            {inlineLabel}
          </span>
        ) : null}
        <input
          {...aria}
          style={
            inlineLabel
              ? { paddingInlineStart: `calc(${inlineLabel.length}ch + 1.25rem)` }
              : undefined
          }
          ref={(node) => {
            input.current = node;
            if (typeof boxRef === "function") boxRef(node);
            else if (boxRef && typeof boxRef === "object")
              (boxRef as { current: HTMLInputElement | null }).current = node;
          }}
          id={(aria.id as string | undefined) ?? id}
          type="text"
          data-date-input=""
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          dir="auto"
          placeholder={hint}
          required={required}
          disabled={disabled}
          aria-label={rest["aria-label"]}
          aria-invalid={problem ? true : (aria["aria-invalid"] as boolean | undefined)}
          aria-describedby={describedBy}
          value={text}
          className={inlineLabel ? inlineBox : compact ? compactBox : box}
          onFocus={(event) => {
            onFocus?.(event);
          }}
          onChange={(event) => {
            const typed = event.currentTarget.value;
            setText(typed);
            if (problem) say(undefined);
            // A whole ISO date goes at once: it is what a test or a paste gives.
            if (typed.trim() === "" || WHOLE_ISO.test(typed.trim())) read(typed, false);
          }}
          onBlur={(event) => {
            read(event.currentTarget.value, true);
            onBlur?.(event);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              read(event.currentTarget.value, true);
            } else if (event.key === "ArrowDown" && event.altKey) {
              event.preventDefault();
              toggle(true);
            }
          }}
        />
        <Base.Root open={open} onOpenChange={(next: boolean) => toggle(next)}>
          <Base.Trigger
            type="button"
            disabled={disabled}
            aria-label="Open calendar"
            className={`absolute inset-y-0 end-0 flex ${compact ? "w-9" : "w-10"} items-center justify-center rounded-e-control text-ink-muted hover:text-ink disabled:opacity-60`}
          >
            <Calendar aria-hidden="true" size={16} />
          </Base.Trigger>
          <Base.Portal>
            <Base.Positioner
              anchor={wrapper}
              side="bottom"
              align="start"
              sideOffset={6}
              collisionPadding={16}
              className="layer-popover"
            >
              <Base.Popup
                ref={popup}
                data-date-picker=""
                initialFocus={() =>
                  popup.current?.querySelector<HTMLElement>("[data-day][tabindex='0']") ?? true
                }
                finalFocus={input}
                className="w-[min(21.5rem,calc(100vw-2rem))] rounded-panel border border-line-strong bg-raised p-3 text-ink shadow-overlay transition-[opacity,translate] motion-base data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0"
              >
                <Base.Title className="sr-only">Choose date</Base.Title>
                <Calendar_
                  locale={locale}
                  withTime={withTime}
                  value={readWall(wall)}
                  min={readWall(minWall)?.day}
                  max={readWall(maxWall)?.day}
                  required={required === true}
                  onPick={(day) => {
                    const next = wallOf(day, undefined);
                    const outside = range(next);
                    if (outside) {
                      say(outside);
                      return;
                    }
                    say(undefined);
                    send(next);
                    setText(formatWall(next, locale, withTime));
                    if (!withTime) setOpen(false);
                  }}
                  onTime={(time) => {
                    const day = readWall(wall)?.day ?? todayYmd();
                    const next = wallOf(day, time);
                    const outside = range(next);
                    if (outside) {
                      say(outside);
                      return false;
                    }
                    say(undefined);
                    send(next);
                    setText(formatWall(next, locale, withTime));
                    return true;
                  }}
                  onClear={() => {
                    say(undefined);
                    send("");
                    setText("");
                    setOpen(false);
                  }}
                  onClose={() => setOpen(false)}
                />
              </Base.Popup>
            </Base.Positioner>
          </Base.Portal>
        </Base.Root>
        {coarse ? (
          <input
            ref={native}
            type={withTime ? "datetime-local" : "date"}
            tabIndex={-1}
            aria-hidden="true"
            value={wall}
            min={minWall || undefined}
            max={maxWall || undefined}
            onChange={(event) => {
              const picked = trimWall(event.currentTarget.value, withTime);
              setText(formatWall(picked, locale, withTime));
              say(undefined);
              send(picked);
            }}
            className="pointer-events-none absolute start-0 bottom-0 size-px opacity-0"
          />
        ) : null}
        {name ? <input type="hidden" name={name} value={formValue ?? wall} /> : null}
      </div>
      {onProblem === undefined && problem ? (
        <p id={problemId} role="alert" className="m-0 text-body-sm text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The calendar

function Calendar_({
  locale,
  withTime,
  value,
  min,
  max,
  required,
  onPick,
  onTime,
  onClear,
  onClose,
}: {
  locale: string;
  withTime: boolean;
  value: { day: Ymd; time: Hm | undefined } | undefined;
  min: Ymd | undefined;
  max: Ymd | undefined;
  required: boolean;
  onPick: (day: Ymd) => void;
  onTime: (time: Hm) => boolean;
  onClear: () => void;
  onClose: () => void;
}) {
  const today = todayYmd();
  const clamp = (day: Ymd) =>
    min && compareYmd(day, min) < 0 ? min : max && compareYmd(day, max) > 0 ? max : day;
  const [focus, setFocus] = useState<Ymd>(() => clamp(value?.day ?? today));
  const moved = useRef(false);
  const grid = useRef<HTMLTableElement>(null);
  const headingId = useId();
  const first = useMemo(() => firstDayOf(locale), [locale]);
  const months = useMemo(() => monthNames(locale, "long"), [locale]);
  const longDays = useMemo(() => weekdayNames(locale, "long"), [locale]);
  const shortDays = useMemo(() => weekdayNames(locale, "short"), [locale]);
  const [timeText, setTimeText] = useState(() =>
    value?.time ? formatTime(value.time, locale) : "",
  );
  const [timeProblem, setTimeProblem] = useState<string | undefined>();

  useLayoutEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-date="${ymdText(focus)}"]`)?.focus();
  }, [focus]);

  const go = (day: Ymd) => {
    moved.current = true;
    setFocus(day);
  };

  const outOf = (day: Ymd): string | undefined =>
    min && compareYmd(day, min) < 0
      ? `before ${formatDay(min, locale)}`
      : max && compareYmd(day, max) > 0
        ? `after ${formatDay(max, locale)}`
        : undefined;

  const rows = useMemo(() => {
    const start = addDays(
      { y: focus.y, m: focus.m, d: 1 },
      -((weekdayOf({ y: focus.y, m: focus.m, d: 1 }) - first + 7) % 7),
    );
    return Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 7 }, (_, column) => addDays(start, row * 7 + column)),
    );
  }, [focus.y, focus.m, first]);

  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    const rtl = grid.current ? getComputedStyle(grid.current).direction === "rtl" : false;
    const weekday = (weekdayOf(focus) - first + 7) % 7;
    let next: Ymd | undefined;
    switch (event.key) {
      case "ArrowLeft":
        next = addDays(focus, rtl ? 1 : -1);
        break;
      case "ArrowRight":
        next = addDays(focus, rtl ? -1 : 1);
        break;
      case "ArrowUp":
        next = addDays(focus, -7);
        break;
      case "ArrowDown":
        next = addDays(focus, 7);
        break;
      case "Home":
        next = addDays(focus, -weekday);
        break;
      case "End":
        next = addDays(focus, 6 - weekday);
        break;
      case "PageUp":
        next = event.shiftKey ? addMonths(focus, -12) : addMonths(focus, -1);
        break;
      case "PageDown":
        next = event.shiftKey ? addMonths(focus, 12) : addMonths(focus, 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    go(next);
  };

  const years = useMemo(() => {
    const from = Math.min(min?.y ?? focus.y - 100, focus.y);
    const to = Math.max(max?.y ?? focus.y + 20, focus.y);
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }, [min, max, focus.y]);

  const keepIn = (y: number, m: number) => clamp({ y, m, d: Math.min(focus.d, daysInMonth(y, m)) });
  const step = (n: number) => setFocus(clamp(addMonths(focus, n)));

  const commitTime = () => {
    if (timeText.trim() === "") {
      setTimeProblem(undefined);
      return;
    }
    const time = parseTime(timeText);
    if (!time) {
      setTimeProblem(`Couldn't read "${timeText.trim()}" as a time. Try 2:30 PM or 14:30.`);
      return;
    }
    setTimeProblem(undefined);
    if (onTime(time)) setTimeText(formatTime(time, locale));
  };

  const selectClass =
    "h-9 min-w-0 rounded-control border border-line-control bg-field px-2 text-body-sm text-ink";
  const stepClass =
    "flex size-9 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-hover hover:text-ink";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the keys are handled on the grid's own buttons as they bubble
    <div onKeyDown={onKey} className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous month"
          className={stepClass}
          onClick={() => step(-1)}
        >
          <ChevronLeft aria-hidden="true" size={16} className="rtl:rotate-180" />
        </button>
        <select
          aria-label="Month"
          value={focus.m}
          className={`${selectClass} flex-1`}
          onChange={(event) => setFocus(keepIn(focus.y, Number(event.currentTarget.value)))}
        >
          {months.map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          value={focus.y}
          className={`${selectClass} w-20`}
          onChange={(event) => setFocus(keepIn(Number(event.currentTarget.value), focus.m))}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Next month" className={stepClass} onClick={() => step(1)}>
          <ChevronRight aria-hidden="true" size={16} className="rtl:rotate-180" />
        </button>
      </div>
      <div id={headingId} aria-live="polite" className="sr-only">
        {months[focus.m - 1]} {focus.y}
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the date picker dialog pattern is a grid of days */}
      <table ref={grid} role="grid" aria-labelledby={headingId} className="w-full border-collapse">
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, column) => {
              const day = (first + column) % 7;
              return (
                <th
                  key={day}
                  scope="col"
                  abbr={longDays[day] ?? ""}
                  className="h-8 text-center text-meta font-medium text-ink-muted"
                >
                  {shortDays[day]}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={ymdText(row[0] as Ymd)}>
              {row.map((day) => {
                const selected = sameDay(day, value?.day);
                const away = outOf(day);
                const inMonth = day.m === focus.m;
                const label = [
                  formatDay(day, locale, "full"),
                  selected ? "selected" : undefined,
                  away ? `not available, ${away}` : undefined,
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  // biome-ignore lint/a11y/useFocusableInteractive: the day button inside it takes the focus
                  <td
                    key={ymdText(day)}
                    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a cell of the date picker grid
                    role="gridcell"
                    aria-selected={selected}
                    className="p-0 text-center"
                  >
                    <button
                      type="button"
                      data-day=""
                      data-date={ymdText(day)}
                      tabIndex={sameDay(day, focus) ? 0 : -1}
                      aria-label={label}
                      aria-current={sameDay(day, today) ? "date" : undefined}
                      aria-disabled={away ? true : undefined}
                      onClick={() => {
                        setFocus(day);
                        if (!away) onPick(day);
                      }}
                      className={`size-10 rounded-control text-body-sm tabular-nums ${
                        selected
                          ? "bg-action font-semibold text-action-ink"
                          : `hover:bg-hover ${inMonth ? "text-ink" : "text-ink-subtle"}`
                      } aria-[current=date]:border aria-[current=date]:border-line-strong aria-[current=date]:font-semibold aria-disabled:cursor-not-allowed aria-disabled:text-ink-subtle aria-disabled:line-through aria-disabled:hover:bg-transparent`}
                    >
                      {day.d}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {withTime ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <label htmlFor={`${headingId}-time`} className="text-body-sm font-medium">
              Time
            </label>
            <input
              id={`${headingId}-time`}
              type="text"
              autoComplete="off"
              dir="auto"
              value={timeText}
              placeholder={formatTime({ h: 14, mi: 30 }, locale)}
              aria-invalid={timeProblem ? true : undefined}
              aria-describedby={timeProblem ? `${headingId}-time-note` : undefined}
              onChange={(event) => setTimeText(event.currentTarget.value)}
              onBlur={commitTime}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTime();
                }
              }}
              className={`${selectClass} w-28`}
            />
          </div>
          {timeProblem ? (
            <p id={`${headingId}-time-note`} role="alert" className="m-0 text-body-sm text-danger">
              {timeProblem}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-control px-2 py-1 text-body-sm font-medium text-ink-muted hover:bg-hover hover:text-ink"
          onClick={() => {
            const day = clamp(today);
            if (outOf(today)) {
              go(day);
              return;
            }
            onPick(today);
            go(today);
          }}
        >
          Today
        </button>
        {required ? null : (
          <button
            type="button"
            className="rounded-control px-2 py-1 text-body-sm font-medium text-ink-muted hover:bg-hover hover:text-ink"
            onClick={onClear}
          >
            Clear
          </button>
        )}
        {withTime ? (
          <button
            type="button"
            className="rounded-control bg-action px-3 py-1 text-body-sm font-semibold text-action-ink"
            onClick={() => {
              commitTime();
              onClose();
            }}
          >
            Done
          </button>
        ) : null}
      </div>
    </div>
  );
}
