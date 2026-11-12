import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "@vynxlabs/db";
import { createTestDatabase } from "@vynxlabs/db/testing";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { workspaceSchema } from "./kernel/data/apply.js";
import { readConnection } from "./kernel/execution/bindings.js";
import { fireDueSchedules } from "./kernel/execution/triggers.js";
import { revealSecret } from "./kernel/secrets.js";
import { INSTANCE_TABLES, OWNED_TABLES } from "./kernel/tenancy/tables.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let otherTenant: string;
let alice: Client;
let devOnly: Client;
let dev: string;
let qa: string;
let prod: string;
let foreign: string;
let gina: Client;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;
const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});
const object = { type: "object" };
const script = (path: string, uses: Record<string, string[]> = {}) =>
  manifest("script", path, {
    entry: "main",
    input: object,
    output: object,
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [], ...uses },
  });
const items = (columns: Record<string, object>) => manifest("table", "items", { columns });

function bundle(manifests: BundleManifest[]): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.2.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export const main = { execute: async () => ({}) };",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
const v1 = bundle([
  manifest("connection", "api", { connector: "http" }),
  items({ name: { type: "text", required: true }, note: { type: "text" } }),
  script("use", { connections: ["api"], tables: ["items"] }),
]);
const v2 = bundle([
  manifest("connection", "api", { connector: "http" }),
  items({
    title: { type: "text", required: true, renamedFrom: "name" },
    done: { type: "boolean", default: false },
  }),
  script("use", { connections: ["api"], tables: ["items"] }),
  script("extra"),
]);

const ws = (id: string) => `/tenants/${tenant}/workspaces/${id}`;
async function deploy(client: Client, workspace: string, content: Bundle) {
  const uploaded = await client.post(`${ws(workspace)}/bundles`, content);
  if (uploaded.status >= 300) return uploaded;
  return client.post(`${ws(workspace)}/deployments`, { bundleId: uploaded.body.id });
}
const active = async (workspace: string) =>
  (await alice.get(`${ws(workspace)}/bundles`)).body.items.find((b: Any) => b.active);
const bind = (workspace: string) =>
  alice.put(`${ws(workspace)}/connection-bindings/api`, { config: { baseUrl: "http://x.test" } });

beforeAll(async () => {
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const seed = async (slug: string, email: string) => {
    const id = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
    const grant = await t.admin.post(`/tenants/${id}/access-grants`, {
      reason: "Setup",
      roleId: roles.tenant_admin,
    });
    const member = await t.admin.post(`/tenants/${id}/members`, {
      email,
      name: email,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${id}/bindings`, {
      principalType: "member",
      principalId: member.body.id,
      roleId: roles.tenant_admin,
    });
    await t.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
    return { id, client: await t.signIn(email, PASSWORD) };
  };
  const acme = await seed("acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
  const globex = await seed("globex", "gina@globex.example");
  otherTenant = globex.id;
  gina = globex.client;
  foreign = (
    await globex.client.post(`/tenants/${otherTenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  const make = async (slug: string, type: string) =>
    (await alice.post(`/tenants/${tenant}/workspaces`, { slug, name: slug, type })).body
      .id as string;
  prod = await make("main", "production");
  qa = await make("qa", "dev");
  dev = await make("dev", "dev");

  // Someone who may deploy in dev and only look at production.
  const dana = await alice.post(`/tenants/${tenant}/members`, {
    email: "dana@acme.example",
    name: "Dana",
    password: PASSWORD,
  });
  await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: dev,
    principalType: "member",
    principalId: dana.body.id,
    roleId: roles.developer,
  });
  await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: prod,
    principalType: "member",
    principalId: dana.body.id,
    roleId: roles.viewer,
  });
  devOnly = await t.signIn("dana@acme.example", PASSWORD);
}, 60_000);

afterAll(async () => {
  await t.stop();
});

