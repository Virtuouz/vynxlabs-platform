import { afterAll, beforeAll, expect, test } from "vitest";
import { Limiter } from "./kernel/apps/limit.js";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.stop();
});

// HOST-21: a guest's tries at forms and pages are counted where every replica reads them.
test("two replicas on one database share a caller's count (HOST-21)", async () => {
  const db = t.app.kernel.db;
  const one = new Limiter(db, "forms", 3, 60);
  const other = new Limiter(db, "forms", 3, 60);
  const caller = "203.0.113.7 tenant-a";
  expect(await one.allow(caller)).toBe(true);
  expect(await other.allow(caller)).toBe(true);
  expect(await one.allow(caller)).toBe(true);
  // The fourth try, on the other replica, is one too many; another caller has its own count.
  expect(await other.allow(caller)).toBe(false);
  expect(await other.allow("203.0.113.8 tenant-a")).toBe(true);
  // A limit of another name does not share it.
  expect(await new Limiter(db, "votes", 3, 60).allow(caller)).toBe(true);
});
