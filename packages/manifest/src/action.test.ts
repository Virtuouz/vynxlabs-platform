import { Ajv } from "ajv";
import { describe, expect, test } from "vitest";
import { actionSchema, conditionsHold, conditionWords, widgetRulesSchema } from "./action.js";

const row = { status: "Unpaid", total: 5 };
const holds = (test: "is" | "is_not", value: unknown, record: Record<string, unknown> = row) =>
  conditionsHold([{ field: "status", test, value }], { this: record }, undefined);

describe("conditions that take several values", () => {
  test("`is` with an array is any of", () => {
    expect(holds("is", ["Unpaid", "Overdue"])).toBe(true);
    expect(holds("is", ["Paid", "Overdue"])).toBe(false);
    expect(holds("is", [])).toBe(false);
    expect(holds("is", ["Unpaid"], { status: null })).toBe(false);
  });

  test("`is_not` with an array is none of", () => {
    expect(holds("is_not", ["Paid", "Void"])).toBe(true);
    expect(holds("is_not", ["Paid", "Unpaid"])).toBe(false);
    expect(holds("is_not", ["Paid"], { status: "" })).toBe(true);
    expect(holds("is_not", [])).toBe(true);
  });

  test("a single value still works, and numbers compare as text", () => {
    expect(holds("is", "Unpaid")).toBe(true);
    expect(
      conditionsHold([{ field: "total", test: "is", value: [4, 5] }], { this: row }, undefined),
    ).toBe(true);
  });

  test("they read as a sentence, and the schema accepts them", () => {
    expect(conditionWords({ field: "status", test: "is", value: ["A", "B", "C"] })).toBe(
      "status is A, B or C",
    );
    const ajv = new Ajv({ strict: false });
    const rules = ajv.compile(widgetRulesSchema);
    expect(rules({ showWhen: [{ field: "status", test: "is", value: ["Unpaid", "Paid"] }] })).toBe(
      true,
    );
    const action = ajv.compile(actionSchema);
    expect(
      action({
        steps: [{ do: "close" }],
        when: [{ field: "status", test: "is_not", value: ["Paid"] }],
      }),
    ).toBe(true);
  });
});
