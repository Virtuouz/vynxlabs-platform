import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { settleDrafts } from "./kernel/execution/deploy.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let prod: string;
let alice: Client;
let viewer: Client;
let worker: Worker;
let working: Promise<unknown>;

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;
const flow = (value: string) => ({
  nodes: {
    start: { type: "trigger", trigger: { type: "manual" } },
    note: { type: "set", values: { said: value } },
  },
  edges: [{ from: "start", to: "note" }],
});
/** A bundle as a CLI that knows nothing of the console builds it: one script. */
function localBundle(greeting: string): Bundle {
  const script: BundleManifest = {
    kind: "script",
    schemaVersion: 1,
    path: "hello",
    ownership: "code",
    body: {
      entry: "hello",
      input: { type: "object" },
      output: { type: "object" },
      timeoutSeconds: 30,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
    },
  };
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [script],
    code: `export const hello = { execute: async (input) => ({ said: "${greeting} " + input.name }) };`,
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
// biome-ignore lint/suspicious/noExplicitAny: run bodies are inspected freely
async function finished(id: string, workspace = dev): Promise<any> {
  for (let i = 0; i < 150; i++) {
    const body = (await alice.get(`${ws(workspace)}/runs/${id}`)).body;
    if (!["queued", "running"].includes(body.status)) return body;
    await sleep(100);
  }
  throw new Error("The run did not finish.");
}
const files = async (query = "") =>
  (await alice.get(`${ws()}/resource-files${query}`)).body as {
    files: { path: string; content: string }[];
    bundleVersion: number | null;
    drafts: { path: string; revision: number; deleted: boolean }[];
  };

beforeAll(async () => {
  t = await startTestApp({ version: "0.5.0" });
  const url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = async (email: string, role: string) => {
    const created = await t.admin.post(`/tenants/${tenant}/members`, {
      email,
      name: email,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: created.body.id,
      roleId: roles[role],
    });
    return t.signIn(email, PASSWORD);
  };
  alice = await member("alice@acme.example", "tenant_admin");
  viewer = await member("vic@acme.example", "viewer");
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "dev", name: "Dev", type: "dev" })
  ).body.id;
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "prod",
      name: "Prod",
      type: "production",
    })
  ).body.id;
  const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "cli" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1 });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker?.stop();
  await working;
  await t?.stop();
});

describe("the console's resources, as files", () => {
  test("are the deployed set with the drafts laid over it, or the deployed set alone", async () => {
    expect(await files()).toEqual({ files: [], bundleVersion: null, drafts: [] });
    for (const [path, value] of [
      ["orders/intake", "'first'"],
      ["orders/archive", "'old'"],
    ] as const) {
      await alice.put(`${ws()}/drafts/${path}`, {
        kind: "flow",
        schemaVersion: 1,
        body: flow(value),
      });
    }
    expect((await alice.post(`${ws()}/changes/deploy`, {})).status).toBeLessThan(300);
    // A change, and a removal, not yet deployed.
    const saved = (await alice.get(`${ws()}/resources/orders/intake`)).body;
    expect(saved.ownership).toBe("ui");
    await alice.put(`${ws()}/drafts/orders/intake`, {
      kind: "flow",
      schemaVersion: 1,
      body: flow("'second'"),
    });
    await alice.put(`${ws()}/drafts/orders/archive`, {
      kind: "flow",
      schemaVersion: 1,
      body: {},
      deleted: true,
    });

    const withDrafts = await files();
    expect(withDrafts.drafts).toEqual([
      { path: "orders/archive", revision: expect.any(Number), deleted: true },
      { path: "orders/intake", revision: expect.any(Number), deleted: false },
    ]);
    expect(withDrafts.bundleVersion).toEqual(expect.any(Number));
    expect(withDrafts.files.map((file) => file.path)).toEqual(["orders/intake.flow.yaml"]);
    expect(withDrafts.files[0]?.content).toContain("said: \"'second'\"");
    const deployed = await files("?drafts=false");
    expect(deployed.files.map((file) => file.path)).toEqual([
      "orders/archive.flow.yaml",
      "orders/intake.flow.yaml",
    ]);
    expect(deployed.files[1]?.content).toContain("'first'");
    // Part of the set would read as all of it: only one who may read every resource gets it.
    expect((await viewer.get(`${ws()}/resource-files`)).status).toBe(200);
    expect((await t.anonymous.get(`${ws()}/resource-files`)).status).toBe(401);
  });

  test("a deploy removes the drafts it made true, and keeps the others", async () => {
    const deployedManifest = (body: unknown, path: string): BundleManifest => ({
      kind: "flow",
      schemaVersion: 1,
      path,
      ownership: "ui",
      body: body as Record<string, unknown>,
    });
    await alice.put(`${ws()}/drafts/orders/other`, {
      kind: "flow",
      schemaVersion: 1,
      body: flow("'not deployed'"),
    });
    const settled = await t.db
      .transaction()
      .execute((trx) =>
        settleDrafts(trx, dev, [
          deployedManifest(flow("'second'"), "orders/intake"),
          deployedManifest(flow("'something else'"), "orders/other"),
        ]),
      );
    // The change is now what runs; the removal's path is gone; the other differs.
    expect(settled.sort()).toEqual(["orders/archive", "orders/intake"]);
    const left = (await alice.get(`${ws()}/drafts`)).body.items.map(
      (item: { path: string }) => item.path,
    );
    expect(left).toEqual(["orders/other"]);
    await alice.delete(`${ws()}/drafts/orders/other`);
  });
});

