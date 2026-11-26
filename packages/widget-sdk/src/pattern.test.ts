import { describe, expect, test } from "vitest";
import {
  compilePattern,
  MAX_PATTERN_LENGTH,
  MAX_PATTERN_TEXT,
  matchPattern,
  patternProblem,
} from "./pattern.js";

// Patterns that froze a backtracking engine: nested and adjacent repeats, forks that share a start,
// chains of optional atoms, ranges. On RE2 each is run in time that grows with the text only.
// The same list is in packages/manifest/src/pattern-guard.test.ts and in
// apps/control-plane/src/kernel/flows/expressions-patterns.test.ts: one engine, three places.
export const NASTY = [
  "^(a+)+$",
  "(a+)+$",
  "^(a*)*$",
  "^(a|a)*$",
  "^(a|aa)+$",
  "(a|aa)+$",
  "^a*a*a*b",
  "^a*a*b",
  "^a*a*a*a*b",
  "^[a-z]*[a-z]*[a-z]*[0-9]$",
  "^a+a+a+a+$",
  "^a{1,1000}a{1,1000}a{1,1000}b",
  "^a{1,1000}$",
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
export const texts = (length: number) =>
  ["a", "b", ".", "-", "0", " ", ",", "@", "ab"].flatMap((unit) => {
    const run = unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
    return [run, `${run.slice(0, -1)}!`, `${run.slice(0, -1)}c`];
  });

describe("p35 round three: patterns run on RE2", () => {
  test("every pattern that froze a backtracking engine finishes in under 100 ms on text of 100,000 characters", () => {
    for (const pattern of NASTY) {
      for (const text of texts(100_000)) {
        const started = performance.now();
        const result = matchPattern(pattern, text);
        const took = performance.now() - started;
        expect(took, `${pattern} on ${text.slice(0, 6)}...`).toBeLessThan(100);
        // Not refused for being a bad pattern: only a large one is held to a shorter text.
        expect(compilePattern(pattern), pattern).toHaveProperty("pattern");
        if ("problem" in result) expect(result.problem).toMatch(/longer than/);
      }
    }
  }, 120_000);

  test("each pattern is also quick on the longest text it is run on", () => {
    for (const pattern of NASTY) {
      const compiled = compilePattern(pattern);
      if (!("pattern" in compiled)) throw new Error(pattern);
      for (const text of texts(compiled.pattern.maxText)) {
        const started = performance.now();
        compiled.pattern.test(text);
        expect(performance.now() - started, `${pattern} on ${text.slice(0, 6)}...`).toBeLessThan(
          100,
        );
      }
    }
  }, 120_000);

  test("a small pattern is run on the whole of 100,000 characters, a large one on fewer", () => {
    const small = compilePattern("^(a|aa)+$");
    const large = compilePattern("^a{1,1000}a{1,1000}a{1,1000}b");
    if (!("pattern" in small) || !("pattern" in large)) throw new Error("both compile");
    expect(small.pattern.maxText).toBe(MAX_PATTERN_TEXT);
    expect(large.pattern.maxText).toBeLessThan(1000);
    const long = matchPattern("^a{1,1000}a{1,1000}a{1,1000}b", "a".repeat(5000));
    expect(long).toEqual({
      problem: expect.stringMatching(/longer than \d+ characters, the most this pattern is run on/),
    });
  });

  test("shapes a guard by shape had to refuse now work", () => {
    const fine: [string, string, string][] = [
      ["^(ab)+$", "ababab", "aba"],
      ["^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "a@b.example", "a@b"],
      ["^([a-z]+-)*[a-z]+$", "one-two-three", "one--two"],
      ["^(?:\\.\\d+)?$", ".5", ".x"],
      ["^(a?){3}b$", "aab", "aaaab"],
      [
        "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$",
        "0b8f6c3e-2a51-4d8e-9a6f-3c1e7d2b4a90",
        "nope",
      ],
    ];
    for (const [pattern, good, bad] of fine) {
      expect(matchPattern(pattern, good), pattern).toEqual({ matches: true });
      expect(matchPattern(pattern, bad), pattern).toEqual({ matches: false });
    }
  });

  test("a reference back and looking ahead or behind are refused, naming the construct", () => {
    const refused: [string, RegExp][] = [
      ["^(a)\\1$", /reference back to a group \(\\1\)/],
      ["(?<x>a)\\k<x>", /reference back to a named group/],
      ["a(?=b)", /looking ahead/],
      ["a(?!b)", /looking ahead/],
      ["(?<=a)b", /looking behind/],
      ["(?<!a)b", /looking behind/],
    ];
    for (const [pattern, words] of refused) {
      const why = patternProblem(pattern);
      expect(why, pattern).toMatch(words);
      expect(why, pattern).toMatch(/patterns run on RE2/);
    }
    // In a class, or escaped, these are only characters.
    expect(patternProblem("[(?=1]")).toBeUndefined();
    expect(patternProblem("\\(?=a")).toBeUndefined();
  });

  test("a repeat over 1000 and a pattern past the limit are refused with the reason", () => {
    expect(patternProblem("a{1,4000}")).toMatch(/repeat count/);
    expect(patternProblem("a".repeat(MAX_PATTERN_LENGTH + 1))).toMatch(/longer than 10000/);
    expect(patternProblem("(")).toMatch(/not one RE2 can run/);
  });

  // The decisions about the dialect, one line each (they are written in pattern.ts too).
  test("the dialect: code points, ASCII classes, the six spaces, escapes of the browser", () => {
    const is = (pattern: string, text: string) => matchPattern(pattern, text);
    // The `u` flag: an emoji is one character.
    expect(is("^.$", "\u{1F600}")).toEqual({ matches: true });
    expect(is("^\\p{L}+$", "\u00e9a")).toEqual({ matches: true });
    expect(is("^\\p{Greek}$", "\u03b1")).toEqual({ matches: true });
    expect(patternProblem("\\p{Script=Greek}")).toMatch(/not one RE2 can run/);
    // \d and \w are ASCII, as in the browser.
    expect(is("\\d", "\u0663")).toEqual({ matches: false });
    expect(is("^\\w+$", "caf\u00e9")).toEqual({ matches: false });
    // \s is the six characters; a no-break space is not one.
    expect(is("^\\s$", " ")).toEqual({ matches: true });
    expect(is("^\\s$", "\u00a0")).toEqual({ matches: false });
    // \uXXXX, \u{X} and a pair of surrogates are the character they name.
    expect(is("^\\u0041$", "A")).toEqual({ matches: true });
    expect(is("^\\u{1F600}$", "\u{1F600}")).toEqual({ matches: true });
    expect(is("^\\uD83D\\uDE00$", "\u{1F600}")).toEqual({ matches: true });
    expect(is("^[\\u0041-\\u0043]+$", "ABC")).toEqual({ matches: true });
    // Named groups, both spellings. Anchors: `$` is the end of the text, not before a final newline.
    expect(is("^(?<year>\\d{4})$", "2026")).toEqual({ matches: true });
    expect(is("^(?P<year>\\d{4})$", "2026")).toEqual({ matches: true });
    expect(is("^a$", "a\n")).toEqual({ matches: false });
    // A pattern with no anchor is found anywhere in the text.
    expect(is("b+", "aabbcc")).toEqual({ matches: true });
  });
});
