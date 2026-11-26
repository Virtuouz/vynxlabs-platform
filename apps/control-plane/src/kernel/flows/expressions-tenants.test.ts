// One tenant's slow expression must not fail another tenant's (RT-12-1).
import { afterAll, describe, expect, test } from "vitest";
import { ExpressionError, Expressions } from "./expressions.js";

const expressions = new Expressions({ timeoutMs: 100 });
afterAll(() => expressions.close());

// Nothing a pattern check could refuse: three nested loops over a list, which run past the limit.
const SLOW = "big.all(a, big.all(b, big.all(c, a + b + c >= 0.0)))";
const big = Array.from({ length: 200 }, (_, index) => index);
// The ReDoS pattern of the review.
const BOMB = "'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'.matches('^(a+)+$')";

const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ value }),
    (error: Error) => ({ error: error.message }),
  );

describe("one tenant's slow expressions and another tenant's", () => {
  test("a queue of slow expressions from one tenant does not fail another's plain one", async () => {
    await expressions.evaluate("1 + 1", {}, "warm");
    // The attacker's slow expressions wait ahead of the victim's, as many as one tenant may have.
    const slow = Array.from({ length: 200 }, () =>
      settle(expressions.evaluate(SLOW, { big }, "a")),
    );
    const started = Date.now();
    const victim = await settle(
      expressions.evaluate("trigger.n + 1.0", { trigger: { n: 1 } }, "b"),
    );
    // The victim waits for one of the attacker's turns, not for the whole line.
    expect(victim).toEqual({ value: 2 });
    expect(Date.now() - started).toBeLessThan(2000);
    const done = await Promise.all(slow);
    // Past the limit the slow ones are stopped, and each says so.
    expect(done.some((one) => "error" in one && /took longer/.test(one.error))).toBe(true);
  }, 120_000);

  test("one tenant may have only so many expressions waiting", async () => {
    const many = await Promise.all(
      Array.from({ length: 400 }, () => settle(expressions.evaluate("1 + 1", {}, "c"))),
    );
    const refused = many.filter((one) => "error" in one);
    expect(refused.length).toBeGreaterThan(0);
    expect(refused[0]).toMatchObject({ error: expect.stringMatching(/too many expressions/i) });
    expect(many.some((one) => "value" in one)).toBe(true);
  });

  test("a pattern that backtracks without end is refused at once, not run", async () => {
    const started = Date.now();
    const error = await expressions.evaluate(BOMB, {}, "d").catch((one: Error) => one);
    expect(error).toBeInstanceOf(ExpressionError);
    expect((error as Error).message).toMatch(/regular expression/);
    expect(Date.now() - started).toBeLessThan(90);
  });

  test("ordinary patterns still match", async () => {
    expect(await expressions.evaluate("'ab-12'.matches('^[a-z]{2}-\\\\d+$')", {}, "e")).toBe(true);
    expect(
      await expressions.evaluate("trigger.s.matches('^(a|b)c$')", { trigger: { s: "x" } }, "e"),
    ).toBe(false);
  });
});
