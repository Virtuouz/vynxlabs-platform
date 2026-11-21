/**
 * The controls the inspector draws a widget's configuration with: one for
 * each name in `CONTROLS` (`@volvel/widgets`), drawn from a property's
 * `x-volvel` hint. A widget names a control; it never brings one of its own,
 * so a widget from any pack is drawn with no code here that knows it.
 */
import type { PageFilter, PageWidget, ValueFormat } from "@volvel/manifest";
import {
  Button,
  CheckboxField,
  Markdown,
  MoveButtons,
  MultiSelectField,
  NumberField,
  type Option,
  SegmentedControl,
  SelectField,
  TextAreaField,
  TextField,
  useFlip,
} from "@volvel/ui";
import type { Surface, WidgetDefinition } from "@volvel/widgets";
import { useState } from "react";
import { amount } from "../format.ts";
import { DataControl } from "./dataControls.tsx";
import type { Catalog, ConfigSetting } from "./model.ts";
import { heading, resultNames, visualOf, withConfig, withSystemColumns } from "./model.ts";

/** What every control is given: the widget, its definition, and how to write it. */
export interface Env {
  definition: WidgetDefinition;
  widget: PageWidget;
  surface: Surface;
  filters: readonly PageFilter[];
  catalog: Catalog;
  /** The widget's configuration with its definition's defaults filled in. */
  config: Record<string, unknown>;
  /** Writes the widget as it should now be. `key` joins quick changes, such as typing, into one step to undo. */
  write: (next: PageWidget, label: string, key?: string) => void;
}

/** The columns a column control offers for a data input. */
export function columnOptions(
  env: Env,
  of: string | undefined,
  types?: readonly string[],
): Option[] {
  const input = of ? env.widget.data?.[of] : undefined;
  const visual = visualOf(input);
  const table = visual ? env.catalog.tables.find((one) => one.name === visual.table) : undefined;
  const columns = table ? withSystemColumns(table.columns) : [];
  if (types) {
    return columns
      .filter((column) => types.includes(column.type))
      .map((column) => ({ value: column.name, label: heading(column.name) }));
  }
  const declared = of ? env.definition.data[of] : undefined;
  if (declared?.shape === "summary") {
    return resultNames(input).map((name) => ({ value: name, label: heading(name) }));
  }
  return columns.map((column) => ({ value: column.name, label: heading(column.name) }));
}

const labelOf = (setting: ConfigSetting) => setting.hint.label;

