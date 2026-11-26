// RT-13-2. Copy to packages/widget-sdk/src/ and run: pnpm --filter @volvel/widgets vitest run proof-2
// A pattern with NO repeated group, NO back reference and at most two `*`/`+`/`{n,}` passes
// patternProblem, yet backtracks as 2^n: `a?` chains are not counted. N = 24 keeps the vulnerable
// run to a second or two; at N = 40 the same shape does not return.
import { expect, test } from "vitest";
import { payloadProblem } from "./schema.js";

const N = 24;
const pattern = `^${"a?".repeat(N)}${"a".repeat(N)}$`; // 4N+2 chars, far under the 200 cap for N <= 49
const value = "a".repeat(N - 1); // one 'a' short, so the match fails after trying every split

test("RT-13-2 a pattern of optional atoms is refused, not run", () => {
  const start = performance.now();
  const problem = payloadProblem({ type: "string", pattern }, value);
  const ms = performance.now() - start;
  // Fixed instance: patternProblem refuses it at once. Vulnerable: ms is seconds and problem is "does not match its pattern".
  expect(problem).toMatch(/the pattern/);
  expect(ms).toBeLessThan(200);
});

test("RT-13-2 bounded repeats chained are refused, not run", () => {
  const chained = `^${"a{0,60}".repeat(5)}b$`; // no unbounded repeat, no group
  const start = performance.now();
  payloadProblem({ type: "string", pattern: chained }, "a".repeat(250));
  expect(performance.now() - start).toBeLessThan(200);
});

test("RT-13-2 optional and bounded groups, and nested repeats through them, are refused", () => {
  for (const pattern of [
    "^(a?){30}a{30}$",
    "^(a{1,5})+$",
    "^(a+)?$",
    "^(a{2,9})?b$",
    "^(?:a*)?c$",
  ]) {
    expect(payloadProblem({ type: "string", pattern }, "aaaa"), pattern).toMatch(/the pattern/);
  }
});

test("RT-13-2 ordinary patterns still run", () => {
  const ok = { type: "string", pattern: "^(\\+\\d{2} )?[A-Z]{2}-\\d{3,6}(?:x)?$" };
  expect(payloadProblem(ok, "+44 AB-1234")).toBeUndefined();
  expect(payloadProblem(ok, "nope")).toMatch(/does not match/);
});
