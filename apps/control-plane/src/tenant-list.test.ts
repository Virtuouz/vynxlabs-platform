import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

/** The tenant list offers what opens: a tenant a member is suspended in is not in it (SHL-15). */

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.stop();
});

test("a member suspended in a tenant does not see it in the tenant list", async () => {
  const kept = (await t.admin.post("/tenants", { slug: "kept", name: "Kept", addCreator: true }))
    .body.id;
  const left = (await t.admin.post("/tenants", { slug: "left", name: "Left", addCreator: true }))
    .body.id;
  const password = "a-good-long-password";
  let sam = "";
  for (const tenant of [kept, left]) {
    const made = await t.admin.post(`/tenants/${tenant}/members`, {
      email: "sam@list.example",
      name: "Sam",
      password,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    sam = made.body.id ?? sam;
  }
  const client = await t.signIn("sam@list.example", password);
  const slugs = async () =>
    ((await client.get("/tenants")).body.items as { slug: string }[]).map((i) => i.slug).sort();
  expect(await slugs()).toEqual(["kept", "left"]);
  const suspended = await t.admin.patch(`/tenants/${left}/members/${sam}`, { suspended: true });
  expect(suspended.status, JSON.stringify(suspended.body)).toBe(200);
  expect(await slugs()).toEqual(["kept"]);
});

test("the list and one tenant say whether the caller may rename it (SHL-11)", async () => {
  const id = (await t.admin.post("/tenants", { slug: "named", name: "Named", addCreator: true }))
    .body.id;
  const row = (await t.admin.get("/tenants")).body.items.find(
    (one: { id: string }) => one.id === id,
  );
  expect(row.mayRename).toBe(true);
  expect((await t.admin.get(`/tenants/${id}`)).body.mayRename).toBe(true);
  const made = await t.admin.post(`/tenants/${id}/members`, {
    email: "reader@list.example",
    name: "Reader",
    password: "a-good-long-password",
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const reader = await t.signIn("reader@list.example", "a-good-long-password");
  const seen = (await reader.get("/tenants")).body.items.find(
    (one: { id: string }) => one.id === id,
  );
  // A member added with no role reads the tenant but may not change it.
  expect(seen?.mayRename).toBe(false);
});

test("an operator who is not in a tenant is told they may change it when the route lets them (P31)", async () => {
  const id = (
    await t.admin.post("/tenants", { slug: "outside", name: "Outside", addCreator: false })
  ).body.id;
  const row = (await t.admin.get("/tenants")).body.items.find(
    (one: { id: string }) => one.id === id,
  );
  const patched = await t.admin.patch(`/tenants/${id}`, { consoleCode: false });
  expect(patched.status, JSON.stringify(patched.body)).toBe(200);
  expect(row.mayRename).toBe(true);
  expect((await t.admin.get(`/tenants/${id}`)).body.mayRename).toBe(true);
});
