import type { ValueFormat } from "@volvel/manifest";
import { formatValue } from "@volvel/screens";
import { CheckboxField, SelectField, TextField } from "@volvel/ui";

/**
 * How a number is written: as it is, as a number, as money or as a percent.
 * Money kept in cents is divided by 100. An example shows the result.
 */
export function FormatSettings({
  name,
  label,
  format,
  onChange,
}: {
  name: string;
  label: string;
  format: ValueFormat | undefined;
  onChange: (format: ValueFormat | undefined) => void;
}) {
  const sample = 123456.789;
  const example = format
    ? formatValue(format.minorUnits ? Math.round(sample * 100) : sample, format)
    : undefined;
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label={label}
        name={`format-${name}`}
        value={format?.style ?? ""}
        options={[
          { value: "", label: "As it is" },
          { value: "number", label: "A number: 1,234.5" },
          { value: "currency", label: "Money: $1,234.50" },
          { value: "percent", label: "A percent: 0.25 as 25%" },
        ]}
        onChange={(style) =>
          onChange(
            style
              ? {
                  ...(format?.style === style ? format : {}),
                  style: style as ValueFormat["style"],
                  ...(style === "currency" ? { currency: format?.currency ?? "USD" } : {}),
                }
              : undefined,
          )
        }
      />
      {format?.style === "currency" ? (
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Currency"
            name={`currency-${name}`}
            value={format.currency ?? "USD"}
            maxLength={3}
            onChange={(code) => onChange({ ...format, currency: code.toUpperCase() || "USD" })}
          />
          <CheckboxField
            label="Kept in cents"
            name={`cents-${name}`}
            checked={format.minorUnits ?? false}
            onChange={(minorUnits) => {
              const next = { ...format };
              if (minorUnits) next.minorUnits = true;
              else delete next.minorUnits;
              onChange(next);
            }}
          />
        </div>
      ) : null}
      {format ? (
        <SelectField
          label="Decimal places"
          name={`decimals-${name}`}
          value={format.decimals === undefined ? "" : String(format.decimals)}
          options={[
            { value: "", label: "As usual" },
            ...[0, 1, 2, 3].map((n) => ({ value: String(n), label: String(n) })),
          ]}
          onChange={(places) => {
            const next = { ...format };
            if (places === "") delete next.decimals;
            else next.decimals = Number(places);
            onChange(next);
          }}
        />
      ) : null}
      {example ? <p className="m-0 text-meta text-ink-muted">Shown as {example}</p> : null}
    </div>
  );
}
