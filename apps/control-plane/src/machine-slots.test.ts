import { randomUUID } from "node:crypto";
import { type Bundle, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, expect, test } from "vitest";
import { claimRun } from "./kernel/execution/runs.js";
import { claimTask, queueTask } from "./kernel/execution/tasks.js";
import { createWorkerCredential, seeWorker } from "./kernel/execution/workers.js";
import { startTestApp, type TestApp } from "./testing.js";

// Workers on one machine share its run slots: the scripts running there, across all
// of them and all their tenants, never go past it, and a busy tenant leaves room for
// the others that are waiting.

let t: TestApp;

const unsigned = {
  formatVersion: 1 as const,
  sdkVersion: "0.2.0",
  core: { min: "0.0.0", below: "99.0.0" },
  manifests: [
    {
      kind: "script",
      schemaVersion: 1,
      path: "greet",
      ownership: "code" as const,
      body: {
        entry: "greet",
        input: { type: "object" },
        output: { type: "object" },
        timeoutSeconds: 30,
        retries: { limit: 0, delaySeconds: 0, backoff: false },
        uses: { connections: [], secrets: [], variables: [] },
      },
    },
  ],
  code: "export const greet = { execute: async () => ({}) };",
};
const bundle: Bundle = { ...unsigned, digest: bundleDigest(unsigned) };

interface Place {
  tenant: string;
  workspace: string;
  scope: { credentialId: string; tenantId: string; workspaceId: null; pool: null };
  /** A worker of this tenant, seen on the given machine. */
  worker(machine: { name: string; slots: number }): Promise<string>;
  /** Queues this many runs. */
  queue(count: number): Promise<void>;
}

async function place(slug: string): Promise<Place> {
  const tenant = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
  const role = await t.db
    .selectFrom("role")
    .select("id")
    .where("builtin", "=", true)
    .where("name", "=", "tenant_admin")
    .executeTakeFirstOrThrow();
  await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: role.id });
  const base = `/tenants/${tenant}/workspaces`;
  const workspace = (await t.admin.post(base, { slug: "main", name: "Main", type: "production" }))
    .body.id as string;
  const uploaded = await t.admin.post(`${base}/${workspace}/bundles`, bundle);
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  const deployed = await t.admin.post(`${base}/${workspace}/deployments`, {
    bundleId: uploaded.body.id,
  });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  const credential = await createWorkerCredential(t.db, { tenantId: tenant, name: "w" });
  const scope = {
    credentialId: credential.row.id,
    tenantId: tenant,
    workspaceId: null,
    pool: null,
  };
  return {
    tenant,
    workspace,
    scope,
    async worker(machine) {
      const id = randomUUID();
      await seeWorker(t.kernel, scope, id, "test", machine);
      return id;
    },
    async queue(count) {
      for (let i = 0; i < count; i += 1) {
        const started = await t.admin.post(`${base}/${workspace}/runs`, {
          script: "greet",
          input: {},
        });
        expect(started.status, JSON.stringify(started.body)).toBeLessThan(300);
      }
    },
  };
}

beforeAll(async () => {
  t = await startTestApp();
});

afterAll(async () => {
  await t?.stop();
});

test("the scripts running on a machine never go past its slots", async () => {
  const one = await place("slots-one");
  const machine = { name: `m-${randomUUID()}`, slots: 2 };
  const worker = await one.worker(machine);
  await one.queue(3);
  const first = await claimRun(t.kernel, one.scope, worker, undefined, machine);
  const second = await claimRun(t.kernel, one.scope, worker, undefined, machine);
  const third = await claimRun(t.kernel, one.scope, worker, undefined, machine);
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(third).toBeNull();
  // A worker that says nothing of its machine is held only to its own workspace's limit.
  expect(await claimRun(t.kernel, one.scope, worker)).not.toBeNull();
});

test("a busy tenant takes no more than its share while another waits", async () => {
  const busy = await place("slots-busy");
  const other = await place("slots-other");
  const machine = { name: `m-${randomUUID()}`, slots: 2 };
  const busyWorker = await busy.worker(machine);
  const otherWorker = await other.worker(machine);
  await busy.queue(3);
  await other.queue(1);

  expect(await claimRun(t.kernel, busy.scope, busyWorker, undefined, machine)).not.toBeNull();
  // Its share of two slots between two tenants is one, and the other is waiting.
  expect(await claimRun(t.kernel, busy.scope, busyWorker, undefined, machine)).toBeNull();
  expect(await claimRun(t.kernel, other.scope, otherWorker, undefined, machine)).not.toBeNull();
  // Now the machine is full for both.
  expect(await claimRun(t.kernel, busy.scope, busyWorker, undefined, machine)).toBeNull();
});

test("past its share, a tenant may take a slot nobody else is waiting for", async () => {
  const busy = await place("slots-alone");
  const idle = await place("slots-idle");
  const machine = { name: `m-${randomUUID()}`, slots: 2 };
  const busyWorker = await busy.worker(machine);
  await idle.worker(machine);
  await busy.queue(2);
  expect(await claimRun(t.kernel, busy.scope, busyWorker, undefined, machine)).not.toBeNull();
  expect(await claimRun(t.kernel, busy.scope, busyWorker, undefined, machine)).not.toBeNull();
});

test("tasks count against the machine's slots too", async () => {
  const one = await place("slots-tasks");
  const machine = { name: `m-${randomUUID()}`, slots: 1 };
  const worker = await one.worker(machine);
  for (let i = 0; i < 2; i += 1) {
    await queueTask(t.db, {
      tenantId: one.tenant,
      workspaceId: one.workspace,
      kind: "test-connection",
      request: {},
    });
  }
  expect(await claimTask(t.kernel, one.scope, worker, ["test-connection"], machine)).toBeDefined();
  expect(
    await claimTask(t.kernel, one.scope, worker, ["test-connection"], machine),
  ).toBeUndefined();
  await one.queue(1);
  expect(await claimRun(t.kernel, one.scope, worker, undefined, machine)).toBeNull();
});
