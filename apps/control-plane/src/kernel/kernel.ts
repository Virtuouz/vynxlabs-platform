import type { Database, JobQueue, TenantRouter } from "@vynxlabs/db";
import { KindRegistry } from "@vynxlabs/manifest";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";
import type { ObjectStore } from "../storage.js";
import type { Db } from "./audit.js";
import { type Auth, createAuth } from "./auth.js";
import { Vault } from "./crypto.js";
import { DataStores } from "./data/stores.js";
import { registerExecutionHooks } from "./execution/triggers.js";
import { Expressions } from "./flows/expressions.js";
import { type KindHook, registerDataHooks, registerKernelKinds } from "./kinds.js";

/** Everything the kernel's routes and services share. */
export interface Kernel {
  db: Db;
  router: TenantRouter;
  auth: Auth;
  vault: Vault;
  /** Where each tenant's custom tables live. */
  data: DataStores;
  kinds: KindRegistry;
  hooks: Map<string, KindHook>;
  config: Config;
  queue: JobQueue;
  storage: ObjectStore;
  /** Evaluates the expressions in flows and event filters, in a sandbox. */
  expressions: Expressions;
  /** The core version, checked against each bundle's range. */
  version: string;
  log: FastifyBaseLogger;
}

export function createKernel(
  database: Database,
  storage: ObjectStore,
  version: string,
  config: Config,
  log: FastifyBaseLogger,
): Kernel {
  const db = database.router.platform();
  const kinds = new KindRegistry();
  const hooks = new Map<string, KindHook>();
  registerKernelKinds(kinds, hooks);
  const vault = new Vault(config.masterKey);
  const kernel: Kernel = {
    db,
    router: database.router,
    auth: createAuth(db, config, log),
    vault,
    data: new DataStores(database, vault, config.masterKey, log),
    kinds,
    hooks,
    config,
    queue: database.queue,
    storage,
    expressions: new Expressions(),
    version,
    log,
  };
  registerDataHooks(hooks, kernel.data);
  registerExecutionHooks(kernel);
  return kernel;
}
