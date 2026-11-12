import type { Database, TenantRouter } from "@vynxlabs/db";
import { KindRegistry } from "@vynxlabs/manifest";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";
import type { Db } from "./audit.js";
import { type Auth, createAuth } from "./auth.js";
import { Vault } from "./crypto.js";
import { type KindHook, registerKernelKinds } from "./kinds.js";

/** Everything the kernel's routes and services share. */
export interface Kernel {
  db: Db;
  router: TenantRouter;
  auth: Auth;
  vault: Vault;
  kinds: KindRegistry;
  hooks: Map<string, KindHook>;
  config: Config;
}

export function createKernel(database: Database, config: Config, log: FastifyBaseLogger): Kernel {
  const db = database.router.platform();
  const kinds = new KindRegistry();
  const hooks = new Map<string, KindHook>();
  registerKernelKinds(kinds, hooks);
  return {
    db,
    router: database.router,
    auth: createAuth(db, config, log),
    vault: new Vault(config.masterKey),
    kinds,
    hooks,
    config,
  };
}
