import { type ColumnType, ENUM_COLORS, SYSTEM_COLUMNS } from "./kinds.js";
import type { ManifestIssue } from "./registry.js";

/** One value of an enum column, as a definition may write it in full. */
export interface EnumValue {
  value: string;
  /** What people read in place of the value. */
  label?: string;
  /** One of `ENUM_COLORS`' names, or `#rrggbb`. */
  color?: string;
  /** The value's previous spelling. Rows that hold it are rewritten on deploy. */
  renamedFrom?: string;
}

/** What a reference does when the row it points to is deleted. */
export type OnDelete = "restrict" | "set_null" | "cascade";

export interface TableColumn {
  type: ColumnType;
  /** What the column holds, in plain text. */
  description?: string;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
  references?: string;
  /** For a reference. Left out, `restrict`. */
  onDelete?: OnDelete;
  /** For an enum or an enum_list: a value alone, or with its label and color. */
  values?: (string | EnumValue)[];
  renamedFrom?: string;
}

/**
 * Type changes that cannot lose anything, by what the column is now. A text column also becomes
 * an enum, when every row already holds one of the values (the rows say, not this list).
 */
export const COLUMN_WIDENINGS: Record<string, ColumnType[]> = {
  integer: ["number", "text"],
  number: ["text"],
  boolean: ["text"],
  uuid: ["text"],
  date: ["text"],
  timestamp: ["text"],
  // An enum is text that is held to a list, so letting go of the list loses nothing.
  enum: ["text"],
};

export const isEnumType = (type: string): type is "enum" | "enum_list" =>
  type === "enum" || type === "enum_list";

/** A column's values, each written in full. */
export function enumValues(values: readonly (string | EnumValue)[] | undefined): EnumValue[] {
  return (values ?? []).map((one) => (typeof one === "string" ? { value: one } : one));
}

/** The color a value is drawn on, as `#rrggbb`, or nothing when it has none. */
export function enumColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return color in ENUM_COLORS ? ENUM_COLORS[color as keyof typeof ENUM_COLORS] : color;
}

/** When a row rule applies to a person, judged from one of the row's columns. */
export type RowCondition =
  /** Every row, for anyone who may use the table at all. */
  | { everyone: true }
  /** The column holds the person's own ID. */
  | { column: string; is: "principal" }
  /** The column names a group the person is in: its ID in a uuid column, its key in a text column (its name too, in rows written before groups had keys). */
  | { column: string; in: "groups" }
  /** The column equals one of the person's attributes, such as the customer they belong to. */
  | { column: string; equals: { attribute: string } };

export interface RowRule {
  /** `read` lets a person see the row. `write` and `all` also let them add, change and delete it. */
  allow: "read" | "write" | "all";
  when: RowCondition;
}

/** The most rules one table may have. Each is a clause in every query on the table. */
export const MAX_ROW_RULES = 20;

export type TablePolicy =
  | { type: "open" }
  | { type: "owner"; column: string }
  | { type: "rules"; rules: RowRule[] };

/** The column a condition looks at, or nothing for `everyone`. */
export const conditionColumn = (when: RowCondition): string | undefined =>
  "column" in when ? when.column : undefined;

/** The body of a `table` manifest, version 1. */
export interface TableBody {
  description?: string;
  columns: Record<string, TableColumn>;
  policy?: TablePolicy;
  indexes?: string[][];
  renamedFrom?: string;
  /** The column that stands for a row where another table refers to it. */
  display?: string;
}

/**
 * The column that names a row where another table refers to it, when the table says none: its
 * `name`, else its `title`, else its first text column. Retired columns are never chosen. The
 * console's pickers and grid, and the server's `expanded` labels, all use this one rule.
 */
export function displayGuess(
  columns: readonly { name: string; type: string; status?: string }[],
): string | undefined {
  const text = columns.filter((one) => one.type === "text" && one.status !== "retired");
  return (
    text.find((one) => one.name === "name")?.name ??
    text.find((one) => one.name === "title")?.name ??
    text[0]?.name
  );
}

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_TEXT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Whether a year, month and day name a day that exists. Years run 0001 to 9999. */
function dayExists(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const last = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1] as number;
  return day <= last;
}

