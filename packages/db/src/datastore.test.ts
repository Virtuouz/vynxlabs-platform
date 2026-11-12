import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Database } from "./database.js";
import { dataRoleName, openDataStore } from "./datastore.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

const secret = Buffer.alloc(32, 7);
let platformDb: TestDatabase;
let dedicatedDb: TestDatabase;
let database: Database;

beforeAll(async () => {
  platformDb = await createTestDatabase();
  dedicatedDb = await createTestDatabase();
  database = new Database({ connectionString: platformDb.connectionString });
  await database.migrate();
});
afterAll(async () => {
  await database.close();
  await platformDb.drop();
  await dedicatedDb.drop();
});

const shape = async (db: Parameters<ReturnType<typeof sql>["execute"]>[0]) =>
  (
    await sql<{ line: string }>`
      select table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '-') as line
      from information_schema.columns
      where table_schema = 'public' and table_name in ('data_table', 'data_column')
      order by 1
    `.execute(db)
  ).rows.map((row) => row.line);
const indexes = async (db: Parameters<ReturnType<typeof sql>["execute"]>[0]) =>
  (
    await sql<{ line: string }>`
      select indexdef as line from pg_indexes
      where schemaname = 'public' and tablename in ('data_table', 'data_column') order by 1
    `.execute(db)
  ).rows.map((row) => row.line);

describe("data stores", () => {
  test("a dedicated database gets the same catalog the migrations give the platform database", async () => {
    const store = await openDataStore({ connectionString: dedicatedDb.connectionString, secret });
    try {
      expect(await shape(store.owner)).toEqual(await shape(database.router.platform()));
      expect(await indexes(store.owner)).toEqual(await indexes(database.router.platform()));
      // It has nothing else of the platform's.
      const tables = await sql<{ name: string }>`
        select table_name as name from information_schema.tables where table_schema = 'public' order by 1
      `.execute(store.owner);
      expect(tables.rows.map((row) => row.name)).toEqual(["data_column", "data_table"]);
    } finally {
      await store.close();
    }
  });

  test("opening a store twice is harmless, and each database has a sign-in of its own", async () => {
    const [a, b] = await Promise.all([
      openDataStore({ connectionString: dedicatedDb.connectionString, secret }),
      openDataStore({ connectionString: dedicatedDb.connectionString, secret }),
    ]);
    const shared = await database.openDataStore(secret);
    try {
      expect(a.role).toBe(b.role);
      expect(a.role).not.toBe(shared.role);
      expect(shared.shared).toBe(true);
      expect(a.shared).toBe(false);
      const name = new URL(dedicatedDb.connectionString).pathname.slice(1);
      expect(a.role).toBe(dataRoleName(name));
      await a.ping();
      await shared.ping();
      const who = await sql<{ who: string }>`select current_user as who`.execute(shared.rows);
      expect(who.rows[0]?.who).toBe(shared.role);
      // The restricted sign-in cannot read the platform's own tables.
      await expect(sql`select * from tenant`.execute(shared.rows)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await a.close();
      await b.close();
      await shared.close();
    }
  });

  test("tables and policies made for the role of an earlier version are handed to the new sign-in", async () => {
    const platform = database.router.platform();
    const schema = "ws_0123456789abcdef0123456789abcdef";
    // What a phase 4 instance left behind: a server-wide role named in grants and policies.
    await sql`do $$ begin create role platform_data nologin; exception when duplicate_object then null; end $$`.execute(
      platform,
    );
    await sql
      .raw(`
      create schema ${schema};
      create table ${schema}.t_orders (id uuid primary key, owner_id uuid, note text);
      alter table ${schema}.t_orders enable row level security;
      grant usage on schema ${schema} to platform_data;
      grant select, insert, update, delete on ${schema}.t_orders to platform_data;
      create policy rows on ${schema}.t_orders for all to platform_data using (true) with check (true);
      insert into ${schema}.t_orders values ('00000000-0000-7000-8000-000000000001', null, 'kept');
    `)
      .execute(platform);
    const store = await database.openDataStore(secret);
    try {
      const seen = await sql<{
        note: string;
      }>`select note from ${sql.id(schema, "t_orders")}`.execute(store.rows);
      expect(seen.rows).toEqual([{ note: "kept" }]);
    } finally {
      await store.close();
      await sql.raw(`drop schema ${schema} cascade`).execute(platform);
    }
  });
});
