import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { sql } from "@volvel/db";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WorkerSupervisor } from "./kernel/execution/supervisor.js";
import { startTestApp, type TestApp } from "./testing.js";

/**
 * The supervisor of `process` mode meets the same refusals the worker host does (HOST-04):
 * node refuses to start a worker as another user, and a signal to one is refused without CAP_KILL.
 */
let t: TestApp;
let tenant: string;
beforeAll(async () => {
  t = await startTestApp();
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

const revoked = async () =>
  (
    await sql<{ n: string }>`
      select count(*) as n from worker_credential where tenant_id = ${tenant} and revoked_at is not null
    `.execute(t.db)
  ).rows[0]?.n;

describe("managed workers that cannot be started or stopped (process mode)", () => {
  test("a start node refuses is logged, its credential ends, and the tick goes on", async () => {
    const refusing = (() => {
      throw Object.assign(new Error("spawn EPERM"), { code: "EPERM" });
    }) as unknown as typeof spawn;
    const supervisor = new WorkerSupervisor(t.kernel, {
      url: "http://127.0.0.1:1",
      operatorCodeOnly: false,
      spawn: refusing,
      waiting: async () => [{ tenant_id: tenant }],
    });
    await supervisor.tick();
    expect(supervisor.tenants).toEqual([]);
    expect(await revoked()).toBe("1");
    // The next tick tries again and is not stopped by the first.
    await supervisor.tick();
    expect(await revoked()).toBe("2");
    await supervisor.stop(0.01, 0.01);
  });

  test("a worker that cannot be signalled is left, and stopping does not throw or wait for ever", async () => {
    let child: EventEmitter & { kill: () => boolean };
    const stubborn = (() => {
      child = Object.assign(new EventEmitter(), {
        pid: 4242,
        exitCode: null,
        stdin: { end() {} },
        stdout: null,
        stderr: null,
        kill: () => {
          child.emit("error", Object.assign(new Error("kill EPERM"), { code: "EPERM" }));
          return false;
        },
      });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }) as unknown as typeof spawn;
    const supervisor = new WorkerSupervisor(t.kernel, {
      url: "http://127.0.0.1:1",
      operatorCodeOnly: false,
      spawn: stubborn,
      waiting: async () => [{ tenant_id: tenant }],
    });
    await supervisor.tick();
    expect(supervisor.tenants).toEqual([tenant]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const started = Date.now();
    await supervisor.stop(0.05, 0.1);
    expect(Date.now() - started).toBeLessThan(2000);
    // Still ours: a refused signal is not an exit, so its credential is not revoked.
    expect(supervisor.tenants).toEqual([tenant]);
  });

  test("no worker starts where one more would take the machine below its memory floor", async () => {
    // STR-02: 13 idle workers of about 105 MB each left a 2 GB machine no room to run a script.
    let started = 0;
    const counting = (() => {
      started += 1;
      throw new Error("not started in a test");
    }) as unknown as typeof spawn;
    // A tenant of its own: the one above still holds the credential of a worker left running.
    const other = (await t.admin.post("/tenants", { slug: "short", name: "Short" })).body.id;
    const free = { mb: 280 };
    const supervisor = new WorkerSupervisor(t.kernel, {
      url: "http://127.0.0.1:1",
      operatorCodeOnly: false,
      spawn: counting,
      memoryFloorMb: 200,
      probe: {
        memory: () => ({ totalMb: 2048, availableMb: free.mb }),
        rssMb: () => undefined,
        children: () => [],
      },
      waiting: async () => [{ tenant_id: other }],
    });
    // Above the floor, but a worker of its own would not fit above it.
    await supervisor.tick();
    expect(started).toBe(0);
    free.mb = 400;
    await supervisor.tick();
    expect(started).toBe(1);
    await supervisor.stop(0.01, 0.01);
  });
});
