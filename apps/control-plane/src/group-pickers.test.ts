import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
let tenant: string;

beforeAll(async () => {
  t = await startTestApp();
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id as string;
  const admin = await t.db
    .selectFrom("role")
    .select("id")
    .where("name", "=", "tenant_admin")
    .where("builtin", "=", true)
    .executeTakeFirstOrThrow();
  await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: admin.id });
  for (const name of ["Finance", "Finance Leads", "Night shift", "Support", "Sales"]) {
    expect((await t.admin.post(`/tenants/${tenant}/groups`, { name })).status).toBe(201);
    expect((await t.admin.post(`/tenants/${tenant}/end-user-groups`, { name })).status).toBe(201);
  }
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

describe.each(["groups", "end-user-groups"])("the %s picker is narrowed by the server", (route) => {
  const at = () => `/tenants/${tenant}/${route}`;

  test("search narrows by name, and nothing matching is an empty list", async () => {
    const found = await t.admin.get(`${at()}?search=finance`);
    expect(found.body.items.map((one: { name: string }) => one.name)).toEqual([
      "Finance",
      "Finance Leads",
    ]);
    expect((await t.admin.get(`${at()}?search=zzz`)).body.items).toEqual([]);
  });

  test("a limit pages in the order of the name, and says where the rest begins", async () => {
    const first = await t.admin.get(`${at()}?limit=2`);
    expect(first.body.items.map((one: { name: string }) => one.name)).toEqual([
      "Finance",
      "Finance Leads",
    ]);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await t.admin.get(`${at()}?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((one: { name: string }) => one.name)).toEqual([
      "Night shift",
      "Sales",
    ]);
    const last = await t.admin.get(`${at()}?limit=2&cursor=${second.body.nextCursor}`);
    expect(last.body.items.map((one: { name: string }) => one.name)).toEqual(["Support"]);
    expect(last.body.nextCursor).toBeNull();
  });

  test("asked for no limit, every group is answered, as it always was", async () => {
    const all = await t.admin.get(at());
    expect(all.body.items).toHaveLength(5);
    expect(all.body.nextCursor).toBeNull();
  });
});
