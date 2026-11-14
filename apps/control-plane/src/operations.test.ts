import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "@vynxlabs/db";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { diagnose } from "./kernel/execution/diagnose.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let workspace: string;
let alice: Client; // tenant admin, in the Finance group
let carl: Client; // tenant admin, not in it
let hooks: Record<string, string>;

const ws = () => `/tenants/${tenant}/workspaces/${workspace}`;
const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});

function bundle(): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("script", "orders/sync", {
        entry: "sync",
        input: {},
        output: {},
        timeoutSeconds: 30,
        retries: { limit: 2, delaySeconds: 1, backoff: false },
        uses: { connections: ["erp"], secrets: [], variables: [] },
      }),
      manifest("connection", "erp", { connector: "http" }),
      manifest("event", "orders/nobody-listens", { payload: { type: "object" } }),
      manifest("trigger", "orders/hook", { type: "webhook", script: "orders/sync" }),
      manifest("trigger", "orders/signed", {
        type: "webhook",
        script: "orders/sync",
        verify: { scheme: "hmac-sha256", header: "X-Sig", secret: "HOOK_SECRET" },
      }),
      manifest("flow", "orders/approve", {
        nodes: {
          start: { type: "trigger", trigger: { type: "manual" } },
          gate: {
            type: "approval",
            title: "Approve a large order",
            approvers: { groups: ["Finance"] },
          },
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

async function admin(email: string) {
  const made = await t.admin.post(`/tenants/${tenant}/members`, {
    email,
    name: email,
    password: PASSWORD,
  });
  return made.body.id as string;
}

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await sleep(100);
  }
}

beforeAll(async () => {
  t = await startTestApp();
  const tenantAdmin = "00000000-0000-7000-8000-000000000002";
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: tenantAdmin,
  });
  const aliceId = await admin("alice@acme.example");
  const carlId = await admin("carl@acme.example");
  for (const id of [aliceId, carlId])
    await t.admin.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: id,
      roleId: tenantAdmin,
    });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  carl = await t.signIn("carl@acme.example", PASSWORD);
  const finance = await alice.post(`/tenants/${tenant}/groups`, { name: "Finance" });
  expect(finance.status, JSON.stringify(finance.body)).toBe(201);
  expect(
    (await alice.put(`/tenants/${tenant}/groups/${finance.body.id}/members/${aliceId}`)).status,
  ).toBeLessThan(300);

  workspace = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "orders",
      name: "Orders",
      type: "dev",
    })
  ).body.id;
  await alice.put(`${ws()}/secrets/HOOK_SECRET`, { value: "shh" });
  await alice.put(`${ws()}/connection-bindings/erp`, {
    config: { baseUrl: "https://erp.example.test" },
  });
  const uploaded = await alice.post(`${ws()}/bundles`, bundle());
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
  const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  hooks = Object.fromEntries(
    ((await alice.get(`${ws()}/triggers`)).body.items as { path: string; url: string }[]).map(
      (one) => [one.path, new URL(one.url).pathname.replace("/api/v1", "")],
    ),
  );
}, 60_000);
afterAll(() => t?.stop());

const send = (name: string, payload = "{}", headers: Record<string, string> = {}) =>
  t.app.inject({
    method: "POST",
    url: `/api/v1${hooks[name]}`,
    headers: { "content-type": "application/json", ...headers },
    payload,
  });

describe("pausing one trigger", () => {
  test("a paused webhook refuses, records why, and works again once resumed", async () => {
    const paused = await alice.put(`${ws()}/trigger-pauses/orders/hook`, {
      reason: "The ERP is down for maintenance",
    });
    expect(paused.status, JSON.stringify(paused.body)).toBe(204);
    expect((await send("orders/hook")).statusCode).toBeGreaterThanOrEqual(400);

    const listed = (await alice.get(`${ws()}/triggers`)).body.items as {
      path: string;
      paused: { reason: string } | null;
      lastRefusal: { reason: string } | null;
      lastFiredAt: string | null;
    }[];
    const hook = listed.find((one) => one.path === "orders/hook");
    expect(hook?.paused?.reason).toBe("The ERP is down for maintenance");
    expect(hook?.lastRefusal?.reason).toBe("paused");
    // The other trigger is untouched.
    expect(listed.find((one) => one.path === "orders/signed")?.paused).toBeNull();

    expect((await alice.delete(`${ws()}/trigger-pauses/orders/hook`)).status).toBe(204);
    expect((await send("orders/hook")).statusCode).toBe(202);
    const after = (await alice.get(`${ws()}/triggers`)).body.items.find(
      (one: { path: string }) => one.path === "orders/hook",
    );
    expect(after.paused).toBeNull();
    expect(after.lastFiredAt).not.toBeNull();
    expect(after.lastRun).toMatchObject({ kind: "script" });

    // Both are in the audit log.
    const audit = (await alice.get(`/tenants/${tenant}/audit?area=trigger`)).body.items.map(
      (entry: { action: string }) => entry.action,
    );
    expect(audit).toEqual(expect.arrayContaining(["trigger.paused", "trigger.resumed"]));
    expect((await alice.put(`${ws()}/trigger-pauses/nothing/here`, {})).status).toBe(404);
  });

  test("a request with a bad signature is refused and its reason kept, never its body", async () => {
    expect((await send("orders/signed", '{"card":"4111"}', { "x-sig": "nope" })).statusCode).toBe(
      401,
    );
    const signed = (await alice.get(`${ws()}/triggers`)).body.items.find(
      (one: { path: string }) => one.path === "orders/signed",
    );
    expect(signed.lastRefusal.reason).toBe("signature");
    const kept = await t.db.selectFrom("webhook_refusal").select("problem").execute();
    expect(JSON.stringify(kept)).not.toContain("4111");
  });
});

