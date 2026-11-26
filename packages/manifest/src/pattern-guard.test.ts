import { payloadProblem } from "@volvel/widgets/frame";
import { describe, expect, test } from "vitest";
import { checkBundleManifests } from "./bundle-check.js";
import { patternProblem, patternProblems } from "./pattern-guard.js";
import { jsonSchemaProblem, validateJson } from "./registry.js";

// Patterns that froze a backtracking engine: nested and adjacent repeats, forks that share a
// start, chains of optional atoms, ranges. Tenant schemas run patterns on RE2 (packages/widget-sdk/
// src/pattern.ts), in time that grows with the text only. The same list is in
// packages/widget-sdk/src/pattern.test.ts and apps/control-plane/src/kernel/flows/
// expressions-patterns.test.ts: one engine, three places.
const NASTY = [
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
const texts = (length: number) =>
  ["a", "b", ".", "-", "0", " ", ",", "@", "ab"].flatMap((unit) => {
    const run = unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
    return [run, `${run.slice(0, -1)}!`, `${run.slice(0, -1)}c`];
  });

// What zod writes for z.iso.datetime(), which the example scripts use, and for z.uuid().
const ISO_DATETIME =
  "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$";
const UUID =
  "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$";

describe("p35 round three: a tenant's schema patterns run on RE2", () => {
  test("every pattern that froze a backtracking engine finishes in under 100 ms on text of 100,000 characters", () => {
    for (const pattern of NASTY) {
      expect(patternProblem(pattern), pattern).toBeUndefined();
      for (const text of texts(100_000)) {
        const started = performance.now();
        validateJson({ type: "string", pattern }, text);
        const took = performance.now() - started;
        expect(took, `${pattern} on ${text.slice(0, 6)}...`).toBeLessThan(100);
      }
    }
  }, 120_000);

  test("a pattern is run in the schema of an object as it is on a bare string", () => {
    const schema = {
      type: "object",
      properties: { name: { type: "string", pattern: "^(a+)+$" } },
    };
    const started = performance.now();
    expect(validateJson(schema, { name: `${"a".repeat(26)}!` })).not.toEqual([]);
    expect(validateJson(schema, { name: "aaaa" })).toEqual([]);
    expect(performance.now() - started).toBeLessThan(100);
  });

  test("patterns a guard by shape refused, and patterns for ordinary fields, run", () => {
    const fine: [string, string, string][] = [
      ["^(ab)+$", "ababab", "aba"],
      ["^[a-z0-9-]+$", "my-name-2", "My Name"],
      ["^[A-Z]{2}\\d{6}$", "AB123456", "ab123456"],
      ["^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "a@b.example", "a@b"],
      ["^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\\.[a-zA-Z0-9-]+)+$", "a.b@c-d.example.org", "a@b"],
      ["^\\d{4}-\\d{2}-\\d{2}$", "2026-11-26", "26-11-2026"],
      ["^S\\d{7}$", "S1002003", "S100"],
      [UUID, "0b8f6c3e-2a51-4d8e-9a6f-3c1e7d2b4a90", "nope"],
      ["^[a-z]{2,5}-\\d+$", "ab-12", "ab-"],
      [ISO_DATETIME, "2026-11-26T10:00:00Z", "2026-11-26"],
      [
        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
        "2026-11-26T10:00:00.5Z",
        "2026-11-26",
      ],
      ["^(\\w+\\s?)*$", "one two three", "one two!"],
    ];
    for (const [pattern, good, bad] of fine) {
      expect(patternProblem(pattern), pattern).toBeUndefined();
      expect(validateJson({ type: "string", pattern }, good), pattern).toEqual([]);
      expect(validateJson({ type: "string", pattern }, bad), pattern).not.toEqual([]);
    }
  });

  test("a string up to 100,000 characters is run through a small pattern, and no more", () => {
    const schema = { type: "string", pattern: "^[a-z]+$" };
    expect(validateJson(schema, "a".repeat(100_000))).toEqual([]);
    const over = validateJson(schema, "a".repeat(100_001));
    expect(over).toHaveLength(1);
    expect(over[0]?.message).toMatch(/longer than 100000 characters, the most the pattern/);
  });

  test("a backreference and a lookahead are refused at upload and fail in a deployed bundle, with the same words", () => {
    for (const [pattern, construct] of [
      ["^(a)\\1$", "uses a reference back to a group"],
      ["^a(?=b)", "uses looking ahead"],
      ["(?<!a)b", "uses looking behind"],
    ] as const) {
      // At upload: the pointer, and what is wrong.
      const problems = patternProblems({ properties: { a: { type: "string", pattern } } }, "/body");
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(new RegExp(`^/body/properties/a/pattern ${construct}`));
      expect(problems[0]).toMatch(/patterns run on RE2/);
      expect(jsonSchemaProblem({ type: "string", pattern })).toMatch(/patterns run on RE2/);
      // In a bundle already deployed: the check fails with the words, it does not just never match.
      const issues = validateJson({ type: "string", pattern }, "ab");
      expect(issues).toHaveLength(1);
      expect(issues[0]?.message).toMatch(new RegExp(`${construct}`));
      expect(issues[0]?.message).toMatch(/patterns run on RE2/);
    }
    expect(patternProblems({ patternProperties: { "^(a)\\1$": {} } })).toHaveLength(1);
  });

  test("a script whose input schema holds a backreference is refused at upload, with the pointer and the words", () => {
    const script = (pattern: string) => ({
      kind: "script" as const,
      schemaVersion: 1,
      path: "jobs/nightly",
      ownership: "code" as const,
      body: {
        entry: "nightly",
        input: { type: "object", properties: { code: { type: "string", pattern } } },
        output: {},
        timeoutSeconds: 30,
        retries: { limit: 0, delaySeconds: 0, backoff: false },
        uses: { connections: [], secrets: [], variables: [] },
        worker: "clients-lan",
      },
    });
    const problems = checkBundleManifests([script("^(a)\\1$")]);
    expect(problems.join("\n")).toMatch(
      /jobs\/nightly \(script\): \/body\/input\/properties\/code\/pattern uses a reference back to a group.*patterns run on RE2/,
    );
    expect(checkBundleManifests([script("^(a+)+$")])).toEqual([]);
  });

  // The same value, the same schema, the server's check and the widget frame's: a table. The
  // frame keeps a guard by shape (RE2 would add about 180 KB to its bundle), so it refuses some
  // patterns the server runs; those are in `FRAME_REFUSES`, and for every other row the two
  // checks must give one answer.
  const TABLE: [string, string][] = [
    ["^[a-z0-9-]+$", "my-name-2"],
    ["^[a-z0-9-]+$", "My Name"],
    ["^[A-Z]{2}\\d{6}$", "AB123456"],
    ["^[A-Z]{2}\\d{6}$", "AB12345"],
    ["^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "a@b.example"],
    ["^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", "a b@c.d"],
    ["^\\d{4}-\\d{2}-\\d{2}$", "2026-11-26"],
    ["^\\d{4}-\\d{2}-\\d{2}$", "2026-1-26"],
    ["^S\\d{7}$", "S1002003"],
    ["^S\\d{7}$", "S100"],
    ["^[a-z]{2,5}-\\d+$", "ab-12"],
    ["^[a-z]{2,5}-\\d+$", "abcdef-12"],
    ["abc", "xxabcxx"],
    ["abc", "xxabxx"],
    ["^$", ""],
    ["^$", "a"],
    ["^.$", "\u{1F600}"],
    ["^\\p{L}+$", "éa"],
    ["^\\p{L}+$", "a1"],
    ["^\\u0041$", "A"],
    ["^\\u{1F600}$", "\u{1F600}"],
    ["\\d", "٣"],
    ["^\\w+$", "café"],
    ["^(?<y>\\d{4})-(?<m>\\d{2})$", "2026-11"],
    ["^[ab]+c?$", "abba"],
    ["^[ab]+c?$", "abbad"],
    ["^[^\\n]+$", "one line"],
    ["^[^\\n]+$", "two\nlines"],
    ["^a$", "a\n"],
    ["\\bword\\b", "a word here"],
    ["\\bword\\b", "swordfish"],
    ["^[\\s\\S]{1,5}$", "abc"],
  ];
  // Patterns the frame refuses by shape or reads differently; the server runs them.
  const FRAME_REFUSES: [string, string][] = [
    ["^(ab)+$", "abab"],
    ["^(a?){3}b$", "aab"],
    ["^([a-z]+-)*[a-z]+$", "one-two"],
    ["^a*a*a*b", "aab"],
    ["^(a|aa)+$", "aaa"],
  ];

  test("the server's check and the widget frame's check give the same answer for thirty patterns and values", () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(30);
    for (const [pattern, value] of TABLE) {
      const server = validateJson({ type: "string", pattern }, value).length === 0;
      const frame = payloadProblem({ type: "string", pattern }, value) === undefined;
      expect(frame, `${pattern} on ${JSON.stringify(value)}: the frame said ${frame}`).toBe(server);
    }
  });

  test("the patterns the frame refuses by shape, which the server runs", () => {
    for (const [pattern, value] of FRAME_REFUSES) {
      expect(validateJson({ type: "string", pattern }, value), pattern).toEqual([]);
      expect(payloadProblem({ type: "string", pattern }, value), pattern).toMatch(/the pattern/);
    }
  });
});
