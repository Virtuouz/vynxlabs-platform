import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let workspace: string;
let alice: Client;
let worker: Worker;
let working: Promise<unknown>;
let outside: Server;
let outsideUrl: string;
const received: { url: string; authorization: string | undefined }[] = [];

const ws = () => `/tenants/${tenant}/workspaces/${workspace}`;
const script = (path: string, entry: string, uses: Record<string, unknown>): BundleManifest => ({
  kind: "script",
  schemaVersion: 1,
  path,
  ownership: "code",
  body: {
    entry,
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [], ...uses },
  },
});
function bundle(change: (manifests: BundleManifest[]) => BundleManifest[] = (m) => m): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: change([
      {
        kind: "connection_group",
        schemaVersion: 1,
        path: "shops",
        ownership: "code",
        body: { connector: "http", description: "Each customer's shop." },
      },
      {
        kind: "connection_group",
        schemaVersion: 1,
        path: "erps",
        ownership: "code",
        body: { connector: "http" },
      },
      script("orders/fetch", "fetchOrders", { connectionGroups: ["shops"] }),
      script("orders/peek", "peek", {}),
    ]),
    code: `
export const fetchOrders = { execute: async (input, ctx) => {
  const shops = ctx.connections("shops");
  if (input.list) return { keys: await shops.keys() };
  const shop = await shops.get(input.shop);
  const answer = await shop.get("/orders");
  return { status: answer.status };
} };
export const peek = { execute: async (input, ctx) => {
  const group = ctx.connections(input.group);
  return input.list ? { keys: await group.keys() } : { ok: Boolean(await group.get(input.shop)) };
} };
`,
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}
// biome-ignore lint/suspicious/noExplicitAny: run bodies are inspected freely
async function run(scriptPath: string, input: unknown): Promise<any> {
  const started = await alice.post(`${ws()}/runs`, { script: scriptPath, input });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  for (let i = 0; i < 150; i++) {
    const body = (await alice.get(`${ws()}/runs/${started.body.id}`)).body;
    if (!["queued", "running"].includes(body.status)) return body;
    await sleep(100);
  }
  throw new Error("The run did not finish.");
}
const member = (key: string, token: string, label = "") =>
  alice.put(`${ws()}/connection-group-members/${key}/shops`, {
    label,
    config: { baseUrl: `${outsideUrl}/${key}`, auth: { type: "bearer" } },
    credential: token,
  });

beforeAll(async () => {
  outside = createServer((request, response) => {
    received.push({ url: request.url ?? "", authorization: request.headers.authorization });
    response.setHeader("content-type", "application/json");
    response.end("[]");
  });
  await new Promise<void>((resolve) => outside.listen(0, "127.0.0.1", resolve));
  outsideUrl = `http://127.0.0.1:${(outside.address() as AddressInfo).port}`;

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
  const created = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "Alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: created.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  workspace = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "test" });
  worker = new Worker({ url, token: credential.body.token, claimWaitSeconds: 1 });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker?.stop();
  await working;
  outside.closeAllConnections();
  await new Promise((resolve) => outside.close(resolve));
  await t.stop();
});