describe("linking workspaces", () => {
  const link = (from: string, to: string | null) =>
    alice.patch(ws(from), { linkedWorkspaceId: to });

  test("a dev workspace links to production or to another dev workspace, within its tenant", async () => {
    expect((await link(dev, prod)).body.linkedWorkspaceId).toBe(prod);
    expect((await link(dev, qa)).body.linkedWorkspaceId).toBe(qa);
    expect((await link(dev, foreign)).status).toBe(400);
    expect((await link(dev, dev)).status).toBe(400);
    const fromProd = await link(prod, dev);
    expect(fromProd.status).toBe(400);
    expect(fromProd.body.detail).toBe("Only a dev workspace can link to another workspace.");
  });

  test("links cannot form a loop", async () => {
    // dev already leads to qa.
    const loop = await link(qa, dev);
    expect(loop.status).toBe(400);
    expect(loop.body.detail).toBe("That link would lead back to this workspace.");
    expect((await link(qa, prod)).status).toBe(200);
  });
});

describe("promotion", () => {
  test("there must be a link and something deployed", async () => {
    const nothing = await alice.post(`${ws(dev)}/promotions`);
    expect(nothing.status).toBe(409);
    expect(nothing.body.detail).toContain("nothing deployed");
    const unlinked = await alice.post(`${ws(prod)}/promotions`);
    expect(unlinked.status).toBe(409);
    expect(unlinked.body.detail).toContain("not linked");
  });

  test("the preview says why a promotion would be refused, and changes nothing", async () => {
    await bind(dev);
    expect((await deploy(alice, dev, v1)).status).toBe(201);
    await alice.post(`${ws(dev)}/rows/items`, { name: "made in dev" });

    const preview = (await alice.get(`${ws(dev)}/promotion-preview`)).body;
    expect(preview).toMatchObject({
      target: { id: qa, slug: "qa", type: "dev" },
      bundle: { digest: v1.digest, version: 1 },
      possible: false,
      summary: null,
      refusal: {
        code: "bindings_missing",
        errors: [
          {
            path: "/connections/api",
            message: 'the connection "api" is not bound in this workspace',
          },
        ],
      },
    });
    const refused = await alice.post(`${ws(dev)}/promotions`);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("bindings_missing");
    // Neither the preview nor the refusal left anything behind.
    expect((await alice.get(`${ws(qa)}/bundles`)).body.items).toEqual([]);
    expect((await alice.get(`${ws(qa)}/tables`)).body.items).toEqual([]);
  });

  test("the preview lists what would change, and the promotion then does exactly that", async () => {
    await bind(qa);
    const audited = async () =>
      (await alice.get(`/tenants/${tenant}/audit?limit=200`)).body.items.length as number;
    const before = await audited();
    const preview = (await alice.get(`${ws(dev)}/promotion-preview`)).body;
    expect(preview.possible).toBe(true);
    expect(preview.summary).toMatchObject({ created: 3, updated: 0, deleted: 0, unchanged: 0 });
    expect(preview.summary.changes).toEqual([
      { change: "created", kind: "connection", path: "api" },
      { change: "created", kind: "table", path: "items" },
      { change: "created", kind: "script", path: "use" },
    ]);
    expect(preview.summary.data).toEqual(["Table items created."]);
    // A preview is not a change: no bundle, no table, and nothing in the audit log.
    expect((await alice.get(`${ws(qa)}/bundles`)).body.items).toEqual([]);
    expect((await alice.get(`${ws(qa)}/tables`)).body.items).toEqual([]);
    expect(await audited()).toBe(before);

    const promoted = await alice.post(`${ws(dev)}/promotions`);
    expect(promoted.status, JSON.stringify(promoted.body)).toBe(201);
    expect(promoted.body).toMatchObject({ workspaceId: qa, digest: v1.digest, bundleVersion: 1 });
    expect(promoted.body.summary).toEqual(preview.summary);
    // The same bundle is active in both. It was not rebuilt: the digest is the same.
    expect((await active(qa)).digest).toBe((await active(dev)).digest);
    const deployment = (await alice.get(`${ws(qa)}/deployments`)).body.items[0];
    expect(deployment.promotedFromWorkspaceId).toBe(dev);
    expect((await alice.get(`${ws(dev)}/deployments`)).body.items[0].promotedFromWorkspaceId).toBe(
      null,
    );
    // Data does not travel with a promotion. Each workspace keeps its own rows.
    expect((await alice.get(`${ws(qa)}/rows/items`)).body.items).toEqual([]);
    const actions = (await alice.get(`/tenants/${tenant}/audit?limit=20`)).body.items.map(
      (entry: Any) => entry.action,
    );
    expect(actions).toEqual(expect.arrayContaining(["bundle.promoted", "deployment.created"]));
  });

  test("promoting again when nothing changed is harmless", async () => {
    const again = await alice.post(`${ws(dev)}/promotions`);
    expect(again.status).toBe(201);
    expect(again.body.summary).toMatchObject({ created: 0, updated: 0, unchanged: 3, changes: [] });
    expect((await alice.get(`${ws(qa)}/bundles`)).body.items).toHaveLength(1);
  });

  test("a change moves from dev to QA to production, and each workspace's rows survive it", async () => {
    await bind(prod);
    // Production starts on the first bundle, with rows of its own.
    expect((await alice.post(`${ws(qa)}/promotions`)).status).toBe(201);
    await alice.post(`${ws(prod)}/rows/items`, {
      rows: [{ name: "P1", note: "keep" }, { name: "P2" }],
    });
    await alice.post(`${ws(qa)}/rows/items`, { name: "Q1" });

    expect((await deploy(alice, dev, v2)).status).toBe(201);
    const toQa = await alice.post(`${ws(dev)}/promotions`);
    expect(toQa.body.summary.data.sort()).toEqual([
      "Table items: column done added.",
      "Table items: column name renamed to title. Its values are kept.",
      "Table items: column note retired. Its values are kept.",
    ]);
    // Production is untouched until QA promotes in turn.
    expect((await active(prod)).digest).toBe(v1.digest);
    const preview = (await alice.get(`${ws(qa)}/promotion-preview`)).body;
    expect(preview.target).toMatchObject({ id: prod, type: "production" });
    expect(preview.summary.changes).toEqual([
      { change: "updated", kind: "table", path: "items" },
      { change: "created", kind: "script", path: "extra" },
    ]);
    const toProd = await alice.post(`${ws(qa)}/promotions`);
    expect(toProd.status).toBe(201);
    expect(toProd.body.summary).toEqual(preview.summary);
    for (const workspace of [dev, qa, prod])
      expect((await active(workspace)).digest).toBe(v2.digest);
    expect(
      (await alice.get(`${ws(prod)}/rows/items?sort=title`)).body.items.map((row: Any) => [
        row.title,
        row.done,
      ]),
    ).toEqual([
      ["P1", false],
      ["P2", false],
    ]);
    expect((await alice.get(`${ws(qa)}/rows/items`)).body.items[0].title).toBe("Q1");
  });

  test("rolling back the target is an ordinary deploy of its earlier bundle", async () => {
    const first = (await alice.get(`${ws(prod)}/bundles`)).body.items.find(
      (b: Any) => b.digest === v1.digest,
    );
    expect((await alice.post(`${ws(prod)}/deployments`, { bundleId: first.id })).status).toBe(201);
    expect(
      (await alice.get(`${ws(prod)}/rows/items?sort=name`)).body.items.map((row: Any) => [
        row.name,
        row.note,
      ]),
    ).toEqual([
      ["P1", "keep"],
      ["P2", null],
    ]);
  });

  test("promoting needs the right to deploy where the bundle is going", async () => {
    await alice.patch(ws(dev), { linkedWorkspaceId: prod });
    // Dana may deploy in dev and look at production: she can preview, not promote.
    expect((await devOnly.get(`${ws(dev)}/promotion-preview`)).status).toBe(200);
    const refused = await devOnly.post(`${ws(dev)}/promotions`);
    expect(refused.status).toBe(403);
    expect((await active(prod)).digest).toBe(v1.digest);
    expect((await alice.post(`${ws(dev)}/promotions`)).status).toBe(201);
    expect((await active(prod)).digest).toBe(v2.digest);
  });
});

