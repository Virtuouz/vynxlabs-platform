import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.stop();
});

test("an operator reads what the replica is set to, with no secret in it (HOST-MP2)", async () => {
  const settings = await t.admin.get("/instance/settings");
  expect(settings.status, JSON.stringify(settings.body)).toBe(200);
  expect(settings.body).toMatchObject({
    runSlots: null,
    managedWorkers: null,
    retention: { auditDays: expect.any(Number), runsDays: expect.any(Number) },
    egressAllow: { networks: expect.any(Array), hosts: expect.any(Array) },
    appsAddress: expect.stringMatching(/^(separate|console|none)$/),
    metricsToken: expect.any(Boolean),
  });
  const text = JSON.stringify(settings.body);
  for (const secret of ["authSecret", "masterKey", "accessKey", "databaseUrl", "password"]) {
    expect(text.toLowerCase()).not.toContain(secret.toLowerCase());
  }
  expect((await t.anonymous.get("/instance/settings")).status).toBe(401);
});
