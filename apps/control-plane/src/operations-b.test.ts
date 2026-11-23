import { sql } from "@volvel/db";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { sendAlerts } from "./kernel/execution/alerts.js";
import { diagnose } from "./kernel/execution/diagnose.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

// Phase 29, lane opsb: what the operate screens say and do about pauses, approvals, attempts.

const PASSWORD = "a-good-long-password";
// biome-ignore lint/suspicious/noExplicitAny: response bodies are read by their shape
type Any = any;

let t: TestApp;
let tenant: string;
let workspace: string;
let alice: Client;
let robot: Client;

const ws = () => `/tenants/${tenant}/workspaces/${workspace}`;
const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
const sync = (timeoutSeconds: number, connections: string[]) =>
  manifest("script", "orders/sync", {
    entry: "sync",
    input: {},
    output: {},
    timeoutSeconds,
    retries: { limit: 2, delaySeconds: 1, backoff: false },
    uses: { connections, secrets: [], variables: [] },
  });

function bundle(syncScript = sync(30, ["erp"])): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      syncScript,
      manifest("connection", "erp", { connector: "http" }),
      manifest("script", "orders/own", {
        entry: "sync",
        input: {},
        output: {},
        timeoutSeconds: 30,
        retries: { limit: 0, delaySeconds: 0, backoff: false },
        uses: { connections: [], secrets: [], variables: [] },
        onFailure: { notify: "erp" },
      }),
      manifest("event", "orders/placed", { payload: { type: "object" } }),
      manifest("trigger", "orders/on-a", {
        type: "event",
        event: "orders/placed",
        script: "orders/sync",
      }),
      manifest("trigger", "orders/on-b", {
        type: "event",
        event: "orders/placed",
        script: "orders/sync",
      }),
      manifest("trigger", "orders/on-off", {
        type: "event",
        event: "orders/placed",
        script: "orders/sync",
        enabled: false,
      }),
      manifest("schedule", "orders/nightly", {
        script: "orders/sync",
        cron: "0 3 * * *",
        input: {},
      }),
      manifest("flow", "orders/gate", {
        nodes: {
          start: { type: "trigger", trigger: { type: "manual" } },
          gate: { type: "approval", title: "Approve it" },
          done: { type: "set", values: { ok: "true" } },
        },
        edges: [
          { from: "start", to: "gate" },
          { from: "gate", to: "done" },
        ],
      }),
    ],
    code: "export const sync = { execute: async () => ({}) };\n",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

async function deploy(content: Bundle) {
  const uploaded = await alice.post(`${ws()}/bundles`, content);
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
  const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const listed = async (path: string) =>
  ((await alice.get(`${ws()}/triggers`)).body.items as Any[]).find((one) => one.path === path);

beforeAll(async () => {
  t = await startTestApp();
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const roleId = "00000000-0000-7000-8000-000000000002";
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId,
  });
  const member = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "alice@acme.example",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  workspace = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "orders",
      name: "Orders",
      type: "dev",
      triggersPaused: false,
    })
  ).body.id;
  await alice.put(`${ws()}/connection-bindings/erp`, {
    config: { baseUrl: "https://erp.example.test" },
  });
  await deploy(bundle());
  const account = await alice.post(`/tenants/${tenant}/service-accounts`, { name: "Robot" });
  expect(account.status, JSON.stringify(account.body)).toBe(201);
  await alice.post(`/tenants/${tenant}/bindings`, {
    principalType: "service_account",
    principalId: account.body.id,
    roleId,
  });
  const key = await alice.post(`/tenants/${tenant}/service-accounts/${account.body.id}/api-keys`, {
    name: "robot",
  });
  robot = t.withKey(key.body.token);
}, 60_000);
afterAll(() => t?.stop());

