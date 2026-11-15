import { fileURLToPath } from "node:url";
import type { Database, JobQueue, TenantRouter } from "@vynxlabs/db";
import { KindRegistry } from "@vynxlabs/manifest";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";
import type { ObjectStore } from "../storage.js";
import { Hosts } from "./apps/hosts.js";
import { RuntimeFiles } from "./apps/runtime.js";
import type { Db } from "./audit.js";
import { type Auth, createAuth } from "./auth.js";
import { Vault } from "./crypto.js";
import { DataStores } from "./data/stores.js";
import { configureEgress } from "./egress.js";
import { registerExecutionHooks } from "./execution/triggers.js";
import { Expressions } from "./flows/expressions.js";
import { DATA_ROLE_SECRET, instanceSecret } from "./instance-secrets.js";
import { type KindHook, registerDataHooks, registerKernelKinds } from "./kinds.js";
import { Mailer } from "./mail.js";
import { Metrics } from "./metrics.js";
import { StreamHub } from "./stream.js";

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
  /** The highest database migration applied. An export can only be imported at the same level. */
  migrationLevel(): Promise<number>;
  log: FastifyBaseLogger;
  /** Which of the instance's addresses a request came to, and what may be reached there. */
  hosts: Hosts;
  mail: Mailer;
  /** The files of the app that draws interfaces. */
  screens: RuntimeFiles;
  /** What changes in runs, passed on to the browsers that may see it. */
  stream: StreamHub;
  /** What this replica counted: runs ended, waits, refusals. */
  metrics: Metrics;
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
  const vault = new Vault(config.masterKey, config.masterKeySecondary);
  let roleSecret: Promise<Buffer> | undefined;
  const dataRoleSecret = () => {
    roleSecret ??= instanceSecret(db, vault, DATA_ROLE_SECRET, () => config.masterKey).catch(
      (error) => {
        roleSecret = undefined;
        throw error;
      },
    );
    return roleSecret;
  };
  const kernel: Kernel = {
    db,
    router: database.router,
    auth: createAuth(db, config, log),
    vault,
    data: new DataStores(database, vault, dataRoleSecret, log),
    kinds,
    hooks,
    config,
    queue: database.queue,
    storage,
    expressions: new Expressions(),
    version,
    migrationLevel: () => database.migrationLevel(),
    log,
    hosts: new Hosts(db, config),
    mail: new Mailer(config, log),
    stream: new StreamHub(database, log),
    metrics: new Metrics(),
    screens: new RuntimeFiles(
      config.screensDir ??
        fileURLToPath(new URL("../../../../packages/screens/runtime/dist", import.meta.url)),
    ),
  };
  configureEgress(config.egressAllow);
  registerDataHooks(hooks, kernel.data);
  registerExecutionHooks(kernel);
  return kernel;
}
