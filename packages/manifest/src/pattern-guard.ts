import { compilePattern, patternProblem as widgetPatternProblem } from "@volvel/widgets/pattern";

/**
 * A tenant's JSON Schema may carry a `pattern`, and the string it is run on comes from a caller. The
 * control plane has one thread for every tenant, so a pattern that can backtrack without end
 * (`^(a+)+$`) would stop it for all of them. Tenant patterns run on RE2, an engine that does not
 * backtrack (packages/widget-sdk/src/pattern.ts): a pattern it cannot run is refused at upload,
 * and in a bundle already deployed it fails the check with the same words.
 */

/**
 * The platform's own schemas use the built-in engine; a tenant's use RE2 (`own` is false). A
 * pattern RE2 cannot run (a reference back to a group, looking ahead or behind) is refused when
 * a schema is compiled, with a message that names the construct; the text a pattern is run on is
 * held to what `compilePattern` allows for that pattern.
 */

/** A pattern (or text) that is not run: the message is meant for the author of the schema. */
export class PatternError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatternError";
  }
}

/** Why a pattern is not run, or nothing when it is: the one rule of `@volvel/widgets/pattern`. */
export const patternProblem = (pattern: string): string | undefined =>
  widgetPatternProblem(pattern);

/**
 * What Ajv's `code.regExp` hook returns for a tenant's schema: a pattern that RE2 does not run
 * stops the compile with its reason, and text too long for the pattern stops the check. Ajv keeps one
 * compiled pattern per `toString()`, so that must tell patterns apart.
 */
function re2RegExp(pattern: string, _flags: string): { test(text: string): boolean } {
  const result = compilePattern(pattern);
  if ("problem" in result)
    throw new PatternError(`the pattern "${pattern.slice(0, 60)}" ${result.problem}`);
  const { maxText, test } = result.pattern;
  return {
    test: (text) => {
      if (text.length > maxText)
        throw new PatternError(
          `a value is longer than ${maxText} characters, the most the pattern "${pattern.slice(0, 60)}" is run on`,
        );
      return test(text);
    },
    toString: () => `/${pattern}/re2`,
  } as { test(text: string): boolean };
}
re2RegExp.code = "re2RegExp";

export { re2RegExp };

/** Every `pattern` in a value that RE2 does not run (a schema, or a manifest body holding schemas), as "<pointer> <why>". */
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
