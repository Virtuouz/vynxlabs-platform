import { type Kysely, newId, type PlatformSchema, type Transaction } from "@vynxlabs/db";

export type Db = Kysely<PlatformSchema>;
export type Trx = Transaction<PlatformSchema>;

export interface Principal {
  type: "member" | "service_account" | "anonymous" | "system";
  id: string | null;
  /** The tenant a service account belongs to. */
  tenantId?: string;
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
  action: string;
  targetType: string;
  targetId?: string | null;
  tenantId?: string | null;
  workspaceId?: string | null;
  /** Never put a secret value, password or key in here. */
  details?: Record<string, unknown>;
}

export type Audit = (input: AuditInput) => Promise<void>;

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
      details: JSON.stringify(input.details ?? {}),
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
  return db.transaction().execute(async (trx) => {
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