// ----- Pausing, cloning and deleting -----

const shopBundle = bundle([
  manifest("connection", "api", { connector: "http" }),
  manifest("variable", "batch", { default: "10" }),
  manifest("data_source", "erp", { connector: "postgres" }),
  manifest("event", "ping", { payload: { type: "object" } }),
  manifest("table", "docs", {
    columns: { title: { type: "text", required: true }, attachment: { type: "file" } },
  }),
  manifest("table", "notes", {
    columns: { text: { type: "text" }, doc: { type: "reference", references: "docs" } },
  }),
  script("job", {
    connections: ["api"],
    secrets: ["TOKEN"],
    variables: ["batch"],
    sources: ["erp"],
    tables: ["docs", "notes"],
  }),
  manifest("schedule", "tick", { script: "job", cron: "* * * * *" }),
  manifest("trigger", "hook", { type: "webhook", script: "job" }),
  manifest("trigger", "on-ping", { type: "event", script: "job", event: "ping" }),
]);
let shop: string;
let fileId: string;
let docId: string;

const runsIn = async (workspace: string) =>
  (await alice.get(`${ws(workspace)}/runs`)).body.items.length as number;
const hookOf = async (workspace: string) =>
  (await alice.get(`${ws(workspace)}/triggers`)).body.items.find(
    (item: Any) => item.path === "hook",
  ).url as string;
