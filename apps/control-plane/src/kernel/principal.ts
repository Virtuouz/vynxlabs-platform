import { createHash, randomBytes } from "node:crypto";
import { isId } from "@vynxlabs/db";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";
import type { Place } from "./apps/hosts.js";
import { appPrincipal } from "./apps/sessions.js";
import { ANONYMOUS, type Principal } from "./audit.js";
import { HttpError, unauthenticated } from "./errors.js";
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

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A browser sends cookies by itself, also when another site makes it send the
 * request. So a change that arrives with a cookie must come from a page of this
 * instance: from the address it was sent to, or from the instance's own.
 */
function refuseCrossSite(kernel: Kernel, request: FastifyRequest, place: Place): void {
  if (READS.has(request.method)) return;
  const origin = request.headers.origin;
  if (origin === undefined) return;
  // The instance may be reached by a name other than its configured one, so both count
  // there. At an app's address only that address does: not even the console's.
  const allowed =
    place.kind === "main"
      ? [kernel.hosts.originOf(request), kernel.hosts.mainOrigin]
      : [kernel.hosts.originOf(request)];
  if (!allowed.includes(origin)) {
    throw new HttpError(403, "cross_site", "This request came from another site.");
  }
}

/**
 * Works out who is calling: an API key, a member's session, a sign-in to a
 * tenant's apps, or nobody.
 *
 * A member's session counts only at the instance's own address. At an app's
 * address a person is known by a sign-in to that tenant's apps and nothing else.
 * `tenantId` is the tenant the request is about, when it is about one.
 */
export async function resolvePrincipal(
  kernel: Kernel,
  request: FastifyRequest,
  tenantId?: string,
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
  const place = await kernel.hosts.place(request);
  if (place.kind === "main") {
    const session = await kernel.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (session) {
      refuseCrossSite(kernel, request, place);
      return {
        type: "member",
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        viaCookie: true,
      };
    }
  }
  const tenant = tenantId ?? (place.kind === "domain" ? place.domain.tenantId : undefined);
  if (tenant !== undefined && isId(tenant)) {
    const principal = await appPrincipal(kernel, request, tenant);
    if (principal) {
      refuseCrossSite(kernel, request, place);
      return principal;
    }
  }
  return ANONYMOUS;
}
