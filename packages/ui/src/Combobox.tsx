import { Combobox as Base } from "@base-ui/react/combobox";
import { FieldFrame } from "./Fields.tsx";

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
  "flex min-h-control w-full flex-wrap items-center gap-1 rounded-control border border-line-control bg-surface px-1.5 py-1 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-action data-[disabled]:opacity-60 has-[[aria-invalid=true]]:border-danger";
const input =
  "min-w-24 flex-1 bg-transparent px-1 text-ink outline-none placeholder:text-ink-muted/70";
const popup =
  "max-h-72 w-[var(--anchor-width)] min-w-56 overflow-y-auto rounded-control border border-line bg-surface p-1 shadow-overlay transition-[opacity,translate] motion-base data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0";
const row =
  "flex cursor-default items-start gap-2 rounded-inner px-2 py-1.5 data-[highlighted]:bg-action-soft data-[disabled]:opacity-50";

function Items({ empty }: { empty: string }) {
  return (
    <Base.Portal>
      <Base.Positioner sideOffset={4} className="layer-popover">
        <Base.Popup className={popup}>
          <Base.Empty className="px-2 py-1.5 text-ink-muted empty:hidden">{empty}</Base.Empty>
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
                    <span className="truncate text-meta text-ink-muted">{option.hint}</span>
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
  /**
   * Called with what is typed, for a list the server searches: `options` are
   * then shown as given, without being narrowed here.
   */
  onSearch?: (typed: string) => void;
}

/** One choice from a list that can be searched by typing. Use it when a list is too long for a select. */
export function ComboboxField({
  label,
  hint,
  error,
  options,
  value,
  onChange,
  onSearch,
  placeholder,
  disabled,
  empty = "Nothing matches.",
}: ComboboxFieldProps) {
  const chosen = options.find((option) => option.value === value) ?? null;
  return (
    <FieldFrame label={label} {...(hint ? { hint } : {})} error={error}>
      <Base.Root
        items={options}
        value={chosen}
        onValueChange={(next: Option | null) => onChange(next?.value)}
        itemToStringLabel={text}
        isItemEqualToValue={same}
        {...(onSearch
          ? { filter: null, onInputValueChange: (typed: string) => onSearch(typed) }
          : {})}
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
    </FieldFrame>
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
    <FieldFrame label={label} {...(hint ? { hint } : {})} error={error}>
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
                    className="inline-flex items-center gap-1 rounded-inner bg-action-soft px-1.5 py-0.5 text-body-sm"
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
    </FieldFrame>
  );
}
