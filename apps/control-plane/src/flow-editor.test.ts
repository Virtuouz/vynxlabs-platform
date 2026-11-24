import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { expressionContext } from "./kernel/flows/context.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let other: string;
let alice: Client;
let reader: Client;

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;
const flow = {
  nodes: {
    start: {
      type: "trigger",
      trigger: {
        type: "manual",
        input: {
          type: "object",
          properties: { customer: { type: "string" }, items: { type: "array" } },
        },
      },
    },
    totals: {
      type: "set",
      values: { count: "size(trigger.items)", who: "trigger.customer" },
    },
    late: { type: "set", values: { broken: "steps.totals.output.nope" } },
  },
  edges: [
    { from: "start", to: "totals" },
    { from: "totals", to: "late" },
  ],
};

// biome-ignore lint/suspicious/noExplicitAny: run bodies are inspected freely
async function finished(id: string): Promise<any> {
  for (let i = 0; i < 150; i++) {
    const body = (await alice.get(`${ws()}/flow-runs/${id}`)).body;
    if (!["queued", "running"].includes(body.status)) return body;
    await sleep(100);
  }
  throw new Error("The flow run did not finish.");
}

const value = (query: Record<string, string>, as: Client = alice) =>
  as.get(`${ws()}/expressions/value?${new URLSearchParams(query)}`);

let testRun: string;

beforeAll(async () => {
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = async (email: string, role: string) => {
    const created = await t.admin.post(`/tenants/${tenant}/members`, {
      email,
      name: email,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: created.body.id,
      roleId: roles[role],
    });
    return t.signIn(email, PASSWORD);
  };
  alice = await member("alice@acme.example", "tenant_admin");
  reader = await member("rita@acme.example", "viewer");
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  other = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "other", name: "Other", type: "dev" })
  ).body.id;
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

