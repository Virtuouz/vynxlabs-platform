import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.stop();
});

// The console's gating tests ask what each built-in role may do from this table
// (`apps/console/src/builtinRoles.ts`). It is held to what the migrations leave.
test("the console's table of the built-in roles is what the database holds", async () => {
  const text = readFileSync(new URL("../../console/src/builtinRoles.ts", import.meta.url), "utf8");
  const literal = text.slice(text.indexOf("= {") + 2, text.lastIndexOf("};") + 1);
  const table = JSON.parse(literal) as Record<string, string[]>;
  const rows = await t.db
    .selectFrom("role")
    .select(["name", "permissions"])
    .where("builtin", "=", true)
    .execute();
  const held = Object.fromEntries(rows.map((row) => [row.name, [...row.permissions].sort()]));
  expect(table).toEqual(held);
});
