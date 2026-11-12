import {
  type Database,
  type DataStore,
  type Kysely,
  openDataStore,
  type PlatformSchema,
  type Transaction,
} from "@vynxlabs/db";
import type { FastifyBaseLogger } from "fastify";
import type { Db, Trx } from "../audit.js";
import type { Vault } from "../crypto.js";
import { HttpError, notFound } from "../errors.js";

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
  readonly #secret: Buffer;
  readonly #log: FastifyBaseLogger;
  #platform: Promise<DataStore> | undefined;
  readonly #dedicated = new Map<string, Promise<DataStore>>();
  /** A tenant's location never changes, so it is looked up once. */
  readonly #locations = new Map<string, string | null>();

  constructor(database: Database, vault: Vault, secret: Buffer, log: FastifyBaseLogger) {
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
  platform(): Promise<DataStore> {
    this.#platform ??= this.#database.openDataStore(this.#secret).catch((error) => {
      this.#platform = undefined;
      throw error;
    });
    return this.#platform;
  }

  /** Seals a connection string for storing. Only this instance can open it. */
  seal(name: string, connectionString: string): Buffer {
    return this.#vault.sealForInstance(`database-location:${name}`, connectionString);
  }

  /** Opens a connection string as a data store, setting it up if it is new. Does not remember it. */
  connect(connectionString: string): Promise<DataStore> {
    return openDataStore({
      connectionString,
      secret: this.#secret,
      maxConnections: 5,
      onConnectionError: (error) =>
        this.#log.warn({ err: error }, "a connection to a dedicated database failed"),
    });
  }

  /**
   * The store registered under a name. A caller inside a transaction passes it as `db`,
   * so that opening the store for the first time does not wait for a second connection.
   */
  location(name: string, db: Db | Trx = this.#db): Promise<DataStore> {
    let store = this.#dedicated.get(name);
    if (!store) {
      store = (async () => {
        const row = await db
          .selectFrom("database_location")
          .select("connection_encrypted")
          .where("name", "=", name)
          .executeTakeFirst();
        if (!row) throw notFound(`The database location ${name}`);
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
    await store?.then((opened) => opened.close()).catch(() => {});
  }

  forgetTenant(tenantId: string): void {
    this.#locations.delete(tenantId);
  }

  /** The name of the dedicated location a tenant uses, or null for the platform database. */
  async locationOf(tenantId: string, db: Db | Trx = this.#db): Promise<string | null> {
    const known = this.#locations.get(tenantId);
    if (known !== undefined) return known;
    const tenant = await db
      .selectFrom("tenant")
      .select("data_location")
      .where("id", "=", tenantId)
      .executeTakeFirst();
    if (!tenant) throw notFound("The tenant");
    const name = tenant.data_location.kind === "dedicated" ? tenant.data_location.ref : null;
    this.#locations.set(tenantId, name);
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
