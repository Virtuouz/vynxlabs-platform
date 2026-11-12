import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Database } from "./database.js";
import {
  DatabaseNewerThanCodeError,
  MigrationChecksumError,
  MigrationFailedError,
  MigrationFilesError,
} from "./errors.js";
import { loadMigrations } from "./migrate.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

const FIXTURES = [
  ["0001_first.sql", "create table first (id integer primary key);"],
  [
    "0002_second.sql",
    "create table second (id integer primary key); insert into second values (1);",
  ],
  ["0003_third.sql", "alter table first add column note text;"],
] as const;

let testDb: TestDatabase;
let dirs: string[];
let databases: Database[];

async function migrationsDir(count: number, overrides: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "migrations-"));
  dirs.push(dir);
  for (const [name, contents] of FIXTURES.slice(0, count)) {
    await writeFile(join(dir, name), overrides[name] ?? contents);
  }
  return dir;
}

function open(migrationsDir?: string) {
  const database = new Database({
    connectionString: testDb.connectionString,
    ...(migrationsDir ? { migrationsDir } : {}),
  });
  databases.push(database);
  return database;
}

async function tables(database: Database) {
  const result = await sql<{ table_name: string }>`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `.execute(database.router.platform());
  return result.rows.map((row) => row.table_name);
}

beforeEach(async () => {
  testDb = await createTestDatabase();
  dirs = [];
  databases = [];
});

afterEach(async () => {
  await Promise.all(databases.map((database) => database.close()));
  await testDb.drop();
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true })));
});

describe("built-in migrations", () => {
  test("apply to an empty database", async () => {
    const database = open();
    const files = await loadMigrations(join(import.meta.dirname, "../migrations"));
    const result = await database.migrate();
    expect(result.applied).toHaveLength(files.length);
    expect(result.level).toBe(files.length);
    expect(await database.migrationLevel()).toBe(files.length);
    expect(await tables(database)).toContain("tenant");
  });

  test("a second run applies nothing", async () => {
    const database = open();
    await database.migrate();
    const again = await database.migrate();
    expect(again.applied).toEqual([]);
  });
});

describe("runner", () => {
  test("reports level 0 before any migration exists", async () => {
    const database = open(await migrationsDir(0));
    const result = await database.migrate();
    expect(result).toEqual({ applied: [], level: 0 });
    expect(await database.migrationLevel()).toBe(0);
  });

  test.each([0, 1, 2])("reaches the newest version from migration point %i", async (start) => {
    if (start > 0) {
      await open(await migrationsDir(start)).migrate();
    }
    const database = open(await migrationsDir(3));
    const result = await database.migrate();
    expect(result.applied.map((m) => m.version)).toEqual([1, 2, 3].slice(start));
    expect(result.level).toBe(3);
    expect(await tables(database)).toEqual(["first", "platform_migration", "second"]);
  });

  test("racing runners apply each migration once", async () => {
    const dir = await migrationsDir(3);
    const results = await Promise.all([1, 2, 3, 4].map(() => open(dir).migrate()));
    const applied = results.flatMap((result) => result.applied.map((m) => m.version));
    expect(applied.sort()).toEqual([1, 2, 3]);
    expect(results.every((result) => result.level === 3)).toBe(true);
  });

  test("refuses a database newer than the code", async () => {
    await open(await migrationsDir(3)).migrate();
    const older = open(await migrationsDir(2));
    await expect(older.migrate()).rejects.toBeInstanceOf(DatabaseNewerThanCodeError);
  });

  test("refuses an edited migration", async () => {
    await open(await migrationsDir(2)).migrate();
    const edited = open(
      await migrationsDir(2, { "0001_first.sql": "create table first (id bigint primary key);" }),
    );
    await expect(edited.migrate()).rejects.toBeInstanceOf(MigrationChecksumError);
  });

  test("rolls back a failing migration and keeps the ones before it", async () => {
    const database = open(
      await migrationsDir(3, {
        "0002_second.sql": "create table second (id integer primary key); select 1 / 0;",
      }),
    );
    await expect(database.migrate()).rejects.toBeInstanceOf(MigrationFailedError);
    expect(await database.migrationLevel()).toBe(1);
    expect(await tables(database)).toEqual(["first", "platform_migration"]);
  });

  test("rejects a gap in versions and a badly named file", async () => {
    const gap = await migrationsDir(1);
    await writeFile(join(gap, "0003_third.sql"), "select 1;");
    await expect(loadMigrations(gap)).rejects.toBeInstanceOf(MigrationFilesError);

    const badName = await migrationsDir(1);
    await writeFile(join(badName, "second.sql"), "select 1;");
    await expect(loadMigrations(badName)).rejects.toBeInstanceOf(MigrationFilesError);
  });
});
