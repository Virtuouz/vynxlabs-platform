import { describe, expect, test } from "vitest";
import { MAX_PATTERN_INPUT, patternProblem } from "./pattern-guard.js";
import { validateJson } from "./registry.js";

// Patterns that have gone wrong, or could: nested and adjacent repeats, ranges, forks that share a
// start, chains of optional atoms. The guard may refuse any of them. Each it ACCEPTS must be fast
// on the worst text of the longest length it lets a pattern run on. The same list is in
// packages/widget-sdk/src/pattern.test.ts and in apps/control-plane/src/kernel/flows/expressions.test.ts:
// the three guards are one function, and the three tests must change with it.
export const NASTY = [
  "^(a+)+$",
  "^(a*)*$",
  "^(a|a)*$",
  "^(a|aa)+$",
  "^a*a*a*b",
  "^a*a*b",
  "^a*a*a*a*b",
  "^[a-z]*[a-z]*[a-z]*[0-9]$",
  "^a+a+a+a+$",
  "^a{1,4000}a{1,4000}a{1,4000}b",
  "^a{1,4000}$",
  "^a{0,60}a{0,60}a{0,60}a{0,60}a{0,60}b$",
  "^(a?){30}a{30}$",
  "^a?a?a?a?a?a?a?a?a?a?a?a?aaaaaaaaaaaa$",
  "^(a|a)(a|a)(a|a)(a|a)(a|a)(a|a)(a|a)(a|a)(a|a)(a|a)b",
  "^(ab|ab)(ab|ab)(ab|ab)(ab|ab)(ab|ab)(ab|ab)c",
  "^.*.*.*b",
  "^.*a.*a.*a.*b",
  "^\\w*\\w*\\w*!",
  "^\\d*\\d*\\d*x",
  "^a*b?a*b?a*c",
  "^[^,]*,[^,]*,[^,]*,[^,]*,x",
  "^[^.]*\\.[^.]*\\.[^.]*\\.[^.]*\\.x",
  "^(?:a|b|ab)(?:a|b|ab)(?:a|b|ab)c",
  "(.*)(.*)(.*)(.*)(.*)x",
  "^a*(?:a)*a*x",
  "a*a*b$",
  "^(\\w+\\s?)*$",
  "^\\s*\\S*\\s*\\S*\\s*x",
];

// The worst texts: one character over and over, with and without a last character that breaks the match.
const texts = (length: number) =>
  ["a", "b", ".", "-", "0", " ", ",", "@", "ab"].flatMap((unit) => {
    const run = unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
    return [run, `${run.slice(0, -1)}!`, `${run.slice(0, -1)}c`];
  });

describe("p35 round two: the schema pattern guard", () => {
  test("every pattern it accepts is quick on the worst text of the longest length it allows", () => {
    const accepted = NASTY.filter((pattern) => patternProblem(pattern) === undefined);
    for (const pattern of accepted) {
      for (const text of texts(MAX_PATTERN_INPUT)) {
        const started = performance.now();
        validateJson({ type: "string", pattern }, text);
        const took = performance.now() - started;
        expect(took, `${pattern} on ${text.slice(0, 6)}...`).toBeLessThan(100);
      }
    }
  }, 120_000);

  test("the reviewer's patterns are refused, and so are ranges that chain", () => {
    for (const pattern of [
      "^a*a*a*b",
      "^a{1,4000}a{1,4000}a{1,4000}b",
      "^[a-z]*[a-z]*[a-z]*[0-9]$",
    ])
      expect(patternProblem(pattern), pattern).toBeDefined();
  });

  test("patterns people write for ordinary fields still run", () => {
    const fine: [string, string, string][] = [
      ["^[a-z0-9-]+$", "my-name-2", "My Name"],
      ["^[A-Z]{2}\\d{6}$", "AB123456", "ab123456"],
      ["^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "a@b.example", "a@b"],
      ["^\\d{4}-\\d{2}-\\d{2}$", "2026-11-26", "26-11-2026"],
      ["^S\\d{7}$", "S1002003", "S100"],
      [
        "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$",
        "0b8f6c3e-2a51-4d8e-9a6f-3c1e7d2b4a90",
        "nope",
      ],
      ["^[a-z]{2,5}-\\d+$", "ab-12", "ab-"],
      // What zod writes for z.iso.datetime(), which the example scripts use.
      [
        "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$",
        "2026-11-26T10:00:00Z",
        "2026-11-26",
      ],
      [
        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
        "2026-11-26T10:00:00.5Z",
        "2026-11-26",
      ],
    ];
    for (const [pattern, good, bad] of fine) {
      expect(patternProblem(pattern), pattern).toBeUndefined();
      expect(validateJson({ type: "string", pattern }, good), pattern).toEqual([]);
      expect(validateJson({ type: "string", pattern }, bad), pattern).not.toEqual([]);
    }
  });
});
