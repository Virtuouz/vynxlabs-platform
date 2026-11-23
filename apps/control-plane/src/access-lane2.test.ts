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
const group = (key: string, title = key) => ({ kind: "group", key, body: { title } });
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

const madeByProvider = async (table: "principal_group" | "end_user_group", name: string) => {
  const id = newId();
  await t.db
    .insertInto(table)
    .values({ id, tenant_id: tenant, key: name.toLowerCase(), name, managed_by: "provider" })
    .execute();
  return id;
};

describe("releases of access, lane acc2", () => {
  test("ACC-11: deleting a group an identity provider made is refused, and nothing is recorded", async () => {
    const before = (await releases()).length;
    for (const [table, path] of [
      ["principal_group", "groups"],
      ["end_user_group", "end-user-groups"],
    ] as const) {
      const id = await madeByProvider(table, `Pushed${path.length}`);
      const gone = await alice.delete(`/tenants/${tenant}/${path}/${id}`);
      expect(gone.status, JSON.stringify(gone.body)).toBe(409);
      expect(gone.body.detail).toContain("made by the identity provider");
      expect(await t.db.selectFrom(table).select("id").where("id", "=", id).execute()).toHaveLength(
        1,
      );
    }
    expect(await releases()).toHaveLength(before);
  });

  test("ACC-12: a role a workspace's bundle defines, given to a group, does not stop a release or going back", async () => {
    const made = await alice.post(`/tenants/${tenant}/groups`, { name: "Ops" });
    const role = newId();
    await t.db
      .insertInto("role")
      .values({
        id: role,
        tenant_id: tenant,
        workspace_id: main,
        name: "keeper",
        description: "",
        permissions: ["data:read"],
      })
      .execute();
    await t.db
      .insertInto("binding")
      .values({
        id: newId(),
        scope_type: "workspace",
        tenant_id: tenant,
        workspace_id: main,
        principal_type: "group",
        principal_id: made.body.id,
        role_id: role,
      })
      .execute();
    const here = (await releases())[0];
    const next = await alice.post(`${at()}/releases`, { resources: [maker, group("ops", "Ops")] });
    expect(next.status, JSON.stringify(next.body)).toBe(201);
    const back = await alice.post(`${at()}/releases/${here.id}/rollback`);
    expect(back.status, JSON.stringify(back.body)).toBe(201);
    expect(
      await t.db.selectFrom("binding").select("id").where("role_id", "=", role).execute(),
    ).toHaveLength(1);
  });

  test("ACC-13: going back is possible once a workspace the release names is deleted, and says what was left out", async () => {
    const gone = await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "scratch",
      name: "Scratch",
      type: "dev",
    });
    const ops = (await alice.get(`/tenants/${tenant}/groups`)).body.items.find(
      (one: Any) => one.key === "ops",
    );
    const given = await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: gone.body.id,
      principalType: "group",
      principalId: ops.id,
      roleId: roles.viewer,
    });
    expect(given.status, JSON.stringify(given.body)).toBe(201);
    const wanted = (await releases())[0];
    const removed = await alice.delete(
      `/tenants/${tenant}/workspaces/${gone.body.id}?confirm=scratch`,
    );
    expect(removed.status, JSON.stringify(removed.body)).toBe(204);
    const look = await alice.get(`${at()}/releases/${wanted.id}/rollback`);
    expect(look.status, JSON.stringify(look.body)).toBe(200);
    expect(look.body.warnings.join(" ")).toContain("scratch");
    const back = await alice.post(`${at()}/releases/${wanted.id}/rollback`);
    expect(back.status, JSON.stringify(back.body)).toBe(201);
    expect(back.body.summary.warnings.join(" ")).toContain("scratch");
  });

  test("ACC-18: a provider's group kept in a repository is unchanged the second time", async () => {
    await t.db
      .insertInto("principal_group")
      .values({
        id: newId(),
        tenant_id: tenant,
        key: "kept",
        name: "Kept",
        description: "From the provider.",
        managed_by: "provider",
      })
      .execute();
    const set = [
      {
        kind: "group",
        key: "kept",
        body: { title: "Kept", description: "From the provider." },
      },
      group("ops", "Ops"),
      maker,
    ];
    const first = await alice.post(`${at()}/releases`, { resources: set });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.summary).toMatchObject({ updated: 0, created: 0, deleted: 0 });
    const second = await alice.post(`${at()}/releases`, { resources: set });
    expect(second.body.summary).toMatchObject({ updated: 0, unchanged: 3 });
  });

  test("ACC-14, ACC-15, ACC-16: a change that waits says so, is superseded, and its maker withdraws it", async () => {
    expect((await alice.put(`${at()}/approval`, { required: true })).status).toBe(200);
    const one = await carol.post(`/tenants/${tenant}/groups`, { name: "Alpha" });
    expect(one.status, JSON.stringify(one.body)).toBe(202);
    const two = await alice.post(`/tenants/${tenant}/groups`, { name: "Beta" });
    const three = await alice.post(`/tenants/${tenant}/groups`, { name: "Gamma" });
    expect(two.status).toBe(202);
    // The maker sees what they asked for, and takes it back, without any right to release.
    const mine = await carol.get(`${at()}/releases`);
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(mine.body.items.map((row: Any) => row.id)).toEqual([one.body.release.id]);
    const withdrawn = await carol.post(`${at()}/releases/${one.body.release.id}/decision`, {
      decision: "withdraw",
    });
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200);
    // One is approved: the other, asked of what the tenant was before, can no longer apply.
    const approved = await bob.post(`${at()}/releases/${two.body.release.id}/decision`, {
      decision: "approve",
    });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const left = (await releases()).find((row) => row.id === three.body.release.id);
    expect(left.status).toBe("superseded");
    expect(left.comment).toContain(`Release ${approved.body.number}`);
    // Going back answers the same way as anything else that waits.
    const here = (await releases()).filter((row) => row.status === "applied").at(-1);
    const back = await alice.post(`${at()}/releases/${here.id}/rollback`);
    expect(back.status, JSON.stringify(back.body)).toBe(202);
    expect(back.body.waiting).toBe(true);
    const now = (await alice.get(at())).body.resources as Any[];
    const full = await alice.post(`${at()}/releases`, {
      resources: now.map((one) => (one.key === "ops" ? group("ops", "Operations") : one)),
    });
    expect(full.status).toBe(202);
    expect(full.body.waiting).toBe(true);
    await alice.put(`${at()}/approval`, { required: false });
  });

  test("ACC-19: a binding given by hand and the same one from a workspace's code are two, whichever came first", async () => {
    const ops = (await alice.get(`/tenants/${tenant}/groups`)).body.items.find(
      (one: Any) => one.key === "ops",
    );
    const code = (body: object = {}) => ({
      kind: "binding",
      schemaVersion: 1,
      ownership: "code",
      body: { role: "viewer", principal: { type: "group", key: "ops" }, ...body },
    });
    const resources = `/tenants/${tenant}/workspaces/${main}/resources`;
    // Code first, then by hand.
    expect((await alice.put(`${resources}/access/ops-views`, code())).status).toBe(201);
    const byHand = await alice.post(`/tenants/${tenant}/bindings`, {
      workspaceId: main,
      principalType: "group",
      principalId: ops.id,
      roleId: roles.viewer,
    });
    expect(byHand.status, JSON.stringify(byHand.body)).toBe(201);
    // Taking the code's away leaves the one given by hand, and the other way round.
    expect((await alice.delete(`${resources}/access/ops-views`)).status).toBe(204);
    const left = await t.db
      .selectFrom("binding")
      .select(["id", "source_resource_id"])
      .where("principal_id", "=", ops.id)
      .where("workspace_id", "=", main)
      .where("role_id", "=", roles.viewer as string)
      .execute();
    expect(left).toEqual([{ id: byHand.body.id, source_resource_id: null }]);
    expect((await alice.put(`${resources}/access/ops-views`, code())).status).toBe(201);
    expect((await alice.delete(`/tenants/${tenant}/bindings/${byHand.body.id}`)).status).toBe(204);
    expect(
      await t.db
        .selectFrom("binding")
        .select("id")
        .where("principal_id", "=", ops.id)
        .where("workspace_id", "=", main)
        .where("role_id", "=", roles.viewer as string)
        .execute(),
    ).toHaveLength(1);
  });

  test("D57: a workspace admin has the interfaces, documents and repository of its workspace, and nothing that checks nothing there", async () => {
    const { permissions } = await t.db
      .selectFrom("role")
      .select("permissions")
      .where("builtin", "=", true)
      .where("name", "=", "workspace_admin")
      .executeTakeFirstOrThrow();
    expect(permissions).toEqual(expect.arrayContaining(["interface:*", "doc:*", "git:*"]));
    expect(permissions).not.toContain("code:*");
    expect(permissions).not.toContain("role:*");
    expect(permissions).not.toContain("access:write");
  });

  test("ACC-20: a description of 400 characters is kept by every kind that has one, made or changed", async () => {
    const long = "x".repeat(400);
    const tenantAt = `/tenants/${tenant}`;
    for (const [path, body] of [
      ["groups", { name: "Wide group" }],
      ["end-user-groups", { name: "Wide users" }],
      ["service-accounts", { name: "Wide account" }],
      ["roles", { name: "wide_role", permissions: ["data:read"] }],
    ] as const) {
      const made = await alice.post(`${tenantAt}/${path}`, { ...body, description: long });
      expect(made.status, `${path}: ${JSON.stringify(made.body)}`).toBe(201);
      const changed = await alice.patch(`${tenantAt}/${path}/${made.body.id}`, {
        description: `${long}!`,
      });
      expect(changed.status, `${path}: ${JSON.stringify(changed.body)}`).toBe(200);
    }
    const set = await alice.post(`${at()}/plan`, {
      resources: [
        ...(await alice.get(at())).body.resources,
        { kind: "group", key: "set-wide", body: { title: "Set wide", description: long } },
      ],
    });
    expect(set.body.possible, JSON.stringify(set.body)).toBe(true);
  });
});
