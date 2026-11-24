import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

/** Whether code may be written in the console is a switch of the tenant, audited (EXT-10, D17). */

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.stop();
});

test("a tenant's administrator turns writing code in the console off and on, and it is audited", async () => {
  const id = (await t.admin.post("/tenants", { slug: "codeoff", name: "Code", addCreator: true }))
    .body.id;
  expect((await t.admin.get(`/tenants/${id}`)).body.consoleCode).toBe(true);

  const off = await t.admin.patch(`/tenants/${id}`, { consoleCode: false });
  expect(off.status, JSON.stringify(off.body)).toBe(200);
  expect(off.body.consoleCode).toBe(false);
  expect((await t.admin.get(`/tenants/${id}`)).body.consoleCode).toBe(false);
  // The name was not sent: it is kept.
  expect(off.body.name).toBe("Code");

  const on = await t.admin.patch(`/tenants/${id}`, { consoleCode: true });
  expect(on.body.consoleCode).toBe(true);

  const audit = (await t.admin.get(`/tenants/${id}/audit`)).body.items as {
    action: string;
    details: { consoleCode?: boolean };
  }[];
  expect(
    audit.filter((one) => one.action === "tenant.updated").map((one) => one.details.consoleCode),
  ).toEqual([true, false]);
});

test("someone who may only read the tenant cannot switch it", async () => {
  const id = (await t.admin.post("/tenants", { slug: "coderead", name: "Read", addCreator: true }))
    .body.id;
  const made = await t.admin.post(`/tenants/${id}/members`, {
    email: "reader@code.example",
    name: "Reader",
    password: "a-good-long-password",
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const reader = await t.signIn("reader@code.example", "a-good-long-password");
  const refused = await reader.patch(`/tenants/${id}`, { consoleCode: false });
  expect(refused.status).toBe(403);
});
