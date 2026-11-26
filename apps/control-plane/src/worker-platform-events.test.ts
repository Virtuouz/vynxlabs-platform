// A script cannot publish an event under platform/: those are the platform's own.
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
        uses: { connections: [], secrets: [], variables: [], events: ["platform/run-finished"] },
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

test("a script cannot publish platform/run-finished with a forged payload", async () => {
  const tenant = (await t.admin.post("/tenants", { slug: "rt102", name: "rt102" })).body
    .id as string;
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
  // The people's route refuses the name:
  const viaApi = await t.admin.post(`${base}/${ws}/events`, {
    name: "platform/run-finished",
    payload: {},
  });
  expect(viaApi.status).toBe(400);
  const started = await t.admin.post(`${base}/${ws}/runs`, { script: "greet", input: {} });
  const run = (started.body.id ?? started.body.runId) as string;
  const { token } = await createWorkerCredential(t.db, { tenantId: tenant, name: "w" });
  const headers = { authorization: `Bearer ${token}` };
  const claim = await t.app.inject({
    method: "POST",
    url: "/api/v1/worker/claim",
    headers,
    payload: { workerId: randomUUID(), waitSeconds: 0 },
  });
  expect(claim.json().job.runId).toBe(run);
  const forged = await t.app.inject({
    method: "POST",
    url: `/api/v1/worker/runs/${run}/events`,
    headers,
    payload: {
      attempt: 1,
      event: "platform/run-finished",
      payload: {
        runId: "x",
        script: "billing/close",
        status: "failed",
        error: "forged",
        nonsense: true,
      },
    },
  });
  expect(forged.statusCode, "a script may not publish a platform event").toBe(400);
});
