import { RE2JS } from "re2js";

/**
 * The one place a regular expression from a tenant is compiled and run. It is used by the
 * manifest's schema check on the server (`@volvel/manifest`, `pattern-guard.ts`), by the flow
 * expressions' `matches` (in their worker thread) and by the widget frame's payload check
 * (`schema.ts`), so all three give the same answer for the same pattern and text.
 *
 * Patterns run on RE2 (here the JavaScript port `re2js`), an engine that never backtracks. The
 * time it takes is the size of the pattern times the length of the text: a pattern such as
 * `(a+)+$` cannot hold a thread longer than any other. What it does not have is what needs
 * backtracking: references back to a group and looking ahead or behind. Those are refused, with
 * the name of the construct, instead of being run.
 *
 * Where it differs from the engine of a browser (JSON Schema says ECMA-262 with the `u` flag):
 * - Text is read as code points, as the `u` flag does.
 * - `\d`, `\w` and `\b` are ASCII only, as in the browser. `\s` is the six characters
 *   `[\t\n\f\r ]` and no more: a no-break space or U+2028 is not a space here, and `.` takes
 *   U+2028 and U+2029, which the browser's `.` does not.
 * - `\p{L}`, `\p{Lu}` and `\p{Greek}` are known; `\p{Script=Greek}` and the other long forms are
 *   not.
 * - `\uXXXX` (two in a row that make a surrogate pair are one character) and `\u{X}` are
 *   accepted and read as the character they name.
 * - `(?<name>x)` and `(?P<name>x)` are groups with a name; `\k<name>` is a back reference.
 * - `(?i)` and the other inline flags are accepted, which the browser refuses.
 * - A repeat count may be at most 1000, and counts that multiply (`(a{100}){100}`) at most 1000
 *   together.
 */

/** The longest pattern, in characters. */
export const MAX_PATTERN_LENGTH = 10_000;

/** The most steps of work (the pattern's size times the text's length) one test may be given. */
const MAX_WORK = 2_000_000;

/** The longest text any pattern is run on, in characters. */
export const MAX_PATTERN_TEXT = 100_000;

/** The largest a pattern may grow to once its repeat counts are written out. */
const MAX_PROGRAM = 20_000;

/** A pattern, ready to be run. */
export interface RunnablePattern {
  /** Whether the pattern matches anywhere in the text, as JSON Schema's `pattern` does. */
  test(text: string): boolean;
  /**
   * The longest text this pattern is run on: 100,000 characters, or fewer when the pattern is
   * large, so that the work stays under a fixed number of steps.
   */
  readonly maxText: number;
}

/** A pattern's result: ready to run, or the reason it is not run, which reads after "the pattern". */
export type CompiledPattern = { pattern: RunnablePattern } | { problem: string };

/**
 * The first construct in a pattern that needs backtracking, named. Classes are skipped, and an
 * escaped character is not a construct.
 */
function backtrackingConstruct(pattern: string): string | undefined {
  let inClass = false;
  for (let at = 0; at < pattern.length; at++) {
    const char = pattern[at];
    if (char === "\\") {
      const next = pattern[at + 1] ?? "";
      if (!inClass && /[1-9]/.test(next))
        return `a reference back to a group (\\${next}), which patterns do not have`;
      if (!inClass && next === "k" && pattern[at + 2] === "<")
        return "a reference back to a named group (\\k<name>), which patterns do not have";
      at++;
    } else if (inClass) {
      if (char === "]") inClass = false;
    } else if (char === "[") {
      inClass = true;
      // A `]` straight after `[` or `[^` is a member of the class, not its end.
      if (pattern[at + 1] === "^") at++;
      if (pattern[at + 1] === "]") at++;
    } else if (char === "(" && pattern[at + 1] === "?") {
      const marker = pattern.slice(at + 2, at + 4);
      if (marker.startsWith("=") || marker.startsWith("!"))
        return "looking ahead ((?=...) or (?!...)), which patterns do not have";
      if (marker === "<=" || marker === "<!")
        return "looking behind ((?<=...) or (?<!...)), which patterns do not have";
    }
  }
  return undefined;
}

/** `\uXXXX` and `\u{X}` are written `\x{X}`, which is how RE2 spells them. */
function toRe2(pattern: string): string {
  let out = "";
  for (let at = 0; at < pattern.length; at++) {
    const char = pattern[at] as string;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const rest = pattern.slice(at + 1);
    const braced = /^u\{([0-9a-fA-F]+)\}/.exec(rest);
    const fixed = /^u([0-9a-fA-F]{4})/.exec(rest);
    if (braced) {
      out += `\\x{${braced[1]}}`;
      at += braced[0].length;
    } else if (fixed) {
      let code = Number.parseInt(fixed[1] as string, 16);
      let length = fixed[0].length;
      // A pair of surrogates written one after the other is one character.
      const low = /^\\u([dD][c-fC-F][0-9a-fA-F]{2})/.exec(rest.slice(length));
      if (code >= 0xd800 && code <= 0xdbff && low) {
        code = 0x10000 + ((code - 0xd800) << 10) + (Number.parseInt(low[1] as string, 16) - 0xdc00);
        length += low[0].length;
      }
      out += `\\x{${code.toString(16)}}`;
      at += length;
    } else {
      out += char + (rest[0] ?? "");
      at += 1;
    }
  }
  return out;
}

const held = new Map<string, CompiledPattern>();
const MAX_HELD = 512;

/**
 * Compiles a pattern for RE2, or says why it is not run. A pattern is compiled once: the result is
 * kept, newest last, for the last 512 patterns.
 */
export function compilePattern(pattern: string): CompiledPattern {
  const known = held.get(pattern);
  if (known) return known;
  const result = build(pattern);
  held.set(pattern, result);
  if (held.size > MAX_HELD) held.delete(held.keys().next().value as string);
  return result;
}

function build(pattern: string): CompiledPattern {
  if (pattern.length > MAX_PATTERN_LENGTH)
    return { problem: `is longer than ${MAX_PATTERN_LENGTH} characters` };
  const construct = backtrackingConstruct(pattern);
  if (construct)
    return { problem: `uses ${construct}: patterns run on RE2, which cannot go back over text` };
  let program: RE2JS;
  try {
    program = RE2JS.compile(toRe2(pattern));
  } catch (error) {
    const why = String((error as Error).message ?? error).replace(/^error parsing regexp: /, "");
    return { problem: `is not one RE2 can run (${why}): patterns run on RE2` };
  }
  const size = program.programSize();
  if (size > MAX_PROGRAM)
    return {
      problem: `is too large to be run (its repeats make ${size} steps of it; the most is ${MAX_PROGRAM})`,
    };
  const maxText = Math.min(MAX_PATTERN_TEXT, Math.floor(MAX_WORK / Math.max(size, 1)));
  return { pattern: { maxText, test: (text) => program.matcher(text).find() } };
}

/** Why a pattern is not run, or nothing when it is. */
export function patternProblem(pattern: string): string | undefined {
  const result = compilePattern(pattern);
  return "problem" in result ? result.problem : undefined;
}

/**
 * Whether a text matches a pattern, or why that is not known: the pattern is not one RE2 runs, or
 * the text is longer than that pattern is run on.
 */
export function matchPattern(
  pattern: string,
  text: string,
): { matches: boolean } | { problem: string } {
  const result = compilePattern(pattern);
  if ("problem" in result) return { problem: `The pattern ${result.problem}.` };
  if (text.length > result.pattern.maxText)
    return {
      problem: `The text is longer than ${result.pattern.maxText} characters, the most this pattern is run on.`,
    };
  return { matches: result.pattern.test(text) };
}
