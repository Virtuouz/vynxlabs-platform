import { afterAll, describe, expect, test } from "vitest";
import { EXPRESSION_PATTERN_INPUT, Expressions } from "./expressions.js";

const expressions = new Expressions({ timeoutMs: 5000 });
afterAll(() => expressions.close());

// The same list as packages/manifest/src/pattern-guard.test.ts and packages/widget-sdk/src/pattern.test.ts:
// the three guards are one function, and the three tests must change with it.
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

const texts = (length: number) =>
  ["a", "b", ".", "-", "0", " ", ",", "@", "ab"].flatMap((unit) => {
    const run = unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
    return [run, `${run.slice(0, -1)}!`, `${run.slice(0, -1)}c`];
  });

const matches = (pattern: string, text: string) =>
  expressions.evaluate("text.matches(pattern)", { text, pattern }).then(
    () => "ran",
    (error: Error) => error.message,
  );

describe("p35 round two: the pattern guard of flow expressions", () => {
  test("every pattern it runs is quick on the worst text of the longest length it allows", async () => {
    // Warm up the thread, so only the pattern is timed.
    await matches("^a$", "a");
    for (const pattern of NASTY) {
      for (const text of texts(EXPRESSION_PATTERN_INPUT)) {
        const started = performance.now();
        const outcome = await matches(pattern, text);
        const took = performance.now() - started;
        // A pattern that is refused answers at once; one that runs must be quick.
        expect(took, `${pattern} on ${text.slice(0, 6)}... (${outcome})`).toBeLessThan(100);
      }
    }
  }, 120_000);

  test("a text longer than the limit is not run through a pattern", async () => {
    expect(await matches("^[a-z]+$", "a".repeat(EXPRESSION_PATTERN_INPUT + 1))).not.toBe("ran");
    expect(await matches("^[a-z]+$", "a".repeat(100))).toBe("ran");
  });

  test("the harmless shapes still run", async () => {
    for (const [pattern, text] of [
      ["^[a-z0-9-]+$", "my-name-2"],
      ["^[A-Z]{2}\\d{6}$", "AB123456"],
      ["^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "a@b.example"],
      ["^\\d{4}-\\d{2}-\\d{2}$", "2026-11-26"],
    ] as const) {
      expect(await expressions.evaluate("text.matches(pattern)", { text, pattern })).toBe(true);
    }
  });
});
