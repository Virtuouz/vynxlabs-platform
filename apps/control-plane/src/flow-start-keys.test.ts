import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

// A webhook's address follows its step's key through a rename, and a deploy that would
// stop an address says so.

let t: TestApp;
let tenant: string;

const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});

function bundle(start: string, extra: Record<string, unknown> = {}): Bundle {
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
      manifest("flow", "hooks", {
        nodes: {
          [start]: { type: "trigger", ...extra, trigger: { type: "webhook" } },
          step: { type: "script", script: "work" },
        },
        edges: [{ from: start, to: "step" }],
      }),
    ],
    code: "export const work = { execute: async () => ({}) };",
  };
  return { ...body, digest: bundleDigest(body) } as Bundle;
}

async function deploy(ws: string, next: Bundle) {
  const uploaded = await t.admin.post(`${ws}/bundles`, next);
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  const deployed = await t.admin.post(`${ws}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  return deployed.body;
}
const address = async (ws: string): Promise<string | null> =>
  ((await t.admin.get(`${ws}/flows/hooks`)).body.triggers as { url: string | null }[])[0]?.url ??
  null;

beforeAll(async () => {
  t = await startTestApp();
  tenant = (await t.admin.post("/tenants", { slug: "keys", name: "Keys" })).body.id;
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

async function workspace(slug: string) {
  const created = await t.admin.post(`/tenants/${tenant}/workspaces`, {
    slug,
    name: slug,
    type: "production",
  });
  return `/tenants/${tenant}/workspaces/${created.body.id}`;
}

test("a renamed webhook step with a key keeps its address, and one without says it will lose it (FLW-04)", async () => {
  const ws = await workspace("renamed");
  await deploy(ws, bundle("intake"));
  const first = await address(ws);
  expect(first).toBeTruthy();

  const kept = await deploy(ws, bundle("inbox", { key: "intake" }));
  expect(kept.summary.breaking).toEqual([]);
  expect(await address(ws)).toBe(first);
  // The address still starts the flow, at the step's new name.
  const delivered = await t.anonymous.post(new URL(first as string).pathname.replace("/api/v1", ""), {});
  expect(delivered.status).toBe(202);

  const lost = await deploy(ws, bundle("front_door"));
  expect(lost.summary.breaking).toHaveLength(1);
  expect(lost.summary.breaking[0].message).toContain('"inbox"');
  expect(lost.summary.breaking[0].message).toContain("address stops answering");
  expect(await address(ws)).not.toBe(first);
});
