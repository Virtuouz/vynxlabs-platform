import { type Kysely, newId, type PlatformSchema, sql, type Transaction } from "@volvel/db";

import type { AuditAction } from "@volvel/manifest";
import { commitDataTransactions, rollbackDataTransactions } from "./data/stores.js";

export type Db = Kysely<PlatformSchema>;
export type Trx = Transaction<PlatformSchema>;

export interface Principal {
  type: "member" | "service_account" | "end_user" | "anonymous" | "system";
  id: string | null;
  /** The tenant a service account or an end user belongs to. */
  tenantId?: string;
  /**
   * Set when a member is signed in to one tenant's apps, on an address other than
   * the instance's own. Such a sign-in reaches that tenant only, and only what apps use.
   */
  appTenantId?: string;
  /** The app sign-in this request came with, when it came with one. */
  appSessionId?: string;
  /** Whether the caller was recognized by a cookie, which a browser sends by itself. */
  viaCookie?: boolean;
  /** A member's session at the console's address, when the caller came with one. */
  memberSessionId?: string;
  /** Whether the caller is a page of an app written as code, acting with its app token. */
  appToken?: boolean;
  apiKeyId?: string;
  name?: string;
  email?: string;
}

export const ANONYMOUS: Principal = { type: "anonymous", id: null };
export const SYSTEM: Principal = { type: "system", id: null };

/** Who is acting, and from where. */
export interface Actor {
  principal: Principal;
  accessGrantId?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  requestId?: string | undefined;
}

export interface AuditInput {
  /** One of `AUDIT_ACTIONS` (@volvel/manifest): what is not listed cannot be written. */
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  tenantId?: string | null;
  workspaceId?: string | null;
  /** Never put a secret value, password or key in here. */
  details?: Record<string, unknown>;
}

export type Audit = (input: AuditInput) => Promise<void>;

/**
 * An actor with no row to look a name up in (the system, acting for an identity provider)
 * is kept by name in the entry, as `actorName`, so the log can say who it was.
 */
function namedActor(actor: Actor, details: Record<string, unknown> = {}) {
  const { type, name } = actor.principal;
  return name && (type === "system" || type === "anonymous")
    ? { ...details, actorName: name }
    : details;
}

export async function writeAudit(db: Db | Trx, actor: Actor, input: AuditInput): Promise<void> {
  await db
    .insertInto("audit_entry")
    .values({
      id: newId(),
      tenant_id: input.tenantId ?? null,
      workspace_id: input.workspaceId ?? null,
      actor_type: actor.principal.type,
      actor_id: actor.principal.id,
      api_key_id: actor.principal.apiKeyId ?? null,
      access_grant_id: actor.accessGrantId ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      details: JSON.stringify(namedActor(actor, input.details)),
      ip_address: actor.ipAddress ?? null,
      user_agent: actor.userAgent ?? null,
      request_id: actor.requestId ?? null,
    })
    .execute();
}

/**
 * The one write path. Runs a change and its audit entries in one transaction:
 * if either fails, both roll back. A change that records no audit entry is
 * refused.
 */
export async function mutate<T>(
  db: Db,
  actor: Actor,
  change: (trx: Trx, audit: Audit) => Promise<T>,
): Promise<T> {
  return transact(db, async (trx) => {
    // Who is changing things, for what the database stamps by itself, such as when
    // and by whom a credential was set. It lasts for this transaction only.
    await sql`select set_config('vx.actor_type', ${actor.principal.type}, true),
      set_config('vx.actor_id', ${actor.principal.id ?? ""}, true)`.execute(trx);
    let entries = 0;
    const result = await change(trx, async (input) => {
      await writeAudit(trx, actor, input);
      entries += 1;
    });
    if (entries === 0) {
      throw new Error("A change must record at least one audit entry.");
    }
    return result;
  });
}

/**
 * A transaction on the platform database that may also change a tenant's
 * tables in a dedicated database. Those changes commit just before this one
 * does, and roll back if it fails first.
 */
export function transact<T>(db: Db, change: (trx: Trx) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (trx) => {
    try {
      const result = await change(trx);
      await commitDataTransactions(trx);
      return result;
    } catch (error) {
      await rollbackDataTransactions(trx);
      throw error;
    }
  });
}
