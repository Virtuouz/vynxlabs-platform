import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Principal } from "../audit.js";
import { unauthenticated } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { principalOfAppSession } from "./sessions.js";

/**
 * What a page of an app written as code calls the API with, in place of a cookie.
 *
 * Such a page is served sandboxed: it has no origin of its own, so the browser sends it no
 * cookie and it reads no other page. The page is still loaded by an ordinary navigation, with
 * the person's sign-in, and the token it is given there is what it acts with. A token names
 * one tenant, the address it was given at, and the sign-in it came from; it lasts minutes, is
 * renewed by the page with itself, and is worth nothing once that sign-in ends. Nothing about
 * it is stored: it is signed with a key made from AUTH_SECRET.
 */
export const APP_TOKEN_PREFIX = "vxa_";
/** How long one token lasts. The page renews it well before. */
export const APP_TOKEN_SECONDS = 10 * 60;

interface Claims {
  /** The tenant. */
  t: string;
  /** The address it was given at, lower case. */
  h: string;
  /** The sign-in it stands on: an app sign-in, or a member's session at the console's address. */
  k: "app" | "member";
  /** That sign-in's id. */
  s: string;
  /** Who: an end user or a member. */
  p: "end_user" | "member";
  i: string;
  /** When it ends, in seconds since 1970. */
  e: number;
}

export interface AppToken {
  token: string;
  expiresAt: string;
}

const keys = new WeakMap<Kernel, Buffer>();
function keyOf(kernel: Kernel): Buffer {
  let key = keys.get(kernel);
  if (!key) {
    key = createHash("sha256").update(`volvel app token\0${kernel.config.authSecret}`).digest();
    keys.set(kernel, key);
  }
  return key;
}

const sign = (kernel: Kernel, body: string) =>
  createHmac("sha256", keyOf(kernel)).update(body).digest("base64url");

/** A token for `who`, standing on the sign-in `session`, at the address of `request`. */
export function mintAppToken(
  kernel: Kernel,
  request: FastifyRequest,
  who: Omit<Claims, "h" | "e">,
): AppToken {
  const expires = Math.floor(Date.now() / 1000) + APP_TOKEN_SECONDS;
  const claims: Claims = { ...who, h: request.host.toLowerCase(), e: expires };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return {
    token: `${APP_TOKEN_PREFIX}${body}.${sign(kernel, body)}`,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

/** The token for whoever `principal` is, when an app's page is served to them; null for anyone else. */
export function tokenFor(
  kernel: Kernel,
  request: FastifyRequest,
  tenantId: string,
  principal: Principal,
): AppToken | null {
  if (!principal.id) return null;
  if (principal.type === "end_user" && principal.appSessionId) {
    return mintAppToken(kernel, request, {
      t: tenantId,
      k: "app",
      s: principal.appSessionId,
      p: "end_user",
      i: principal.id,
    });
  }
  if (principal.type === "member" && principal.appSessionId) {
    return mintAppToken(kernel, request, {
      t: tenantId,
      k: "app",
      s: principal.appSessionId,
      p: "member",
      i: principal.id,
    });
  }
  if (principal.type === "member" && principal.memberSessionId) {
    return mintAppToken(kernel, request, {
      t: tenantId,
      k: "member",
      s: principal.memberSessionId,
      p: "member",
      i: principal.id,
    });
  }
  return null;
}

function readClaims(kernel: Kernel, token: string): Claims | null {
  const [body, signature] = token.slice(APP_TOKEN_PREFIX.length).split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(kernel, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Claims;
    return typeof claims.e === "number" && typeof claims.t === "string" ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Who an app token stands for. A member is always one who acts in apps only, with what apps
 * use, in the token's tenant: also at the console's address, where a page of the console would
 * have acted with everything the member holds.
 */
export async function fromAppToken(
  kernel: Kernel,
  request: FastifyRequest,
  token: string,
): Promise<Principal> {
  const invalid = () => unauthenticated("The app's sign-in has ended. Open the page again.");
  const claims = readClaims(kernel, token);
  if (!claims) throw invalid();
  if (claims.e * 1000 <= Date.now()) throw invalid();
  if (claims.h !== request.host.toLowerCase()) throw invalid();
  if (claims.k === "app") {
    const session = await kernel.db
      .selectFrom("app_session")
      .select(["id", "principal_type", "principal_id", "host", "expires_at"])
      .where("id", "=", claims.s)
      .where("tenant_id", "=", claims.t)
      .executeTakeFirst();
    if (
      !session ||
      session.expires_at <= new Date() ||
      session.host !== claims.h ||
      session.principal_type !== claims.p ||
      session.principal_id !== claims.i
    ) {
      throw invalid();
    }
    const principal = await principalOfAppSession(kernel, session, claims.t);
    if (!principal) throw invalid();
    return { ...principal, viaCookie: false, appToken: true };
  }
  const session = await kernel.db
    .selectFrom("member_session")
    .innerJoin("member", "member.id", "member_session.member_id")
    .select(["member.id", "member.name", "member.email", "member.disabled_at"])
    .where("member_session.id", "=", claims.s)
    .where("member_session.member_id", "=", claims.i)
    .where("member_session.expires_at", ">", new Date())
    .executeTakeFirst();
  if (!session || session.disabled_at) throw invalid();
  return {
    type: "member",
    id: session.id,
    name: session.name,
    email: session.email,
    appTenantId: claims.t,
    memberSessionId: claims.s,
    appToken: true,
  };
}

/** The same token for a further while, as long as the sign-in it stands on lasts. */
export async function renewAppToken(
  kernel: Kernel,
  request: FastifyRequest,
  token: string,
): Promise<AppToken> {
  await fromAppToken(kernel, request, token);
  const claims = readClaims(kernel, token) as Claims;
  const { h: _host, e: _ends, ...who } = claims;
  return mintAppToken(kernel, request, who);
}
