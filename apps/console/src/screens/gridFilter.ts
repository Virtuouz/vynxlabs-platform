import { parseValue } from "@volvel/ui";

/** One test of a column's value, as the data API takes it, or several joined by and or or. */
export type Condition = { op: string; value: unknown } | { and: Condition[] } | { or: Condition[] };

const RANGED = new Set(["integer", "number", "date", "timestamp"]);

/** One test, with no `|`: text to look for, a comparison, a range, a negation, or empty. */
function single(type: string, trimmed: string): Condition {
  if (/^(!\s*empty|!\s*null|not\s+empty|not\s+null)$/i.test(trimmed))
    return { op: "is_null", value: false };
  if (/^(empty|null)$/i.test(trimmed)) return { op: "is_null", value: true };
  const negated = /^(?:!=|!|not\s+)\s*(.+)$/i.exec(trimmed);
  if (negated) {
    if (type === "enum_list")
      throw new Error("A list cannot be searched with not. Search for a value it has.");
    if (type === "json") throw new Error("JSON can only be tested for empty.");
    return { op: "ne", value: parseValue(type, negated[1] as string) };
  }
  if (type === "text") return { op: "contains", value: trimmed };
  // An enum is found by a value spelled out, a list by one value it has.
  if (type === "enum") return { op: "eq", value: trimmed };
  if (type === "enum_list") return { op: "has", value: trimmed };
  const compared = /^(>=|<=|>|<)\s*(.+)$/.exec(trimmed);
  if (compared) {
    const op = { ">=": "gte", "<=": "lte", ">": "gt", "<": "lt" }[compared[1] as ">"];
    return { op, value: parseValue(type, compared[2] as string) };
  }
  // A range, both ends included: 10..20, or 2026-01-01..2026-03-31. One end may be left open.
  const range = RANGED.has(type) ? /^(.*?)\s*\.\.\s*(.*)$/.exec(trimmed) : null;
  if (range && (range[1] || range[2])) {
    const ends: Condition[] = [];
    if (range[1]) ends.push({ op: "gte", value: parseValue(type, range[1]) });
    if (range[2]) ends.push({ op: "lte", value: parseValue(type, range[2]) });
    return ends.length === 1 ? (ends[0] as Condition) : { and: ends };
  }
  return { op: "eq", value: parseValue(type, trimmed) };
}

/**
 * What was typed in a filter box, as the condition the data API takes, or nothing for an empty
 * box. Throws a message for text that cannot be read as the column's type.
 *
 * - text to look for; `empty`; `!empty` for any value
 * - `> 100`, `>= 100`, `< 100`, `<= 100`; a range `10..20`, or `10..` and `..20`
 * - `!x` for rows that are not x
 * - `a | b` for rows that are a or b
 */
export function toFilter(type: string, text: string): Condition | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const alternatives = trimmed
    .split("|")
    .map((one) => one.trim())
    .filter(Boolean);
  if (alternatives.length <= 1) return single(type, alternatives[0] ?? trimmed);
  const each = alternatives.map((one) => single(type, one));
  // Values to be any of, for a kind that is compared whole: one test, not several.
  if (each.every((one) => "op" in one && one.op === "eq"))
    return { op: "in", value: each.map((one) => (one as { value: unknown }).value) };
  return { or: each };
}

/** A condition on a column, with the column named in each test it is made of. */
export function filterNode(column: string, condition: Condition): object {
  if ("and" in condition) return { and: condition.and.map((one) => filterNode(column, one)) };
  if ("or" in condition) return { or: condition.or.map((one) => filterNode(column, one)) };
  return { column, ...condition };
}
