import { describe, expect, test } from "vitest";
import { renderTypes, schemaToType, typeName } from "./json-schema-ts.js";

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

describe("a JSON Schema as a TypeScript type", () => {
  test("scalars, enums and const", () => {
    expect(schemaToType({ type: "string", maxLength: 3 })).toBe("string");
    expect(schemaToType({ type: "integer" })).toBe("number");
    expect(schemaToType({ enum: ["a", "b"] })).toBe('"a" | "b"');
    expect(schemaToType({ const: 1 })).toBe("1");
    expect(schemaToType({ type: ["string", "null"] })).toBe("string | null");
  });

  test("objects: required fields, optional fields, descriptions", () => {
    const type = schemaToType({
      type: "object",
      properties: { a: { type: "string", description: "The a." }, "b-c": { type: "boolean" } },
      required: ["a"],
      additionalProperties: false,
    });
    expect(squash(type)).toBe('{ /** The a. */ a: string; "b-c"?: boolean; }');
  });

  test("a map, an open object and arrays", () => {
    expect(schemaToType({ type: "object", additionalProperties: { type: "number" } })).toContain(
      "[name: string]: number;",
    );
    expect(schemaToType({ type: "object" })).toBe("Record<string, unknown>");
    expect(schemaToType({ type: "array", items: { enum: ["a", "b"] } })).toBe('("a" | "b")[]');
    expect(schemaToType({ type: "array" })).toBe("unknown[]");
  });

  test("oneOf is a union; branches that only say what is required add nothing", () => {
    expect(schemaToType({ oneOf: [{ type: "string" }, { type: "number" }] })).toBe(
      "string | number",
    );
    const type = schemaToType({
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      oneOf: [{ required: ["a"] }, { required: ["b"] }],
    });
    expect(squash(type)).toBe("{ a?: string; b?: string; }");
  });

  test("a $ref within the file is followed; one outside it is refused", () => {
    const root = { $defs: { Id: { type: "string" } }, type: "object" } as const;
    expect(schemaToType({ $ref: "#/$defs/Id" }, root)).toBe("string");
    expect(() => schemaToType({ $ref: "other.json#/x" })).toThrow(/\$ref/);
  });

  test("a type it cannot draw is said, not guessed", () => {
    expect(() => schemaToType({ type: "date" })).toThrow(/date/);
  });

  test("a kind's name as a type's name, and the file", () => {
    expect(typeName("trigger_source")).toBe("TriggerSource");
    const file = renderTypes([{ kind: "event", version: 1, body: { type: "string" } }], "x");
    expect(file).toContain("export type EventBody = string;");
    expect(file).toContain("a event".replace("a ", "an "));
  });
});
