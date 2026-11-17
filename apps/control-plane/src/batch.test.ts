import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * Batch actions (phase 15, P3-3): each item is done by its single action's
 * own route, as the caller, so it is checked and audited as it would be alone,
 * and the answer says what happened to each.
 */

const PASSWORD = "a-good-long-password";
let t: TestApp;
let tenant: string;
let dev: string;
let viewer: Client;
const ws = () => `/tenants/${tenant}/workspaces/${dev}`;

const script = (code: string) => ({
  kind: "script",
  schemaVersion: 1,
  body: {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});
const approving = {
  kind: "flow",
  schemaVersion: 1,
  body: {
    nodes: {
      start: { type: "trigger", trigger: { type: "manual" } },
      ask: { type: "approval", title: "Go ahead?" },
      done: { type: "set", values: { done: "true" } },
    },
    edges: [
      { from: "start", to: "ask" },
      { from: "ask", to: "done" },
    ],
  },
};

const actions = async (action: string) =>
  (
    await t.db
      .selectFrom("audit_entry")
      .select("target_id")
      .where("action", "=", action)
      .where("tenant_id", "=", tenant)
      .execute()
  ).map((row) => row.target_id);

beforeAll(async () => {
  t = await startTestApp();
  tenant = (await t.admin.post("/tenants", { slug: "batch", name: "Batch", addCreator: true })).body
    .id;
  dev = (
    await t.admin.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  const viewerRole = (
    await t.db
      .selectFrom("role")
      .select("id")
      .where("name", "=", "viewer")
      .executeTakeFirstOrThrow()
  ).id;
  const made = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "vic@batch.example",
    name: "Vic",
    password: PASSWORD,
    bindings: [{ roleId: viewerRole }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  viewer = await t.signIn("vic@batch.example", PASSWORD);
  await t.admin.put(
    `${ws()}/drafts/hello/greet`,
    script("export default async () => ({ hi: 1 });\n"),
  );
  await t.admin.put(`${ws()}/drafts/orders/approve`, approving);
  expect((await t.admin.post(`${ws()}/changes/deploy`, {})).status).toBeLessThan(300);
});
afterAll(async () => {
  await t?.stop();
});

describe("runs", () => {
  let runs: string[];

  test("many are canceled at once, each audited as if canceled alone, and one not found says so", async () => {
    runs = [];
    for (let i = 0; i < 3; i++) {
      const started = await t.admin.post(`${ws()}/runs`, { script: "hello/greet", input: {} });
      expect(started.status, JSON.stringify(started.body)).toBe(201);
      runs.push(started.body.id);
    }
    const missing = "01a1e7f7-0000-7000-8000-000000000999";
    const answer = await t.admin.post(`${ws()}/runs/batch`, {
      action: "cancel",
      ids: [...runs, missing],
    });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body).toMatchObject({ done: 3, failed: 1 });
    expect(answer.body.results.at(-1)).toMatchObject({ id: missing, ok: false, status: 404 });
    expect(answer.body.results.at(-1).detail).toBeTruthy();
    expect((await actions("run.cancelled")).sort()).toEqual([...runs].sort());
    for (const id of runs) {
      expect((await t.admin.get(`${ws()}/runs/${id}`)).body.state).toBe("canceled");
    }
  });

  test("many are run again, and each answer names the run it started", async () => {
    const answer = await t.admin.post(`${ws()}/runs/batch`, {
      action: "rerun",
      ids: runs.slice(0, 2),
    });
    expect(answer.body, JSON.stringify(answer.body)).toMatchObject({ done: 2, failed: 0 });
    for (const result of answer.body.results) {
      expect(result.runId).toMatch(/^[0-9a-f-]{36}$/);
      expect((await t.admin.get(`${ws()}/runs/${result.runId}`)).body.rerunOf).toBe(result.id);
    }
  });

  test("a batch can do nothing its caller could not do one at a time", async () => {
    const started = await t.admin.post(`${ws()}/runs`, { script: "hello/greet", input: {} });
    const answer = await viewer.post(`${ws()}/runs/batch`, {
      action: "cancel",
      ids: [started.body.id],
    });
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ done: 0, failed: 1 });
    expect(answer.body.results[0].status).toBeGreaterThanOrEqual(403);
    expect((await t.admin.get(`${ws()}/runs/${started.body.id}`)).body.state).not.toBe("canceled");
  });

  test("more than a hundred is refused whole", async () => {
    const ids = Array.from(
      { length: 101 },
      (_, i) => `01a1e7f7-0000-7000-8000-${String(i).padStart(12, "0")}`,
    );
    expect((await t.admin.post(`${ws()}/runs/batch`, { action: "cancel", ids })).status).toBe(400);
  });
});

