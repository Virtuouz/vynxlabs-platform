import { newId } from "@volvel/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let alice: Client;
let bob: Client;
let carol: Client;
let main: string;
let roles: Record<string, string>;

// biome-ignore lint/suspicious/noExplicitAny: bodies are inspected freely
type Any = any;

const at = () => `/tenants/${tenant}/access`;
const maker = {
  kind: "tenant_role",
  key: "group_maker",
  body: { permissions: ["group:write", "group:read"] },
};
const _group = (key: string, title = key) => ({ kind: "group", key, body: { title } });
const releases = async () => (await alice.get(`${at()}/releases`)).body.items as Any[];

beforeAll(async () => {
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "lakeshore", name: "Lakeshore" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const people: Record<string, string> = {};
  for (const who of ["alice", "bob", "carol"]) {
    const member = await t.admin.post(`/tenants/${tenant}/members`, {
      email: `${who}@lakeshore.example`,
      name: who,
      password: PASSWORD,
    });
    people[who] = member.body.id;
    if (who === "carol") continue;
    await t.admin.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: member.body.id,
      roleId: roles.tenant_admin,
    });
  }
  const maker = await t.admin.post(`/tenants/${tenant}/roles`, {
    name: "group_maker",
    permissions: ["group:write", "group:read"],
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: people.carol,
    roleId: maker.body.id,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@lakeshore.example", PASSWORD);
  bob = await t.signIn("bob@lakeshore.example", PASSWORD);
  carol = await t.signIn("carol@lakeshore.example", PASSWORD);
  main = (
    await alice.post(`/tenants/${tenant}/workspaces`, { slug: "main", name: "Main", type: "dev" })
  ).body.id;
}, 60_000);

afterAll(async () => {
  await t.stop();
});

describe("tenant access, lane t3-access", () => {
  test("ACC-17: giving what is already given records no release and answers the one there", async () => {
    const ops = await alice.post(`/tenants/${tenant}/groups`, { name: "Desk" });
    const given = { principalType: "group", principalId: ops.body.id, roleId: roles.viewer };
    const first = await alice.post(`/tenants/${tenant}/bindings`, given);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const before = (await releases()).length;
    const again = await alice.post(`/tenants/${tenant}/bindings`, given);
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body.id).toBe(first.body.id);
    expect(await releases()).toHaveLength(before);
    const member = (await alice.get(`/tenants/${tenant}/members`)).body.items[0];
    const one = { principalType: "member", principalId: member.id, roleId: roles.viewer };
    const m1 = await alice.post(`/tenants/${tenant}/bindings`, one);
    const m2 = await alice.post(`/tenants/${tenant}/bindings`, one);
    expect(m1.status, JSON.stringify(m1.body)).toBe(201);
    expect(m2.status, JSON.stringify(m2.body)).toBe(201);
    expect(m2.body.id).toBe(m1.body.id);
  });

  test("ACC-22: a role that lists a retired permission still saves a new description", async () => {
    const made = await alice.post(`/tenants/${tenant}/roles`, {
      name: "old_timer",
      permissions: ["group:read"],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    await t.db
      .updateTable("role")
      .set({ permissions: ["group:read", "legacy:read"] as never })
      .where("id", "=", made.body.id)
      .execute();
    const changed = await alice.patch(`/tenants/${tenant}/roles/${made.body.id}`, {
      description: "Kept for the desk.",
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.permissions).toContain("legacy:read");
    // A retired permission that is not already held is still refused.
    const added = await alice.patch(`/tenants/${tenant}/roles/${made.body.id}`, {
      permissions: ["group:read", "legacy:read", "legacy:write"],
    });
    expect(added.status).toBe(400);
  });
});