/** Whether text is a day that exists, written 2026-01-31. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const found = DATE_TEXT.exec(value);
  return found !== null && dayExists(Number(found[1]), Number(found[2]), Number(found[3]));
}

/**
 * Whether text is a moment that exists, in ISO 8601 with its zone: 2026-01-31T09:30:00Z or
 * 2026-01-31T09:30:00+02:00. A time with no zone means a different moment in each place, so it
 * is not taken.
 */
export function isIsoTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const found = TIME_TEXT.exec(value);
  if (!found) return false;
  const [, year, month, day, hour, minute, second] = found;
  return (
    dayExists(Number(year), Number(month), Number(day)) &&
    Number(hour) < 24 &&
    Number(minute) < 60 &&
    Number(second ?? 0) < 60 &&
    !Number.isNaN(Date.parse(value))
  );
}

/** A day, or a day and time with no zone, that exists: what a column default has always been allowed to say. */
function isLooseDefaultTime(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (isCalendarDate(value)) return true;
  const found = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/.exec(value);
  return (
    found !== null &&
    isCalendarDate(found[1]) &&
    Number(found[2]) < 24 &&
    Number(found[3]) < 60 &&
    Number(found[4] ?? 0) < 60
  );
}

/** Whether text is an ID, such as a column of type uuid holds. */
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_TEXT.test(value);

/** Whether a value holds the character with code 0, which Postgres cannot store in text or json. */
export function hasNul(value: unknown): boolean {
  if (typeof value === "string") return value.includes("\u0000");
  if (Array.isArray(value)) return value.some(hasNul);
  if (typeof value === "object" && value !== null)
    return Object.entries(value).some(([key, one]) => hasNul(key) || hasNul(one));
  return false;
}

/** Whether a default can be stored in a column of this type. */
function defaultFits(type: ColumnType, value: unknown, values: string[] = []): boolean {
  switch (type) {
    case "enum":
      return typeof value === "string" && values.includes(value);
    case "enum_list":
      return (
        Array.isArray(value) &&
        value.every((one) => typeof one === "string" && values.includes(one)) &&
        new Set(value).size === value.length
      );
    case "text":
      return typeof value === "string" && !hasNul(value);
    case "uuid":
      return isUuid(value);
    case "timestamp":
      // A default is read by the database, so a bundle written with a day, or a time with no
      // zone, keeps working. One that does not exist (31 February) or reads as nothing is refused.
      return isIsoTime(value) || isLooseDefaultTime(value);
    case "date":
      return isCalendarDate(value);
    case "integer":
      return Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "json":
      return !hasNul(value);
    default:
      return false;
  }
}

