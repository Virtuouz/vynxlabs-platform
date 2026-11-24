import { type Bundle, type BundleManifest, bundleDigest, formatFor } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let dev: string;
let prod: string;
let alice: Client; // tenant admin
let quinn: Client; // holds a role on one resource of dev, nothing else
let nobody: Client; // a member of the tenant with no grant anywhere
let stranger: Client; // a member of another tenant
let roles: Record<string, string>;

const ws = (id = dev) => `/tenants/${tenant}/workspaces/${id}`;

async function member(email: string) {
  const made = await alice.post(`/tenants/${tenant}/members`, {
    email,
    name: email,
    password: PASSWORD,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body.id as string;
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
  dev = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "orders-dev",
      name: "Orders dev",
      type: "dev",
      linkedWorkspaceId: prod,
    })
  ).body.id;
  const manifests: BundleManifest[] = ["orders/note", "orders/other"].map((path) => ({
    kind: "variable",
    schemaVersion: 1,
    path,
    ownership: "code",
    body: { description: "A note" },
  }));
  const unsigned = {
    formatVersion: formatFor(1, manifests),
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests,
    code: "export {};\n",
  };
  const bundle: Bundle = { ...unsigned, digest: bundleDigest(unsigned) };
  const uploaded = await alice.post(`${ws()}/bundles`, bundle);
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
  const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
  expect(deployed.status, JSON.stringify(deployed.body)).toBeLessThan(300);

  const reader = await alice.post(`/tenants/${tenant}/roles`, {
    name: "note_reader",
    description: "Reads the notes it is bound to.",
    permissions: ["variable:read"],
  });
  expect(reader.status, JSON.stringify(reader.body)).toBe(201);
  const note = (await alice.get(`${ws()}/resources/orders/note`)).body;
  const quinnId = await member("quinn@acme.example");
  const bound = await alice.post(`/tenants/${tenant}/bindings`, {
    workspaceId: dev,
    resourceId: note.id,
    principalType: "member",
    principalId: quinnId,
    roleId: reader.body.id,
  });
  expect(bound.status, JSON.stringify(bound.body)).toBe(201);
  await member("nobody@acme.example");
  quinn = await t.signIn("quinn@acme.example", PASSWORD);
  nobody = await t.signIn("nobody@acme.example", PASSWORD);

  const other = (await t.admin.post("/tenants", { slug: "elsewhere", name: "Elsewhere" })).body.id;
  const grant2 = await t.admin.post(`/tenants/${other}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const made2 = await t.admin.post(`/tenants/${other}/members`, {
    email: "sam@elsewhere.example",
    name: "Sam",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${other}/bindings`, {
    principalType: "member",
    principalId: made2.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${other}/access-grants/${grant2.body.id}`);
  stranger = await t.signIn("sam@elsewhere.example", PASSWORD);
});
afterAll(async () => {
  await t?.stop();
});

describe("someone whose only grant is on one resource inside a workspace (GOV-37, fix-gating)", () => {
  test("reaches what the shell draws, with a name and a kind and nothing more", async () => {
    const one = await quinn.get(ws());
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(one.body).toMatchObject({
      id: dev,
      slug: "orders-dev",
      name: "Orders dev",
      type: "dev",
    });
    // The link to production, the limits and the alert are the workspace's settings.
    expect(one.body.linkedWorkspaceId).toBeNull();
    expect(one.body.failureAlert).toEqual({});
    expect(one.body.onlyInside).toBe(true);

    const summary = await quinn.get(`${ws()}/summary`);
    expect(summary.status, JSON.stringify(summary.body)).toBe(200);
    expect(summary.body.linked).toBeNull();
    expect(summary.body.version).toBeNull();
    expect(summary.body.drafts).toBeNull();
    expect(summary.body.unboundConnections).toBeNull();

    const tenantOne = await quinn.get(`/tenants/${tenant}`);
    expect(tenantOne.status, JSON.stringify(tenantOne.body)).toBe(200);
    expect(tenantOne.body).toMatchObject({ slug: "acme", name: "Acme", mayRename: false });
    const counts = await quinn.get(`/tenants/${tenant}/summary`);
    expect(counts.status, JSON.stringify(counts.body)).toBe(200);
    expect(counts.body.members).toBeNull();
    expect(counts.body.workspaces).toBeNull();
  });

  test("lists only the workspace they hold something in", async () => {
    const list = await quinn.get(`/tenants/${tenant}/workspaces`);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.items.map((one: { slug: string }) => one.slug)).toEqual(["orders-dev"]);
    expect((await alice.get(`/tenants/${tenant}/workspaces`)).body.items).toHaveLength(2);
  });

  test("reads nothing else: other resources, lists, other workspaces, the tenant's own records", async () => {
    expect((await quinn.get(`${ws()}/resources/orders/other`)).status).toBe(403);
    expect((await quinn.get(`${ws()}/resources`)).status).toBe(403);
    expect((await quinn.get(`${ws()}/secrets`)).status).toBe(403);
    expect((await quinn.get(`${ws()}/connection-bindings`)).status).toBe(403);
    expect((await quinn.patch(ws(), { name: "Mine now" })).status).toBe(403);
    // Another workspace of the same tenant: nothing is bound there.
    expect((await quinn.get(ws(prod))).status).toBe(403);
    expect((await quinn.get(`${ws(prod)}/summary`)).status).toBe(403);
    expect((await quinn.get(`/tenants/${tenant}/members`)).status).toBe(403);
    expect((await quinn.patch(`/tenants/${tenant}`, { name: "Mine now" })).status).toBe(403);
    // What it was given is still read, and asked about on that resource alone.
    const asked = (query: string) => quinn.get(`${ws()}/allowed?permissions=variable:read${query}`);
    expect((await asked("&kind=variable&path=orders/note")).body.allowed).toEqual([
      "variable:read",
    ]);
    expect((await asked("&kind=variable&path=orders/other")).body.allowed).toEqual([]);
  });

  test("someone with no grant there is still refused, and a stranger still finds no tenant", async () => {
    expect((await nobody.get(ws())).status).toBe(403);
    expect((await nobody.get(`${ws()}/summary`)).status).toBe(403);
    expect((await nobody.get(`/tenants/${tenant}`)).status).toBe(403);
    expect((await nobody.get(`/tenants/${tenant}/summary`)).status).toBe(403);
    expect((await nobody.get(`/tenants/${tenant}/workspaces`)).status).toBe(403);
    expect((await stranger.get(ws())).status).toBe(404);
    expect((await stranger.get(`/tenants/${tenant}`)).status).toBe(404);
    expect((await stranger.get(`/tenants/${tenant}/workspaces`)).status).toBe(404);
  });
});
