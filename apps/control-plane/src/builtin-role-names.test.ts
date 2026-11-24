import { BUILTIN_ROLE_NAMES } from "@volvel/manifest";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.stop();
});

// The build checks a binding's role against this list (`checkBundleManifests`).
test("the built-in role names the build knows are the ones the database holds", async () => {
  const rows = await t.db.selectFrom("role").select("name").where("builtin", "=", true).execute();
  expect([...BUILTIN_ROLE_NAMES].sort()).toEqual(rows.map((row) => row.name).sort());
});
