import { describe, expect, test } from "vitest";
import { patternProblems, schemaCostProblems } from "./pattern-guard.js";
import { compiledSchemaCount, jsonSchemaProblem, validateJson } from "./registry.js";

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
  test("round two: a uniqueItems on many objects, a schema of many properties and a huge value cost nothing", () => {
    const objects = Array.from({ length: 20_000 }, (_, i) => ({ i }));
    let started = performance.now();
    const refused = validateJson({ type: "array", uniqueItems: true }, objects);
    expect(performance.now() - started).toBeLessThan(100);
    expect(refused.length).toBeGreaterThan(0);

    const properties = Object.fromEntries(
      Array.from({ length: 20_000 }, (_, i) => [`p${i}`, { type: "string" }]),
    );
    started = performance.now();
    const big = validateJson({ type: "object", properties }, {});
    expect(performance.now() - started).toBeLessThan(100);
    expect(big.length).toBeGreaterThan(0);
    expect(jsonSchemaProblem({ type: "object", properties })).toMatch(/too large|too many/);

    started = performance.now();
    const many = validateJson(
      { type: "array", items: { anyOf: [{ type: "object" }, { type: "string" }] } },
      Array.from({ length: 300_000 }, () => ({})),
    );
    expect(performance.now() - started).toBeLessThan(100);
    expect(many.length).toBeGreaterThan(0);
  });

  test("round two: a schema that would be refused at run time is named at upload", () => {
    const body = { input: { type: "array", uniqueItems: true, items: { type: "object" } } };
    expect(schemaCostProblems(body, "/body")).toHaveLength(1);
    expect(
      schemaCostProblems({
        input: { type: "array", uniqueItems: true, items: { type: "string" } },
      }),
    ).toEqual([]);
    const properties = Object.fromEntries(
      Array.from({ length: 6000 }, (_, i) => [`p${i}`, { type: "string" }]),
    );
    expect(schemaCostProblems({ input: { type: "object", properties } })).toHaveLength(1);
  });

  test("round two: ordinary schemas and the platform's own are not held to the caps", () => {
    const schema = {
      type: "object",
      properties: { tags: { type: "array", uniqueItems: true, items: { type: "string" } } },
    };
    expect(validateJson(schema, { tags: ["a", "b"] })).toEqual([]);
    expect(validateJson(schema, { tags: ["a", "a"] }).length).toBeGreaterThan(0);
    const own = { type: "array", uniqueItems: true, items: { type: "object" } };
    expect(validateJson(own, [{ a: 1 }, { a: 2 }], "", true)).toEqual([]);
  });
});
