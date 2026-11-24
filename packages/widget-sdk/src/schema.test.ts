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
