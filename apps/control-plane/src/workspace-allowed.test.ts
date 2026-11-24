import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

/** A screen asks what the caller may do in a workspace before it draws the controls (CFG-26). */

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.stop();
});

test("a workspace says which of the asked permissions the caller holds in it", async () => {
  const tenant = (await t.admin.post("/tenants", { slug: "may", name: "May", addCreator: true }))
    .body.id;
  const workspace = (
    await t.admin.post(`/tenants/${tenant}/workspaces`, { slug: "main", name: "Main", type: "dev" })
  ).body.id;
  const ask = "connection:write,variable:write,secret:write";
  const mine = await t.admin.get(
    `/tenants/${tenant}/workspaces/${workspace}/allowed?permissions=${ask}`,
  );
  expect(mine.status, JSON.stringify(mine.body)).toBe(200);
  expect(mine.body.allowed.sort()).toEqual(["connection:write", "secret:write", "variable:write"]);

  const made = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "viewer@may.example",
    name: "Viewer",
    password: "a-good-long-password",
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const viewer = await t.signIn("viewer@may.example", "a-good-long-password");
  const theirs = await viewer.get(
    `/tenants/${tenant}/workspaces/${workspace}/allowed?permissions=${ask}`,
  );
  expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
  expect(theirs.body.allowed).toEqual([]);
});
