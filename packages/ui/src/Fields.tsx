import { Field } from "@base-ui/react/field";
import type { ComponentChildren, TargetedEvent } from "preact";

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
  autoComplete?: string;
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
