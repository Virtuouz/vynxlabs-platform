import { expect, test } from "vitest";
import { defineScript, z } from "./index.js";
import { memoryTable, runScript, testContext } from "./testing.js";

const charge = defineScript({
  path: "billing/charge",
  input: z.object({ customerId: z.string(), amount: z.number() }),
  output: z.object({ ok: z.boolean(), receipt: z.string() }),
  connections: ["shop"],
  secrets: ["api-key"],
  variables: ["billing/currency"],
  tables: ["charges"],
  events: ["billing/charged"],
  async run(input, ctx) {
    const shop = await ctx.connection<{ charge(id: string, amount: number): Promise<string> }>(
      "shop",
    );
    const key = await ctx.secret("api-key");
    const currency = await ctx.variable("billing/currency");
    ctx.log.info("Charging", { customer: input.customerId, currency });
    const receipt = await shop.charge(input.customerId, input.amount);
    await ctx.table("charges").insert({ customer: input.customerId, receipt, key });
    await ctx.events.publish("billing/charged", { customerId: input.customerId });
    await ctx.run.tag(`customer:${input.customerId}`);
    return { ok: true, receipt };
  },
});

test("a script runs against stand-ins, and what it did is told (CLI-MP5)", async () => {
  const charges = memoryTable<Record<string, unknown>>();
  const result = await runScript(
    charge,
    { customerId: "c1", amount: 5 },
    {
      connections: { shop: { charge: async (id: string, amount: number) => `r-${id}-${amount}` } },
      secrets: { "api-key": "k" },
      variables: { "billing/currency": "USD" },
      tables: { charges },
    },
  );
  expect(result.output).toEqual({ ok: true, receipt: "r-c1-5" });
  expect(result.logs).toEqual([
    { level: "info", message: "Charging", fields: { customer: "c1", currency: "USD" } },
  ]);
  expect(result.events).toEqual([{ event: "billing/charged", payload: { customerId: "c1" } }]);
  expect(result.tags).toEqual(["customer:c1"]);
  expect(charges.rows).toMatchObject([{ customer: "c1", receipt: "r-c1-5", key: "k" }]);
});

test("input and output are checked as the platform checks them", async () => {
  await expect(runScript(charge, { customerId: 1 }, {})).rejects.toThrow(
    "The script's input does not match its schema",
  );
});

test("what a script did not declare is refused, and what it did and was not given is said to be missing", async () => {
  const ctx = testContext({ secrets: { other: "x" } }, { secrets: ["api-key"] });
  await expect(ctx.secret("other")).rejects.toThrow(
    'The script did not declare the secret "other". Add it to the script\'s definition.',
  );
  await expect(ctx.secret("api-key")).rejects.toThrow(
    'The secret "api-key" has no stand-in in this test. Give one under secrets.',
  );
  await expect(runScript(charge, { customerId: "c", amount: 1 }, {})).rejects.toThrow(
    'The connection "shop" has no stand-in in this test',
  );
});

test("a group's members, files and a table of rows to start from work in memory", async () => {
  const ctx = testContext({
    groups: { shops: { acme: { client: { name: "acme" }, label: "Acme" } } },
    tables: { items: [{ name: "a" }, { name: "b" }] },
  });
  expect(await ctx.connections("shops").keys()).toEqual([{ key: "acme", label: "Acme" }]);
  expect(await ctx.connections("shops").get("acme")).toEqual({ name: "acme" });
  await expect(ctx.connections("shops").get("zed")).rejects.toThrow('has no member "zed"');
  const items = ctx.table("items");
  expect((await items.find()).map((row) => row.name)).toEqual(["a", "b"]);
  const saved = await ctx.files.put("a.txt", "hello", "text/plain");
  expect(new TextDecoder().decode((await ctx.files.get(saved.id)).content)).toBe("hello");
});
