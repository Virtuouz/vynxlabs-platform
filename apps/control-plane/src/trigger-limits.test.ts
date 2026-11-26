import { sql } from "@volvel/db";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, expect, test } from "vitest";
import { cancelRun, queueName } from "./kernel/execution/runs.js";
import { fireDueSchedules } from "./kernel/execution/triggers.js";
import { startTestApp, type TestApp } from "./testing.js";

// Triggers that cannot run away: a flow still going is not started again on its
// next time, a workspace with a long queue gets no more from its schedules, an
// operator can stop every trigger at once, and a backlog can be cancelled in bulk.
// No worker runs here, so whatever starts stays queued or running.

let t: TestApp;
let tenant: string;

const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
const tick = { type: "trigger", trigger: { type: "schedule", cron: "* * * * *" } };

function bundle(): Bundle {
  const body = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("script", "work", {
        entry: "work",
        input: { type: "object" },
        output: { type: "object" },
        timeoutSeconds: 30,
        retries: { limit: 0, delaySeconds: 0, backoff: false },
        uses: { connections: [], secrets: [], variables: [] },
      }),
      manifest("flow", "skips", {
        nodes: { tick, step: { type: "script", script: "work" } },
        edges: [{ from: "tick", to: "step" }],
      }),
      manifest("flow", "piles", {
        nodes: {
          tick: {
            type: "trigger",
            trigger: { type: "schedule", cron: "* * * * *", overlap: "allow" },
          },
          step: { type: "script", script: "work" },
        },
        edges: [{ from: "tick", to: "step" }],
      }),
      manifest("schedule", "every-minute", { script: "work", cron: "* * * * *" }),
    ],
    code: "export const work = { execute: async () => ({}) };",
  };
  return { ...body, digest: bundleDigest(body) } as Bundle;
}

