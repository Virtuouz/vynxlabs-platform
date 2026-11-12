import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import {
  DatabaseNewerThanCodeError,
  MigrationChecksumError,
  MigrationFailedError,
  MigrationFilesError,
} from "./errors.js";

export const defaultMigrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

/** Session advisory lock key that serializes migration runs across replicas. */
const LOCK_KEY = "7481129650012001";

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export interface MigrationFile {
  version: number;
  name: string;
  checksum: string;
  sql: string;
}

export interface MigrationResult {
  /** Migrations this run applied, in order. Empty when the database was current. */
  applied: { version: number; name: string }[];
  /** The highest migration in the database after the run. 0 when there are none. */
  level: number;
}

export function checksum(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

/** Reads and validates a migrations directory. Versions must run 1, 2, 3 with no gaps. */
export async function loadMigrations(dir: string): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((entry) => entry.endsWith(".sql")).sort();
  const files: MigrationFile[] = [];
  for (const entry of entries) {
    const match = FILE_PATTERN.exec(entry);
    if (!match) {
      throw new MigrationFilesError(`Migration file ${entry} must be named NNNN_description.sql.`);
    }
    const sql = await readFile(join(dir, entry), "utf8");
    files.push({
      version: Number(match[1]),
      name: match[2] as string,
      checksum: checksum(sql),
      sql,
    });
  }
  files.forEach((file, index) => {
    if (file.version !== index + 1) {
      throw new MigrationFilesError(
        `Migration versions must be consecutive from 0001. Found ${file.version} where ${index + 1} was expected.`,
      );
    }
  });
  return files;
}

async function appliedMigrations(client: PoolClient) {
  await client.query(`
    create table if not exists platform_migration (
      version integer primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
  const result = await client.query<{ version: number; name: string; checksum: string }>(
    "select version, name, checksum from platform_migration order by version",
  );
  return result.rows;
}

/**
 * Brings the database up to the newest migration in `dir`.
 *
 * Forward only. Safe to call from several processes at once: one applies, the
 * rest wait on the advisory lock and then find nothing to do.
 */
export async function runMigrations(
  pool: Pool,
  dir: string = defaultMigrationsDir,
): Promise<MigrationResult> {
  const files = await loadMigrations(dir);
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    try {
      const applied = await appliedMigrations(client);
      const newest = files.length;

      for (const row of applied) {
        const file = files[row.version - 1];
        if (!file) {
          throw new DatabaseNewerThanCodeError(row.version, newest);
        }
        if (file.checksum !== row.checksum) {
          throw new MigrationChecksumError(row.version, row.name);
        }
      }

      const pending = files.slice(applied.length);
      for (const file of pending) {
        try {
          await client.query("begin");
          await client.query(file.sql);
          await client.query(
            "insert into platform_migration (version, name, checksum) values ($1, $2, $3)",
            [file.version, file.name, file.checksum],
          );
          await client.query("commit");
        } catch (error) {
          await client.query("rollback").catch(() => {});
          throw new MigrationFailedError(file.version, file.name, error);
        }
      }

      return {
        applied: pending.map(({ version, name }) => ({ version, name })),
        level: newest,
      };
    } finally {
      await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}
