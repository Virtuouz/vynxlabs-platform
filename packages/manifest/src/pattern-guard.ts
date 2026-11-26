import { patternProblem as widgetPatternProblem } from "@volvel/widgets/pattern";

/**
 * A tenant's JSON Schema may carry a `pattern`, and the string it is run on comes from a caller. The
 * control plane has one thread for every tenant, so a pattern that can backtrack without end
 * (`^(a+)+$`) would stop it for all of them. The rules are those of the widget frame's check and
 * of the flow expressions, one function (packages/widget-sdk/src/pattern.ts): a pattern is
 * refused at upload, and at run time it never runs on a long string.
 */

/**
 * The longest string a pattern is run on, and the longest pattern. A pattern the guard accepts takes
 * at most the square of the length of the text, so 1024 keeps the worst case to a few milliseconds
 * (a test runs every accepted pattern of a list of nasty ones against the worst text of this length).
 */
export const MAX_PATTERN_INPUT = 1024;
const MAX_PATTERN_LENGTH = 1000;

/**
 * Why a pattern is not run, or nothing when it is. The rule is one function shared with the widget
 * frame's check and the flow expressions' (`@volvel/widgets/pattern`): a change to it is a change
 * to all three.
 */
export const patternProblem = (pattern: string): string | undefined =>
  widgetPatternProblem(pattern, MAX_PATTERN_LENGTH);

/**
 * What Ajv's `code.regExp` hook returns: an unsafe pattern, or text that is too long, matches
 * nothing. Ajv keeps one compiled pattern per `toString()`, so that must tell patterns apart.
 */
function guardedRegExp(pattern: string, flags: string): { test(text: string): boolean } {
  const unsafe = patternProblem(pattern) !== undefined;
  const expression = unsafe ? undefined : new RegExp(pattern, flags);
  return {
    test: (text) => text.length <= MAX_PATTERN_INPUT && expression?.test(text) === true,
    toString: () => `/${pattern}/${flags}${unsafe ? " (not run)" : ""}`,
  } as { test(text: string): boolean };
}
guardedRegExp.code = "guardedRegExp";
export { guardedRegExp };

/** Every unsafe `pattern` in a value (a schema, or a manifest body holding schemas), as "<pointer> <why>". */
export function patternProblems(value: unknown, at = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => patternProblems(item, `${at}/${i}`));
  if (typeof value !== "object" || value === null) return [];
  const problems: string[] = [];
  for (const [key, inner] of Object.entries(value)) {
    if (key === "pattern" && typeof inner === "string") {
      const why = patternProblem(inner);
      if (why) problems.push(`${at}/pattern ${why}`);
    } else if (key === "patternProperties" && typeof inner === "object" && inner !== null) {
      for (const [source, sub] of Object.entries(inner)) {
        const why = patternProblem(source);
        if (why)
          problems.push(`${at}/patternProperties: the pattern "${source.slice(0, 40)}" ${why}`);
        problems.push(...patternProblems(sub, `${at}/patternProperties`));
      }
    } else {
      problems.push(...patternProblems(inner, `${at}/${key}`));
    }
  }
  return problems;
}

/**
 * What else in a tenant's JSON Schema costs the shared thread more than the schema is worth, and
 * what a value may be before it is checked against one. Each number is a ceiling a real schema is
 * far under, and was set from a measure (a schema of 20,000 properties compiled in 5 s; 20,000
 * distinct objects under `uniqueItems` took 9 s).
 */
/** The most text a tenant's schema may be, as JSON: 256 KiB. */
export const MAX_SCHEMA_BYTES = 256 * 1024;
/** The most objects, lists and values in one tenant schema: 5,000. */
export const MAX_SCHEMA_NODES = 5000;
/** The most values (objects, lists, strings, numbers) in what is checked against a tenant schema: 100,000. */
export const MAX_VALUE_NODES = 100_000;

const SCALAR_TYPES = new Set(["string", "number", "integer", "boolean", "null"]);

/** How many values are in this one, counting no further than `limit`. */
export function countNodes(value: unknown, limit: number): number {
  let count = 0;
  const pending: unknown[] = [value];
  while (pending.length > 0 && count <= limit) {
    const one = pending.pop();
    count++;
    if (Array.isArray(one)) for (const item of one) pending.push(item);
    else if (typeof one === "object" && one !== null)
      for (const item of Object.values(one)) pending.push(item);
  }
  return count;
}

/** Whether a schema asks that the items of a list differ, over items that are not plain values. */
function uniqueOfObjects(schema: Record<string, unknown>): boolean {
  if (schema.uniqueItems !== true) return false;
  const items = schema.items;
  if (typeof items !== "object" || items === null || Array.isArray(items)) return true;
  const type = (items as { type?: unknown }).type;
  const types = Array.isArray(type) ? type : [type];
  return !types.every((one) => typeof one === "string" && SCALAR_TYPES.has(one));
}

/**
 * Why a tenant's schema is not compiled or run, or nothing when it is. Too long, with too many
 * parts, or `uniqueItems` over items that are not plain values (the comparison then takes the
 * square of the list's length).
 */
export function schemaProblem(schema: unknown): string | undefined {
  let bytes = 0;
  try {
    bytes = JSON.stringify(schema)?.length ?? 0;
  } catch {
    return "cannot be read as JSON";
  }
  if (bytes > MAX_SCHEMA_BYTES) return `too large (more than ${MAX_SCHEMA_BYTES} characters)`;
  if (countNodes(schema, MAX_SCHEMA_NODES) > MAX_SCHEMA_NODES)
    return `too large (more than ${MAX_SCHEMA_NODES} parts)`;
  const pending: unknown[] = [schema];
  while (pending.length > 0) {
    const one = pending.pop();
    if (Array.isArray(one)) for (const item of one) pending.push(item);
    else if (typeof one === "object" && one !== null) {
      if (uniqueOfObjects(one as Record<string, unknown>))
        return "uses uniqueItems on items that are not plain values (strings, numbers, booleans), which is not run";
      for (const item of Object.values(one)) pending.push(item);
    }
  }
  return undefined;
}

const SCHEMA_KEYS = ["properties", "items", "anyOf", "oneOf", "allOf", "type", "uniqueItems"];

/**
 * The schemas in a manifest body (any object that reads as one), as "<pointer> <why>" for each
 * that `schemaProblem` refuses. A schema inside a schema is judged with the one around it.
 */
export function schemaCostProblems(value: unknown, at = ""): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, i) => schemaCostProblems(item, `${at}/${i}`));
  if (typeof value !== "object" || value === null) return [];
  if (SCHEMA_KEYS.some((key) => key in value)) {
    const why = schemaProblem(value);
    return why ? [`${at} is a schema that is ${why}`] : [];
  }
  return Object.entries(value).flatMap(([key, inner]) => schemaCostProblems(inner, `${at}/${key}`));
}
