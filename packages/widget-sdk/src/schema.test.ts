import { describe, expect, test } from "vitest";
import { payloadProblem } from "./schema.js";

const goal = {
  type: "object",
  properties: { record: { type: "string", minLength: 1 }, n: { type: "integer", maximum: 5 } },
  required: ["record"],
  additionalProperties: false,
};

describe("the payload check", () => {
  test("accepts what fits", () => {
    expect(payloadProblem(goal, { record: "a", n: 3 })).toBeUndefined();
  });
  test("says what does not fit", () => {
    expect(payloadProblem(goal, {})).toMatch(/lacks "record"/);
    expect(payloadProblem(goal, { record: 1 })).toMatch(/must be string/);
    expect(payloadProblem(goal, { record: "a", n: 9 })).toMatch(/over 5/);
    expect(payloadProblem(goal, { record: "a", extra: 1 })).toMatch(/does not declare/);
    expect(payloadProblem(goal, [])).toMatch(/must be object, not array/);
  });
  test("reads arrays, enums and alternatives", () => {
    expect(payloadProblem({ type: "array", items: { enum: ["a", "b"] } }, ["a", "c"])).toMatch(
      /one of the values/,
    );
    expect(payloadProblem({ anyOf: [{ type: "string" }, { type: "null" }] }, 3)).toMatch(/none/);
  });
  test("a schema it cannot read admits nothing", () => {
    expect(payloadProblem({ $ref: "#/x" }, {})).toMatch(/not read/);
  });
});

describe("p34-b4r a schema written by a tenant cannot hang the page that checks it", () => {
  const timed = (schema: object, value: unknown) => {
    const start = performance.now();
    const problem = payloadProblem(schema, value);
    return { problem, ms: performance.now() - start };
  };

  test("a pattern that backtracks without end is not run", () => {
    const { problem, ms } = timed({ type: "string", pattern: "^(a+)+$" }, `${"a".repeat(40)}!`);
    expect(problem).toBeDefined();
    expect(ms).toBeLessThan(200);
  });

  test("a long string is not matched against a pattern at all", () => {
    const { problem, ms } = timed(
      { type: "string", pattern: "^(a|aa)*$" },
      `${"a".repeat(60_000)}!`,
    );
    expect(problem).toBeDefined();
    expect(ms).toBeLessThan(200);
  });

  test("a plain pattern still matches", () => {
    expect(
      payloadProblem({ type: "string", pattern: "^[a-z]{2,5}-\\d+$" }, "abc-12"),
    ).toBeUndefined();
    expect(payloadProblem({ type: "string", pattern: "^[a-z]+$" }, "ABC")).toBeDefined();
  });
});

describe("p34-b4r names that are on every object", () => {
  test("a required name is the value's own, not one it inherits", () => {
    expect(payloadProblem({ type: "object", required: ["constructor"] }, {})).toBeDefined();
    expect(
      payloadProblem({ type: "object", required: ["toString"] }, JSON.parse("{}")),
    ).toBeDefined();
  });

  test("a property named __proto__ or constructor is checked against nothing it inherits", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" } },
      additionalProperties: false,
    };
    expect(payloadProblem(schema, JSON.parse('{"__proto__": {"a": 1}}'))).toBeDefined();
    expect(payloadProblem(schema, JSON.parse('{"constructor": "x"}'))).toBeDefined();
  });
});
