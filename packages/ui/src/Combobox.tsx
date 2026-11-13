import { Combobox as Base } from "@base-ui/react/combobox";
import type { ReactNode } from "react";

export interface Option {
  value: string;
  label: string;
  /** A second line under the label, in muted text. */
  hint?: string;
  disabled?: boolean;
}

interface Common {
  label: string;
  /** Shown under the control. Says what is expected, not what went wrong. */
  hint?: string | undefined;
  error?: string | undefined;
  options: readonly Option[];
  placeholder?: string;
  disabled?: boolean;
  /** What the list says when nothing matches what was typed. */
  empty?: string;
}

const box =
  "flex min-h-9 w-full flex-wrap items-center gap-1 rounded-control border border-line bg-surface px-1.5 py-1 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-action data-[disabled]:opacity-60";
const input =
  "min-w-24 flex-1 bg-transparent px-1 text-ink outline-none placeholder:text-ink-muted/70";
const popup =
  "max-h-72 w-[var(--anchor-width)] min-w-56 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-lg";
const row =
  "flex cursor-default items-start gap-2 rounded-[4px] px-2 py-1.5 data-[highlighted]:bg-action-soft data-[disabled]:opacity-50";

function Frame({
  label,
  hint,
  error,
  children,
}: Pick<Common, "label" | "hint" | "error"> & { children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the combobox's input is inside
    <label className="flex flex-col gap-1">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[13px] text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}

function Items({ empty }: { empty: string }) {
  return (
    <Base.Portal>
      <Base.Positioner sideOffset={4} className="z-50">
        <Base.Popup className={popup}>
          <Base.Empty className="px-2 py-1.5 text-ink-muted">{empty}</Base.Empty>
          <Base.List>
            {(option: Option) => (
              <Base.Item
                key={option.value}
                value={option}
                className={row}
                {...(option.disabled ? { disabled: true } : {})}
              >
                <Base.ItemIndicator className="w-3 text-action">✓</Base.ItemIndicator>
                <span className="col-start-2 flex min-w-0 flex-col data-[selected]:font-medium">
                  <span className="truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="truncate text-[12px] text-ink-muted">{option.hint}</span>
                  ) : null}
                </span>
              </Base.Item>
            )}
          </Base.List>
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

const same = (a: Option, b: Option) => a.value === b.value;
const text = (option: Option) => option.label;

export interface ComboboxFieldProps extends Common {
  /** The chosen option's value, or nothing. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/** One choice from a list that can be searched by typing. Use it when a list is too long for a select. */
export function ComboboxField({
  label,
  hint,
  error,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  empty = "Nothing matches.",
}: ComboboxFieldProps) {
  const chosen = options.find((option) => option.value === value) ?? null;
  return (
    <Frame label={label} hint={hint} error={error}>
      <Base.Root
        items={options}
        value={chosen}
        onValueChange={(next: Option | null) => onChange(next?.value)}
        itemToStringLabel={text}
        isItemEqualToValue={same}
        {...(disabled ? { disabled: true } : {})}
      >
        <div className={box}>
          <Base.Input className={input} {...(placeholder ? { placeholder } : {})} />
          <Base.Clear aria-label="Clear" className="px-1 text-ink-muted hover:text-ink">
            ×
          </Base.Clear>
        </div>
        <Items empty={empty} />
      </Base.Root>
    </Frame>
  );
}

export interface MultiSelectFieldProps extends Common {
  /** The chosen options' values, in the order they were chosen. */
  value: readonly string[];
  onChange: (value: string[]) => void;
}

/** Several choices from a list that can be searched by typing. Each choice shows as a chip. */
export function MultiSelectField({
  label,
  hint,
  error,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  empty = "Nothing matches.",
}: MultiSelectFieldProps) {
  const chosen = value
    .map((one) => options.find((option) => option.value === one))
    .filter((option): option is Option => option !== undefined);
  return (
    <Frame label={label} hint={hint} error={error}>
      <Base.Root
        multiple
        items={options}
        value={chosen}
        onValueChange={(next: Option[]) => onChange(next.map((option) => option.value))}
        itemToStringLabel={text}
        isItemEqualToValue={same}
        {...(disabled ? { disabled: true } : {})}
      >
        <Base.Chips className={box}>
          <Base.Value>
            {(selected: Option[]) => (
              <>
                {selected.map((option) => (
                  <Base.Chip
                    key={option.value}
                    aria-label={option.label}
                    className="inline-flex items-center gap-1 rounded-[4px] bg-action-soft px-1.5 py-0.5 text-[13px]"
                  >
                    {option.label}
                    <Base.ChipRemove
                      aria-label={`Remove ${option.label}`}
                      className="text-ink-muted hover:text-ink"
                    >
                      ×
                    </Base.ChipRemove>
                  </Base.Chip>
                ))}
                <Base.Input
                  className={input}
                  {...(placeholder && selected.length === 0 ? { placeholder } : {})}
                />
              </>
            )}
          </Base.Value>
        </Base.Chips>
        <Items empty={empty} />
      </Base.Root>
    </Frame>
  );
}
