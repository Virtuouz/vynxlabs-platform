import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Database } from "./database.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

let testDb: TestDatabase;
let database: Database;
let n = 0;
const queue = () => `q${++n}`;

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = new Database({
    connectionString: testDb.connectionString,
    queue: { superviseIntervalSeconds: 1, heartbeatSeconds: 10 },
  });
  await database.migrate();
  await database.queue.start();
});
afterAll(async () => {
  await database.close();
  await testDb.drop();
});

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, seconds: number) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await sleep(250);
  }
}

describe("job queue", () => {
  test("its tables live in their own schema and starting twice is harmless", async () => {
    const schemas = await sql<{ n: string }>`
      select count(*) as n from information_schema.tables where table_schema = 'pgboss'
    `.execute(database.router.platform());
    expect(Number(schemas.rows[0]?.n)).toBeGreaterThan(0);
    const again = new Database({ connectionString: testDb.connectionString });
    await again.queue.start();
    await again.close();
  });

  test("claim, complete, and nothing left", async () => {
    const q = queue();
    const id = await database.queue.enqueue(q, { runId: "r1" }, { timeoutSeconds: 60 });
    expect(await database.queue.state(q, id)).toBe("created");
    const job = await database.queue.claim<{ runId: string }>(q);
    expect(job).toEqual({ id, data: { runId: "r1" }, attempt: 1, timeoutSeconds: 60 });
    expect(await database.queue.claim(q)).toBeNull();
    expect(await database.queue.state(q, id)).toBe("active");
    expect(await database.queue.complete(q, id, { ok: true })).toBe(true);
    expect(await database.queue.state(q, id)).toBe("completed");
    // A second completion, or a late one from a worker that lost the job, changes nothing.
    expect(await database.queue.complete(q, id)).toBe(false);
  });

  test("higher priority first, and a delayed job waits", async () => {
    const q = queue();
    await database.queue.enqueue(q, { name: "low" }, { priority: 1 });
    await database.queue.enqueue(q, { name: "high" }, { priority: 5 });
    await database.queue.enqueue(q, { name: "later" }, { priority: 9, startAfter: 3600 });
    const order = [];
    for (
      let job = await database.queue.claim<{ name: string }>(q);
      job;
      job = await database.queue.claim(q)
    ) {
      order.push(job.data.name);
    }
    expect(order).toEqual(["high", "low"]);
  });

  test("a failed attempt is retried after its delay, then lands in the dead-letter queue", async () => {
    const q = queue();
    const id = await database.queue.enqueue(
      q,
      { runId: "retry-me" },
      { retryLimit: 1, retryDelaySeconds: 1 },
    );
    const first = await database.queue.claim(q);
    expect(first?.attempt).toBe(1);
    expect(await database.queue.fail(q, id, { message: "boom" })).toBe(true);
    expect(await database.queue.state(q, id)).toBe("retry");
    expect(await database.queue.claim(q)).toBeNull();

    const second = await until(
      () => database.queue.claim(q),
      (job) => job !== null,
      5,
    );
    expect(second).toMatchObject({ id, attempt: 2 });
    await database.queue.fail(q, id, { message: "boom again" });
    expect(await database.queue.state(q, id)).toBe("failed");

    const dead = await until(
      () => database.queue.takeDead<{ runId: string }>(),
      (job) => job !== null,
      5,
    );
    expect(dead?.data).toEqual({ runId: "retry-me" });
    expect(await database.queue.takeDead()).toBeNull();
  });

  test("a job can be cancelled while waiting or running", async () => {
    const q = queue();
    const waiting = await database.queue.enqueue(q, {});
    expect(await database.queue.cancel(q, waiting)).toBe(true);
    expect(await database.queue.claim(q)).toBeNull();

    const running = await database.queue.enqueue(q, {});
    await database.queue.claim(q);
    expect(await database.queue.cancel(q, running)).toBe(true);
    expect(await database.queue.state(q, running)).toBe("cancelled");
    // The worker's next heartbeat learns the job is gone.
    expect(await database.queue.heartbeat(q, running)).toBe(false);
    expect(await database.queue.complete(q, running)).toBe(false);
  });

  test("a group never runs more than its limit, while other groups carry on", async () => {
    const q = queue();
    for (let i = 0; i < 3; i++)
      await database.queue.enqueue(q, { script: "a", i }, { group: { id: "a", limit: 2 } });
    await database.queue.enqueue(q, { script: "b" }, { group: { id: "b", limit: 1 } });
    await database.queue.enqueue(q, { script: "b" }, { group: { id: "b", limit: 1 } });
    await database.queue.enqueue(q, { script: "free" });

    const claimed = [];
    for (
      let job = await database.queue.claim<{ script: string }>(q);
      job;
      job = await database.queue.claim(q)
    ) {
      claimed.push(job);
    }
    expect(claimed.map((job) => job.data.script).sort()).toEqual(["a", "a", "b", "free"]);

    // Finishing one of a group's jobs frees one slot in that group only.
    const a = claimed.find((job) => job.data.script === "a");
    await database.queue.complete(q, a?.id as string);
    const next = await database.queue.claim<{ script: string }>(q);
    expect(next?.data.script).toBe("a");
    expect(await database.queue.claim(q)).toBeNull();
    await expect(database.queue.enqueue(q, {}, { group: { id: "x", limit: 0 } })).rejects.toThrow();
  });

  test("an attempt that runs past its timeout is taken back and retried", async () => {
    const q = queue();
    const id = await database.queue.enqueue(q, {}, { timeoutSeconds: 1, retryLimit: 1 });
    await database.queue.claim(q);
    const again = await until(
      () => database.queue.claim(q),
      (job) => job !== null,
      15,
    );
    expect(again).toMatchObject({ id, attempt: 2 });
  }, 30_000);

  test("a worker that stops sending heartbeats loses its job, one that keeps sending does not", async () => {
    const silent = queue();
    const alive = queue();
    const lost = await database.queue.enqueue(silent, {}, { retryLimit: 1, timeoutSeconds: 600 });
    const kept = await database.queue.enqueue(alive, {}, { retryLimit: 1, timeoutSeconds: 600 });
    await database.queue.claim(silent);
    await database.queue.claim(alive);

    const beat = setInterval(() => void database.queue.heartbeat(alive, kept), 2000);
    try {
      const reclaimed = await until(
        () => database.queue.claim(silent),
        (job) => job !== null,
        30,
      );
      expect(reclaimed).toMatchObject({ id: lost, attempt: 2 });
      expect(await database.queue.state(alive, kept)).toBe("active");
      expect(await database.queue.heartbeat(alive, kept)).toBe(true);
    } finally {
      clearInterval(beat);
    }
  }, 60_000);
});
