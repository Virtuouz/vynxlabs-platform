import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
let tenant: string;

beforeAll(async () => {
  t = await startTestApp();
  tenant = (await t.admin.post("/tenants", { slug: "searchable", name: "Searchable Ltd" })).body.id;
  const role = await t.db
    .selectFrom("role")
    .select("id")
    .where("builtin", "=", true)
    .where("name", "=", "tenant_admin")
    .executeTakeFirstOrThrow();
  await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: role.id });
  for (const [email, name] of [
    ["ada@lists.example", "Ada Lovelace"],
    ["bo@lists.example", "Bo Peep"],
    ["cy_50%@lists.example", "Cy Young"],
  ] as const) {
    const made = await t.admin.post(`/tenants/${tenant}/members`, {
      email,
      name,
      password: "a-good-long-password",
    });
    expect(made.status, JSON.stringify(made.body)).toBeLessThan(300);
  }
});
afterAll(async () => {
  await t?.stop();
});

const emails = (body: { items: { email: string }[] }) => body.items.map((one) => one.email);

describe("lists that page are searched on the server", () => {
  test("a tenant's members are found by email or name, in any case, and by what is past the page", async () => {
    const byName = await t.admin.get(`/tenants/${tenant}/members?search=LOVELACE`);
    expect(emails(byName.body)).toEqual(["ada@lists.example"]);
    const byEmail = await t.admin.get(`/tenants/${tenant}/members?search=bo@`);
    expect(emails(byEmail.body)).toEqual(["bo@lists.example"]);
    // A page of one, then the next: the search keeps its place.
    const first = await t.admin.get(`/tenants/${tenant}/members?search=lists.example&limit=1`);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await t.admin.get(
      `/tenants/${tenant}/members?search=lists.example&limit=1&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  });

  test("a search takes % and _ as themselves", async () => {
    const percent = await t.admin.get(
      `/tenants/${tenant}/members?search=${encodeURIComponent("50%")}`,
    );
    expect(emails(percent.body)).toEqual(["cy_50%@lists.example"]);
    const wild = await t.admin.get(`/tenants/${tenant}/members?search=${encodeURIComponent("%")}`);
    expect(emails(wild.body)).toEqual(["cy_50%@lists.example"]);
  });

  test("the instance's members are searched too", async () => {
    const found = await t.admin.get("/members?search=peep");
    expect(emails(found.body)).toEqual(["bo@lists.example"]);
  });

  test("tenants are found by name or slug", async () => {
    expect(
      (await t.admin.get("/tenants?search=searchable")).body.items.map(
        (one: { slug: string }) => one.slug,
      ),
    ).toEqual(["searchable"]);
    expect((await t.admin.get("/tenants?search=LTD")).body.items).toHaveLength(1);
    expect((await t.admin.get("/tenants?search=nothing-like-it")).body.items).toEqual([]);
  });

  test("an event is looked up by its ID, whatever page it would be on", async () => {
    const made = await t.admin.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "dev",
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const base = `/tenants/${tenant}/workspaces/${made.body.id}`;
    const draft = await t.admin.put(`${base}/drafts/ping`, {
      kind: "event",
      schemaVersion: 1,
      body: { payload: { type: "object" } },
    });
    expect(draft.status, JSON.stringify(draft.body)).toBeLessThan(300);
    const deployed = await t.admin.post(`${base}/changes/deploy`, {});
    expect(deployed.status, JSON.stringify(deployed.body)).toBeLessThan(300);
    for (const n of [1, 2, 3]) {
      const sent = await t.admin.post(`${base}/events`, { name: "ping", payload: { n } });
      expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    }
    const all = (await t.admin.get(`${base}/events?limit=1`)).body;
    expect(all.items).toHaveLength(1);
    expect(all.nextCursor).not.toBeNull();
    const oldest = (await t.admin.get(`${base}/events`)).body.items.at(-1);
    const found = await t.admin.get(`${base}/events?id=${oldest.id}`);
    expect(found.body.items.map((one: { id: string }) => one.id)).toEqual([oldest.id]);
    const none = await t.admin.get(`${base}/events?id=01a1fa48-de1e-7041-ae70-318b1d0fc291`);
    expect(none.body.items).toEqual([]);
  });
});
