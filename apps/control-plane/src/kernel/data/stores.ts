import {
  type Database,
  type DataStore,
  type Kysely,
  openDataStore,
  type PlatformSchema,
  type PoolStats,
  sql,
  type Transaction,
} from "@volvel/db";
import type { FastifyBaseLogger } from "fastify";
import type { Db, Trx } from "../audit.js";
import type { Vault } from "../crypto.js";
import { HttpError, notFound } from "../errors.js";
import { upgradePolicies } from "./apply.js";
import { TenantGate } from "./gate.js";

/** A connection to the database that holds a tenant's custom tables and their catalog. */
export type DataDb = Kysely<PlatformSchema> | Transaction<PlatformSchema>;

interface ControlledTransaction extends Transaction<PlatformSchema> {
  commit(): { execute(): Promise<void> };
  rollback(): { execute(): Promise<void> };
}

/**
 * Transactions opened in dedicated databases on behalf of a transaction in
 * the platform database. They are committed just before it, and rolled back
 * with it.
 */
const open = new WeakMap<object, Map<DataStore, ControlledTransaction>>();

/** Commits what a platform transaction changed in dedicated databases. Called as its last step. */
export async function commitDataTransactions(trx: object): Promise<void> {
  const held = open.get(trx);
  if (!held) return;
  open.delete(trx);
  const all = [...held.values()];
  for (const [index, data] of all.entries()) {
    try {
      await data.commit().execute();
    } catch (error) {
      for (const later of all.slice(index + 1))
        await later
          .rollback()
          .execute()
          .catch(() => {});
      throw error;
    }
  }
}

export async function rollbackDataTransactions(trx: object): Promise<void> {
  const held = open.get(trx);
  if (!held) return;
  open.delete(trx);
  for (const data of held.values())
    await data
      .rollback()
      .execute()
      .catch(() => {});
}

/** How long what a replica knows of where tables live is trusted before it is read again. */
const STALE_MS = 2000;

const unreachable = (name: string, error: unknown) =>
  new HttpError(
    503,
    "data_location_unavailable",
    `The database location "${name}" could not be reached. ${(error as Error).message}`,
  );

/**
 * Resolves where each tenant's custom tables live. Most tenants use the
 * platform database. A tenant whose record names a dedicated location uses
 * the database registered under that name.
 */
export class DataStores {
  readonly #database: Database;
  readonly #db: Db;
  readonly #vault: Vault;
  /** The seed of the data role's password, read once from the database. */
  readonly #secret: () => Promise<Buffer>;
  readonly #log: FastifyBaseLogger;
  #platform: Promise<DataStore> | undefined;
  readonly #dedicated = new Map<string, Promise<DataStore>>();
  /**
   * Where each tenant keeps its tables, as last read. Another replica may move a tenant (deleted
   * and imported elsewhere) or change a location's address, so what is remembered is read again
   * after a moment, as the control plane's own settings are.
   */
  readonly #locations = new Map<string, { name: string | null; at: number }>();
  /** The `updated_at` each open location was opened at, and when it was last compared. */
  readonly #versions = new Map<string, { updated: string; checked: number }>();
  /**
   * Each tenant's share of the row connections of whatever database it uses. Several tenants
   * may name one dedicated database, so it needs the share as the platform database does.
   */
  readonly gate: TenantGate;

  constructor(
    database: Database,
    vault: Vault,
    secret: () => Promise<Buffer>,
    log: FastifyBaseLogger,
    /** Row requests one tenant may have open at once on its database. */
    tenantConnections = 3,
  ) {
    this.gate = new TenantGate(tenantConnections);
    this.#database = database;
    this.#db = database.router.platform();
    this.#vault = vault;
    this.#secret = secret;
    this.#log = log;
  }

  /**
   * The platform database as a data store. Opening it takes a connection, so it is
   * opened once at start, before any request can ask for it from inside a transaction.
   */
  platform(options: { setUp?: boolean } = {}): Promise<DataStore> {
    this.#platform ??= this.#secret()
      .then((secret) => this.#database.openDataStore(secret, options))
      .then((store) => this.#upgraded(store, options.setUp !== false))
      .catch((error) => {
        this.#platform = undefined;
        throw error;
      });
    return this.#platform;
  }

  /** Seals a connection string for storing. Only this instance can open it. */
  seal(name: string, connectionString: string): Buffer {
    return this.#vault.sealForInstance(`database-location:${name}`, connectionString);
  }

  /** Brings a store's row policies up to how who is asking is now told. Once, when it is opened. */
  async #upgraded(store: DataStore, writable = true): Promise<DataStore> {
    if (!writable) return store;
    const changed = await upgradePolicies(store.owner, store.role);
    if (changed > 0) this.#log.info({ tables: changed }, "row policies now read the signed claim");
    return store;
  }

  /** Opens a connection string as a data store, setting it up if it is new. Does not remember it. */
  async connect(connectionString: string): Promise<DataStore> {
    return this.#upgraded(await this.#open(connectionString));
  }

  /**
   * Whether a database answers, without making it ready for use: no catalog, role or policy is
   * written, and nothing is remembered. One that is already open answers on its own connection.
   */
  async probe(name: string, connectionString: string): Promise<void> {
    const open = this.#dedicated.get(name);
    if (open) {
      const store = await open.catch(() => null);
      if (store) return store.ping();
    }
    const store = await openDataStore({
      connectionString,
      secret: await this.#secret(),
      setUp: false,
      maxConnections: 1,
    });
    try {
      await sql`select 1`.execute(store.owner);
    } finally {
      await store.close();
    }
  }

  /**
   * Which database a connection string reaches: the server's own identifier and the database's
   * name. Two strings that give the same pair reach one database, however they are spelled.
   * Nothing is written and nothing is remembered.
   */
  async identify(connectionString: string): Promise<string> {
    const store = await openDataStore({
      connectionString,
      secret: await this.#secret(),
      setUp: false,
      maxConnections: 1,
    });
    try {
      const { rows } = await sql<{ id: string }>`
        select (select system_identifier::text from pg_control_system()) || '/' || current_database() as id
      `.execute(store.owner);
      return rows[0]?.id ?? "";
    } finally {
      await store.close();
    }
  }

  async #open(connectionString: string): Promise<DataStore> {
    return openDataStore({
      connectionString,
      secret: await this.#secret(),
      maxConnections: 5,
      onConnectionError: (error) =>
        this.#log.warn({ err: error }, "a connection to a dedicated database failed"),
    });
  }

