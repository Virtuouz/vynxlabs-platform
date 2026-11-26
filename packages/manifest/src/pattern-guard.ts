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
