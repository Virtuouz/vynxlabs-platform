import { describe, expect, test } from "vitest";
import { patternProblems } from "./pattern-guard.js";
import { compiledSchemaCount, validateJson } from "./registry.js";

describe("p35 a tenant's JSON Schema is checked without harm to the other tenants", () => {
  test("a pattern that backtracks without end does not hold the thread", () => {
    const schema = { type: "object", properties: { name: { type: "string", pattern: "^(a+)+$" } } };
    const started = performance.now();
    validateJson(schema, { name: `${"a".repeat(26)}!` });
    expect(performance.now() - started).toBeLessThan(200);
  });

  test("a string too long for any pattern is not run through one", () => {
    const schema = { type: "string", pattern: "^[a-z]+$" };
    expect(validateJson(schema, "a".repeat(100))).toEqual([]);
    expect(validateJson(schema, "a".repeat(100_000)).length).toBeGreaterThan(0);
  });

  test("an unsafe pattern is named at upload, a plain one is not", () => {
    expect(patternProblems({ input: { properties: { a: { pattern: "^(a+)+$" } } } })).toHaveLength(
      1,
    );
    expect(patternProblems({ patternProperties: { "^(x*)*$": {} } })).toHaveLength(1);
    expect(
      patternProblems({
        properties: { a: { pattern: "^[a-z]{2,5}-\\d+$" }, pattern: { type: "string" } },
      }),
    ).toEqual([]);
  });

  test("two tenants' schemas with the same $id both work, every time", () => {
    const one = { $id: "https://tenant.example/input", type: "object", required: ["a"] };
    const other = { $id: "https://tenant.example/input", type: "object", required: ["b"] };
    for (let i = 0; i < 3; i++) {
      expect(validateJson(JSON.parse(JSON.stringify(one)), { a: 1 })).toEqual([]);
      expect(validateJson(JSON.parse(JSON.stringify(other)), { a: 1 })).not.toEqual([]);
      expect(validateJson(other, { b: 1 })).toEqual([]);
    }
  });

  test("starting many runs on the same schema, and on many schemas, keeps the compiled list bounded", () => {
    const text = JSON.stringify({ type: "object", required: ["x"] });
    for (let i = 0; i < 2000; i++) validateJson(JSON.parse(text), { x: i });
    const afterSame = compiledSchemaCount();
    for (let i = 0; i < 2000; i++) validateJson(JSON.parse(text), { x: i });
    expect(compiledSchemaCount()).toBe(afterSame);
    for (let i = 0; i < 300; i++)
      validateJson({ type: "object", required: [`k${i}`] }, { [`k${i}`]: 1 });
    expect(compiledSchemaCount()).toBeLessThanOrEqual(256);
  }, 30_000);
});
