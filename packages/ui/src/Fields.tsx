import { Field } from "@base-ui/react/field";
import type { ChangeEvent, ReactNode } from "react";
import { useId, useState } from "react";

const control =
  "h-9 w-full rounded-control border border-line bg-surface px-2.5 text-ink placeholder:text-ink-muted/70 disabled:opacity-60";

interface Common {
  label: string;
  /** Shown under the control. Says what is expected, not what went wrong. */
  hint?: string;
  error?: string | undefined;
}

function Frame({ label, hint, error, children }: Common & { children: ReactNode }) {
  return (
    <Field.Root invalid={error !== undefined} className="flex flex-col gap-1">
      <Field.Label className="text-[13px] font-medium text-ink">{label}</Field.Label>
      {children}
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <Field.Description className="m-0 text-[13px] text-ink-muted">{hint}</Field.Description>
      ) : null}
    </Field.Root>
  );
}

export interface TextFieldProps extends Common {
  name: string;
  type?: "text" | "email" | "password" | "number";
  value?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

export function TextField({ label, hint, error, onChange, ...input }: TextFieldProps) {
  return (
    <Frame label={label} {...(hint ? { hint } : {})} error={error}>
      <Field.Control
        {...input}
        className={control}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange?.(event.currentTarget.value)}
      />
    </Frame>
  );
}

export interface SelectFieldProps extends Common {
  name: string;
  value?: string;
  required?: boolean;
  disabled?: boolean;
  options: { value: string; label: string }[];
  onChange?: (value: string) => void;
}

/** A native select: it works with every keyboard, screen reader and phone as it is. */
export function SelectField({
  label,
  hint,
  error,
  options,
  onChange,
  ...select
}: SelectFieldProps) {
  return (
    <Frame label={label} {...(hint ? { hint } : {})} error={error}>
      <Field.Control
        render={
          <select
            {...select}
            className={control}
            onChange={(event) => onChange?.(event.currentTarget.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        }
      />
    </Frame>
  );
}

export interface TextAreaFieldProps extends Common {
  name: string;
  value?: string;
  /** How many lines are visible before the text scrolls. */
  rows?: number;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

/** Text that runs over several lines. */
export function TextAreaField({
  label,
  hint,
  error,
  rows = 4,
  onChange,
  ...area
}: TextAreaFieldProps) {
  return (
    <Frame label={label} {...(hint ? { hint } : {})} error={error}>
      <Field.Control
        render={
          <textarea
            {...area}
            rows={rows}
            className={`${control} h-auto resize-y py-1.5`}
            onChange={(event) => onChange?.(event.currentTarget.value)}
          />
        }
      />
    </Frame>
  );
}

/** What the box shows for a number. Nothing for no number. */
function numberText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** The number typed in the box. Undefined for an empty box or text that is not a number. */
function typedNumber(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const number = Number(text);
  return Number.isNaN(number) ? undefined : number;
}

export interface NumberFieldProps extends Common {
  name: string;
  /** The number in the box. Undefined for an empty box. Leave it out to let the box keep its own. */
  value?: number | undefined;
  min?: number;
  max?: number;
  /** The size of one step. Use 1 for whole numbers. */
  step?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Called with the number typed, or undefined when the box holds no number. */
  onChange?: (value: number | undefined) => void;
}

export function NumberField(props: NumberFieldProps) {
  const { label, hint, error, value, onChange, ...input } = props;
  // The typed text is kept as it is, so that "1." or "-" is not rewritten half-way through.
  // It gives way only when a value is passed in that is not the number it spells.
  const [text, setText] = useState(() => numberText(value));
  const held = "value" in props && typedNumber(text) !== value;
  return (
    <Frame label={label} {...(hint ? { hint } : {})} error={error}>
      <Field.Control
        {...input}
        type="number"
        value={held ? numberText(value) : text}
        className={`${control} text-right`}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          setText(event.currentTarget.value);
          onChange?.(typedNumber(event.currentTarget.value));
        }}
      />
    </Frame>
  );
}

export interface DateFieldProps extends Common {
  name: string;
  /**
   * `2026-03-09`, or with `withTime` a date and time: `2026-03-09T14:30` in the
   * person's local time, or with `timeZone: "UTC"` an instant such as
   * `2026-03-09T14:30:00.000Z`.
   */
  value?: string;
  /** Asks for a time of day as well. */
  withTime?: boolean;
  /**
   * Which clock a time is read and written in. `local`, the default, is the
   * browser's. With `UTC` the field shows UTC times and `value`, `min`, `max`
   * and `onChange` are ISO instants ending in `Z`, so what is stored never
   * depends on where the person is.
   */
  timeZone?: "local" | "UTC";
  /** The earliest and latest values allowed, in the same form as `value`. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

/** An ISO instant as a UTC wall-clock time for a `datetime-local` input. */
export function utcInputValue(instant: string | undefined): string | undefined {
  if (!instant) return instant;
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? instant : date.toISOString().slice(0, 16);
}

/** A `datetime-local` input's value, read as UTC, as an ISO instant. */
export function utcInstant(wallClock: string): string {
  if (!wallClock) return "";
  const date = new Date(`${wallClock.length === 16 ? `${wallClock}:00` : wallClock}Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** The browser's own date picker: it follows the person's locale and works on a phone. */
export function DateField({
  label,
  hint,
  error,
  withTime,
  timeZone = "local",
  onChange,
  ...input
}: DateFieldProps) {
  const utc = withTime && timeZone === "UTC";
  const shown = utc
    ? {
        ...input,
        value: utcInputValue(input.value),
        min: utcInputValue(input.min),
        max: utcInputValue(input.max),
      }
    : input;
  const note = utc ? (hint ? `${hint} Times are in UTC.` : "Times are in UTC.") : hint;
  return (
    <Frame label={label} {...(note ? { hint: note } : {})} error={error}>
      <Field.Control
        {...Object.fromEntries(Object.entries(shown).filter(([, value]) => value !== undefined))}
        type={withTime ? "datetime-local" : "date"}
        className={control}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const value = event.currentTarget.value;
          onChange?.(utc ? utcInstant(value) : value);
        }}
      />
    </Frame>
  );
}

export interface CheckboxFieldProps extends Common {
  name: string;
  checked?: boolean;
  required?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

/** A yes-or-no choice. The label sits beside the box and can be pressed too. */
export function CheckboxField({ label, hint, error, onChange, ...input }: CheckboxFieldProps) {
  const id = useId();
  const note = error || hint ? `${id}-note` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <input
          {...input}
          type="checkbox"
          className="size-4 accent-(--vx-action) disabled:opacity-60"
          aria-invalid={error !== undefined}
          aria-describedby={note}
          onChange={(event) => onChange?.(event.currentTarget.checked)}
        />
        {label}
      </label>
      {error ? (
        <p id={note} role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={note} className="m-0 text-[13px] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