/** One setting, drawn by the control its hint names. */
export function ConfigControl({ env, setting }: { env: Env; setting: ConfigSetting }) {
  const { hint, name, schema } = setting;
  const { widget } = env;
  const value = env.config[name];
  const field = `${widget.id}-${name}`;
  const set = (next: unknown, key = true) =>
    env.write(
      withConfig(widget, name, next),
      `changing ${labelOf(setting).toLowerCase()}`,
      key ? `config:${widget.id}:${name}` : undefined,
    );
  const help = hint.help;

  switch (hint.control) {
    case "text":
      return (
        <TextField
          name={field}
          label={hint.label}
          {...(help ? { hint: help } : {})}
          required={false}
          value={typeof value === "string" ? value : ""}
          {...(typeof schema.maxLength === "number" ? { maxLength: schema.maxLength } : {})}
          onChange={(text) => set(text)}
        />
      );
    case "markdown":
      return (
        <MarkdownControl
          field={field}
          label={hint.label}
          help={help}
          value={typeof value === "string" ? value : ""}
          onChange={(text) => set(text)}
        />
      );
    case "number":
      return (
        <NumberField
          name={field}
          label={hint.label}
          {...(help ? { hint: help } : {})}
          required={false}
          value={typeof value === "number" ? value : undefined}
          {...(typeof schema.minimum === "number" ? { min: schema.minimum } : {})}
          {...(typeof schema.maximum === "number" ? { max: schema.maximum } : {})}
          onChange={(next) => set(next)}
        />
      );
    case "switch":
      return (
        <CheckboxField
          name={field}
          label={hint.label}
          {...(help ? { hint: help } : {})}
          checked={value === true}
          onChange={(on) => set(on ? true : undefined)}
        />
      );
    case "choice":
    case "segmented": {
      const choices = choicesOf(setting);
      const fixed = env.definition.defaults?.[name] !== undefined;
      if (hint.control === "choice") {
        return (
          <SelectField
            name={field}
            label={hint.label}
            {...(help ? { hint: help } : {})}
            value={value === undefined ? "" : String(value)}
            options={[...(fixed ? [] : [{ value: "", label: "Not chosen" }]), ...choices]}
            onChange={(next) => set(choices.find((one) => one.value === next) ? next : undefined)}
          />
        );
      }
      return (
        <div className="flex flex-col gap-1">
          <span className="text-body-sm font-medium text-ink">{hint.label}</span>
          <div>
            <SegmentedControl
              label={hint.label}
              options={choices}
              value={value === undefined ? "" : String(value)}
              onChange={(next) => set(next)}
            />
          </div>
          {help ? <p className="m-0 text-body-sm text-ink-muted">{help}</p> : null}
        </div>
      );
    }
    case "format":
      return (
        <FormatControl
          field={field}
          label={hint.label}
          format={value as ValueFormat | undefined}
          onChange={(format) => set(format)}
        />
      );
    case "filter": {
      const dates = env.filters.filter((one) => one.type === "date_range");
      return (
        <SelectField
          name={field}
          label={hint.label}
          hint={
            dates.length === 0
              ? "The page has no filter for a range of dates yet. Add one under Filters on the page."
              : (help ?? "")
          }
          value={typeof value === "string" ? value : ""}
          options={[
            { value: "", label: "Not compared" },
            ...dates.map((one) => ({ value: one.name, label: one.label ?? heading(one.name) })),
          ]}
          onChange={(next) => set(next)}
        />
      );
    }
    case "column": {
      const options = columnOptions(env, hint.of, hint.types);
      const known =
        typeof value === "string" && value !== "" && !options.some((one) => one.value === value);
      return (
        <SelectField
          name={field}
          label={hint.label}
          {...(help ? { hint: help } : {})}
          value={typeof value === "string" ? value : ""}
          options={[
            { value: "", label: "None" },
            ...(known ? [{ value: value as string, label: heading(value as string) }] : []),
            ...options,
          ]}
          onChange={(next) => set(next)}
        />
      );
    }
    case "columns": {
      const items = (schema.items ?? {}) as { type?: string };
      const options = columnOptions(env, hint.of, hint.types);
      if (items.type === "string") {
        const max = typeof schema.maxItems === "number" ? schema.maxItems : undefined;
        const chosen = Array.isArray(value) ? (value as string[]) : [];
        return (
          <MultiSelectField
            label={hint.label}
            options={options}
            value={chosen}
            placeholder="None"
            hint={[help, max ? `Up to ${max}.` : undefined].filter(Boolean).join(" ")}
            onChange={(next) => set(max ? next.slice(0, max) : next)}
          />
        );
      }
      return (
        <ColumnsControl
          field={field}
          label={hint.label}
          help={help}
          options={options}
          value={Array.isArray(value) ? (value as ColumnSetting[]) : undefined}
          onChange={(next) => set(next, false)}
        />
      );
    }
    case "source":
    case "measure":
    case "breakdown":
    case "conditions":
    case "sort":
    case "limit":
      // A data control written as a setting of config still belongs to an input.
      return hint.of ? (
        <DataControl
          env={env}
          input={hint.of}
          control={hint.control}
          label={hint.label}
          help={help}
        />
      ) : null;
    default:
      return null;
  }
}

/** What each value of a choice is called: the hint's words, else the value made readable. */
export function choicesOf(setting: ConfigSetting): { value: string; label: string }[] {
  const values =
    (setting.schema.enum as readonly unknown[] | undefined) ??
    Object.keys(setting.hint.choices ?? {});
  return values.map((one) => ({
    value: String(one),
    label: setting.hint.choices?.[String(one)] ?? heading(String(one)),
  }));
}

// ---------------------------------------------------------------------------
// Numbers

const STYLE_WORDS: Record<ValueFormat["style"], string> = {
  number: "Number",
  currency: "Money",
  percent: "Percent",
};

