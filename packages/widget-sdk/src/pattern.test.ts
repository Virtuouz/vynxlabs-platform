import { describe, expect, test } from "vitest";
import { patternProblem } from "./pattern.js";
import { payloadProblem } from "./schema.js";

// The same list as packages/manifest/src/pattern-guard.test.ts and
// apps/control-plane/src/kernel/flows/expressions-patterns.test.ts: the three guards are one
// function (this one), and the three tests must change with it.
const NASTY = [
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

// The most the frame's check runs a pattern on (`MAX_PATTERN_INPUT` in schema.ts).
const LONGEST = 256;

const texts = (length: number) =>
  ["a", "b", ".", "-", "0", " ", ",", "@", "ab"].flatMap((unit) => {
    const run = unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
    return [run, `${run.slice(0, -1)}!`, `${run.slice(0, -1)}c`];
  });

describe("p35 round two: the widget frame's pattern guard", () => {
  test("every pattern it accepts is quick on the worst text of the longest length it allows", () => {
    for (const pattern of NASTY) {
      for (const text of texts(LONGEST)) {
        const started = performance.now();
        payloadProblem({ type: "string", pattern }, text);
        expect(performance.now() - started, `${pattern} on ${text.slice(0, 6)}...`).toBeLessThan(
          100,
        );
      }
    }
  });

  test("chains of repeats over the same text are refused, a pair is not", () => {
    expect(patternProblem("^a*a*a*b")).toBeDefined();
    expect(patternProblem("^a{1,4000}a{1,4000}a{1,4000}b")).toBeDefined();
    expect(patternProblem("a*a*b$")).toBeDefined();
    expect(patternProblem("^a*a*b")).toBeUndefined();
    expect(patternProblem("^[a-z]+-[a-z]+-[a-z]+$")).toBeUndefined();
  });

  test("the harmless shapes still run", () => {
    for (const [pattern, text] of [
      ["^[a-z0-9-]+$", "my-name-2"],
      ["^[A-Z]{2}\\d{6}$", "AB123456"],
      ["^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "a@b.example"],
      ["^\\d{4}-\\d{2}-\\d{2}$", "2026-11-26"],
    ] as const) {
      expect(payloadProblem({ type: "string", pattern }, text), pattern).toBeUndefined();
    }
  });
});
