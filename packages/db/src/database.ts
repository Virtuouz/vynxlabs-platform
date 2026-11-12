import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { type DataStore, openDataStore } from "./datastore.js";
import { type MigrationResult, runMigrations } from "./migrate.js";
import { JobQueue, type QueueTuning } from "./queue.js";
import { TenantRouter } from "./router.js";
import type { PlatformSchema } from "./schema.js";

/** How long a request for a connection waits when all are in use. */
const CONNECTION_WAIT_MS = 5_000;
/** Connections kept for the queue's own statements. Each is held for one statement. */
const QUEUE_CONNECTIONS = 2;

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
  readonly #queuePool: pg.Pool;
  readonly #kysely: Kysely<PlatformSchema>;
  readonly #migrationsDir: string | undefined;
  readonly #options: DatabaseOptions;

  constructor(options: DatabaseOptions) {
    this.#options = options;
    this.#pool = new pg.Pool({
      connectionString: options.connectionString,
      max: options.maxConnections ?? 10,
      // When every connection is busy, fail and say so. Waiting without limit turns
      // a pool that is too small, or work that holds connections, into a silent stop.
      connectionTimeoutMillis: CONNECTION_WAIT_MS,
    });
    this.#pool.on("error", (error) => options.onConnectionError?.(error));
    // The queue's own statements get connections of their own. Much of the platform
    // calls the queue from inside a transaction, which already holds a connection
    // from the pool above. If the queue then waited on that same pool, enough such
    // callers at once would each hold one connection and wait for another, for good.
    // Nothing that uses this pool waits on the other while it holds a connection.
    this.#queuePool = new pg.Pool({
      connectionString: options.connectionString,
      max: QUEUE_CONNECTIONS,
      connectionTimeoutMillis: CONNECTION_WAIT_MS,
      application_name: "vynxlabs-platform-queue",
    });
    this.#queuePool.on("error", (error) => options.onConnectionError?.(error));
    this.#kysely = new Kysely<PlatformSchema>({
      dialect: new PostgresDialect({ pool: this.#pool }),
    });
    this.#migrationsDir = options.migrationsDir;
    this.router = new TenantRouter(this.#kysely);
    this.queue = new JobQueue(this.#queuePool, options.queue, (error) =>
      options.onConnectionError?.(error),
    );
  }

  /** Applies pending migrations. Call once at start, before serving. */
  migrate(upTo?: number): Promise<MigrationResult> {
    return runMigrations(this.#pool, this.#migrationsDir, upTo);
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
    await this.#queuePool.end();
    await this.#kysely.destroy();
  }
}
