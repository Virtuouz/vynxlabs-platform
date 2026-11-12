import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, expect, test } from "vitest";
import { claimRun } from "./kernel/execution/runs.js";
import { exportTenant } from "./kernel/tenancy/export.js";
import { startTestApp, type TestApp } from "./testing.js";

// Work that holds one connection while it waits for another stops for good once
// every connection is held that way. This instance has a single connection, so
// anything here that asks for a second while holding the first never finishes.

let t: TestApp;
let tenant: string;
const workspaces: string[] = [];

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

const scope = () => ({ credentialId: "none", tenantId: tenant, workspaceId: null, pool: null });

/** Fails instead of waiting for the test's own time limit, so the cause is named. */
async function within<T>(seconds: number, what: string, work: Promise<T>): Promise<T> {
  const late = sleep(seconds * 1000).then(() => {
    throw new Error(`${what} did not finish in ${seconds} seconds.`);
  });
  return Promise.race([work, late]);
}

async function drain(stream: AsyncGenerator<Buffer>): Promise<number> {
  let bytes = 0;
  for await (const piece of stream) bytes += piece.length;
  return bytes;
}

async function workspace(slug: string): Promise<string> {
  const base = `/tenants/${tenant}/workspaces`;
  const created = await t.admin.post(base, { slug, name: slug, type: "dev" });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const id = created.body.id as string;
  const uploaded = await t.admin.post(`${base}/${id}/bundles`, bundle);
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  const deployed = await t.admin.post(`${base}/${id}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  workspaces.push(id);
  return id;
}

beforeAll(async () => {
  t = await startTestApp({ maxConnections: 1 });
  const role = await t.db
    .selectFrom("role")
    .select("id")
    .where("builtin", "=", true)
    .where("name", "=", "tenant_admin")
    .executeTakeFirstOrThrow();
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: role.id });
});

afterAll(async () => {
  await t?.stop();
});

test("workers asking for work in a workspace that has never queued a run", async () => {
  await workspace("first");
  const claims = Array.from({ length: 6 }, (_, n) => claimRun(t.kernel, scope(), `worker-${n}`));
  expect(await within(10, "Claiming", Promise.all(claims))).toEqual(Array(6).fill(null));
});

test("two exports at once", async () => {
  const options = { passphrase: "correct horse battery staple", history: true };
  const sizes = await within(
    10,
    "Exporting",
    Promise.all([
      drain(exportTenant(t.kernel, tenant, options)),
      drain(exportTenant(t.kernel, tenant, options)),
    ]),
  );
  for (const size of sizes) expect(size).toBeGreaterThan(1024);
});

test("an export while workers ask for work in a new workspace", async () => {
  await workspace("second");
  const options = { passphrase: "correct horse battery staple", history: false };
  const [size, ...claimed] = await within(
    10,
    "Exporting beside claims",
    Promise.all([
      drain(exportTenant(t.kernel, tenant, options)),
      ...Array.from({ length: 4 }, (_, n) => claimRun(t.kernel, scope(), `worker-${n}`)),
    ]),
  );
  expect(size).toBeGreaterThan(1024);
  expect(claimed).toEqual(Array(4).fill(null));
});
