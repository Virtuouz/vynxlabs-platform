import { randomBytes } from "node:crypto";
import { newId } from "@vynxlabs/db";
import type { FastifyRequest } from "fastify";
import type { Db, Trx } from "../audit.js";
import { unauthenticated } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { hashApiKey } from "../principal.js";
import type { WorkerScope } from "./runs.js";

export const WORKER_TOKEN_PREFIX = "vxw_";

export interface NewCredential {
  tenantId: string;
  workspaceId?: string | null;
  name: string;
  managed?: boolean;
  /** The pool the credential's workers serve. */
  pool?: string | null;
  expiresAt?: Date | null;
}

/** Creates a worker credential. The token is returned once and only its hash is stored. */
export async function createWorkerCredential(db: Db | Trx, input: NewCredential) {
  const token = `${WORKER_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await db
    .insertInto("worker_credential")
    .values({
      id: newId(),
      tenant_id: input.tenantId,
      workspace_id: input.workspaceId ?? null,
      name: input.name,
      prefix: token.slice(0, 12),
      token_hash: hashApiKey(token),
      managed: input.managed ?? false,
      pool: input.pool ?? null,
      expires_at: input.expiresAt ?? null,
      revoked_at: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { row, token };
}

/** Works out which worker is calling, from its credential. */
export async function resolveWorker(kernel: Kernel, request: FastifyRequest): Promise<WorkerScope> {
  const [scheme, token] = (request.headers.authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.startsWith(WORKER_TOKEN_PREFIX)) {
    throw unauthenticated("Send a worker credential: Authorization: Bearer <credential>.");
  }
  const credential = await kernel.db
    .selectFrom("worker_credential")
    .select(["id", "tenant_id", "workspace_id", "pool", "revoked_at", "expires_at"])
    .where("token_hash", "=", hashApiKey(token))
    .executeTakeFirst();
  if (
    !credential ||
    credential.revoked_at ||
    (credential.expires_at && credential.expires_at <= new Date())
  ) {
    throw unauthenticated("The worker credential is not valid.");
  }
  return {
    credentialId: credential.id,
    tenantId: credential.tenant_id,
    workspaceId: credential.workspace_id,
    pool: credential.pool,
  };
}

/** Records that a worker is alive. */
export async function seeWorker(
  kernel: Kernel,
  scope: WorkerScope,
  workerId: string,
  version?: string,
) {
  const now = new Date();
  await kernel.db
    .insertInto("worker")
    .values({
      id: workerId,
      credential_id: scope.credentialId,
      tenant_id: scope.tenantId,
      version: version ?? null,
      last_seen_at: now,
    })
    .onConflict((oc) => oc.column("id").doUpdateSet({ last_seen_at: now }))
    .execute();
}

/** A worker not heard from for this long is no longer listed. */
export const WORKER_STALE_SECONDS = 90;