  /**
   * The store registered under a name. A caller inside a transaction passes it as `db`,
   * so that opening the store for the first time does not wait for a second connection.
   */
  async location(name: string, db: Db | Trx = this.#db): Promise<DataStore> {
    // Another replica may have changed the address: a store opened at an older version is closed.
    const version = this.#versions.get(name);
    if (version && this.#dedicated.has(name) && Date.now() - version.checked > STALE_MS) {
      const now = await db
        .selectFrom("database_location")
        .select("updated_at")
        .where("name", "=", name)
        .executeTakeFirst();
      if (now?.updated_at.toISOString() === version.updated) version.checked = Date.now();
      else await this.forget(name);
    }
    let store = this.#dedicated.get(name);
    if (!store) {
      store = (async () => {
        const row = await db
          .selectFrom("database_location")
          .select(["connection_encrypted", "updated_at"])
          .where("name", "=", name)
          .executeTakeFirst();
        if (!row) throw notFound(`The database location ${name}`);
        this.#versions.set(name, { updated: row.updated_at.toISOString(), checked: Date.now() });
        const address = this.#vault.openForInstance(
          `database-location:${name}`,
          row.connection_encrypted,
        );
        try {
          return await this.connect(address);
        } catch (error) {
          throw unreachable(name, error);
        }
      })();
      this.#dedicated.set(name, store);
      // A failure is not remembered: the next request tries again.
      store.catch(() => this.#dedicated.delete(name));
    }
    return store;
  }

  /** Closes and forgets a location, after its address changed or it was removed. */
  async forget(name: string): Promise<void> {
    const store = this.#dedicated.get(name);
    this.#dedicated.delete(name);
    this.#versions.delete(name);
    await store?.then((opened) => opened.close()).catch(() => {});
  }

  forgetTenant(tenantId: string): void {
    this.#locations.delete(tenantId);
  }

  /** The name of the dedicated location a tenant uses, or null for Volvel's own database. */
  async locationOf(tenantId: string, db: Db | Trx = this.#db): Promise<string | null> {
    const known = this.#locations.get(tenantId);
    if (known !== undefined && Date.now() - known.at < STALE_MS) return known.name;
    const tenant = await db
      .selectFrom("tenant")
      .select("data_location")
      .where("id", "=", tenantId)
      .executeTakeFirst();
    if (!tenant) throw notFound("The tenant");
    const name = tenant.data_location.kind === "dedicated" ? tenant.data_location.ref : null;
    this.#locations.set(tenantId, { name, at: Date.now() });
    return name;
  }

  /** Where a tenant's custom tables live. */
  async forTenant(tenantId: string): Promise<DataStore> {
    const name = await this.locationOf(tenantId);
    return name === null ? this.platform() : this.location(name);
  }

  /**
   * The connection to use for a tenant's tables and catalog inside a
   * transaction on the platform database. For the platform database it is
   * that same transaction, so everything commits together. For a dedicated
   * database it is a transaction there, committed just before the platform's.
   */
  async within(trx: Trx, tenantId: string): Promise<{ db: Trx; store: DataStore }> {
    // Looked up on the transaction itself: it holds a connection, and must not wait for another.
    return this.withinLocation(trx, await this.locationOf(tenantId, trx));
  }

  /** The same, for a location given by name: for a tenant whose record is being written in this very transaction. */
  async withinLocation(trx: Trx, name: string | null): Promise<{ db: Trx; store: DataStore }> {
    const store = await (name === null ? this.platform() : this.location(name, trx));
    if (store.shared) return { db: trx, store };
    let held = open.get(trx);
    if (!held) {
      held = new Map();
      open.set(trx, held);
    }
    let data = held.get(store);
    if (!data) {
      data = (await store.owner.startTransaction().execute()) as unknown as ControlledTransaction;
      held.set(store, data);
    }
    return { db: data, store };
  }

  /** How the platform database's pools are doing: its own, the queue's, and the row requests'. */
  async poolStats(): Promise<Record<string, PoolStats>> {
    const own = this.#database.poolStats();
    const store = await this.#platform?.catch(() => undefined);
    return { ...own, ...(store ? { rows: store.rowStats() } : {}) };
  }

  /** Every store in use, with the name of its location. For the readiness check. */
  async opened(): Promise<{ name: string | null; store: Promise<DataStore> }[]> {
    return [
      { name: null, store: this.platform() },
      ...[...this.#dedicated].map(([name, store]) => ({ name, store })),
    ];
  }

  async close(): Promise<void> {
    for (const store of [this.#platform, ...this.#dedicated.values()]) {
      await store?.then((opened) => opened.close()).catch(() => {});
    }
    this.#dedicated.clear();
    this.#platform = undefined;
  }
}
