import { afterAll, describe, expect, test } from "vitest";
import { Expressions } from "./expressions.js";

const expressions = new Expressions({ timeoutMs: 5000 });
afterAll(() => expressions.close());

// The same list as packages/manifest/src/pattern-guard.test.ts and packages/widget-sdk/src/pattern.test.ts:
// the three places run patterns on one engine (RE2, @volvel/widgets/pattern).
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
  "^a{1,1000}a{1,1000}a{1,1000}b",
  "^a{1,1000}$",
  "(a+)+$",
  "(a|aa)+$",
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

describe("p35 round three: flow expressions run patterns on RE2", () => {
  test("every pattern that froze a backtracking engine finishes in under 100 ms on text of 100,000 characters", async () => {
    // Warm up the thread, so only the pattern is timed.
    await matches("^a$", "a");
    for (const pattern of NASTY) {
      for (const text of texts(100_000)) {
        const started = performance.now();
        const outcome = await matches(pattern, text);
        const took = performance.now() - started;
        expect(took, `${pattern} on ${text.slice(0, 6)}... (${outcome})`).toBeLessThan(100);
        // Only a large pattern is held to a shorter text, and says so.
        if (outcome !== "ran") expect(outcome).toMatch(/longer than \d+ characters/);
      }
    }
  }, 120_000);

  test("a text longer than the pattern is run on is refused with its limit, a shorter one runs", async () => {
    expect(await matches("^[a-z]+$", "a".repeat(100_001))).toBe(
      "The text is longer than 100000 characters, the most this pattern is run on.",
    );
    expect(await matches("^[a-z]+$", "a".repeat(100_000))).toBe("ran");
  });

  test("shapes that a guard by shape refused, and ordinary patterns, run", async () => {
    for (const [pattern, text] of [
      ["^(ab)+$", "ababab"],
      ["^[a-z0-9-]+$", "my-name-2"],
      ["^[A-Z]{2}\\d{6}$", "AB123456"],
      ["^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "a@b.example"],
      ["^\\d{4}-\\d{2}-\\d{2}$", "2026-11-26"],
    ] as const) {
      expect(await expressions.evaluate("text.matches(pattern)", { text, pattern })).toBe(true);
    }
    expect(
      await expressions.evaluate("text.matches(pattern)", { text: "aba", pattern: "^(ab)+$" }),
    ).toBe(false);
  });

  test("a backreference and a lookahead fail with the construct named, not silently", async () => {
    expect(await matches("^(a)\\1$", "aa")).toMatch(
      /^The pattern uses a reference back to a group \(\\1\).*patterns run on RE2/,
    );
    expect(await matches("^a(?=b)", "ab")).toMatch(/^The pattern uses looking ahead.*run on RE2/);
  });
});
