import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import type { DrawerIcon } from "./Drawer.tsx";

export interface TileOption<Value extends string> {
  value: Value;
  label: string;
  icon?: DrawerIcon;
  /** The thing drawn as it is, in place of the icon: a button in its style. */
  preview?: ReactNode;
  disabled?: boolean;
  /** Why it is disabled, under its label: "needs a date". */
  reason?: string;
}

const ring =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus";

/**
 * Tiles chosen by looking: an icon and a label, or the thing itself. One is chosen; a tile may
 * be disabled with the reason under it. Arrow keys move between the enabled ones.
 */
export function TilePicker<Value extends string>({
  label,
  options,
  value,
  onChange,
  columns = 3,
}: {
  label: string;
  options: readonly TileOption<Value>[];
  value: Value | undefined;
  onChange: (value: Value) => void;
  columns?: 2 | 3 | 4;
}) {
  const name = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const on = option.value === value;
          const Icon = option.icon;
          const reasonId = `${name}-${option.value}-why`;
          return (
            <label
              key={option.value}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-control border px-2 py-2 text-center text-body-sm ${ring} ${
                option.disabled
                  ? "cursor-default border-dashed border-line text-ink-muted opacity-60"
                  : on
                    ? "cursor-pointer border-action bg-action-soft text-action"
                    : "cursor-pointer border-line text-ink hover:border-line-strong"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={on}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                {...(option.reason ? { "aria-describedby": reasonId } : {})}
                className="sr-only"
              />
              {option.preview ?? (Icon ? <Icon size={16} aria-hidden /> : null)}
              <span>{option.label}</span>
              {option.reason ? (
                <span id={reasonId} className="text-tag text-ink-muted">
                  {option.reason}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Cards with a radio, a title and a line: "Open record detail · Passes the clicked invoice along". */
export function RadioCards<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: Value; title: string; line?: string; disabled?: boolean }[];
  value: Value | undefined;
  onChange: (value: Value) => void;
}) {
  const name = useId();
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const on = option.value === value;
        const lineId = `${name}-${option.value}-line`;
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-control border px-3 py-3 has-[:disabled]:cursor-default has-[:disabled]:opacity-60 ${ring} ${
              on ? "border-action bg-action-soft" : "border-line hover:border-line-strong"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={on}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              {...(option.line ? { "aria-describedby": lineId } : {})}
              className="mt-0.5 size-4 shrink-0 accent-[var(--vx-action)]"
            />
            <span className="min-w-0">
              <span className="block text-body-sm font-medium text-ink">{option.title}</span>
              {option.line ? (
                <span id={lineId} className="block text-meta text-ink-muted">
                  {option.line}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export const POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;
export type Position = (typeof POSITIONS)[number];

const positionName = (position: Position) => {
  const [row, column] = position.split("-") as [string, string];
  const words = row === "middle" && column === "center" ? "Center" : `${row} ${column}`;
  return words.charAt(0).toUpperCase() + words.slice(1).replace("-", " ");
};

/**
 * A 3 × 3 grid of positions, for where a button sits in its cell. One radio group: the arrow
 * keys move over the grid (and choose as they go), and each place has its name for a screen
 * reader: "Top left".
 */
export function PositionPicker({
  label = "Position",
  value,
  onChange,
}: {
  label?: string;
  value: Position;
  onChange: (value: Position) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = POSITIONS.indexOf(value);
  const go = (event: KeyboardEvent, from: number) => {
    const row = Math.floor(from / 3);
    const column = from % 3;
    const to =
      event.key === "ArrowLeft"
        ? row * 3 + Math.max(0, column - 1)
        : event.key === "ArrowRight"
          ? row * 3 + Math.min(2, column + 1)
          : event.key === "ArrowUp"
            ? Math.max(0, row - 1) * 3 + column
            : event.key === "ArrowDown"
              ? Math.min(2, row + 1) * 3 + column
              : -1;
    if (to < 0) return;
    event.preventDefault();
    const next = POSITIONS[to];
    if (!next) return;
    onChange(next);
    refs.current[to]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-grid w-fit grid-cols-3 gap-1 rounded-control border border-line bg-sunken p-1"
    >
      {POSITIONS.map((position, index) => {
        const on = position === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a 2-D roving grid, which native radios do not give
          <button
            key={position}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={positionName(position)}
            tabIndex={on || (at < 0 && index === 0) ? 0 : -1}
            onClick={() => onChange(position)}
            onKeyDown={(event) => go(event, index)}
            className="grid size-8 cursor-pointer place-items-center rounded-inner outline-offset-1 hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus"
          >
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${on ? "bg-action ring-4 ring-action-soft" : "bg-line-strong"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