const callHook = (address: string) =>
  t.app.inject({ method: "POST", url: new URL(address).pathname, payload: {} });
const soon = () => new Date(Date.now() + 5 * 60_000);
async function cloned(body: Record<string, unknown>, client = alice, from = shop) {
  const asked = await client.post(`${ws(from)}/clones`, body);
  if (asked.status !== 202) return asked;
  for (let i = 0; i < 200; i++) {
    const now = await alice.get(`/tenants/${tenant}/workspace-clones/${asked.body.id}`);
    if (now.body.status !== "running") return now;
    await sleep(50);
  }
  throw new Error("the clone did not finish");
}

describe("pausing a workspace", () => {
  test("setting up a workspace that does things by itself", async () => {
    shop = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "shop",
        name: "Shop",
        type: "production",
      })
    ).body.id;
    await alice.put(`${ws(shop)}/connection-bindings/api`, {
      config: { baseUrl: "http://real.test", auth: { type: "bearer" } },
      credential: "real-api-key",
    });
    await alice.put(`${ws(shop)}/secrets/TOKEN`, { value: "real-secret" });
    await alice.put(`${ws(shop)}/variable-values/batch`, { value: "25" });
    await alice.put(`${ws(shop)}/data-source-bindings/erp`, {
      config: { host: "erp.internal", database: "erp", user: "sync" },
      password: "erp-password",
    });
    const deployed = await deploy(alice, shop, shopBundle);
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
  });

  test("while paused, no schedule, webhook or event starts anything, and each resumes", async () => {
    const hook = await hookOf(shop);
    expect((await alice.get(ws(shop))).body.triggersPaused).toBe(false);
    const paused = await alice.patch(ws(shop), { triggersPaused: true });
    expect(paused.body.triggersPaused).toBe(true);

    expect(await fireDueSchedules(t.kernel, soon())).toBe(0);
    const refused = await callHook(hook);
    expect(refused.statusCode).toBe(503);
    expect(refused.json().code).toBe("workspace_paused");
    const published = await alice.post(`${ws(shop)}/events`, { name: "ping", payload: {} });
    expect(published.status).toBe(201);
    expect(published.body.started).toBe(0);
    expect(await runsIn(shop)).toBe(0);
    // Starting something by hand still works.
    expect((await alice.post(`${ws(shop)}/runs`, { script: "job", input: {} })).status).toBe(201);
    expect(await runsIn(shop)).toBe(1);

    await alice.patch(ws(shop), { triggersPaused: false });
    // The schedule that came due while paused fires once.
    expect(await fireDueSchedules(t.kernel, soon())).toBe(1);
    expect((await callHook(hook)).statusCode).toBe(202);
    expect(
      (await alice.post(`${ws(shop)}/events`, { name: "ping", payload: {} })).body.started,
    ).toBe(1);
    expect(await runsIn(shop)).toBe(4);
    const actions = (await alice.get(`/tenants/${tenant}/audit?limit=30`)).body.items.map(
      (entry: Any) => entry.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining(["workspace.triggers_paused", "workspace.triggers_resumed"]),
    );
    // Nothing more should fire behind the tests that follow.
    await alice.patch(ws(shop), { triggersPaused: true });
    for (const run of (await alice.get(`${ws(shop)}/runs`)).body.items) {
      await alice.post(`${ws(shop)}/runs/${run.id}/cancellation`);
    }
  });
});

