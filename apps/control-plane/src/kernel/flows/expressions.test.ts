import { afterAll, describe, expect, test } from "vitest";
import { ExpressionError, Expressions } from "./expressions.js";

const expressions = new Expressions();
afterAll(() => expressions.close());

const data = {
  trigger: {
    order: {
      id: "1001",
      total: 1250.5,
      currency: "EUR",
      lines: [
        { sku: "A", qty: 2, price: 100 },
        { sku: "B", qty: 1, price: 1050.5 },
      ],
    },
  },
  steps: {
    check: { output: { valid: true, customer: { id: "c9", tier: "gold" } } },
    stock: { output: { available: ["A"], missing: ["B"] } },
  },
};
const evaluate = (expression: string, over: Record<string, unknown> = data) =>
  expressions.evaluate(expression, over);
const failure = (expression: string, over: Record<string, unknown> = data) =>
  evaluate(expression, over).then(
    () => "no error",
    (error) => {
      expect(error).toBeInstanceOf(ExpressionError);
      return (error as Error).message;
    },
  );

describe("wiring data between steps", () => {
  test("picks fields, tests conditions, builds objects and works on lists", async () => {
    expect(await evaluate("steps.check.output.customer.tier")).toBe("gold");
    expect(
      await evaluate(
        "trigger.order.total > 1000 && steps.check.output.customer.tier != 'platinum'",
      ),
    ).toBe(true);
    expect(
      await evaluate(
        "{'orderId': trigger.order.id, 'customer': steps.check.output.customer.id, 'needsApproval': trigger.order.total > 1000}",
      ),
    ).toEqual({ orderId: "1001", customer: "c9", needsApproval: true });
    expect(
      await evaluate(
        "trigger.order.lines.filter(l, l.sku in steps.stock.output.available).map(l, l.sku)",
      ),
    ).toEqual(["A"]);
    expect(
      await evaluate("'Order ' + trigger.order.id + ' (' + trigger.order.currency + ')'"),
    ).toBe("Order 1001 (EUR)");
    expect(await evaluate("size(trigger.order.lines)")).toBe(2);
    expect(await evaluate("trigger.order.lines.map(l, l.qty * l.price)")).toEqual([200, 1050.5]);
  });

  test("results come back as plain JSON values", async () => {
    expect(await evaluate("int(trigger.order.lines[0].qty) + 1")).toBe(3);
    expect(await evaluate("{'nested': {'list': [1, 2.5, 'x', true, null]}}")).toEqual({
      nested: { list: [1, 2.5, "x", true, null] },
    });
  });

  test("an optional field is asked for explicitly", async () => {
    expect(
      await evaluate(
        "has(steps.check.output.customer.phone) ? steps.check.output.customer.phone : 'none'",
      ),
    ).toBe("none");
  });

  test("a mistake is an error that says what is wrong", async () => {
    expect(await failure("steps.check.output.customer.phone")).toBe("No such key: phone");
    expect(await failure("steps.ship.output.id")).toBe("No such key: ship");
    expect(await failure("trigger.order.total >")).toMatch(/Unexpected token/);
    expect(await failure("trigger.order.lines[0].qty + 1")).toMatch(
      /Numbers from step outputs are doubles: write 1\.0 instead of 1/,
    );
    await expect(expressions.check("trigger.order.total > 1000")).resolves.toBeUndefined();
    await expect(expressions.check("trigger.order.total >")).rejects.toBeInstanceOf(
      ExpressionError,
    );
  });
});

describe("containment", () => {
  test("nothing outside the data can be reached", async () => {
    for (const expression of [
      "process",
      "globalThis",
      "require",
      "trigger.constructor",
      "trigger.__proto__",
      "''.constructor",
    ]) {
      expect(await failure(expression), expression).not.toBe("no error");
    }
  });

  const big = { n: Array.from({ length: 3000 }, (_, index) => index) };

  test("an expression that would run for minutes is stopped, and the next one works", async () => {
    const started = Date.now();
    expect(await failure("n.all(a, n.all(b, n.all(c, a + b + c >= 0.0)))", big)).toBe(
      "The expression took longer than 250 ms and was stopped.",
    );
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await evaluate("size(n)", big)).toBe(3000);
  });

  test("an expression that would exhaust memory is stopped, and the next one works", async () => {
    const roomy = new Expressions({ timeoutMs: 10_000, memoryMb: 32 });
    try {
      const message = await roomy
        .evaluate("n.map(a, n.map(b, n.map(c, [a, b, c]))).size()", big)
        .then(
          () => "no error",
          (error) => (error as Error).message,
        );
      expect(message).toBe("The expression used too much memory and was stopped.");
      expect(await roomy.evaluate("size(n)", big)).toBe(3000);
    } finally {
      await roomy.close();
    }
  }, 30_000);

  test("oversized expressions are refused before they run", async () => {
    expect(await failure(`${"(".repeat(500)}1${")".repeat(500)}`)).toMatch(/maxDepth/);
    expect(await failure(`[${Array.from({ length: 5000 }, () => "1").join(",")}].size()`)).toMatch(
      /maxListElements/,
    );
  });

  test("evaluations that overlap do not mix up their answers", async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, index) => evaluate("x * 2.0", { x: index })),
    );
    expect(results).toEqual(Array.from({ length: 200 }, (_, index) => index * 2));
  });
});
