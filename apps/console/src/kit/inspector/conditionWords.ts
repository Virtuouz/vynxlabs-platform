/**
 * "Only include" in words: the operators a column's type is spoken with, and the translation
 * between the kit's condition editor (`{ field, test, value }`) and the manifest's
 * `VisualCondition` (`{ column, op, value }`). Several values chosen are an array.
 */
import type { VisualCondition, VisualOperator } from "@volvel/manifest";
import type { ConditionColumn, ConditionOperator, ConditionValue } from "@volvel/ui";
import { type CatalogColumn, choiceWords, heading } from "./model.ts";
import { iconOfType, NUMERIC, TEMPORAL } from "./queryParts.tsx";

/** What a condition's test is called in a sentence, whatever the column. */
export const TEST_WORDS: Record<VisualOperator, string> = {
  eq: "is",
  ne: "is not",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  in: "is one of",
  contains: "contains",
  is_null: "is empty",
  not_null: "is not empty",
  last: "is in the last",
  between: "is between",
};

/** "30 days", "1 week": the value of "is in the last". */
function lastWords(value: { count?: number; unit?: string }): string {
  const count = value.count ?? 0;
  return `${count} ${value.unit ?? "day"}${count === 1 ? "" : "s"}`;
}

/** What was typed for a value, as a query takes it: a number where it reads as one, a list for "is one of". */
export function typedValue(op: string, text: string): unknown {
  if (op === "in") {
    return text
      .split(",")
      .map((one) => one.trim())
      .filter(Boolean);
  }
  const trimmed = text.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return text;
}

/** A value as it is read in a sentence or typed in a box. */
export const shownValue = (value: unknown): string =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? lastWords(value as { count?: number; unit?: string })
    : Array.isArray(value)
      ? value.join(", ")
      : value === undefined || value === null
        ? ""
        : String(value);

const NONE = { input: "none" } as const;
const empties: ConditionOperator[] = [
  { test: "is_null", label: "is empty", ...NONE },
  { test: "not_null", label: "is not empty", ...NONE },
];

/** The words each kind of column is spoken with. "choice" is a column whose values are known. */
export function operatorsFor(type: string): ConditionOperator[] {
  switch (type) {
    case "number":
      return [
        { test: "eq", label: "is", input: "number" },
        { test: "ne", label: "is not", input: "number" },
        { test: "gt", label: "is more than", input: "number" },
        { test: "gte", label: "is at least", input: "number" },
        { test: "lt", label: "is less than", input: "number" },
        { test: "lte", label: "is at most", input: "number" },
        { test: "between", label: "is between", input: "between" },
        ...empties,
      ];
    case "date":
      return [
        { test: "last", label: "is in the last", input: "last" },
        { test: "gt", label: "is after", input: "date" },
        { test: "lt", label: "is before", input: "date" },
        { test: "gte", label: "is on or after", input: "date" },
        { test: "lte", label: "is on or before", input: "date" },
        { test: "between", label: "is between", input: "between" },
        { test: "eq", label: "is on", input: "date" },
        { test: "is_null", label: "is empty", ...NONE },
        { test: "not_null", label: "has a date", ...NONE },
      ];
    case "choice":
      return [{ test: "eq", label: "is" }, { test: "ne", label: "is not" }, ...empties];
    case "boolean":
      return [{ test: "eq", label: "is", input: "text" }, ...empties];
    default:
      return [
        { test: "eq", label: "is", input: "text" },
        { test: "ne", label: "is not", input: "text" },
        { test: "contains", label: "contains", input: "text" },
        { test: "in", label: "is one of", input: "text" },
        ...empties,
      ];
  }
}

/** The type a column is spoken as: a column with known values is a choice. */
export function spokenType(column: CatalogColumn | undefined): string {
  if (!column) return "text";
  if (column.values && column.values.length > 0) return "choice";
  if (NUMERIC.has(column.type)) return "number";
  if (TEMPORAL.has(column.type)) return "date";
  return column.type;
}

/** The columns as the condition editor lists them. */
export function conditionColumns(columns: readonly CatalogColumn[]): ConditionColumn[] {
  return columns.map((column) => ({
    id: column.name,
    label: heading(column.name),
    type: spokenType(column),
    icon: iconOfType(column.type, column.references),
  }));
}

/** A value a choice column holds, as people say it ("Paid"); any other value as it is. */
function choiceValue(value: unknown, column: CatalogColumn | undefined): string {
  if (spokenType(column) !== "choice") return shownValue(value);
  const say = (one: unknown) => choiceWords(column, String(one));
  return Array.isArray(value) ? value.map(say).join(", ") : say(value);
}

/** The sentence of a condition: "Status is not" and its value, for a chip. */
export function sentenceOf(
  condition: VisualCondition,
  column: CatalogColumn | undefined,
): { before: string; value: string } {
  const words = operatorsFor(spokenType(column)).find(
    (one) => one.test === (condition.op === "in" && column?.values?.length ? "eq" : condition.op),
  );
  return {
    before: `${heading(condition.column)} ${words?.label ?? TEST_WORDS[condition.op]}`,
    value:
      condition.op === "is_null" || condition.op === "not_null"
        ? ""
        : condition.op === "between" && Array.isArray(condition.value)
          ? condition.value.join(" and ")
          : choiceValue(condition.value, column),
  };
}

/** A condition as the editor holds it: a column of known values that is "one of" is "is" with several chosen. */
export function toEditor(
  condition: VisualCondition,
  column: CatalogColumn | undefined,
): ConditionValue {
  const choice = spokenType(column) === "choice";
  const raw = condition.value;
  return {
    field: condition.column,
    test: choice && condition.op === "in" ? "eq" : condition.op,
    ...(raw === undefined
      ? {}
      : {
          value:
            !choice && Array.isArray(raw) && condition.op !== "between" ? shownValue(raw) : raw,
        }),
  };
}

/** True when the condition says all it needs to: a test that takes a value has one. */
export function isComplete(condition: ConditionValue): boolean {
  if (condition.test === "is_null" || condition.test === "not_null") return true;
  const value = condition.value;
  if (condition.test === "between") {
    return Array.isArray(value) && value.length === 2 && value.every((one) => one !== "");
  }
  if (condition.test === "last") {
    return typeof value === "object" && value !== null && "count" in value && "unit" in value;
  }
  return Array.isArray(value)
    ? value.length > 0
    : value !== undefined && value !== null && value !== "";
}

/**
 * The conditions an editor's value is, for a query: several values for "is" are "is one of"; for
 * "is not", one "is not" for each. A typed list for "is one of" is split at its commas.
 */
export function fromEditor(value: ConditionValue): VisualCondition[] {
  const op = value.test as VisualOperator;
  if (op === "is_null" || op === "not_null") return [{ column: value.field, op }];
  const raw = value.value;
  if (op === "last" || op === "between") {
    return raw === undefined
      ? [{ column: value.field, op }]
      : [{ column: value.field, op, value: raw as never }];
  }
  if (Array.isArray(raw)) {
    if (op === "ne") return raw.map((one) => ({ column: value.field, op, value: one }));
    return raw.length === 1
      ? [{ column: value.field, op, value: raw[0] }]
      : [{ column: value.field, op: op === "eq" ? "in" : op, value: raw }];
  }
  if (raw === undefined) return [{ column: value.field, op }];
  const typed = typeof raw === "string" ? typedValue(op, raw) : raw;
  return [{ column: value.field, op, value: typed }];
}