describe("cloning a workspace", () => {
  test("the source has rows, a file and a table made in the console", async () => {
    const uploaded = await alice.upload(
      `${ws(shop)}/files?name=spec.txt`,
      "the spec",
      "text/plain",
    );
    fileId = uploaded.body.id;
    const doc = await alice.post(`${ws(shop)}/rows/docs`, { title: "Spec", attachment: fileId });
    docId = doc.body.items[0].id;
    await alice.post(`${ws(shop)}/rows/docs`, { title: "Plain" });
    await alice.post(`${ws(shop)}/rows/notes`, { text: "about the spec", doc: docId });
    const made = await alice.put(`${ws(shop)}/resources/scratch`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: { columns: { label: { type: "text" } } },
    });
    expect(made.status).toBe(201);
    await alice.post(`${ws(shop)}/rows/scratch`, { label: "made in the console" });
  });

  let safeClone: string;

  test("a clone with data, safety on: everything is there and nothing can reach a real system", async () => {
    const done = await cloned({ slug: "shop-copy", name: "Shop copy", withData: true });
    expect(done.body.status, JSON.stringify(done.body)).toBe("succeeded");
    expect(done.body).toMatchObject({ withData: true, safe: true, sourceWorkspaceId: shop });
    expect(done.body.report).toMatchObject({
      variables: 1,
      connections: 0,
      dataSources: 0,
      secrets: 0,
      tables: 3,
      rows: 4,
      files: 1,
    });
    safeClone = done.body.workspaceId;

    // Always a dev workspace, linked to where it came from, and paused.
    expect((await alice.get(ws(safeClone))).body).toMatchObject({
      type: "dev",
      linkedWorkspaceId: shop,
      triggersPaused: true,
    });
    expect((await active(safeClone)).digest).toBe(shopBundle.digest);
    const tables = (await alice.get(`${ws(safeClone)}/tables`)).body.items;
    expect(tables.map((table: Any) => [table.name, table.managedIn, table.rowCount])).toEqual([
      ["docs", "code", 2],
      ["notes", "code", 1],
      ["scratch", "ui", 1],
    ]);

    // Rows keep their IDs, so references between them still hold.
    const docs = (await alice.get(`${ws(safeClone)}/rows/docs?sort=title`)).body.items;
    expect(docs.map((row: Any) => row.title)).toEqual(["Plain", "Spec"]);
    expect(docs[1].id).toBe(docId);
    expect((await alice.get(`${ws(safeClone)}/rows/notes`)).body.items[0].doc).toBe(docId);
    // The clone has its own copy of the file, with the same bytes.
    expect(docs[1].attachment).not.toBe(fileId);
    const copy = await alice.get(`${ws(safeClone)}/files/${docs[1].attachment}`);
    expect(copy.body).toMatchObject({ name: "spec.txt", sizeBytes: 8 });
    const key = (
      await t.db
        .selectFrom("file")
        .select("storage_key")
        .where("id", "=", docs[1].attachment)
        .executeTakeFirstOrThrow()
    ).storage_key;
    expect((await t.kernel.storage.get(key)).toString()).toBe("the spec");

    // Unbound: no connection, no data source, no secret value. The variable is not a secret and is copied.
    expect((await alice.get(`${ws(safeClone)}/connection-bindings`)).body.items).toEqual([
      expect.objectContaining({ path: "api", bound: false, hasCredential: false }),
    ]);
    expect((await alice.get(`${ws(safeClone)}/data-source-bindings`)).body.items).toEqual([
      expect.objectContaining({ path: "erp", bound: false, hasPassword: false }),
    ]);
    expect((await alice.get(`${ws(safeClone)}/secrets`)).body.items).toEqual([]);
    expect(
      (await alice.get(`${ws(safeClone)}/variable-values`)).body.items.find(
        (item: Any) => item.path === "batch",
      ).value,
    ).toBe("25");
  });

  test("a clone starts nothing: its webhook has a new address and is paused, and its schedule does not fire", async () => {
    const [mine, theirs] = [await hookOf(safeClone), await hookOf(shop)];
    expect(mine).not.toBe(theirs);
    expect((await callHook(mine)).statusCode).toBe(503);
    await fireDueSchedules(t.kernel, soon());
    expect(await runsIn(safeClone)).toBe(0);
  });

  test("the source is untouched, and changing the clone does not change it", async () => {
    const first = (await alice.get(`${ws(safeClone)}/rows/docs?sort=title`)).body.items[0];
    await alice.patch(`${ws(safeClone)}/row/${first.id}/docs`, { title: "Changed in the copy" });
    await alice.delete(
      `${ws(safeClone)}/files/${(await alice.get(`${ws(safeClone)}/files`)).body.items[0].id}`,
    );
    expect(
      (await alice.get(`${ws(shop)}/rows/docs?sort=title`)).body.items.map((row: Any) => row.title),
    ).toEqual(["Plain", "Spec"]);
    expect((await alice.get(`${ws(shop)}/files/${fileId}`)).status).toBe(200);
    expect((await alice.get(`${ws(shop)}/bundles`)).body.items).toHaveLength(1);
    expect((await alice.get(`${ws(shop)}/connection-bindings`)).body.items[0].bound).toBe(true);
  });

  test("the clone promotes back to its source like any linked workspace", async () => {
    const preview = (await alice.get(`${ws(safeClone)}/promotion-preview`)).body;
    expect(preview).toMatchObject({ target: { id: shop }, possible: true });
    expect(preview.summary).toMatchObject({ created: 0, updated: 0, deleted: 0 });
  });

  test("a clone without data, safety off: bindings and secrets come along, and the audit log says so", async () => {
    const done = await cloned({ slug: "shop-live", name: "Shop live copy", safe: false });
    expect(done.body.status, JSON.stringify(done.body)).toBe("succeeded");
    expect(done.body.report).toMatchObject({
      connections: 1,
      dataSources: 1,
      secrets: 1,
      rows: 0,
      files: 0,
    });
    const live = done.body.workspaceId as string;
    expect((await alice.get(`${ws(live)}/rows/docs`)).body.items).toEqual([]);
    // Each value was sealed again for the new workspace, and opens there.
    const connection = await readConnection(t.kernel, t.db, {
      tenantId: tenant,
      workspaceId: live,
      path: "api",
    });
    expect(connection).toMatchObject({
      config: { baseUrl: "http://real.test" },
      credential: "real-api-key",
    });
    expect(
      await revealSecret(t.db, t.kernel.vault, {
        tenantId: tenant,
        workspaceId: live,
        name: "TOKEN",
      }),
    ).toBe("real-secret");
    expect((await alice.get(`${ws(live)}/data-source-bindings`)).body.items[0]).toMatchObject({
      bound: true,
      hasPassword: true,
    });
    // Even so, it starts paused.
    expect((await alice.get(ws(live))).body.triggersPaused).toBe(true);
    const entry = (
      await alice.get(`/tenants/${tenant}/audit?action=workspace.cloned&limit=5`)
    ).body.items.find((item: Any) => item.targetId === live);
    expect(entry.details).toMatchObject({
      safety: "off",
      withData: false,
      sourceWorkspaceId: shop,
    });
    // No secret value is in the audit log.
    expect(
      JSON.stringify((await alice.get(`/tenants/${tenant}/audit?limit=200`)).body),
    ).not.toMatch(/real-secret|real-api-key|erp-password/);
  });

  test("cloning needs the right to create workspaces, and a free slug", async () => {
    expect((await cloned({ slug: "nope", name: "Nope" }, devOnly, dev)).status).toBe(403);
    const taken = await cloned({ slug: "shop-copy", name: "Again" });
    expect(taken.status).toBe(400);
    expect(taken.body.errors[0].message).toContain("has this slug");
    expect((await alice.get(`/tenants/${tenant}/workspace-clones`)).body.items).toHaveLength(2);
    expect((await gina.get(`/tenants/${tenant}/workspace-clones`)).status).toBe(404);
  });

  test("deleting a clone removes its tables and files, and nothing of its source", async () => {
    const key = (
      await t.db
        .selectFrom("file")
        .select("storage_key")
        .where("workspace_id", "=", shop)
        .executeTakeFirstOrThrow()
    ).storage_key;
    const data = (await t.kernel.data.forTenant(tenant)).owner;
    const schemas = async () =>
      (
        await sql<{ name: string }>`
          select nspname as name from pg_namespace where nspname in (${workspaceSchema(shop)}, ${workspaceSchema(safeClone)})
        `.execute(data)
      ).rows.map((row) => row.name);
    expect(await schemas()).toHaveLength(2);

    expect((await alice.delete(`${ws(shop)}?confirm=shop`)).status).toBe(409);
    expect((await alice.delete(`${ws(safeClone)}?confirm=wrong`)).status).toBe(400);
    expect((await devOnly.delete(`${ws(safeClone)}?confirm=shop-copy`)).status).toBe(403);
    expect((await alice.delete(`${ws(safeClone)}?confirm=shop-copy`)).status).toBe(204);

    expect((await alice.get(ws(safeClone))).status).toBe(404);
    expect(await schemas()).toEqual([workspaceSchema(shop)]);
    for (const table of ["resource", "bundle", "file", "secret", "trigger_state"] as const) {
      expect(
        await t.db
          .selectFrom(table)
          .select("tenant_id")
          .where("workspace_id", "=", safeClone)
          .execute(),
      ).toEqual([]);
    }
    expect(
      await data
        .selectFrom("data_table")
        .select("id")
        .where("workspace_id", "=", safeClone)
        .execute(),
    ).toEqual([]);
    // The source keeps everything.
    expect((await t.kernel.storage.get(key)).toString()).toBe("the spec");
    expect((await alice.get(`${ws(shop)}/rows/docs`)).body.items).toHaveLength(2);
    // The record that it existed and was deleted stays in the tenant's log.
    const entry = (await alice.get(`/tenants/${tenant}/audit?action=workspace.deleted`)).body
      .items[0];
    expect(entry.details).toMatchObject({ slug: "shop-copy", tables: 3 });
  });
});

