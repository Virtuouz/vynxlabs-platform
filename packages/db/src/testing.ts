import { randomBytes } from "node:crypto";
import pg from "pg";

/** The Postgres started by `pnpm stack:up`. */
const DEV_STACK_URL = "postgres://platform:platform@localhost:54329/platform";

export interface TestDatabase {
  connectionString: string;
  drop(): Promise<void>;
}

/**
 * Creates an empty throwaway database on the server named by
 * TEST_DATABASE_URL, falling back to the local dev stack.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env.TEST_DATABASE_URL ?? DEV_STACK_URL;
  const name = `test_${randomBytes(8).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  try {
    await admin.connect();
    await admin.query(`create database ${name}`);
  } catch (error) {
    throw new Error(
      `Could not create a test database on ${new URL(adminUrl).host}. Start one with "pnpm stack:up" or set TEST_DATABASE_URL.`,
      { cause: error },
    );
  } finally {
    await admin.end().catch(() => {});
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    connectionString: url.toString(),
    async drop() {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      try {
        await client.query(`drop database if exists ${name} with (force)`);
      } finally {
        await client.end();
      }
    },
  };
}
