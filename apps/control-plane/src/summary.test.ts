import { sql } from "@vynxlabs/db";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let prod: string;
let alice: Client; // tenant admin
let mia: Client; // app maintainer: reads the workspace, not its runs
let roles: Record<string, string>;

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;

function bundle(): Bundle {
  const manifests: BundleManifest[] = [
    {
      kind: "script",
      schemaVersion: 1,
      path: "orders/sync",
      ownership: "code",
      body: {
        entry: "sync",
        input: { type: "object" },
        output: { type: "object" },
        timeoutSeconds: 30,
        retries: { limit: 0, delaySeconds: 0, backoff: false },
        uses: { connections: ["erp"], secrets: [], variables: [] },
      },
    },
    {
      kind: "connection",
      schemaVersion: 1,
      path: "erp",
      ownership: "code",
      body: { connector: "http", description: "The ERP" },
    },
  ];
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export const sync = { execute: async () => ({}) };\n",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

async function member(email: string, role: string, at: Record<string, string>) {
  const made = await alice.post(`/tenants/${tenant}/members`, {
    email,
    name: email,
    password: PASSWORD,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const bound = await alice.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: made.body.id,
    roleId: roles[role],
    ...at,
  });
  expect(bound.status, JSON.stringify(bound.body)).toBe(201);
  return t.signIn(email, PASSWORD);
}

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const made = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "Alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: made.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);

  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "orders",
      name: "Orders",
      type: "production",
    })
  ).body.id;
  const made2 = await alice.post(`/tenants/${tenant}/workspaces`, {
    slug: "orders-dev",
    name: "Orders dev",
    type: "dev",
    linkedWorkspaceId: prod,
  });
  expect(made2.status, JSON.stringify(made2.body)).toBe(201);
  dev = made2.body.id;
  mia = await member("mia@acme.example", "app_maintainer", { workspaceId: dev });
});
afterAll(async () => {
  await t?.stop();
});

describe("a workspace's summary", () => {
  test("an empty workspace has nothing to report", async () => {
    const summary = await alice.get(`${ws()}/summary`);
    expect(summary.status, JSON.stringify(summary.body)).toBe(200);
    expect(summary.body).toMatchObject({
      drafts: 0,
      failedRuns: { count: 0 },
      unboundConnections: 0,
      approvalsWaiting: 0,
      version: null,
      linked: { id: prod, name: "Orders", type: "production", version: null, same: false },
    });
  });

  test("counts drafts, connections with nothing bound, failed runs, and whether production runs the same", async () => {
    const uploaded = await alice.post(`${ws()}/bundles`, bundle());
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    // A deploy needs every connection bound. Bind it, deploy, then take the binding away.
    const bound = await alice.put(`${ws()}/connection-bindings/erp`, {
      config: { baseUrl: "https://erp.example.test" },
    });
    expect(bound.status, JSON.stringify(bound.body)).toBeLessThan(300);
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBeLessThan(300);
    expect((await alice.delete(`${ws()}/connection-bindings/erp`)).status).toBeLessThan(300);
    const draft = await alice.put(`${ws()}/drafts/orders/note`, {
      kind: "variable",
      schemaVersion: 1,
      body: { description: "A note" },
    });
    expect(draft.status, JSON.stringify(draft.body)).toBeLessThan(300);

    // A failed run of the deployed script, as a worker would have left it.
    const active = await t.db
      .selectFrom("workspace")
      .innerJoin("bundle", "bundle.id", "workspace.active_bundle_id")
      .innerJoin("resource", "resource.workspace_id", "workspace.id")
      .select(["bundle.id as bundle", "resource.id as resource"])
      .where("workspace.id", "=", dev)
      .where("resource.path", "=", "orders/sync")
      .executeTakeFirstOrThrow();
    await sql`
      insert into run (id, tenant_id, workspace_id, resource_id, script_path, bundle_id, status,
        max_attempts, trigger_type, trigger_detail, started_by_type, idempotency_key, finished_at)
      values (gen_random_uuid(), ${tenant}, ${dev}, ${active.resource}, 'orders/sync', ${active.bundle},
        'failed', 1, 'manual', '{}', 'system', gen_random_uuid()::text, now())
    `.execute(t.db);

    const summary = (await alice.get(`${ws()}/summary`)).body;
    expect(summary.drafts).toBe(1);
    expect(summary.unboundConnections).toBe(1);
    expect(summary.failedRuns.count).toBe(1);
    expect(summary.version).toBe(1);
    expect(summary.linked.same).toBe(false);
  });

  test("a count the caller may not read is null, not zero", async () => {
    const summary = await mia.get(`${ws()}/summary`);
    expect(summary.status, JSON.stringify(summary.body)).toBe(200);
    expect(summary.body.failedRuns.count).toBeNull();
    expect(summary.body.unboundConnections).toBeNull();
    expect(summary.body.drafts).toBeNull();
  });
});

