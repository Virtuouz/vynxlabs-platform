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
