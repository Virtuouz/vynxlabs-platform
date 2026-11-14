import { useId } from "react";

export interface SegmentOption<Value extends string> {
  value: Value;
  label: string;
  /** A count shown after the label, such as how many are in that state. */
  count?: number;
  disabled?: boolean;
}

/**
 * One choice among a few, shown side by side: a view, a clinic, a period. It
 * is a group of native radio buttons: the arrow keys move the choice and Tab
 * leaves it. For more than about five choices use a select field.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
  size = "regular",
}: {
  /** Names the group for screen readers. */
  label: string;
  options: readonly SegmentOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  size?: "regular" | "small";
}) {
  const name = useId();
  return (
    <fieldset className="m-0 inline-flex max-w-full min-w-0 flex-wrap gap-0.5 rounded-control border border-line bg-sunken p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <label
            key={option.value}
            className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-[calc(var(--vx-radius-control)-2px)] font-medium whitespace-nowrap has-[:disabled]:cursor-default has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
              size === "small" ? "h-6 px-2 text-[13px]" : "h-8 px-3"
            } ${on ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={on}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
            {option.count !== undefined ? (
              <span className="text-xs text-ink-muted tabular-nums">{option.count}</span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}

/** `YYYY-MM-DD` of a date, in the person's own calendar. */
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const dayOf = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year as number, (month as number) - 1, day as number);
};

/**
 * A day, with buttons to the day before and after, and back to today. The
 * value is a `YYYY-MM-DD` date in the person's own calendar.
 */
export function DateStepper({
  value,
  onChange,
  min,
  max,
  label = "Day",
  locale,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The first and last days allowed, as `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  /** Names the control for screen readers. */
  label?: string;
  /** How the day is written. The browser's own by default. */
  locale?: string;
}) {
  const today = isoDay(new Date());
  const shift = (days: number) => {
    const date = dayOf(value);
    date.setDate(date.getDate() + days);
    onChange(isoDay(date));
  };
  const written = dayOf(value).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(value.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  });
  const arrow =
    "inline-flex size-8 items-center justify-center rounded-control border border-line bg-surface text-ink hover:bg-sunken disabled:opacity-50 disabled:pointer-events-none";
  return (
    <fieldset className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <button
        type="button"
        className={arrow}
        aria-label="The day before"
        disabled={min !== undefined && value <= min}
        onClick={() => shift(-1)}
      >
        ‹
      </button>
      <span className="min-w-0 truncate font-semibold" aria-live="polite">
        {value === today ? `Today, ${written}` : written}
      </span>
      <button
        type="button"
        className={arrow}
        aria-label="The day after"
        disabled={max !== undefined && value >= max}
        onClick={() => shift(1)}
      >
        ›
      </button>
      {value !== today ? (
        <button
          type="button"
          className="h-8 rounded-control px-2 font-medium text-action hover:bg-action-soft"
          onClick={() => onChange(today)}
        >
          Today
        </button>
      ) : null}
    </fieldset>
  );
}
