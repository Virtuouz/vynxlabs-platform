import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { type DataStore, openDataStore } from "./datastore.js";
import { type Listener, type ListenOptions, listen } from "./listener.js";
import { type MigrationResult, runMigrations } from "./migrate.js";
import { type PoolStats, statsOf } from "./pool-stats.js";
import { JobQueue, type QueueTuning } from "./queue.js";
import { TenantRouter } from "./router.js";
import type { PlatformSchema } from "./schema.js";

/** How long a request for a connection waits when all are in use. */
const CONNECTION_WAIT_MS = 5_000;
/**
 * How long a connection is kept before it is made again. A connection keeps the
 * settings it was opened with: one opened while the database took no writes would
 * otherwise refuse writes long after the database took them again.
 */
export const CONNECTION_LIFETIME_SECONDS = 60;
/** Connections kept for the queue's own statements. Each is held for one statement. */
const QUEUE_CONNECTIONS = 2;

export interface DatabaseOptions {
  connectionString: string;
  maxConnections?: number;
  /** Connections for every tenant's row requests on this database. Default: `maxConnections`, or 10. */
  dataConnections?: number;
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
      maxLifetimeSeconds: CONNECTION_LIFETIME_SECONDS,
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
      maxLifetimeSeconds: CONNECTION_LIFETIME_SECONDS,
      connectionTimeoutMillis: CONNECTION_WAIT_MS,
      application_name: "volvel-queue",
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

  /**
   * Listens on Postgres channels on a connection of its own, outside the pool,
   * made again when it is lost.
   */
  listen(options: Omit<ListenOptions, "connectionString">): Promise<Listener> {
    return listen({ ...options, connectionString: this.#options.connectionString });
  }

  /** Applies pending migrations. Call once at start, before serving. */
  migrate(upTo?: number): Promise<MigrationResult> {
    return runMigrations(this.#pool, this.#migrationsDir, upTo);
  }

  /**
   * This database as a place for custom tables. Call after `migrate()`.
   * `secret` is the instance's own: the restricted sign-in is derived from it.
   */
  openDataStore(secret: Buffer, options: { setUp?: boolean } = {}): Promise<DataStore> {
    return openDataStore({
      connectionString: this.#options.connectionString,
      secret,
      ...(options.setUp === false ? { setUp: false } : {}),
      platform: this.#kysely,
      ...((this.#options.dataConnections ?? this.#options.maxConnections)
        ? { maxConnections: this.#options.dataConnections ?? this.#options.maxConnections }
        : {}),
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

  /** How the platform's own pools are doing: connections open, idle, and requests waiting for one. */
  poolStats(): Record<"platform" | "queue", PoolStats> {
    return { platform: statsOf(this.#pool), queue: statsOf(this.#queuePool) };
  }

  /**
   * Whether the database takes no writes now: a standby, or one set read-only, as a
   * managed Postgres does when its disk is nearly full.
   */
  async readOnly(): Promise<boolean> {
    const row = await sql<{ read_only: boolean }>`
      select current_setting('transaction_read_only') = 'on' or pg_is_in_recovery() as read_only
    `.execute(this.#kysely);
    return row.rows[0]?.read_only ?? false;
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
