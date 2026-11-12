import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { type DataStore, openDataStore } from "./datastore.js";
import { type MigrationResult, runMigrations } from "./migrate.js";
import { JobQueue, type QueueTuning } from "./queue.js";
import { TenantRouter } from "./router.js";
import type { PlatformSchema } from "./schema.js";

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
  /** Overrides the built-in migrations. For tests. */
  migrationsDir?: string;
  /** Called when an idle connection fails. Without it such errors are dropped. */
  onConnectionError?: (error: Error) => void;
  queue?: QueueTuning;
}

/**
 * The platform database. It owns the connection pool and never hands it out:
 * callers reach data only through `router`.
 */
export class Database {
  readonly router: TenantRouter;
  /** The job queue. Call `queue.start()` after `migrate()`. */
  readonly queue: JobQueue;
  readonly #pool: pg.Pool;
  readonly #kysely: Kysely<PlatformSchema>;
  readonly #migrationsDir: string | undefined;
  readonly #options: DatabaseOptions;

  constructor(options: DatabaseOptions) {
    this.#options = options;
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
    this.queue = new JobQueue(this.#pool, options.queue, (error) =>
      options.onConnectionError?.(error),
    );
  }

  /** Applies pending migrations. Call once at start, before serving. */
  migrate(): Promise<MigrationResult> {
    return runMigrations(this.#pool, this.#migrationsDir);
  }

  /**
   * This database as a place for custom tables. Call after `migrate()`.
   * `secret` is the instance's own: the restricted sign-in is derived from it.
   */
  openDataStore(secret: Buffer): Promise<DataStore> {
    return openDataStore({
      connectionString: this.#options.connectionString,
      secret,
      platform: this.#kysely,
      ...(this.#options.maxConnections ? { maxConnections: this.#options.maxConnections } : {}),
      ...(this.#options.onConnectionError
        ? { onConnectionError: this.#options.onConnectionError }
        : {}),
    });
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
    await this.queue.stop();
    await this.#kysely.destroy();
  }
}
