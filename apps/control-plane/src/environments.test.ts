import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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

describe("guards", () => {
  test("every change by a principal went through the write path, and every new route was exercised", () => {
    expect(
      t.unaudited.filter((route) => !/\/rows?\//.test(route)),
      JSON.stringify(t.unaudited),
    ).toEqual([]);
    expect(t.unexercised((route) => /\/promotions?(-preview)?$/.test(route))).toEqual([]);
  });
});
