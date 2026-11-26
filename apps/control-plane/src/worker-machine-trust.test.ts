// What a worker says about its machine is believed only from a worker the platform started.
// A tenant's own worker cannot fill, mark full or reserve a machine other tenants share.
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, expect, test } from "vitest";
import { claimRun } from "./kernel/execution/runs.js";
import { createWorkerCredential, seeWorker } from "./kernel/execution/workers.js";
import { startTestApp, type TestApp } from "./testing.js";

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

async function place(slug: string) {
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
  await t.admin.post(`${base}/${workspace}/deployments`, { bundleId: uploaded.body.id });
  // The platform's own worker for this tenant, which names its machine truly.
  const managed = await createWorkerCredential(t.db, {
    tenantId: tenant,
    name: "managed",
    managed: true,
  });
  const own = await createWorkerCredential(t.db, { tenantId: tenant, name: "own" });
  const scope = {
    credentialId: managed.row.id,
    tenantId: tenant,
    workspaceId: null,
    pool: null,
    managed: true,
  };
  return {
    scope,
    token: own.token,
    async worker(machine: { name: string; slots: number }) {
      const id = randomUUID();
      await seeWorker(t.kernel, scope, id, "test", machine);
      return id;
    },
    async queue(count: number) {
      for (let i = 0; i < count; i += 1) {
        await t.admin.post(`${base}/${workspace}/runs`, { script: "greet", input: {} });
      }
    },
  };
}

/** A claim over the route by a tenant's own (not managed) worker, naming a machine. */
async function claimNaming(who: { token: string }, machine: { name: string; slots: number }) {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/worker/claim",
    headers: { authorization: `Bearer ${who.token}` },
    payload: { workerId: randomUUID(), waitSeconds: 0, kinds: ["run"], machine },
  });
  expect(res.statusCode).toBe(200);
  return res.json().job;
}

beforeAll(async () => {
  t = await startTestApp();
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

test("a tenant's own worker naming a shared machine with one slot does not make it full for others", async () => {
  const victim = await place("b12-victim-a");
  const attacker = await place("b12-attacker-a");
  const real = { name: `shared-host-${randomUUID()}`, slots: 8 };
  const victimWorker = await victim.worker(real);
  await victim.queue(2);
  expect(await claimRun(t.kernel, victim.scope, victimWorker, undefined, real)).not.toBeNull();
  await sleep(300);
  await attacker.queue(1);
  await claimNaming(attacker, { name: real.name, slots: 1 });
  const second = await claimRun(t.kernel, victim.scope, victimWorker, undefined, real);
  expect(second, "the machine was marked full by another tenant").not.toBeNull();
});

test("a tenant's own worker naming a shared machine with 1000 slots does not fill it", async () => {
  const victim = await place("b12-victim-b");
  const attacker = await place("b12-attacker-b");
  const real = { name: `shared-host-${randomUUID()}`, slots: 3 };
  const victimWorker = await victim.worker(real);
  await attacker.queue(3);
  for (let i = 0; i < 3; i += 1) {
    expect(await claimNaming(attacker, { name: real.name, slots: 1000 })).not.toBeNull();
  }
  await victim.queue(1);
  await sleep(300);
  const claim = await claimRun(t.kernel, victim.scope, victimWorker, undefined, real);
  expect(claim, "three jobs that run elsewhere took the machine's slots").not.toBeNull();
});

test("a tenant's own workers still share the slots of a machine between them", async () => {
  const mine = await place("b12-own");
  const machine = { name: `own-${randomUUID()}`, slots: 1 };
  await mine.queue(2);
  expect(await claimNaming(mine, machine)).not.toBeNull();
  expect(await claimNaming(mine, machine)).toBeNull();
});
