import { createHash, randomBytes } from "node:crypto";
import { newId } from "@vynxlabs/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type Actor, type Db, type Principal, type Trx, writeAudit } from "../audit.js";
import type { Kernel } from "../kernel.js";

/** How long an end user stays signed in. */
export const END_USER_SESSION_DAYS = 30;
/** A member's sign-in to a tenant's apps on another address is short: it is cheap to make again. */
export const MEMBER_APP_SESSION_HOURS = 12;

const TOKEN_PREFIX = "vxs_";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** One cookie per tenant, so that being signed in to two tenants' apps at one address works. */
export const appCookieName = (tenantId: string) => `vx_app_${tenantId}`;

export function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) {
      return decodeURIComponent(part.slice(at + 1).trim());
    }
  }
  return undefined;
}

function cookie(request: FastifyRequest, tenantId: string, value: string, maxAgeSeconds: number) {
  const parts = [
    `${appCookieName(tenantId)}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (request.protocol === "https") parts.push("Secure");
  return parts.join("; ");
}

/**
 * Signs a person in to one tenant's apps at the address the request came to, and
 * sets the cookie. Only a hash of the cookie's value is stored.
 */
export async function startAppSession(
  db: Db | Trx,
  request: FastifyRequest,
  reply: FastifyReply,
  who: { tenantId: string; type: "end_user" | "member"; id: string },
): Promise<string> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const seconds =
    who.type === "end_user" ? END_USER_SESSION_DAYS * 86_400 : MEMBER_APP_SESSION_HOURS * 3600;
  const id = newId();
  await db
    .insertInto("app_session")
    .values({
      id,
      tenant_id: who.tenantId,
      principal_type: who.type,
      principal_id: who.id,
      token_hash: hash(token),
      host: request.host.toLowerCase(),
      expires_at: new Date(Date.now() + seconds * 1000),
      ip_address: request.ip,
      user_agent: request.headers["user-agent"] ?? null,
    })
    .execute();
  reply.header("set-cookie", cookie(request, who.tenantId, token, seconds));
  return id;
}

/** Ends the sign-in the request came with, if any, and clears the cookie. */
export async function endAppSession(
  db: Db | Trx,
  request: FastifyRequest,
  reply: FastifyReply,
  tenantId: string,
): Promise<{ type: string; id: string } | null> {
  const token = readCookie(request, appCookieName(tenantId));
  reply.header("set-cookie", cookie(request, tenantId, "", 0));
  if (!token) return null;
  const ended = await db
    .deleteFrom("app_session")
    .where("token_hash", "=", hash(token))
    .where("tenant_id", "=", tenantId)
    .returning(["principal_type", "principal_id"])
    .executeTakeFirst();
  return ended ? { type: ended.principal_type, id: ended.principal_id } : null;
}

/**
 * Who the request's app cookie for this tenant stands for, or null. A sign-in
 * counts only at the address it was made at, and only while the person it
 * stands for is still there and not disabled.
 */
export async function appPrincipal(
  kernel: Kernel,
  request: FastifyRequest,
  tenantId: string,
): Promise<Principal | null> {
  const token = readCookie(request, appCookieName(tenantId));
  if (!token?.startsWith(TOKEN_PREFIX)) return null;
  const session = await kernel.db
    .selectFrom("app_session")
    .select(["id", "principal_type", "principal_id", "host", "expires_at"])
    .where("token_hash", "=", hash(token))
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  if (!session || session.expires_at <= new Date()) return null;
  if (session.host !== request.host.toLowerCase()) return null;

  if (session.principal_type === "end_user") {
    const user = await kernel.db
      .selectFrom("end_user")
      .select(["id", "name", "email", "disabled_at"])
      .where("id", "=", session.principal_id)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();
    if (!user || user.disabled_at) return null;
    return {
      type: "end_user",
      id: user.id,
      tenantId,
      name: user.name,
      email: user.email,
      appSessionId: session.id,
      viaCookie: true,
    };
  }
  const member = await kernel.db
    .selectFrom("member")
    .select(["id", "name", "email"])
    .where("id", "=", session.principal_id)
    .executeTakeFirst();
  if (!member) return null;
  return {
    type: "member",
    ...member,
    appTenantId: tenantId,
    appSessionId: session.id,
    viaCookie: true,
  };
}

/** Removes sign-ins that have run out. Called now and then by the background work. */
export async function removeExpiredAppSessions(db: Db): Promise<void> {
  const now = new Date();
  await db.deleteFrom("app_session").where("expires_at", "<=", now).execute();
  await db.deleteFrom("app_handoff").where("expires_at", "<=", now).execute();
  await db.deleteFrom("end_user_token").where("expires_at", "<=", now).execute();
}

// ----- Carrying a member from the instance's address to an app's -----

const HANDOFF_SECONDS = 60;

/** A one-time code that lets `memberId` start an app sign-in for the tenant at `host`. */
export async function createHandoff(
  db: Db | Trx,
  handoff: { tenantId: string; memberId: string; host: string },
): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await db
    .insertInto("app_handoff")
    .values({
      id: newId(),
      tenant_id: handoff.tenantId,
      member_id: handoff.memberId,
      code_hash: hash(code),
      host: handoff.host.toLowerCase(),
      expires_at: new Date(Date.now() + HANDOFF_SECONDS * 1000),
    })
    .execute();
  return code;
}

/** Uses a code, once. Returns who it was for, or null when it is unknown, used, late or for another address. */
export async function takeHandoff(
  db: Db | Trx,
  code: string,
  host: string,
): Promise<{ tenantId: string; memberId: string } | null> {
  const taken = await db
    .updateTable("app_handoff")
    .set({ used_at: new Date() })
    .where("code_hash", "=", hash(code))
    .where("host", "=", host.toLowerCase())
    .where("used_at", "is", null)
    .where("expires_at", ">", new Date())
    .returning(["tenant_id", "member_id"])
    .executeTakeFirst();
  return taken ? { tenantId: taken.tenant_id, memberId: taken.member_id } : null;
}

/** Who is acting, for the audit log, when the request went through no route of the API. */
export function actorOf(request: FastifyRequest, principal: Principal): Actor {
  return {
    principal,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
    requestId: request.id,
  };
}

/** Signs an end user in at the address the request came to, and records it, as one change. */
export async function signInEndUser(
  kernel: Kernel,
  request: FastifyRequest,
  reply: FastifyReply,
  tenantId: string,
  userId: string,
): Promise<void> {
  await kernel.db.transaction().execute(async (trx) => {
    await startAppSession(trx, request, reply, { tenantId, type: "end_user", id: userId });
    await trx
      .updateTable("end_user")
      .set({ last_signed_in_at: new Date() })
      .where("id", "=", userId)
      .execute();
    await writeAudit(trx, actorOf(request, { type: "end_user", id: userId, tenantId }), {
      action: "end_user.signed_in",
      targetType: "end_user",
      targetId: userId,
      tenantId,
    });
  });
}
