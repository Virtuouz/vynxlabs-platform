import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { type MigrationResult, runMigrations } from "./migrate.js";
import { TenantRouter } from "./router.js";
import type { PlatformSchema } from "./schema.js";

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
  /** Overrides the built-in migrations. For tests. */
  migrationsDir?: string;
  /** Called when an idle connection fails. Without it such errors are dropped. */
  onConnectionError?: (error: Error) => void;
}

/**
 * The platform database. It owns the connection pool and never hands it out:
 * callers reach data only through `router`.
 */
export class Database {
  readonly router: TenantRouter;
  readonly #pool: pg.Pool;
  readonly #kysely: Kysely<PlatformSchema>;
  readonly #migrationsDir: string | undefined;

  constructor(options: DatabaseOptions) {
    this.#pool = new pg.Pool({
      connectionString: options.connectionString,
      max: options.maxConnections ?? 10,
    });
    this.#pool.on("error", (error) => options.onConnectionError?.(error));
    this.#kysely = new Kysely<PlatformSchema>({
      dialect: new PostgresDialect({ pool: this.#pool }),
    });
    this.#migrationsDir = options.migrationsDir;
    this.router = new TenantRouter(this.#kysely);
  }

  /** Applies pending migrations. Call once at start, before serving. */
  migrate(): Promise<MigrationResult> {
    return runMigrations(this.#pool, this.#migrationsDir);
  }

  /** The highest applied migration, or 0. */
  async migrationLevel(): Promise<number> {
    const row = await this.#kysely
      .selectFrom("platform_migration")
      .select((eb) => eb.fn.max("version").as("level"))
      .executeTakeFirst();
    return row?.level ?? 0;
  }

  /** Throws if the database cannot answer a trivial query. */
  async ping(): Promise<void> {
    await sql`select 1`.execute(this.#kysely);
  }

  async close(): Promise<void> {
    await this.#kysely.destroy();
  }
}