describe("what holds a trigger, and what listens", () => {
  test("an event counts only the triggers that would start something (OPS-23)", async () => {
    await alice.post(`${ws()}/events`, { name: "orders/placed", payload: {} });
    const event = () => alice.get(`${ws()}/events`).then((answer) => answer.body.items[0] as Any);
    // Two are on, and one is turned off: it is not listening.
    expect(await event()).toMatchObject({ listeners: 2, pausedListeners: 0 });
    expect((await alice.put(`${ws()}/trigger-pauses/orders/on-a`, {})).status).toBe(204);
    expect(await event()).toMatchObject({ listeners: 1, pausedListeners: 1 });
    expect((await listed("orders/on-a")).pausedBy).toBe("trigger");
    expect(
      (await alice.patch(`/tenants/${tenant}/workspaces/${workspace}`, { triggersPaused: true }))
        .status,
    ).toBe(200);
    expect(await event()).toMatchObject({ listeners: 0, pausedListeners: 2 });
    // The page of a script or a flow reads this: the workspace's pause is on every row.
    expect((await listed("orders/on-b")).pausedBy).toBe("workspace");
    expect((await listed("orders/nightly")).pausedBy).toBe("workspace");
    expect(
      (await alice.patch(`/tenants/${tenant}/workspaces/${workspace}`, { triggersPaused: false }))
        .status,
    ).toBe(200);
    expect((await listed("orders/on-b")).pausedBy).toBeNull();
    expect((await alice.delete(`${ws()}/trigger-pauses/orders/on-a`)).status).toBe(204);
  });

  test("a schedule that is off may be fired to try it, and one that is paused may not (D31)", async () => {
    await t.db
      .updateTable("trigger_state")
      .set({ enabled: false })
      .where("type", "=", "schedule")
      .execute();
    const off = await alice.post(`${ws()}/schedule-firings`, { path: "orders/nightly" });
    expect(off.status, JSON.stringify(off.body)).toBe(201);
    await t.db
      .updateTable("trigger_state")
      .set({ enabled: true })
      .where("type", "=", "schedule")
      .execute();
    expect((await alice.put(`${ws()}/trigger-pauses/orders/nightly`, {})).status).toBe(204);
    const paused = await alice.post(`${ws()}/schedule-firings`, { path: "orders/nightly" });
    expect(paused.status).toBe(409);
    expect(paused.body.detail).toContain("paused");
    expect((await alice.delete(`${ws()}/trigger-pauses/orders/nightly`)).status).toBe(204);
    await alice.patch(`/tenants/${tenant}/workspaces/${workspace}`, { triggersPaused: true });
    const held = await alice.post(`${ws()}/schedule-firings`, { path: "orders/nightly" });
    expect(held.status).toBe(409);
    await alice.patch(`/tenants/${tenant}/workspaces/${workspace}`, { triggersPaused: false });
  });
});

describe("approvals", () => {
  const waitingRun = async () => {
    const started = await alice.post(`${ws()}/flow-runs`, { flow: "orders/gate", input: {} });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const id = started.body.id ?? started.body.flowRunId;
    await until(
      async () => (await alice.get(`${ws()}/approvals`)).body.items as Any[],
      (items) => items.some((one) => one.flowRunId === id),
    );
    return id as string;
  };
  const decide = (who: Client, id: string, body: Record<string, unknown>) =>
    who.post(`${ws()}/flow-runs/${id}/approvals/gate`, body);

  test("every route asks why a rejection is made, and says so the same way (OPS-27, D30)", async () => {
    const id = await waitingRun();
    const bare = await decide(alice, id, { decision: "reject" });
    expect(bare.status, JSON.stringify(bare.body)).toBe(400);
    expect(bare.body.detail).toContain("Say why it is rejected");
    expect((await decide(robot, id, { decision: "reject", comment: "  " })).status).toBe(400);
    expect((await decide(alice, id, { decision: "reject", comment: "Not ours" })).status).toBe(204);
  });

  test("a decision by a service account is listed as decided, by whom and where (OPS-26)", async () => {
    const id = await waitingRun();
    expect((await decide(robot, id, { decision: "reject", comment: "Duplicate" })).status).toBe(
      204,
    );
    const done = await until(
      async () => (await alice.get(`${ws()}/approvals/decided`)).body.items as Any[],
      (items) => items.some((one) => one.flowRunId === id),
    );
    expect(done.find((one) => one.flowRunId === id)).toMatchObject({
      approved: false,
      comment: "Duplicate",
      decidedBy: { label: "Robot", type: "service_account" },
      via: "api",
    });
    const mine = await waitingRun();
    expect((await decide(alice, mine, { decision: "approve" })).status).toBe(204);
    const again = (await alice.get(`${ws()}/approvals/decided`)).body.items as Any[];
    expect(again.find((one) => one.flowRunId === mine)).toMatchObject({
      approved: true,
      decidedBy: { label: "alice@acme.example", type: "member" },
      via: "console",
    });
  });
});