describe("runs of every kind, together", () => {
  test("lists script and flow runs, counts them, and reads a window of hours", async () => {
    const flow = await alice.post(`${ws()}/flow-runs`, { flow: "orders/approve", input: {} });
    expect(flow.status, JSON.stringify(flow.body)).toBe(201);
    await until(
      async () => (await alice.get(`${ws()}/activity?kind=flow`)).body,
      (page) => page.items[0]?.status === "waiting",
    );
    const all = (await alice.get(`${ws()}/activity`)).body;
    expect(all.items.map((one: { kind: string }) => one.kind)).toEqual(
      expect.arrayContaining(["script", "flow"]),
    );
    expect(all.counts.waiting).toBe(1);
    const waiting = (await alice.get(`${ws()}/activity?status=waiting`)).body.items;
    expect(waiting).toEqual([expect.objectContaining({ kind: "flow", target: "orders/approve" })]);

    const stats = (await alice.get(`${ws()}/run-stats?hours=6`)).body;
    expect(stats.hours).toHaveLength(6);
    expect(stats.running).toBeGreaterThanOrEqual(1);
  });

  test("a failed run says which attempt failed and what to do next", async () => {
    const run = (await alice.get(`${ws()}/activity?kind=script`)).body.items[0];
    await sql`update run set status = 'failed', attempt = 3, max_attempts = 3,
      error = ${JSON.stringify({ message: "The ERP answered with status 401" })}
      where id = ${run.id}`.execute(t.db);
    await sql`insert into run_log (run_id, attempt, logged_at, level, message, fields)
      values (${run.id}, 1, now() - interval '2 minutes', 'error', 'refused', '{}'),
             (${run.id}, 2, now() - interval '1 minute', 'error', 'refused', '{}')`.execute(t.db);
    const insight = (await alice.get(`${ws()}/runs/${run.id}/insight`)).body;
    expect(insight.attempts.map((one: { attempt: number }) => one.attempt)).toEqual([1, 2]);
    expect(insight.uses).toEqual([{ connection: "erp", bound: true }]);
    expect(insight.diagnosis).toMatchObject({ section: "connections" });
    expect(insight.diagnosis.cause).toContain("all 3 attempts");
  });

  test("diagnosis knows the common shapes, and stays quiet about the rest", () => {
    const at = { attempt: 1, maxAttempts: 1 };
    expect(diagnose({ ...at, message: "x", unbound: ["erp"] })?.section).toBe("connections");
    expect(
      diagnose({ ...at, message: "Timed out after 30s", timeoutSeconds: 30 })?.cause,
    ).toContain("30s");
    expect(diagnose({ ...at, message: "connect ECONNREFUSED 10.0.0.1:443" })?.cause).toContain(
      "could not be reached",
    );
    expect(diagnose({ ...at, message: "status 422 Unprocessable" })?.cause).toContain("422");
    expect(diagnose({ ...at, message: "Something odd happened" })).toBeUndefined();
  });
});

describe("approvals that name who decides", () => {
  test("only a member of the named group sees and decides it, and it is then listed as decided", async () => {
    const waiting = (await alice.get(`${ws()}/approvals`)).body.items[0];
    expect(waiting.approvers).toMatchObject({ groups: ["Finance"], text: "the Finance group" });
    expect((await alice.get(`/tenants/${tenant}/approvals`)).body.items).toHaveLength(1);
    // Carl holds the permission, but is not in Finance.
    expect((await carl.get(`/tenants/${tenant}/approvals`)).body.items).toHaveLength(0);
    const refused = await carl.post(`${ws()}/flow-runs/${waiting.flowRunId}/approvals/gate`, {
      decision: "approve",
    });
    expect(refused.status).toBe(403);
    expect(refused.body.detail).toContain("the Finance group");

    expect(
      (
        await alice.post(`${ws()}/flow-runs/${waiting.flowRunId}/approvals/gate`, {
          decision: "approve",
          comment: "Known customer",
        })
      ).status,
    ).toBe(204);
    const decided = (await alice.get(`/tenants/${tenant}/approvals/decided`)).body.items;
    expect(decided[0]).toMatchObject({
      flow: "orders/approve",
      approved: true,
      comment: "Known customer",
      decidedBy: { label: "alice@acme.example" },
    });
  });
});

describe("events", () => {
  test("an event says who published it, what it started, and whether anything listens", async () => {
    const published = await alice.post(`${ws()}/events`, {
      name: "orders/nobody-listens",
      payload: { id: 1 },
    });
    expect(published.status, JSON.stringify(published.body)).toBe(201);
    const event = (await alice.get(`${ws()}/events`)).body.items[0];
    expect(event).toMatchObject({ name: "orders/nobody-listens", listeners: 0, started: [] });
    expect(event.publishedBy).toBeNull();
  });
});

describe("the write path", () => {
  test("every change was audited", () => {
    expect(t.unaudited).toEqual([]);
    expect(t.unexercised((route) => route.includes("/trigger-pauses/"))).toEqual([]);
  });
});
