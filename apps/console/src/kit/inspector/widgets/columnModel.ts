/**
 * What the table and list drawers do with columns, with no React in it so it can be tested by
 * itself: a table's column settings as the config holds them, what each is "shown as", and how a
 * change is written back clean.
 */
import type { ValueFormat } from "@volvel/manifest";
import { sampleOf } from "@volvel/ui";
import { type Catalog, heading, withSystemColumns } from "../model.ts";

export type Tone = "success" | "attention" | "danger" | "neutral" | "action";
export const TONES: readonly Tone[] = ["success", "attention", "danger", "neutral", "action"];
export const TONE_WORDS: Record<Tone, string> = {
  success: "Green",
  attention: "Amber",
  danger: "Red",
  neutral: "Grey",
  action: "Blue",
};

/** One column of a table widget, as `config.columns` holds it. */
export interface ColumnSetting {
  column: string;
  label?: string;
  format?: ValueFormat;
  as?: string;
  badges?: Record<string, Tone>;
  align?: "auto" | "right";
  width?: "auto" | "fixed";
  sortable?: boolean;
  total?: boolean;
  phone?: boolean;
  hidden?: boolean;
}

/** What the drawer knows of a column besides its setting: its type and the values it may hold. */
export interface ColumnFacts {
  name: string;
  type: string;
  /** For a choice column: the values it can hold. */
  choices: readonly string[];
  /** What each choice is called, where the table's definition says. */
  labels?: Readonly<Record<string, string>>;
}

/** A column's facts, from the catalog's table, the table's definition if loaded, and the rows. */
export function factsOf(
  names: readonly string[],
  catalog: Catalog,
  table: string | undefined,
  info?: { columns: readonly { name: string; type: string; values: readonly string[] }[] },
  rows?: readonly Record<string, unknown>[],
): ColumnFacts[] {
  const own = catalog.tables.find((one) => one.name === table);
  const columns = own ? withSystemColumns(own.columns) : [];
  return names.map((name) => {
    const known = columns.find((one) => one.name === name);
    const detailed = info?.columns.find((one) => one.name === name);
    const seen = (rows ?? []).flatMap((row) => {
      const value = row[name];
      return typeof value === "string" && value !== "" ? [value] : [];
    });
    const choices = detailed?.values.length ? detailed.values : [...new Set(seen)];
    const labels = Object.fromEntries(
      (known?.values ?? []).flatMap((one) => (one.label ? [[one.value, one.label]] : [])),
    );
    return {
      name,
      type: detailed?.type ?? known?.type ?? "text",
      choices: choices.slice(0, 50),
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
    };
  });
}

export const isNumberType = (type: string) => type === "integer" || type === "number";
export const isDateType = (type: string) => type === "date" || type === "timestamp";
const LONG = /^(notes?|description|body|comments?|message|details?)$/;

/** The columns a table widget draws: its setting where it has one, else every column as it comes. */
export function columnsOf(
  value: readonly ColumnSetting[] | undefined,
  names: readonly string[],
): ColumnSetting[] {
  return value?.length ? [...value] : names.map((column) => ({ column }));
}

/** "6 of 8 shown". */
export const shownCount = (columns: readonly ColumnSetting[]) =>
  `${columns.filter((one) => !one.hidden).length} of ${columns.length} shown`;

/** What a column is drawn as, in a word or a sample: "Text", "$123.45", "Badge", "Nov 20". */
export function shownAs(spec: ColumnSetting, facts: ColumnFacts | undefined): string {
  if (spec.as === "badge") return "Badge";
  if (spec.format) return sampleOf(123.45, { ...spec.format, minorUnits: false });
  const type = facts?.type ?? "text";
  if (isNumberType(type)) return "123.45";
  if (isDateType(type)) return "Nov 20";
  if (type === "boolean") return "Yes / no";
  if (LONG.test(spec.column)) return "Long text";
  return "Text";
}

/** The heading a column carries on the page. */
export const headingOf = (spec: ColumnSetting): string => spec.label || heading(spec.column);

/** A setting with every default left out, so the page holds only what was chosen. */
export function tidyColumn(spec: ColumnSetting): ColumnSetting {
  const clean: ColumnSetting = { column: spec.column };
  if (spec.label) clean.label = spec.label;
  if (spec.format) clean.format = spec.format;
  if (spec.as && spec.as !== "text") clean.as = spec.as;
  if (spec.as === "badge" && spec.badges && Object.keys(spec.badges).length) {
    clean.badges = spec.badges;
  }
  if (spec.align === "right") clean.align = "right";
  if (spec.width === "fixed") clean.width = "fixed";
  if (spec.sortable === false) clean.sortable = false;
  if (spec.total) clean.total = true;
  if (spec.phone === false) clean.phone = false;
  if (spec.hidden) clean.hidden = true;
  return clean;
}

/** The columns with one changed (by name), written clean. */
export function withColumn(
  columns: readonly ColumnSetting[],
  column: string,
  patch: Partial<ColumnSetting>,
): ColumnSetting[] {
  return columns.map((one) => (one.column === column ? tidyColumn({ ...one, ...patch }) : one));
}

/** Columns not yet in the list, for "+ Column". */
export const unused = (columns: readonly ColumnSetting[], names: readonly string[]) =>
  names.filter((name) => !columns.some((one) => one.column === name));