/** "Money · USD · 2 decimals": what a format is, in a line. */
export function formatSummary(format: ValueFormat | undefined): string {
  if (!format) return "As it comes";
  return [
    STYLE_WORDS[format.style],
    format.style === "currency" ? (format.currency ?? "USD") : undefined,
    format.minorUnits ? "kept in cents" : undefined,
    format.decimals !== undefined
      ? `${format.decimals} decimal${format.decimals === 1 ? "" : "s"}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The sample a format is shown with. */
const SAMPLE = 43120;

function FormatControl({
  field,
  label,
  format,
  onChange,
}: {
  field: string;
  label: string;
  format: ValueFormat | undefined;
  onChange: (format: ValueFormat | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const shown = format ? amount(format.minorUnits ? SAMPLE * 100 : SAMPLE, format) : amount(SAMPLE);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-body-sm font-medium text-ink" id={`${field}-label`}>
        {label}
      </span>
      <Button
        variant="secondary"
        className="w-full justify-between"
        aria-expanded={open}
        aria-controls={`${field}-panel`}
        onClick={() => setOpen((now) => !now)}
      >
        <span className="min-w-0 truncate">{formatSummary(format)}</span>
        <span aria-hidden="true" className="text-ink-muted">
          {open ? "Close" : "Change"}
        </span>
      </Button>
      <span className="text-body-sm text-ink-muted">Shown as {shown}</span>
      {open ? (
        <div
          id={`${field}-panel`}
          className="flex flex-col gap-2 rounded-control border border-line p-3"
        >
          <SelectField
            name={`${field}-style`}
            label="Written as"
            value={format?.style ?? ""}
            options={[
              { value: "", label: "As it comes" },
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
            <>
              <TextField
                name={`${field}-currency`}
                label="Currency"
                hint="A three-letter code, such as USD or EUR."
                value={format.currency ?? "USD"}
                maxLength={3}
                onChange={(code) => onChange({ ...format, currency: code.toUpperCase() || "USD" })}
              />
              <CheckboxField
                name={`${field}-cents`}
                label="Kept in cents"
                hint="The numbers are in hundredths, and shown divided by 100."
                checked={format.minorUnits === true}
                onChange={(minorUnits) => {
                  const { minorUnits: _before, ...rest } = format;
                  onChange(minorUnits ? { ...rest, minorUnits: true } : rest);
                }}
              />
            </>
          ) : null}
          {format ? (
            <SelectField
              name={`${field}-decimals`}
              label="Decimal places"
              value={format.decimals === undefined ? "" : String(format.decimals)}
              options={[
                { value: "", label: "As usual" },
                ...[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) })),
              ]}
              onChange={(places) => {
                const { decimals: _before, ...rest } = format;
                onChange(places === "" ? rest : { ...rest, decimals: Number(places) });
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown

/** The components a page's Markdown may use, beside the plain Markdown every page may. */
export const MARKDOWN_NOTE = "Components you may write in it: alert, steps, tabs and details.";

function MarkdownControl({
  field,
  label,
  help,
  value,
  onChange,
}: {
  field: string;
  label: string;
  help: string | undefined;
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <TextAreaField
        name={field}
        label={label}
        required={false}
        rows={6}
        value={value}
        hint={[help, MARKDOWN_NOTE].filter(Boolean).join(" ")}
        onChange={onChange}
      />
      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-subtle uppercase">Preview</span>
        <section
          aria-label="Preview of the text"
          className="max-h-60 overflow-auto rounded-control border border-line p-3"
        >
          {value.trim() === "" ? (
            <p className="m-0 text-body-sm text-ink-muted">Nothing written yet.</p>
          ) : (
            <Markdown text={value} />
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns of a table

export interface ColumnSetting {
  column: string;
  label?: string;
  format?: ValueFormat;
  as?: string;
  hidden?: boolean;
}

function ColumnsControl({
  field,
  label,
  help,
  options,
  value,
  onChange,
}: {
  field: string;
  label: string;
  help: string | undefined;
  options: Option[];
  value: ColumnSetting[] | undefined;
  onChange: (next: ColumnSetting[] | undefined) => void;
}) {
  const rows: ColumnSetting[] = value?.length
    ? value
    : options.map((one) => ({ column: one.value }));
  const holder = useFlip<HTMLUListElement>(rows.map((one) => one.column).join(" "));
  const change = (at: number, patch: Partial<ColumnSetting>) => {
    const next = rows.map((row, index) => (index === at ? { ...row, ...patch } : row));
    onChange(
      next.map((row) => {
        const clean: ColumnSetting = { column: row.column };
        if (row.label) clean.label = row.label;
        if (row.format) clean.format = row.format;
        if (row.as) clean.as = row.as;
        if (row.hidden) clean.hidden = true;
        return clean;
      }),
    );
  };
  const move = (at: number, by: -1 | 1) => {
    const next = [...rows];
    const [taken] = next.splice(at, 1);
    if (taken) next.splice(at + by, 0, taken);
    onChange(next);
  };
  const left = options.filter((one) => !rows.some((row) => row.column === one.value));
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="p-0 text-body-sm font-medium text-ink">{label}</legend>
      {help ? <p className="m-0 text-body-sm text-ink-muted">{help}</p> : null}
      <ul ref={holder} className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row, at) => (
          <li
            key={row.column}
            data-flip-key={row.column}
            className="flex flex-col gap-1 rounded-control border border-line p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <CheckboxField
                name={`${field}-${row.column}-shown`}
                label={heading(row.column)}
                checked={row.hidden !== true}
                onChange={(shown) => change(at, shown ? { hidden: false } : { hidden: true })}
              />
              <MoveButtons
                label={heading(row.column)}
                at={at}
                count={rows.length}
                onMove={(by) => move(at, by)}
              />
            </div>
            <TextField
              name={`${field}-${row.column}-label`}
              label={`Heading of ${heading(row.column)}`}
              labelHidden
              placeholder={heading(row.column)}
              required={false}
              value={row.label ?? ""}
              onChange={(text) => change(at, { label: text })}
            />
          </li>
        ))}
      </ul>
      {left.length > 0 ? (
        <SelectField
          name={`${field}-add`}
          label="Add a column"
          value=""
          options={[
            { value: "", label: "Choose a column" },
            ...left.map((one) => ({ value: one.value, label: one.label })),
          ]}
          onChange={(next) => next && onChange([...rows, { column: next }])}
        />
      ) : null}
      {value?.length ? (
        <div>
          <Button size="small" variant="quiet" onClick={() => onChange(undefined)}>
            Show every column again
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