describe("a run's attempts, and what it ran on", () => {
  const runOf = async () => {
    const started = await alice.post(`${ws()}/runs`, { script: "orders/sync", input: {} });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    return started.body.id as string;
  };

  test("every attempt is listed, one error line does not fail a success, and an earlier one failed (OPS-31)", async () => {
    const id = await runOf();
    await sql`update run set status = 'succeeded', attempt = 3, max_attempts = 3 where id = ${id}`.execute(
      t.db,
    );
    await sql`insert into run_log (run_id, attempt, logged_at, level, message, fields)
      values (${id}, 2, now(), 'error', 'one line', '{}'),
             (${id}, 3, now(), 'info', 'fine', '{}')`.execute(t.db);
    const insight = (await alice.get(`${ws()}/runs/${id}/insight`)).body;
    expect(insight.attempts.map((one: Any) => [one.attempt, one.failed, one.errorsLogged])).toEqual(
      [
        [1, true, 0],
        [2, true, 1],
        [3, false, 0],
      ],
    );
    // The one that logged nothing has no times; the others do.
    expect(insight.attempts[0].startedAt).toBeNull();
    expect(insight.attempts[2].startedAt).toEqual(expect.any(String));
  });

  test("an old run shows the time limit and connections of the version it ran, not the one deployed now (OPS-32)", async () => {
    const id = await runOf();
    await deploy(bundle(sync(90, [])));
    const insight = (await alice.get(`${ws()}/runs/${id}/insight`)).body;
    expect(insight.timeoutSeconds).toBe(30);
    expect(insight.uses).toEqual([{ connection: "erp", bound: true }]);
    // A script that has since been removed still shows what it was.
    const after = await runOf();
    expect(((await alice.get(`${ws()}/runs/${after}/insight`)).body as Any).timeoutSeconds).toBe(
      90,
    );
  });

  test("an unbound connection is named as the cause only when the failure names it (OPS-32)", () => {
    const at = { attempt: 1, maxAttempts: 1, unbound: ["erp"] };
    expect(diagnose({ ...at, message: "Something odd happened" })).toBeUndefined();
    expect(diagnose({ ...at, message: "The connection erp is not available" })?.section).toBe(
      "connections",
    );
  });
});

describe("a script's own failure alert", () => {
  test("replaces the workspace's default, and does not add to it (C9, D29)", async () => {
    expect(
      (await alice.patch(ws(), { failureAlert: { script: "orders/sync", notify: "erp" } })).status,
    ).toBe(200);
    const alerted = async (script: string) => {
      const started = await alice.post(`${ws()}/runs`, { script, input: {} });
      expect(started.status, JSON.stringify(started.body)).toBe(201);
      const id = started.body.id as string;
      await sql`update run set status = 'failed', attempt = 1, max_attempts = 1,
        error = ${JSON.stringify({ message: `boom ${script}` })} where id = ${id}`.execute(t.db);
      const row = await t.db
        .selectFrom("run")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
      await sendAlerts(t.kernel, row as never);
      return (await alice.get(`${ws()}/runs/${id}`)).body.alert as Any;
    };
    // Its own names a connection and no script: the default's script is not started as well.
    const own = await alerted("orders/own");
    expect(own.handlerRunId).toBeUndefined();
    expect(own.notified).toBeDefined();
    // One with nothing of its own gets the default, whole.
    const plain = await alerted("orders/sync");
    expect(plain.handlerRunId).toEqual(expect.any(String));
    await alice.patch(ws(), { failureAlert: {} });
  });
});
