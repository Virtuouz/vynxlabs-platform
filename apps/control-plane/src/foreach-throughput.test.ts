import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { Worker } from "@volvel/worker";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

// A foreach over many items, one at a time: each item is a run of its own, so what
// each costs beyond its script is what bounds the whole. Found slow under the Fly
// stress test (about 40 items a minute); this keeps it measured.

const ITEMS = 150;

let t: TestApp;
let worker: Worker;
let working: Promise<unknown>;
let ws: string;

const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});

function bundle(): Bundle {
  const body = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("script", "item", {
        entry: "item",
        input: { type: "object" },
        output: { type: "object" },
        timeoutSeconds: 30,
        retries: { limit: 0, delaySeconds: 0, backoff: false },
        uses: { connections: [], secrets: [], variables: [] },
      }),
      manifest("flow", "many", {
        nodes: {
          start: { type: "trigger", trigger: { type: "manual" } },
          each: { type: "foreach", items: "trigger.items", script: "item", input: "{'n': item}" },
        },
        edges: [{ from: "start", to: "each" }],
      }),
    ],
    code: "export const item = { execute: async (input) => ({ n: input.n * 2 }) };",
  };
  return { ...body, digest: bundleDigest(body) } as Bundle;
}

beforeAll(async () => {
  t = await startTestApp();
  const url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  const tenant = (await t.admin.post("/tenants", { slug: "many", name: "Many" })).body.id;
  const role = await t.db
    .selectFrom("role")
    .select("id")
    .where("builtin", "=", true)
    .where("name", "=", "tenant_admin")
    .executeTakeFirstOrThrow();
  await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: role.id });
  const workspace = (
    await t.admin.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  ws = `/tenants/${tenant}/workspaces/${workspace}`;
  const uploaded = await t.admin.post(`${ws}/bundles`, bundle());
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  expect((await t.admin.post(`${ws}/deployments`, { bundleId: uploaded.body.id })).status).toBe(
    201,
  );
  const credential = await t.admin.post(`/tenants/${tenant}/worker-credentials`, { name: "w" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1, concurrency: 4 });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker?.stop();
  await working;
  await t?.stop();
});

test(`a foreach of ${ITEMS} items, one at a time, finishes and says how fast`, async () => {
  const started = Date.now();
  const flowRun = await t.admin.post(`${ws}/flow-runs`, {
    flow: "many",
    input: { items: Array.from({ length: ITEMS }, (_, n) => n) },
  });
  expect(flowRun.status, JSON.stringify(flowRun.body)).toBe(201);
  let status = "running";
  while (status === "running" && Date.now() - started < 240_000) {
    await sleep(500);
    status = (await t.admin.get(`${ws}/flow-runs/${flowRun.body.id}`)).body.status;
  }
  const seconds = (Date.now() - started) / 1000;
  const perMinute = Math.round((ITEMS / seconds) * 60);
  console.log(`foreach: ${ITEMS} items in ${seconds.toFixed(1)} s, ${perMinute} a minute`);
  // Where each item's time goes: the engine starting the next, a worker claiming it, its process.
  const runs = await t.db
    .selectFrom("run")
    .select(["created_at", "started_at", "finished_at"])
    .where("script_path", "=", "item")
    .orderBy("created_at")
    .execute();
  const ms = (a: Date | null, b: Date | null) => (a && b ? b.getTime() - a.getTime() : 0);
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const engine = runs.slice(1).map((run, i) => ms(runs[i]?.finished_at ?? null, run.created_at));
  const claim = runs.map((run) => ms(run.created_at, run.started_at));
  const process = runs.map((run) => ms(run.started_at, run.finished_at));
  console.log(
    `foreach per item (median ms): engine ${median(engine)}, claim ${median(claim)}, process ${median(process)}`,
  );
  expect(status).toBe("succeeded");
  // A waiting claim is woken when the next item is queued. Polling, it took a median of
  // about 360 ms an item here; woken, about 15.
  expect(median(claim)).toBeLessThan(250);
}, 300_000);
