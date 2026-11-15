import { expect, test } from "vitest";
import type { BundleManifest } from "./bundle.js";
import { checkBundleManifests, keyMissing } from "./bundle-check.js";

const script = (concurrency: unknown, input: object = { type: "object" }): BundleManifest =>
  ({
    kind: "script",
    schemaVersion: 1,
    path: "billing/charge",
    ownership: "code",
    body: {
      entry: "charge",
      input,
      output: {},
      timeoutSeconds: 30,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      concurrency,
    },
  }) as BundleManifest;

const customer = {
  type: "object",
  properties: { customerId: { type: "string" }, order: { type: "object" } },
  required: ["customerId"],
  additionalProperties: false,
};

test("concurrency is a number, or a limit for each value of a key in the input", () => {
  expect(checkBundleManifests([script(4)])).toEqual([]);
  expect(checkBundleManifests([script({ key: "input.customerId", limit: 1 }, customer)])).toEqual(
    [],
  );
  expect(checkBundleManifests([script({ key: "input.order.id", limit: 2 }, customer)])).toEqual([]);
  // Not a path into the input, a limit out of range, or a field nobody asked for.
  for (const wrong of [
    { key: "customerId", limit: 1 },
    { key: "input", limit: 1 },
    { key: "input.a b", limit: 1 },
    { key: "input.customerId", limit: 0 },
    { key: "input.customerId", limit: 65 },
    { key: "input.customerId", limit: 1, by: "x" },
    { key: "input.customerId" },
  ]) {
    expect(
      checkBundleManifests([script(wrong, customer)]).length,
      JSON.stringify(wrong),
    ).toBeGreaterThan(0);
  }
});

test("a key naming a field the input does not list is refused at deploy", () => {
  expect(checkBundleManifests([script({ key: "input.customerID", limit: 1 }, customer)])).toEqual([
    "billing/charge (script): /body/concurrency/key reads input.customerID, which the script's input does not have.",
  ]);
  // A schema that lists no fields, or takes more, is taken at its word.
  expect(keyMissing({ type: "object" }, "input.anything")).toBeUndefined();
  expect(
    keyMissing({ type: "object", properties: {}, additionalProperties: true }, "input.x"),
  ).toBeUndefined();
  expect(keyMissing(customer, "input.order.id")).toBeUndefined();
  expect(keyMissing(customer, "input.nope.id")).toBe("input.nope");
});