describe("a connection group", () => {
  test("deploys with no member bound, and a script must name a group that exists", async () => {
    const unknown = await alice.post(
      `${ws()}/bundles`,
      bundle((m) => [...m, script("orders/lost", "peek", { connectionGroups: ["nowhere"] })]),
    );
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(unknown.body.errors)).toContain(
      'connectionGroups refers to \\"nowhere\\", which is not a connection_group in this repository.',
    );

    const uploaded = await alice.post(`${ws()}/bundles`, bundle());
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
    // Nothing has to be bound first: members come and go without a deploy.
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBe(201);
    const groups = (await alice.get(`${ws()}/connection-groups`)).body.items;
    expect(groups).toMatchObject([
      { path: "erps", description: "", connector: "http", members: [] },
      { path: "shops", description: "Each customer's shop.", connector: "http", members: [] },
    ]);
    // Each says what a member's configuration must look like, so a form can be drawn for it.
    expect(groups[0].configSchema.required).toEqual(["baseUrl"]);
  });

  test("members are added in the workspace, and their credentials are never shown", async () => {
    expect((await member("north", "tok-north-1", "North shop")).status).toBe(204);
    expect((await member("south", "tok-south-1")).status).toBe(204);
    const shops = (await alice.get(`${ws()}/connection-groups`)).body.items.find(
      (group: { path: string }) => group.path === "shops",
    );
    expect(shops.members).toEqual([
      expect.objectContaining({ key: "north", label: "North shop", hasCredential: true }),
      expect.objectContaining({ key: "south", label: "", hasCredential: true }),
    ]);
    expect(JSON.stringify(shops)).not.toContain("tok-north-1");
    // A group that is not declared, a key that is not a key, a config that is not one.
    expect(
      (
        await alice.put(`${ws()}/connection-group-members/a/nowhere`, {
          config: { baseUrl: outsideUrl },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await alice.put(`${ws()}/connection-group-members/bad key/shops`, {
          config: { baseUrl: outsideUrl },
        })
      ).status,
    ).toBe(400);
    expect(
      (await alice.put(`${ws()}/connection-group-members/x/shops`, { config: {} })).status,
    ).toBe(400);
  });

  test("a script picks the member by data, and each call goes out with that member's own credential", async () => {
    received.length = 0;
    expect((await run("orders/fetch", { shop: "north" })).output).toEqual({ status: 200 });
    expect((await run("orders/fetch", { shop: "south" })).output).toEqual({ status: 200 });
    expect(received).toEqual([
      { url: "/north/orders", authorization: "Bearer tok-north-1" },
      { url: "/south/orders", authorization: "Bearer tok-south-1" },
    ]);
    expect((await run("orders/fetch", { list: true })).output).toEqual({
      keys: [
        { key: "north", label: "North shop" },
        { key: "south", label: "" },
      ],
    });
  });

  test("a member added or changed takes effect on the next run, with no deploy", async () => {
    const before = (await alice.get(`${ws()}/deployments?limit=50`)).body.items.length;
    await member("east", "tok-east-1");
    await member("north", "tok-north-2");
    received.length = 0;
    await run("orders/fetch", { shop: "east" });
    await run("orders/fetch", { shop: "north" });
    expect(received.map((one) => one.authorization)).toEqual([
      "Bearer tok-east-1",
      "Bearer tok-north-2",
    ]);
    // Changing the address alone keeps the stored credential.
    await alice.put(`${ws()}/connection-group-members/east/shops`, {
      config: { baseUrl: `${outsideUrl}/moved`, auth: { type: "bearer" } },
    });
    received.length = 0;
    await run("orders/fetch", { shop: "east" });
    expect(received).toEqual([{ url: "/moved/orders", authorization: "Bearer tok-east-1" }]);
    expect((await alice.get(`${ws()}/deployments?limit=50`)).body.items.length).toBe(before);
  });

  test("a key with no member, and a group the script did not declare, fail the run and say why", async () => {
    const missing = await run("orders/fetch", { shop: "west" });
    expect(missing.status).toBe("failed");
    expect(missing.error.message).toContain(
      'The member "west" of the connection group shops was not found',
    );

    expect((await alice.delete(`${ws()}/connection-group-members/south/shops`)).status).toBe(204);
    expect((await run("orders/fetch", { shop: "south" })).status).toBe("failed");
    expect((await alice.delete(`${ws()}/connection-group-members/south/shops`)).status).toBe(404);

    // `orders/peek` declares no group, so it reaches none, by listing or by key.
    for (const input of [
      { group: "shops", shop: "north" },
      { group: "shops", list: true },
      { group: "erps", list: true },
    ]) {
      const refused = await run("orders/peek", input);
      expect(refused.status).toBe("failed");
      expect(refused.error.message).toContain("a declared use of the connection group");
    }
  });

  test("every change was audited without a credential, and every route used", async () => {
    expect(t.unaudited).toEqual([]);
    expect(
      t.unexercised((route) => /\/(connection-groups|connection-group-members)(\/|$)/.test(route)),
    ).toEqual([]);
    const entries = (await alice.get(`/tenants/${tenant}/audit?limit=200&area=connection_group`))
      .body.items as { action: string; details: object }[];
    expect(new Set(entries.map((entry) => entry.action))).toEqual(
      new Set([
        "connection_group.member_added",
        "connection_group.member_changed",
        "connection_group.member_removed",
      ]),
    );
    expect(JSON.stringify(entries)).not.toContain("tok-");
  });
});