describe("deleting a tenant", () => {
  test("only an operator can, with the slug typed, and then nothing of it is left but its audit log", async () => {
    // Globex has a table with a row and a file, so there is something to remove.
    const stuff = bundle([items({ name: { type: "text" } })]);
    const uploaded = await gina.post(
      `/tenants/${otherTenant}/workspaces/${foreign}/bundles`,
      stuff,
    );
    await gina.post(`/tenants/${otherTenant}/workspaces/${foreign}/deployments`, {
      bundleId: uploaded.body.id,
    });
    await gina.post(`/tenants/${otherTenant}/workspaces/${foreign}/rows/items`, { name: "theirs" });
    const file = await gina.upload(
      `/tenants/${otherTenant}/workspaces/${foreign}/files?name=a.txt`,
      "bytes",
      "text/plain",
    );
    const key = (
      await t.db
        .selectFrom("file")
        .select("storage_key")
        .where("id", "=", file.body.id)
        .executeTakeFirstOrThrow()
    ).storage_key;

    expect(
      (await gina.post(`/tenants/${otherTenant}/deletion`, { confirm: "globex" })).status,
    ).toBe(403);
    expect(
      (await t.admin.post(`/tenants/${otherTenant}/deletion`, { confirm: "acme" })).status,
    ).toBe(400);
    const deleted = await t.admin.post(`/tenants/${otherTenant}/deletion`, { confirm: "globex" });
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(204);

    expect((await t.admin.get(`/tenants/${otherTenant}`)).status).toBe(404);
    for (const entry of OWNED_TABLES) {
      const left = await sql<{ n: string }>`
        select count(*) as n from ${sql.table(entry.table)} as t where ${entry.ofTenant(otherTenant)}
      `.execute(t.db);
      // Only the record of what was done remains.
      expect([entry.table, left.rows[0]?.n === "0"]).toEqual([entry.table, entry.keep !== true]);
    }
    const schema =
      await sql`select 1 from pg_namespace where nspname = ${workspaceSchema(foreign)}`.execute(
        t.db,
      );
    expect(schema.rows).toEqual([]);
    await expect(t.kernel.storage.get(key)).rejects.toThrow();
    // Gina's account belongs to the instance. She can still sign in, and sees no tenant.
    expect((await gina.get("/me")).body.tenants).toEqual([]);
    const record = (await t.admin.get("/audit?action=tenant.deleted")).body.items[0];
    expect(record.details).toMatchObject({ slug: "globex", workspaces: 1, tables: 1, files: 1 });
    // The other tenant is as it was.
    expect((await alice.get(`${ws(shop)}/rows/docs`)).body.items).toHaveLength(2);
    // A new tenant can take the name.
    expect((await t.admin.post("/tenants", { slug: "globex", name: "Globex again" })).status).toBe(
      201,
    );
  });
});

