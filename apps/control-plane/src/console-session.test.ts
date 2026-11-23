import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, test } from "vitest";
import { CONSOLE_SESSION_DAYS } from "./config.js";
import { ADMIN, startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(() => t?.stop());

test("a member's console session lasts 7 days from sign-in, and SECURITY.md says so (D51)", async () => {
  expect(CONSOLE_SESSION_DAYS).toBe(7);
  const before = Date.now();
  await t.signIn(ADMIN.email, ADMIN.password);
  const newest = await t.db
    .selectFrom("member_session")
    .select("expires_at")
    .orderBy("expires_at", "desc")
    .executeTakeFirstOrThrow();
  const days = (newest.expires_at.getTime() - before) / 86_400_000;
  expect(days).toBeGreaterThan(6.99);
  expect(days).toBeLessThan(7.01);
  const policy = readFileSync(new URL("../../../SECURITY.md", import.meta.url), "utf8");
  expect(policy).toContain("A member's console session lasts 7 days");
});
