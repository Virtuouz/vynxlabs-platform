import { expect, test } from "vitest";
import { defineScript, z } from "./index.js";

test("a script limits its runs per customer with a key into its own input", () => {
  const charge = defineScript({
    path: "billing/charge",
    input: z.object({ customerId: z.string(), amount: z.number() }),
    output: z.object({ ok: z.boolean() }),
    concurrency: { key: "input.customerId", limit: 1 },
    run: async () => ({ ok: true }),
  });
  expect(charge.toManifest("charge").body).toMatchObject({
    concurrency: { key: "input.customerId", limit: 1 },
    input: { properties: { customerId: { type: "string" } } },
  });
  defineScript({
    path: "billing/refund",
    input: z.object({ customerId: z.string() }),
    output: z.object({}),
    // @ts-expect-error a key must name a field of the input
    concurrency: { key: "input.customer", limit: 1 },
    run: async () => ({}),
  });
});