describe("database locations", () => {
  test("an operator registers one, sees whether it answers, and removes it", async () => {
    const extra = await createTestDatabase();
    try {
      const bad = await t.admin.put("/instance/database-locations/spare", {
        connectionString: "mysql://x",
      });
      expect(bad.status).toBe(400);
      const unreachable = await t.admin.put("/instance/database-locations/spare", {
        connectionString: "postgres://nobody:nothing@127.0.0.1:1/none",
      });
      expect(unreachable.status).toBe(400);
      expect(unreachable.body.detail).toContain("could not be prepared");
      expect(
        (
          await t.admin.put("/instance/database-locations/spare", {
            connectionString: extra.connectionString,
            description: "For the next big client",
          })
        ).status,
      ).toBe(204);
      const listed = (await t.admin.get("/instance/database-locations")).body.items;
      expect(listed).toEqual([
        expect.objectContaining({
          name: "spare",
          description: "For the next big client",
          tenants: 0,
          reachable: true,
        }),
      ]);
      expect(JSON.stringify(listed)).not.toContain(
        new URL(extra.connectionString).password || "\u0000",
      );
      const audit = (await t.admin.get("/audit?action=database_location.set")).body.items[0];
      expect(JSON.stringify(audit)).not.toMatch(/postgres:\/\//);
      expect(
        (
          await t.admin.post("/tenants", {
            slug: "initech",
            name: "Initech",
            dataLocation: "nowhere",
          })
        ).status,
      ).toBe(400);
      expect((await t.admin.delete("/instance/database-locations/spare")).status).toBe(204);
      expect((await t.admin.delete("/instance/database-locations/spare")).status).toBe(404);
    } finally {
      await extra.drop();
    }
  });
});

describe("the list of tenant-owned tables", () => {
  test("names every table in the database, so none is forgotten when a tenant is deleted or exported", async () => {
    const present = (
      await sql<{ name: string }>`
        select table_name as name from information_schema.tables where table_schema = 'public' order by 1
      `.execute(t.db)
    ).rows.map((row) => row.name);
    const known = [...OWNED_TABLES.map((entry) => entry.table), ...INSTANCE_TABLES].sort();
    expect(known).toEqual(present);
    // And every table that carries a tenant's ID is one a tenant owns.
    const carrying = (
      await sql<{ name: string }>`
        select table_name as name from information_schema.columns
        where table_schema = 'public' and column_name = 'tenant_id' order by 1
      `.execute(t.db)
    ).rows.map((row) => row.name);
    const owned = new Set<string>(OWNED_TABLES.map((entry) => entry.table));
    expect(carrying.filter((name) => !owned.has(name) && name !== "data_table")).toEqual([]);
  });
});

describe("guards", () => {
  test("every change by a principal went through the write path, and every new route was exercised", () => {
    expect(
      t.unaudited.filter((route) => !/\/rows?\//.test(route)),
      JSON.stringify(t.unaudited),
    ).toEqual([]);
    expect(
      t.unexercised((route) =>
        /\/(promotions?(-preview)?|clones|deletion|database-locations(\/:name)?|workspaces\/:w)$/.test(
          route,
        ),
      ),
    ).toEqual([]);
  });
});