describe("approvals, triggers and drafts", () => {
  test("many waiting approvals are decided with one comment, across the tenant", async () => {
    const started: string[] = [];
    for (let i = 0; i < 2; i++) {
      started.push(
        (await t.admin.post(`${ws()}/flow-runs`, { flow: "orders/approve", input: {} })).body.id,
      );
    }
    for (const id of started) {
      for (let i = 0; i < 150; i++) {
        if ((await t.admin.get(`${ws()}/flow-runs/${id}`)).body.state === "waiting_approval") break;
        await sleep(50);
      }
    }
    const answer = await t.admin.post(`/tenants/${tenant}/approvals/batch`, {
      decision: "approve",
      comment: "Both checked",
      approvals: started.map((flowRunId) => ({ workspaceId: dev, flowRunId, node: "ask" })),
    });
    expect(answer.body, JSON.stringify(answer.body)).toMatchObject({ done: 2, failed: 0 });
    for (const id of started) {
      for (let i = 0; i < 150; i++) {
        if ((await t.admin.get(`${ws()}/flow-runs/${id}`)).body.state === "succeeded") break;
        await sleep(50);
      }
      expect((await t.admin.get(`${ws()}/flow-runs/${id}`)).body.state).toBe("succeeded");
    }
  });

  test("many drafts are discarded, and one that is not a draft says so", async () => {
    await t.admin.put(`${ws()}/drafts/scratch/one`, script("export default async () => 1;\n"));
    await t.admin.put(`${ws()}/drafts/scratch/two`, script("export default async () => 2;\n"));
    const answer = await t.admin.post(`${ws()}/drafts/batch-discard`, {
      paths: ["scratch/one", "scratch/two", "scratch/none"],
    });
    expect(answer.body, JSON.stringify(answer.body)).toMatchObject({ done: 2, failed: 1 });
    expect(answer.body.results[2]).toMatchObject({ id: "scratch/none", ok: false, status: 404 });
  });

  test("many triggers are paused with one reason, and resumed", async () => {
    await t.admin.put(`${ws()}/drafts/nightly/one`, {
      kind: "schedule",
      schemaVersion: 1,
      body: { cron: "0 3 * * *", timezone: "UTC", script: "hello/greet", input: {} },
    });
    const deployed = await t.admin.post(`${ws()}/changes/deploy`, {});
    expect(deployed.status, JSON.stringify(deployed.body)).toBeLessThan(300);
    const paused = await t.admin.post(`${ws()}/trigger-pauses/batch`, {
      paused: true,
      reason: "Quiet hours",
      triggers: [{ path: "nightly/one" }],
    });
    expect(paused.body, JSON.stringify(paused.body)).toMatchObject({ done: 1, failed: 0 });
    const triggers = (await t.admin.get(`${ws()}/triggers`)).body.items;
    expect(
      triggers.find((one: { path: string }) => one.path === "nightly/one").paused,
    ).toMatchObject({
      reason: "Quiet hours",
    });
    const resumed = await t.admin.post(`${ws()}/trigger-pauses/batch`, {
      paused: false,
      triggers: [{ path: "nightly/one" }],
    });
    expect(resumed.body).toMatchObject({ done: 1 });
  });
});