/** Checks a table's definition beyond what its JSON Schema can say. */
export function checkTable(body: TableBody): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const names = Object.keys(body.columns);
  for (const [name, column] of Object.entries(body.columns)) {
    const at = `/body/columns/${name}`;
    if ((SYSTEM_COLUMNS as readonly string[]).includes(name)) {
      issues.push({ path: at, message: `every table already has a column called "${name}"` });
    }
    if (column.type === "reference" && !column.references) {
      issues.push({
        path: `${at}/references`,
        message: "a reference must say which table it points to",
      });
    }
    if (column.type !== "reference" && column.references) {
      issues.push({
        path: `${at}/references`,
        message: `only a reference column points to a table, and this is a ${column.type}`,
      });
    }
    if (column.type !== "reference" && column.onDelete !== undefined) {
      issues.push({
        path: `${at}/onDelete`,
        message: `only a reference says what happens when the row it points to is deleted, and this is a ${column.type}`,
      });
    }
    if (column.onDelete === "set_null" && column.required) {
      issues.push({
        path: `${at}/onDelete`,
        message: "a required column cannot be emptied when the row it points to is deleted",
      });
    }
    const listed = enumValues(column.values);
    if (isEnumType(column.type)) {
      if (listed.length === 0) {
        issues.push({ path: `${at}/values`, message: `an ${column.type} must list its values` });
      }
      const seen = new Set<string>();
      listed.forEach((one, index) => {
        if (seen.has(one.value)) {
          issues.push({
            path: `${at}/values/${index}`,
            message: `"${one.value}" is listed twice`,
          });
        }
        seen.add(one.value);
      });
      listed.forEach((one, index) => {
        if (one.renamedFrom === undefined) return;
        if (one.renamedFrom === one.value || seen.has(one.renamedFrom)) {
          issues.push({
            path: `${at}/values/${index}/renamedFrom`,
            message: `"${one.renamedFrom}" is still one of the values, so it cannot also be this value's old spelling`,
          });
        }
      });
      if (column.unique && column.type === "enum_list") {
        issues.push({ path: `${at}/unique`, message: "a list of values cannot be unique" });
      }
    } else if (column.values !== undefined) {
      issues.push({
        path: `${at}/values`,
        message: `only an enum or an enum_list lists its values, and this is a ${column.type}`,
      });
    }
    if (
      column.default !== undefined &&
      !defaultFits(
        column.type,
        column.default,
        listed.map((one) => one.value),
      )
    ) {
      issues.push({
        path: `${at}/default`,
        message: `the default does not fit a ${column.type} column`,
      });
    }
    if (column.renamedFrom !== undefined) {
      if (column.renamedFrom === name) {
        issues.push({
          path: `${at}/renamedFrom`,
          message: "a column cannot be renamed from its own name",
        });
      } else if (names.includes(column.renamedFrom)) {
        issues.push({
          path: `${at}/renamedFrom`,
          message: `"${column.renamedFrom}" is still declared as a column, so it cannot also be this column's old name`,
        });
      }
    }
  }
  if (body.display !== undefined) {
    const shown = body.columns[body.display];
    if (!shown) {
      issues.push({ path: "/body/display", message: `there is no column "${body.display}"` });
    } else if (["json", "file", "enum_list"].includes(shown.type)) {
      issues.push({
        path: "/body/display",
        message: `a ${shown.type} column cannot stand for a row: use one that holds a single value`,
      });
    }
  }
  if (body.policy?.type === "owner") {
    const owner = body.columns[body.policy.column];
    if (!owner) {
      issues.push({
        path: "/body/policy/column",
        message: `there is no column "${body.policy.column}"`,
      });
    } else if (owner.type !== "uuid" && owner.type !== "text") {
      issues.push({
        path: "/body/policy/column",
        message: `the owner column must be a uuid or text column, and "${body.policy.column}" is a ${owner.type}`,
      });
    }
  }
  if (body.policy?.type === "rules") {
    body.policy.rules.forEach((rule, index) => {
      const name = conditionColumn(rule.when);
      if (name === undefined) return;
      const at = `/body/policy/rules/${index}/when/column`;
      const column = body.columns[name];
      if (!column) {
        issues.push({ path: at, message: `there is no column "${name}"` });
        return;
      }
      // Each is compared as text: a person's ID, a group's ID or name, an attribute's value.
      const fits =
        "equals" in rule.when
          ? ["text", "uuid", "integer"].includes(column.type)
          : ["text", "uuid"].includes(column.type);
      if (!fits) {
        issues.push({
          path: at,
          message: `a rule cannot compare the ${column.type} column "${name}": use a text or uuid column${"equals" in rule.when ? ", or an integer one" : ""}`,
        });
      }
    });
  }
  (body.indexes ?? []).forEach((columns, index) => {
    for (const column of columns) {
      if (!names.includes(column) && !(SYSTEM_COLUMNS as readonly string[]).includes(column)) {
        issues.push({ path: `/body/indexes/${index}`, message: `there is no column "${column}"` });
      }
    }
  });
  return issues;
}
