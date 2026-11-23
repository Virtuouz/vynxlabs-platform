import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createWorkerCredential, seeWorker } from "./kernel/execution/workers.js";
import { startTestApp, type TestApp } from "./testing.js";

// A worker is "older" when it is older than what this control plane speaks: one of the
// control plane's own version is not.

let t: TestApp;
let tenant: string;

beforeAll(async () => {
  t = await startTestApp({ version: "0.5.0" });
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
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

test("a worker of the control plane's own version is not outdated, an older one is", async () => {
  const credential = await createWorkerCredential(t.db, { tenantId: tenant, name: "w" });
  const scope = {
    credentialId: credential.row.id,
    tenantId: tenant,
    workspaceId: null,
    pool: null,
  };
  const ids: Record<string, string> = {};
  for (const version of ["0.5.0", "0.4.2"]) {
    ids[version] = randomUUID();
    await seeWorker(t.kernel, scope, ids[version] as string, version);
  }
  const listed = (await t.admin.get(`/tenants/${tenant}/workers`)).body.items as {
    id: string;
    outdated: boolean;
  }[];
  expect(listed.find((one) => one.id === ids["0.5.0"])?.outdated).toBe(false);
  expect(listed.find((one) => one.id === ids["0.4.2"])?.outdated).toBe(true);
});
