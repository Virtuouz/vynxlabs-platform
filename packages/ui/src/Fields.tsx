import { Field } from "@base-ui/react/field";
import type { ComponentChildren, TargetedEvent } from "preact";
import { useId, useState } from "preact/hooks";

const control =
  "h-9 w-full rounded-control border border-line bg-surface px-2.5 text-ink placeholder:text-ink-muted/70 disabled:opacity-60";

interface Common {
  label: string;
  /** Shown under the control. Says what is expected, not what went wrong. */
  hint?: string;
  error?: string | undefined;
}

function Frame({ label, hint, error, children }: Common & { children: ComponentChildren }) {
  return (
    <Field.Root invalid={error !== undefined} class="flex flex-col gap-1">
      <Field.Label class="text-[13px] font-medium text-ink">{label}</Field.Label>
      {children}
      {error ? (
        <p role="alert" class="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <Field.Description class="m-0 text-[13px] text-ink-muted">{hint}</Field.Description>
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
  onInput?: (value: string) => void;
}

export function TextField({ label, hint, error, onInput, ...input }: TextFieldProps) {
  return (
    <Frame label={label} {...(hint ? { hint } : {})} error={error}>
      <Field.Control
        {...input}
        class={control}
        onInput={(event: TargetedEvent<HTMLInputElement>) => onInput?.(event.currentTarget.value)}
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
            class={control}
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
  onInput?: (value: string) => void;
}

/** Text that runs over several lines. */
export function TextAreaField({
  label,
  hint,
  error,
  rows = 4,
  onInput,
  ...area
}: TextAreaFieldProps) {
  return (
    <Frame label={label} {...(hint ? { hint } : {})} error={error}>
      <Field.Control
        render={
          <textarea
            {...area}
            rows={rows}
            class={`${control} h-auto resize-y py-1.5`}
            onInput={(event) => onInput?.(event.currentTarget.value)}
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
  onInput?: (value: number | undefined) => void;
}

export function NumberField(props: NumberFieldProps) {
  const { label, hint, error, value, onInput, ...input } = props;
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
        class={`${control} text-right`}
        onInput={(event: TargetedEvent<HTMLInputElement>) => {
          setText(event.currentTarget.value);
          onInput?.(typedNumber(event.currentTarget.value));
        }}
      />
    </Frame>
  );
}

export interface DateFieldProps extends Common {
  name: string;
  /** `2026-03-09`, or `2026-03-09T14:30` in local time when `withTime` is set. */
  value?: string;
  /** Asks for a time of day as well. */
  withTime?: boolean;
  /** The earliest and latest values allowed, in the same form as `value`. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  onInput?: (value: string) => void;
}

/** The browser's own date picker: it follows the person's locale and works on a phone. */
export function DateField({ label, hint, error, withTime, onInput, ...input }: DateFieldProps) {
  return (
    <Frame label={label} {...(hint ? { hint } : {})} error={error}>
      <Field.Control
        {...input}
        type={withTime ? "datetime-local" : "date"}
        class={control}
        onInput={(event: TargetedEvent<HTMLInputElement>) => onInput?.(event.currentTarget.value)}
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
    <div class="flex flex-col gap-1">
      <label class="flex items-center gap-2 text-[13px] font-medium text-ink">
        <input
          {...input}
          type="checkbox"
          class="size-4 accent-(--vx-action) disabled:opacity-60"
          aria-invalid={error !== undefined}
          aria-describedby={note}
          onChange={(event) => onChange?.(event.currentTarget.checked)}
        />
        {label}
      </label>
      {error ? (
        <p id={note} role="alert" class="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={note} class="m-0 text-[13px] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
