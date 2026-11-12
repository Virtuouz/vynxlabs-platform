import { createHash, randomBytes } from "node:crypto";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import { ANONYMOUS, type Principal } from "./audit.js";
import { unauthenticated } from "./errors.js";
import type { Kernel } from "./kernel.js";

export const API_KEY_PREFIX = "vxk_";

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new API key. Only `hash` and `prefix` are stored. The token is shown once. */
export function generateApiKey() {
  const token = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, 12), hash: hashApiKey(token) };
}

async function fromApiKey(kernel: Kernel, token: string): Promise<Principal> {
  const key = await kernel.db
    .selectFrom("api_key")
    .selectAll()
    .where("token_hash", "=", hashApiKey(token))
    .executeTakeFirst();
  const now = new Date();
  if (!key || key.revoked_at || (key.expires_at && key.expires_at <= now)) {
    throw unauthenticated("The API key is not valid.");
  }
  // Recording every use would turn each read into a write. Once a minute is enough.
  if (!key.last_used_at || now.getTime() - key.last_used_at.getTime() > 60_000) {
    await kernel.db
      .updateTable("api_key")
      .set({ last_used_at: now })
      .where("id", "=", key.id)
      .execute();
  }
  if (key.owner_type === "member") {
    const member = await kernel.db
      .selectFrom("member")
      .select(["id", "name", "email"])
      .where("id", "=", key.owner_id)
      .executeTakeFirst();
    if (!member) throw unauthenticated("The API key is not valid.");
    return { type: "member", ...member, apiKeyId: key.id };
  }
  const account = await kernel.db
    .selectFrom("service_account")
    .select(["id", "name", "tenant_id"])
    .where("id", "=", key.owner_id)
    .executeTakeFirst();
  if (!account) throw unauthenticated("The API key is not valid.");
  return {
    type: "service_account",
    id: account.id,
    name: account.name,
    tenantId: account.tenant_id,
    apiKeyId: key.id,
  };
}

/** Works out who is calling: an API key, a member session, or nobody. */
export async function resolvePrincipal(
  kernel: Kernel,
  request: FastifyRequest,
): Promise<Principal> {
  const authorization = request.headers.authorization;
  if (authorization) {
    const [scheme, token] = authorization.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token?.startsWith(API_KEY_PREFIX)) {
      throw unauthenticated("The Authorization header must be: Bearer <api key>.");
    }
    return fromApiKey(kernel, token);
  }
  if (!request.headers.cookie) return ANONYMOUS;
  const session = await kernel.auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });
  if (!session) return ANONYMOUS;
  return {
    type: "member",
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
}