/** A workspace with the bundle deployed, its triggers running. */
async function workspace(slug: string): Promise<string> {
  const created = await t.admin.post(`/tenants/${tenant}/workspaces`, {
    slug,
    name: slug,
    type: "production",
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const ws = `/tenants/${tenant}/workspaces/${created.body.id}`;
  const uploaded = await t.admin.post(`${ws}/bundles`, bundle());
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  const deployed = await t.admin.post(`${ws}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  return ws;
}

/** Fires what is due a given number of minutes from now. */
const fireIn = (minutes: number) =>
  fireDueSchedules(t.kernel, new Date(Date.now() + minutes * 60_000));

async function flowRuns(ws: string, flow: string): Promise<number> {
  const listed = await t.admin.get(`${ws}/flow-runs?limit=100`);
  return (listed.body.items as { flow: string }[]).filter((one) => one.flow === flow).length;
}

beforeAll(async () => {
  t = await startTestApp();
  tenant = (await t.admin.post("/tenants", { slug: "limits", name: "Limits" })).body.id;
  const role = await t.db
    .selectFrom("role")
    .select("id")
    .where("builtin", "=", true)
    .where("name", "=", "tenant_admin")
    .executeTakeFirstOrThrow();
  await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: role.id });
});

afterAll(async () => {
  await t?.stop();
});

test("a flow's schedule passes over its time while its last run goes, unless it allows overlap", async () => {
  const ws = await workspace("overlap");
  await fireIn(2);
  expect(await flowRuns(ws, "skips")).toBe(1);
  expect(await flowRuns(ws, "piles")).toBe(1);
  await fireIn(4);
  // Its first run is still going: no worker took its step.
  expect(await flowRuns(ws, "skips")).toBe(1);
  expect(await flowRuns(ws, "piles")).toBe(2);
  const triggers = (await t.admin.get(`${ws}/triggers`)).body.items as {
    path: string;
    overlap: string | null;
    lastSkipReason: string | null;
  }[];
  const skips = triggers.find((one) => one.path.startsWith("skips"));
  expect(skips).toMatchObject({ overlap: "skip", lastSkipReason: "overlap" });
});

test("a workspace with a long queue gets no more from its schedules, and says why", async () => {
  const ws = await workspace("backlog");
  t.kernel.config.limits.scheduleBacklogLimit = 3;
  try {
    for (let i = 0; i < 3; i += 1) {
      expect((await t.admin.post(`${ws}/runs`, { script: "work", input: {} })).status).toBe(201);
    }
    await fireIn(2);
    const triggers = (await t.admin.get(`${ws}/triggers`)).body.items as {
      path: string;
      lastSkipReason: string | null;
      lastSkippedAt: string | null;
    }[];
    const schedule = triggers.find((one) => one.path === "every-minute");
    expect(schedule?.lastSkipReason).toBe("backlog");
    expect(schedule?.lastSkippedAt).not.toBeNull();
    expect(await flowRuns(ws, "skips")).toBe(0);
  } finally {
    t.kernel.config.limits.scheduleBacklogLimit = 200;
  }
});

test("an operator stops every trigger in the instance at once, and starts them again", async () => {
  const ws = await workspace("stopped");
  const paused = await t.admin.put("/instance/triggers", {
    paused: true,
    reason: "Falling behind",
  });
  expect(paused.status, JSON.stringify(paused.body)).toBe(200);
  expect(paused.body).toMatchObject({
    paused: true,
    reason: "Falling behind",
    byEnvironment: false,
  });
  expect(await fireIn(2)).toBe(0);
  expect(await flowRuns(ws, "skips")).toBe(0);
  // The tenant's own screens can say so (INS-24), without the operator's reason.
  const seen = await t.admin.get(ws);
  expect(seen.body).toMatchObject({ triggersPaused: false, pausedByInstance: true });
  expect(JSON.stringify(seen.body)).not.toContain("Falling behind");
  const listed = await t.admin.get(`/tenants/${tenant}/workspaces`);
  expect(
    listed.body.items.every((one: { pausedByInstance: boolean }) => one.pausedByInstance),
  ).toBe(true);

  const resumed = await t.admin.put("/instance/triggers", { paused: false });
  expect(resumed.body).toMatchObject({ paused: false, reason: null });
  expect((await t.admin.get(ws)).body.pausedByInstance).toBe(false);
  // A schedule kept its time while paused, and fires once on resuming.
  expect(await fireIn(2)).toBeGreaterThan(0);
  expect(await flowRuns(ws, "skips")).toBe(1);

  // TRIGGERS_PAUSED stops them whatever the console says, and the console says so.
  t.kernel.config.limits.triggersPaused = true;
  try {
    expect(await fireIn(10)).toBe(0);
    expect((await t.admin.get("/instance/triggers")).body).toMatchObject({
      paused: true,
      byEnvironment: true,
    });
  } finally {
    t.kernel.config.limits.triggersPaused = false;
  }
});

test("a dev workspace starts with its triggers paused, unless asked otherwise", async () => {
  const base = `/tenants/${tenant}/workspaces`;
  const dev = await t.admin.post(base, { slug: "trying", name: "Trying", type: "dev" });
  expect(dev.body.triggersPaused).toBe(true);
  const running = await t.admin.post(base, {
    slug: "trying-live",
    name: "Trying live",
    type: "dev",
    triggersPaused: false,
  });
  expect(running.body.triggersPaused).toBe(false);
  const production = await t.admin.post(base, { slug: "live", name: "Live", type: "production" });
  expect(production.body.triggersPaused).toBe(false);
});

test("a backlog is cancelled in bulk: queued runs, then flow runs in progress", async () => {
  const ws = await workspace("bulk");
  for (let i = 0; i < 5; i += 1) {
    expect((await t.admin.post(`${ws}/runs`, { script: "work", input: {} })).status).toBe(201);
  }
  await fireIn(2);
  expect(await flowRuns(ws, "piles")).toBe(1);

  const runs = await t.admin.post(`${ws}/runs/cancel`, { include: "queued" });
  expect(runs.status, JSON.stringify(runs.body)).toBe(200);
  // The five started by hand, the schedule's own, and the steps of the two flows.
  expect(runs.body).toEqual({ cancelled: 8, more: false });
  expect((await t.admin.post(`${ws}/runs/cancel`, { include: "queued" })).body).toEqual({
    cancelled: 0,
    more: false,
  });

  const flows = await t.admin.post(`${ws}/flow-runs/cancel`, {});
  expect(flows.body).toEqual({ cancelled: 2, more: false });
  const listed = await t.admin.get(`${ws}/flow-runs?limit=100`);
  for (const one of listed.body.items as { status: string }[]) {
    expect(one.status).toBe("cancelled");
  }
});

test("a schedule whose bundle cannot be read does not stop the others from firing (OPS-04)", async () => {
  const broken = await workspace("lost-object");
  const fine = await workspace("kept-object");
  const brokenId = broken.split("/").at(-1) as string;
  // Its active bundle is one this process never read, whose object is gone from storage.
  await t.db.transaction().execute(async (trx) => {
    await sql`create temporary table lost_bundle on commit drop as select * from bundle where workspace_id = ${brokenId}`.execute(
      trx,
    );
    await sql`update lost_bundle set id = gen_random_uuid(), version = version + 1000, digest = digest || 'x', storage_key = 'bundles/missing.json'`.execute(
      trx,
    );
    await sql`insert into bundle select * from lost_bundle`.execute(trx);
    await sql`update workspace set active_bundle_id = (select id from lost_bundle) where id = ${brokenId}`.execute(
      trx,
    );
  });
  await fireIn(2);
  await fireIn(4);
  expect(await flowRuns(fine, "skips")).toBeGreaterThan(0);
  expect(await flowRuns(broken, "skips")).toBe(0);
});

test("a cancel and a claim of the same run both finish: neither waits for the other for ever", async () => {
  // STR-06 of phase 35. The claim takes the run's job, then the run. The cancel took the run,
  // then asked for the job on another connection: each waited for the other, Postgres saw no
  // deadlock, and no run on the instance was claimed again until someone looked.
  const ws = await workspace("race");
  const workspaceId = ws.split("/").at(-1) as string;
  const started = await t.admin.post(`${ws}/runs`, { script: "work", input: {} });
  expect(started.status).toBe(201);
  const runId = started.body.id as string;

  let claimHasJob = () => {};
  const jobTaken = new Promise<void>((resolve) => {
    claimHasJob = resolve;
  });
  let letClaimGoOn = () => {};
  const goOn = new Promise<void>((resolve) => {
    letClaimGoOn = resolve;
  });
  // A claim, as `claimNext` makes it: the job, a pause, then the run.
  const claim = t.kernel.db.transaction().execute(async (trx) => {
    const job = await t.kernel.queue.claim<{ runId: string }>(queueName(workspaceId, null), trx);
    expect(job?.data.runId).toBe(runId);
    claimHasJob();
    await goOn;
    await trx.selectFrom("run").select("id").where("id", "=", runId).forUpdate().execute();
    await trx.updateTable("run").set({ status: "running" }).where("id", "=", runId).execute();
  });
  await jobTaken;
  const cancel = t.kernel.db
    .transaction()
    .execute((trx) => cancelRun(t.kernel, trx, workspaceId, runId));
  // Long enough for the cancel to have taken whatever it takes first.
  await new Promise((resolve) => setTimeout(resolve, 500));
  letClaimGoOn();
  const finished = await Promise.race([
    Promise.all([claim, cancel]).then(() => "both" as const),
    new Promise<"stuck">((resolve) => setTimeout(() => resolve("stuck"), 10_000)),
  ]);
  expect(finished).toBe("both");
  const run = await t.admin.get(`${ws}/runs/${runId}`);
  expect(run.body.status).toBe("cancelled");
}, 30_000);
