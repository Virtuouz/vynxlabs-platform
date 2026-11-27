import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { surviveLostConnections } from "./lost-connection.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

let testDb: TestDatabase;
beforeAll(async () => {
  testDb = await createTestDatabase();
});
afterAll(async () => {
  await testDb.drop();
});

test("a connection lost between two statements of a transaction refuses the next, and the process goes on", async () => {
  const seen: string[] = [];
  const pool = surviveLostConnections(
    new pg.Pool({ connectionString: testDb.connectionString, max: 2 }),
    (error) => seen.push(error.message),
  );
  pool.on("error", () => {});
  const other = new pg.Pool({ connectionString: testDb.connectionString, max: 1 });
  other.on("error", () => {});
  try {
    const client = await pool.connect();
    await client.query("begin");
    const pid = (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]
      ?.pid;
    // The server hangs up on a connection that is checked out and idle, as a restart does.
    await other.query("select pg_terminate_backend($1)", [pid]);
    await sleep(300);
    // Without the listener the `error` it emitted had ended this process before here.
    expect(seen.length).toBeGreaterThan(0);
    await expect(client.query("select 1")).rejects.toThrow();
    client.release();
    // The pool gave the broken connection up, and the next statement gets a new one.
    expect((await pool.query("select 1 as one")).rows[0]?.one).toBe(1);
  } finally {
    await pool.end();
    await other.end();
  }
});
