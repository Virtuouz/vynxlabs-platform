import { isPoolTimeout, sql } from "@volvel/db";
import { createTestDatabase } from "@volvel/db/testing";
import Fastify from "fastify";
import { afterAll, beforeAll, expect, test } from "vitest";
import { withData } from "./kernel/data/rows.js";
import { errorHandler } from "./problem.js";
import { startTestApp, type TestApp } from "./testing.js";

// One tenant's slow table requests must not hold every connection, and none may run
// for long: past the limit it is stopped and said to be too slow.

let t: TestApp;
let slowTenant: string;
let otherTenant: string;
const everyone = { principalId: null, all: true };

beforeAll(async () => {
  t = await startTestApp({
    config: {
      limits: {
        runSlots: undefined,
        runMemoryFloorMb: undefined,
        managedWorkersMax: undefined,
        databasePoolSize: 10,
        dataPoolSize: 10,
        dataTenantConnections: 1,
        dataStatementTimeoutMs: 1000,
        sqlStatementTimeoutMs: 15_000,
        triggersPaused: false,
        scheduleBacklogLimit: 200,
        exportsAtOnce: 3,
        exportsPerTenant: 1,
        exportStallSeconds: 60,
        exportMaxMinutes: 30,
      },
    },
  });
  slowTenant = (await t.admin.post("/tenants", { slug: "slow", name: "Slow" })).body.id;
  otherTenant = (await t.admin.post("/tenants", { slug: "other", name: "Other" })).body.id;
});

afterAll(async () => {
  await t?.stop();
});

test("a statement past the time limit is stopped, and said to be too slow", async () => {
  const refused = await withData(t.kernel, slowTenant, everyone, async (db) => {
    await sql`select pg_sleep(3)`.execute(db);
  }).catch((error: unknown) => error);
  expect(refused).toMatchObject({ statusCode: 422, problemCode: "too_slow" });
});

test("a tenant past its share waits, and another tenant's requests go straight through", async () => {
  const held = withData(t.kernel, slowTenant, everyone, async (db) => {
    await sql`select pg_sleep(0.6)`.execute(db);
    return Date.now();
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const asked = Date.now();
  const [secondDone, otherDone] = await Promise.all([
    withData(t.kernel, slowTenant, everyone, async () => Date.now()),
    withData(t.kernel, otherTenant, everyone, async () => Date.now()),
  ]);
  const firstDone = await held;
  expect(otherDone - asked).toBeLessThan(400);
  expect(secondDone).toBeGreaterThanOrEqual(firstDone);
});

test("tenants that share a dedicated database each have a share of it, and another tenant's requests go through (INS-25)", async () => {
  const shared = await createTestDatabase();
  try {
    expect(
      (
        await t.admin.put("/instance/database-locations/pooled", {
          connectionString: shared.connectionString,
        })
      ).status,
    ).toBe(204);
    const one = (
      await t.admin.post("/tenants", { slug: "pool-one", name: "One", dataLocation: "pooled" })
    ).body.id;
    const two = (
      await t.admin.post("/tenants", { slug: "pool-two", name: "Two", dataLocation: "pooled" })
    ).body.id;
    const held = withData(t.kernel, one, everyone, async (db) => {
      await sql`select pg_sleep(0.6)`.execute(db);
      return Date.now();
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const asked = Date.now();
    const [secondDone, otherDone] = await Promise.all([
      withData(t.kernel, one, everyone, async () => Date.now()),
      withData(t.kernel, two, everyone, async () => Date.now()),
    ]);
    const firstDone = await held;
    expect(otherDone - asked).toBeLessThan(400);
    expect(secondDone).toBeGreaterThanOrEqual(firstDone);
  } finally {
    await shared.drop();
  }
});

test("a database too busy to hand out a connection is a 503 with when to try again", async () => {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.get("/busy", async () => {
    throw new Error("timeout exceeded when trying to connect");
  });
  app.get("/full", async () => {
    throw Object.assign(new Error("cannot execute INSERT in a read-only transaction"), {
      code: "25006",
    });
  });
  const busy = await app.inject({ method: "GET", url: "/busy" });
  expect(busy.statusCode).toBe(503);
  expect(busy.headers["retry-after"]).toBe("2");
  expect(busy.json()).toMatchObject({ code: "busy" });
  const full = await app.inject({ method: "GET", url: "/full" });
  expect(full.statusCode).toBe(503);
  expect(full.headers["retry-after"]).toBe("30");
  expect(full.json()).toMatchObject({ code: "read_only" });
  expect(isPoolTimeout(new Error("something else"))).toBe(false);
  await app.close();
});
