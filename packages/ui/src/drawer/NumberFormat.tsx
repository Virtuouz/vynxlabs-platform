import { formatValue, type ValueFormat } from "@volvel/widgets";
import { useId } from "react";
import { DrawerRow, ToggleRow } from "./Drawer.tsx";

/** How a number is written: the widget SDK's `ValueFormat`, which is also what writes it. */
export type NumberFormat = ValueFormat;

/** Writes a number the way every widget does: the SDK's one `formatValue`, in US English. */
export function sampleOf(value: number, format: NumberFormat): string {
  return formatValue(value, format) ?? String(value);
}

type Choice = "money" | "money-whole" | "money-short" | "number" | "percent" | "plain";

const CHOICES: { id: Choice; label: string; sample: number }[] = [
  { id: "money", label: "Money", sample: 43120 },
  { id: "money-whole", label: "Money, whole", sample: 43120 },
  { id: "money-short", label: "Money, short", sample: 43120 },
  { id: "number", label: "Number", sample: 43120 },
  { id: "percent", label: "Percent", sample: 0.125 },
  { id: "plain", label: "Plain", sample: 43120 },
];

/** What a choice writes, keeping the currency and the cents the person has set. */
export function formatOfChoice(choice: Choice, from: NumberFormat | undefined): NumberFormat {
  const currency = from?.currency ?? "USD";
  const keep = from?.minorUnits ? { minorUnits: true as const } : {};
  switch (choice) {
    case "money":
      return { style: "currency", currency, ...keep };
    case "money-whole":
      return { style: "currency", currency, decimals: 0, ...keep };
    case "money-short":
      return { style: "currency", currency, notation: "compact", ...keep };
    case "number":
      return { style: "number", ...keep };
    case "percent":
      return { style: "percent", ...keep };
    case "plain":
      return { style: "number", grouping: false, ...keep };
  }
}

/** Which choice a format is. A format the picker does not offer is none of them. */
export function choiceOf(format: NumberFormat | undefined): Choice | undefined {
  const f = format ?? { style: "number" };
  if (f.style === "percent") return "percent";
  if (f.style === "currency") {
    if (f.notation === "compact") return "money-short";
    if (f.decimals === 0) return "money-whole";
    return f.decimals === undefined ? "money" : undefined;
  }
  if (f.notation) return undefined;
  if (f.grouping === false) return "plain";
  return f.decimals === undefined ? "number" : undefined;
}

export const CURRENCIES: { code: string; name: string }[] = [
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "AUD", name: "Australian dollar" },
  { code: "MXN", name: "Mexican peso" },
  { code: "JPY", name: "Japanese yen" },
  { code: "CHF", name: "Swiss franc" },
];

/** What a format is called: "Money", "Money, short". */
export function formatName(format: NumberFormat | undefined): string {
  const choice = choiceOf(format);
  return CHOICES.find((one) => one.id === choice)?.label ?? "Custom";
}

/**
 * The list of ways to write a number, each with a real number written that way, the chosen one
 * highlighted; then the currency, and "Stored in cents" with what it means for the number.
 */
export function NumberFormatPicker({
  value,
  onChange,
  sample = 43120,
}: {
  value: NumberFormat | undefined;
  onChange: (next: NumberFormat) => void;
  /** The number the samples write, as a person sees it (not in cents). */
  sample?: number;
}) {
  const name = useId();
  const choice = choiceOf(value);
  const isMoney = (value?.style ?? "number") === "currency";
  const cents = value?.minorUnits === true;
  const shown = sampleOf(sample, { ...(value ?? { style: "number" }), minorUnits: false });
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
        <legend className="sr-only">Number format</legend>
        {CHOICES.map((one) => {
          const on = one.id === choice;
          const format = formatOfChoice(one.id, value);
          // A percent takes its own sample; the rest take the one given.
          const number = one.id === "percent" ? one.sample : sample;
          return (
            <label
              key={one.id}
              className={`flex h-9 cursor-pointer items-center justify-between gap-3 rounded-control border px-3 text-body-sm min-[640px]:h-10 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
                on ? "border-action bg-selected" : "border-transparent hover:bg-selected"
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={on}
                onChange={() => onChange(format)}
                // A choice already shown (a format the table gave) is written when it is chosen again.
                onClick={() => on && onChange(format)}
                className="sr-only"
              />
              <span>{one.label}</span>
              <span className={`font-mono tabular-nums ${on ? "text-action" : "text-ink-muted"}`}>
                {sampleOf(number, { ...format, minorUnits: false })}
              </span>
            </label>
          );
        })}
      </fieldset>
      <div className="divide-y divide-line overflow-hidden rounded-control border border-line">
        {isMoney ? (
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <label htmlFor={`${name}-currency`} className="text-body-sm text-ink-muted">
              Currency
            </label>
            <select
              id={`${name}-currency`}
              value={value?.currency ?? "USD"}
              onChange={(event) =>
                onChange({ ...(value as NumberFormat), currency: event.target.value })
              }
              className="h-8 rounded-control border border-line-control bg-surface px-2 text-body-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              {CURRENCIES.map((one) => (
                <option key={one.code} value={one.code}>
                  {one.name} · {one.code}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <ToggleRow
          label="Stored in cents"
          help={
            cents
              ? `Total is kept as ${Math.round(sample * 100)}, shown as ${shown}`
              : "Switch on if the column holds cents, not dollars"
          }
          checked={cents}
          onChange={(next) => {
            const base = value ?? { style: "number" as const };
            const { minorUnits: _, ...rest } = base;
            onChange(next ? { ...rest, minorUnits: true } : rest);
          }}
        />
      </div>
    </div>
  );
}

/** The drawer row "Numbers  # $43,120.00 · Money" that opens the picker. */
export function NumberFormatRow({
  label = "Numbers",
  value,
  onChange,
  sample = 43120,
  icon,
}: {
  label?: string;
  value: NumberFormat | undefined;
  onChange: (next: NumberFormat) => void;
  sample?: number;
  icon?: Parameters<typeof DrawerRow>[0]["icon"];
}) {
  return (
    <DrawerRow
      label={label}
      {...(icon ? { icon } : {})}
      mono
      value={sampleOf(sample, { ...(value ?? { style: "number" }), minorUnits: false })}
      hint={formatName(value)}
      editorTitle="Numbers look like"
      editorFooter={false}
      editor={<NumberFormatPicker value={value} onChange={onChange} sample={sample} />}
    />
  );
}
