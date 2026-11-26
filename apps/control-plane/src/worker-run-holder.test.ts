// A run is reported on only by the worker credential that holds it, not by any other credential of the tenant.
import { randomUUID } from "node:crypto";
import { type Bundle, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createWorkerCredential } from "./kernel/execution/workers.js";
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

beforeAll(async () => {
  t = await startTestApp();
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

test("another worker credential of the tenant cannot report on a run it does not hold", async () => {
  const tenant = (await t.admin.post("/tenants", { slug: "c6", name: "c6" })).body.id as string;
  const role = await t.db
    .selectFrom("role")
    .select("id")
    .where("builtin", "=", true)
    .where("name", "=", "tenant_admin")
    .executeTakeFirstOrThrow();
  await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: role.id });
  const base = `/tenants/${tenant}/workspaces`;
  const ws = (await t.admin.post(base, { slug: "main", name: "Main", type: "production" })).body
    .id as string;
  const up = await t.admin.post(`${base}/${ws}/bundles`, bundle);
  await t.admin.post(`${base}/${ws}/deployments`, { bundleId: up.body.id });
  const started = await t.admin.post(`${base}/${ws}/runs`, { script: "greet", input: {} });
  const run = (started.body.id ?? started.body.runId) as string;
  const as = async (name: string) => ({
    authorization: `Bearer ${(await createWorkerCredential(t.db, { tenantId: tenant, name })).token}`,
  });
  const holder = await as("a");
  const other = await as("b");
  const claim = await t.app.inject({
    method: "POST",
    url: "/api/v1/worker/claim",
    headers: holder,
    payload: { workerId: randomUUID(), waitSeconds: 0 },
  });
  expect(claim.json().job.runId).toBe(run);
  const report = (headers: Record<string, string>, what: string, payload: object) =>
    t.app.inject({ method: "POST", url: `/api/v1/worker/runs/${run}/${what}`, headers, payload });
  expect((await report(other, "heartbeat", { attempt: 1 })).statusCode).toBe(409);
  expect(
    (await report(other, "complete", { attempt: 1, output: { forged: true } })).statusCode,
  ).toBe(409);
  expect(
    (await report(other, "fail", { attempt: 1, error: { message: "forged" } })).statusCode,
  ).toBe(409);
  // The run is still the holder's to finish.
  expect((await report(holder, "complete", { attempt: 1, output: {} })).statusCode).toBe(204);
});