describe("who uses what", () => {
  test("a connection is used by the script that declares it", async () => {
    const found = await alice.get(`${ws()}/references?kind=connection&name=erp`);
    expect(found.status, JSON.stringify(found.body)).toBe(200);
    expect(found.body.items).toEqual([
      {
        target: { kind: "connection", name: "erp" },
        by: { kind: "script", path: "orders/sync" },
        how: "calls it",
      },
    ]);
    expect((await alice.get(`${ws()}/references?kind=secret`)).body.items).toEqual([]);
  });
});

describe("small things the console shows", () => {
  test("a key keeps its last four characters, a service account says what it is for, and where a member was is remembered", async () => {
    const account = await alice.post(`/tenants/${tenant}/service-accounts`, {
      name: "ci",
      description: " Deploys from CI ",
    });
    expect(account.body.description).toBe("Deploys from CI");
    const changed = await alice.patch(`/tenants/${tenant}/service-accounts/${account.body.id}`, {
      description: "Deploys from CI and nightly ",
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.description).toBe("Deploys from CI and nightly");
    const key = await alice.post(
      `/tenants/${tenant}/service-accounts/${account.body.id}/api-keys`,
      {
        name: "main",
      },
    );
    expect(key.status, JSON.stringify(key.body)).toBe(201);
    expect(key.body.suffix).toBe(key.body.token.slice(-4));
    expect(key.body.token.startsWith(key.body.prefix)).toBe(true);

    const remembered = await alice.put("/me/recent", { tenantId: tenant, workspaceId: dev });
    expect(remembered.status, JSON.stringify(remembered.body)).toBe(204);
    expect((await alice.get("/me/recent")).body.items).toEqual([
      expect.objectContaining({ tenantId: tenant, workspaceId: dev }),
    ]);
    // A workspace of another tenant is not kept against this one.
    await alice.put("/me/recent", {
      tenantId: tenant,
      workspaceId: "00000000-0000-7000-8000-00000000beef",
    });
    expect((await alice.get("/me/recent")).body.items[0].workspaceId).toBeNull();
  });
});

describe("worker pools", () => {
  test("a pool is made, shown with what serves it, and kept while a credential serves it", async () => {
    const made = await alice.post(`/tenants/${tenant}/worker-pools`, {
      name: "client-lan",
      description: "Inside the client's network",
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(
      (await alice.post(`/tenants/${tenant}/worker-pools`, { name: "client-lan" })).status,
    ).toBe(409);
    const credential = await alice.post(`/tenants/${tenant}/worker-credentials`, {
      name: "lan-1",
      pool: "client-lan",
    });
    expect(credential.status, JSON.stringify(credential.body)).toBe(201);
    // A credential for a pool not made yet makes it.
    await alice.post(`/tenants/${tenant}/worker-credentials`, { name: "dock-1", pool: "dock" });
    const pools = (await alice.get(`/tenants/${tenant}/worker-pools`)).body.items;
    expect(pools[0]).toMatchObject({ id: null, name: null });
    expect(pools.find((one: { name: string }) => one.name === "client-lan")).toMatchObject({
      description: "Inside the client's network",
      credentials: 1,
      online: 0,
      lastSeenAt: null,
    });
    expect(pools.some((one: { name: string }) => one.name === "dock")).toBe(true);
    expect((await alice.delete(`/tenants/${tenant}/worker-pools/${made.body.id}`)).status).toBe(
      409,
    );
    await alice.delete(`/tenants/${tenant}/worker-credentials/${credential.body.id}`);
    expect((await alice.delete(`/tenants/${tenant}/worker-pools/${made.body.id}`)).status).toBe(
      204,
    );
  });
});

describe("a tenant's summary", () => {
  test("counts workspaces and members, and nothing to fix", async () => {
    const summary = await alice.get(`/tenants/${tenant}/summary`);
    expect(summary.status, JSON.stringify(summary.body)).toBe(200);
    expect(summary.body).toMatchObject({
      workspaces: 2,
      approvalsWaiting: 0,
      domainsToFix: 0,
      workersOnline: 0,
      operatorAccessActive: 0,
      members: 2,
    });
  });
});