describe("a draft flow tried from its editor", () => {
  test("runs from the saved draft, is marked as a draft run, and records each step", async () => {
    const saved = await alice.put(`${ws()}/drafts/orders/intake`, {
      kind: "flow",
      schemaVersion: 1,
      body: flow,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBeLessThan(300);
    // Nothing yet: a preview says how to get a value.
    expect((await value({ expression: "trigger.customer", flow: "orders/intake" })).body).toEqual({
      note: "Run a test to see its value.",
      flowRun: null,
    });

    const started = await alice.post(`${ws()}/test-runs`, {
      flow: "orders/intake",
      input: { customer: "ada", items: [{ sku: "a" }, { sku: "b" }] },
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    expect(started.body.kind).toBe("flow");
    testRun = started.body.runId;
    const run = await finished(testRun);
    expect(run.trigger).toMatchObject({ type: "manual", draft: true });
    expect(run.status).toBe("failed");
    const steps = Object.fromEntries(run.steps.map((step: { node: string }) => [step.node, step]));
    expect(steps.totals).toMatchObject({ status: "succeeded", output: { count: 2, who: "ada" } });
    expect(steps.late.status).toBe("failed");
    // Nothing was deployed.
    expect((await alice.get(`${ws()}/resources/orders/intake`)).status).toBe(404);
  });
});

describe("what an expression gives", () => {
  test("is worked out against a run's trigger and steps, as a step would see it", async () => {
    expect(
      (await value({ expression: "steps.totals.output.count * 10.0", flowRun: testRun })).body,
    ).toMatchObject({ value: 20, flowRun: { id: testRun, state: "failed" } });
    // Numbers from step outputs are doubles, here as in a run, and it says so.
    expect(
      (await value({ expression: "steps.totals.output.count * 10", flowRun: testRun })).body.error,
    ).toMatch(/doubles/);
    expect(
      (await value({ expression: "trigger.items[1].sku", flow: "orders/intake" })).body,
    ).toMatchObject({ value: "b", flowRun: { id: testRun } });
    // A failed step's error is there, as it is for an error path.
    expect(
      (await value({ expression: "steps.late.error.message", flowRun: testRun })).body.value,
    ).toMatch(/could not be evaluated/);
  });

  test("says what is wrong in the engine's own words", async () => {
    const missing = (await value({ expression: "steps.totals.output.nope", flowRun: testRun }))
      .body;
    expect(missing.error).toMatch(/nope/);
    // The same words the run failed with.
    const run = await finished(testRun);
    const late = run.steps.find((step: { node: string }) => step.node === "late");
    expect(late.error.message).toContain(missing.error);
    // One that does not parse is refused before anything is read.
    expect((await value({ expression: "trigger.(", flowRun: testRun })).body).toMatchObject({
      error: expect.any(String),
      flowRun: null,
    });
  });

  test("a foreach's expression sees its first item", async () => {
    expect(
      (
        await value({
          expression: "item.sku + '-' + string(index)",
          items: "trigger.items",
          flowRun: testRun,
        })
      ).body,
    ).toMatchObject({ value: "a-0", note: "For the first item." });
    expect(
      (await value({ expression: "item", items: "trigger.customer", flowRun: testRun })).body.note,
    ).toBe("Its items gave no list to take the first of.");
  });

  test("the context is the one the engine builds", async () => {
    const row = await t.db
      .selectFrom("flow_run")
      .select(["id", "trigger_node"])
      .where("id", "=", testRun)
      .executeTakeFirstOrThrow();
    const context = await expressionContext(t.db, row);
    expect(context.trigger).toEqual({ customer: "ada", items: [{ sku: "a" }, { sku: "b" }] });
    expect(context.steps).toMatchObject({
      start: { output: { customer: "ada" } },
      totals: { output: { count: 2, who: "ada" } },
      late: { error: { message: expect.any(String) } },
    });
    expect(context.now).toBeInstanceOf(Date);
  });

  test("shows what the run page shows: a masked field is masked before it is evaluated, so a test cannot guess it", async () => {
    await alice.put(`${ws()}/drafts/orders/secrets`, {
      kind: "flow",
      schemaVersion: 1,
      body: {
        nodes: {
          start: { type: "trigger", trigger: { type: "manual" } },
          keep: { type: "set", values: { accessToken: "trigger.apiKey", plain: "'ok'" } },
        },
        edges: [{ from: "start", to: "keep" }],
      },
    });
    const started = await alice.post(`${ws()}/test-runs`, {
      flow: "orders/secrets",
      input: { apiKey: "k-live-98765", password: "hunter22" },
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const run = started.body.runId as string;
    await finished(run);
    const ask = (expression: string) => value({ expression, flowRun: run }, reader);
    // A masked field is not computed on: the answer would be about the mask, not the value.
    const cannot = /cannot be previewed/;
    for (const expression of [
      "trigger.apiKey",
      "trigger.password",
      "size(trigger.apiKey)",
      "steps.keep.output.accessToken",
      "trigger.apiKey == 'k-live-98765'",
      "trigger.apiKey.startsWith('k-')",
    ]) {
      const answer = (await ask(expression)).body;
      expect(answer.value, expression).toBeUndefined();
      expect(answer.note, expression).toMatch(cannot);
    }
    expect((await ask("steps.keep.output.plain")).body.value).toBe("ok");
    // Reading the whole of it still shows what the run page shows.
    expect((await ask("trigger")).body.value).toEqual({
      apiKey: "[redacted]",
      password: "[redacted]",
    });
  });

  test("is for those who may read flow runs, in the run's own workspace", async () => {
    expect((await value({ expression: "1", flowRun: testRun }, reader)).status).toBe(200);
    // A run of another workspace is not there.
    expect(
      (
        await alice.get(
          `${ws(other)}/expressions/value?${new URLSearchParams({ expression: "1", flowRun: testRun })}`,
        )
      ).status,
    ).toBe(404);
    expect((await value({ expression: "1" })).status).toBe(400);
    expect((await t.anonymous.get(`${ws()}/expressions/value?expression=1&flow=x`)).status).toBe(
      401,
    );
  });
});
