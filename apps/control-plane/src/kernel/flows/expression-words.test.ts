import {
  EXPRESSION_EXAMPLE_DATA,
  EXPRESSION_FUNCTIONS,
  EXPRESSION_NAMES,
  EXPRESSION_ROOTS,
  FLOW_STARTS,
  FLOW_STEPS,
  fileSchemas,
} from "@volvel/manifest";
import { afterAll, expect, test } from "vitest";
import { Expressions } from "./expressions.js";

const expressions = new Expressions();
afterAll(() => expressions.close());

// The reference's page of functions says what each does by running its example: a function that
// does not do what its page says fails here, and so does one the evaluator no longer has.
test("every function the reference lists gives what its example says", async () => {
  const data = {
    ...EXPRESSION_EXAMPLE_DATA,
    now: new Date(EXPRESSION_EXAMPLE_DATA.now),
  };
  const names = new Set<string>();
  for (const one of EXPRESSION_FUNCTIONS) {
    expect(names.has(one.name), `${one.name} is listed twice`).toBe(false);
    names.add(one.name);
    const value = await expressions.evaluate(one.example, data);
    expect({ name: one.name, value }).toEqual({ name: one.name, value: one.gives });
    expect(one.signature, one.name).toContain(one.name.split(".").at(-1) as string);
  }
});

test("the names an expression may read are the ones the evaluator is told, each with its words", () => {
  expect(EXPRESSION_ROOTS).toEqual(EXPRESSION_NAMES.map((one) => one.name));
  for (const one of EXPRESSION_NAMES) expect(one.description, one.name).toMatch(/\.$/);
});

/** The `type` values the forms of a union fix, at a path of the flow's schema. */
function formTypes(node: unknown): string[] {
  const forms = (node as { oneOf?: unknown[]; anyOf?: unknown[] }).oneOf ?? [];
  return forms.flatMap((form) => {
    const type = (form as { properties?: { type?: { const?: string } } }).properties?.type?.const;
    return type ? [type] : [];
  });
}

test("every kind of step and of start the flow's schema allows has its words, and no other has", () => {
  const body = fileSchemas().find((one) => one.kind === "flow")?.schema.properties.body as {
    properties: { nodes: { additionalProperties: unknown } };
  };
  const node = body.properties.nodes.additionalProperties as {
    oneOf: { properties: { trigger?: unknown } }[];
  };
  expect(formTypes(node).sort()).toEqual(Object.keys(FLOW_STEPS).sort());
  const trigger = node.oneOf.find((form) => form.properties.trigger)?.properties.trigger;
  expect(formTypes(trigger).sort()).toEqual(Object.keys(FLOW_STARTS).sort());
});