describe("a local build, tried on the platform", () => {
  let preview: string;

  test("is stored as a preview, never offered for deploying, with the console's resources kept on it", async () => {
    const before = (await alice.get(`${ws()}/bundles`)).body.items.length;
    const uploaded = await alice.post(`${ws()}/bundles?preview=true`, localBundle("Hello"));
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    preview = uploaded.body.id;
    expect((await alice.get(`${ws()}/bundles`)).body.items).toHaveLength(before);
    const row = await t.db
      .selectFrom("bundle")
      .select(["origin"])
      .where("id", "=", preview)
      .executeTakeFirstOrThrow();
    expect(row.origin).toBe("preview");
    // The flow made in the console is on it, beside the local script.
    const { loadBundle } = await import("./kernel/execution/bundles.js");
    const stored = await t.db
      .selectFrom("bundle")
      .select(["id", "storage_key"])
      .where("id", "=", preview)
      .executeTakeFirstOrThrow();
    const paths = (await loadBundle(t.kernel, stored)).manifests.map((one) => one.path).sort();
    expect(paths).toContain("hello");
    expect(paths).toContain("orders/intake");
    // Nothing was deployed.
    expect((await alice.get(`${ws()}/resources/hello`)).status).toBe(404);
  });

  test("runs in a workspace that has never deployed anything", async () => {
    // Workers once took runs only from workspaces with something deployed: a try in a new
    // dev workspace waited for ever.
    const fresh = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "fresh",
        name: "Fresh",
        type: "dev",
      })
    ).body.id;
    const uploaded = await alice.post(`${ws(fresh)}/bundles?preview=true`, localBundle("Hey"));
    const started = await alice.post(`${ws(fresh)}/test-runs`, {
      script: "hello",
      bundleId: uploaded.body.id,
      input: { name: "Bo" },
    });
    const run = await finished(started.body.runId, fresh);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    expect(run.output).toEqual({ said: "Hey Bo" });
  });

  test("runs as it is, from a test run, in a dev workspace only", async () => {
    const started = await alice.post(`${ws()}/test-runs`, {
      script: "hello",
      bundleId: preview,
      input: { name: "ada" },
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    expect(started.body).toMatchObject({ kind: "script", bundleId: preview });
    const run = await finished(started.body.runId);
    expect(run.status, JSON.stringify(run.error)).toBe("succeeded");
    expect(run.output).toEqual({ said: "Hello ada" });
    expect(run.trigger).toMatchObject({ type: "manual", draft: true, local: true });
    // A flow from the console, from the same build.
    const flowRun = await alice.post(`${ws()}/test-runs`, {
      flow: "orders/intake",
      bundleId: preview,
    });
    expect(flowRun.status, JSON.stringify(flowRun.body)).toBe(201);

    // Not in production, and not another workspace's bundle.
    const there = await alice.post(`${ws(prod)}/bundles?preview=true`, localBundle("Hi"));
    expect(
      (await alice.post(`${ws(prod)}/test-runs`, { script: "hello", bundleId: there.body.id }))
        .status,
    ).toBe(409);
    expect(
      (await alice.post(`${ws()}/test-runs`, { script: "hello", bundleId: there.body.id })).status,
    ).toBe(404);
    // One who may not write code may not run it.
    expect(
      (await viewer.post(`${ws()}/test-runs`, { script: "hello", bundleId: preview })).status,
    ).toBe(403);
  });
});
