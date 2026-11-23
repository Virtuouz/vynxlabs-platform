import { newId } from "@volvel/db";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { openAPI } from "better-auth/plugins/open-api";
import type { FastifyBaseLogger } from "fastify";
import { CONSOLE_SESSION_DAYS, type Config, MIN_PASSWORD_LENGTH } from "../config.js";
import { ANONYMOUS, type Db, writeAudit } from "./audit.js";
import { countHit } from "./ratelimit.js";
import { finish, stateCookie } from "./sso/flow.js";
import { memberPasswordRefusedBy, nameOwnedBy } from "./sso/people.js";
import { findRecoveryCode, RECOVERY_HEADER, useRecoveryCode } from "./sso/recovery.js";

/** The header the route sets for the library: the caller's address as the server worked it out. */
export const CLIENT_ADDRESS_HEADER = "x-volvel-client-address";

/** Attempts a minute from one address: the same as end users' sign-in, so there is one number to state. */
export const SIGN_IN_ATTEMPTS_PER_MINUTE = 20;
const SIGN_IN_RULE = { window: 60, max: SIGN_IN_ATTEMPTS_PER_MINUTE };

const timestamps = { createdAt: "created_at", updatedAt: "updated_at" };

/** The authentication options, shared by the running service and the schema test. */
export function authOptions(
  db: Db,
  config: Pick<Config, "publicUrl" | "authSecret"> & { authLimits?: boolean },
) {
  return {
    appName: "Volvel",
    baseURL: config.publicUrl,
    basePath: "/api/v1/auth",
    secret: config.authSecret,
    database: { db, type: "postgres" as const },
    // Never report usage anywhere.
    telemetry: { enabled: false },
    trustedOrigins: [config.publicUrl],
    // Counted in the same table as the routes' limits, so that every replica shares one count.
    // Anything that checks a password or sends mail is held to what end users' sign-in is.
    rateLimit: {
      enabled: config.authLimits ?? true,
      customStorage: {
        consume: async (key: string, rule: { window: number; max: number }) => {
          const { hits, ttl } = await countHit(db, `auth|${key}`, rule.window * 1000);
          return hits <= rule.max
            ? { allowed: true, retryAfter: null }
            : { allowed: false, retryAfter: Math.max(1, Math.ceil(ttl / 1000)) };
        },
      },
      customRules: Object.fromEntries(
        [
          "/sign-in/*",
          "/sign-up/*",
          "/change-password",
          "/change-email",
          "/request-password-reset",
          "/send-verification-email",
          "/forget-password/*",
        ].map((path) => [path, SIGN_IN_RULE]),
      ),
    },
    emailAndPassword: {
      enabled: true,
      // Members are created by an admin. Nobody signs themselves up.
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    user: {
      modelName: "member",
      fields: { emailVerified: "email_verified", ...timestamps },
    },
    session: {
      // A session is listed and ended by its owner however old it is (Account, Sessions). The
      // library would ask for one made in the last day to list them.
      freshAge: 0,
      modelName: "member_session",
      // Said here and in SECURITY.md, so that a change of the library's default is a choice.
      expiresIn: CONSOLE_SESSION_DAYS * 86_400,
      fields: {
        userId: "member_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        ...timestamps,
      },
    },
    account: {
      modelName: "member_account",
      fields: {
        userId: "member_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        ...timestamps,
      },
    },
    verification: {
      modelName: "member_verification",
      fields: { expiresAt: "expires_at", ...timestamps },
    },
    advanced: {
      // The end-user pool will use its own prefix, so the two sessions never mix.
      cookiePrefix: "vx_member",
      // The one address of the caller is the one the server worked out, which the route
      // passes in this header after removing any the caller sent. Nothing else is read.
      ipAddress: { ipAddressHeaders: [CLIENT_ADDRESS_HEADER] },
      useSecureCookies: config.publicUrl.startsWith("https://"),
      database: { generateId: () => newId() },
    },
  };
}

function cookieFrom(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/** A place in the console to send someone back to. Only a path at this address is accepted. */
export function consolePath(raw: string | null | undefined): string {
  if (!raw?.startsWith("/") || raw.startsWith("//") || /[\\\r\n]/.test(raw)) return "/";
  if (raw.startsWith("/api/") || raw.length > 2000) return "/";
  return raw;
}

/**
 * The last step of a member's single sign-on. The provider's answer was checked
 * and turned into a one-time code by the platform's own routes. Here the code
 * becomes a session, made by the authentication library as every other session
 * is, so the cookie and the record of the sign-in are the same as a password's.
 */
function singleSignOn(db: Db, config: Pick<Config, "publicUrl">) {
  const base = `${new URL(config.publicUrl).origin}/api/v1/auth`;
  return {
    id: "vx-single-sign-on",
    endpoints: {
      ssoFinish: createAuthEndpoint(
        "/sso/finish",
        { method: "GET", requireHeaders: true },
        async (ctx) => {
          const query = new URL(ctx.request?.url ?? base).searchParams;
          const cookies = ctx.headers?.get("cookie");
          const done = await finish(
            db,
            {
              code: query.get("code") ?? "",
              base,
              audience: "members",
              cookie: (name) => cookieFrom(cookies, name),
            },
            {
              principal: ANONYMOUS,
              userAgent: ctx.headers?.get("user-agent") ?? undefined,
            },
          );
          const user = done
            ? await ctx.context.internalAdapter.findUserById(done.principalId)
            : null;
          if (!done || !user) throw ctx.redirect("/?sso_error=expired");
          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) throw ctx.redirect("/?sso_error=expired");
          await setSessionCookie(ctx, { session, user });
          ctx.setCookie(stateCookie(done.stateId), "", { path: "/", maxAge: 0 });
          throw ctx.redirect(consolePath(done.returnTo));
        },
      ),
    },
  };
}

/**
 * The last few things the authentication library said, whatever the log level.
 * It refuses a sign-in with one answer for three different reasons, and says
 * which only here. Tests read it when a sign-in that should work does not.
 */
const recent: string[] = [];
export const recentAuthLog = (): readonly string[] => recent;

export function createAuth(
  db: Db,
  config: Config,
  log: FastifyBaseLogger,
  /** Only to describe the sign-in routes: the library is given a store in memory and no database. */
  describing = false,
) {
  const actorFor = (
    memberId: string,
    session?: { ipAddress?: string | null | undefined; userAgent?: string | null | undefined },
  ) => ({
    principal: { type: "member" as const, id: memberId },
    ipAddress: session?.ipAddress ?? undefined,
    userAgent: session?.userAgent ?? undefined,
  });

  return betterAuth({
    ...authOptions(db, config),
    ...(describing ? { database: memoryAdapter({}) } : {}),
    plugins: [openAPI({ disableDefaultReference: true }), singleSignOn(db, config)],
    hooks: {
      // A person ending their other sessions is on the record, as ending one is.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/revoke-other-sessions") return;
        const session = await getSessionFromCtx(ctx);
        if (!session) return;
        await writeAudit(db, actorFor(session.user.id, session.session), {
          action: "member.other_sessions_ended",
          targetType: "member",
          targetId: session.user.id,
        });
      }),
      // Where a provider is required, a password is no way in.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/update-user") {
          // A directory that pushes a person's name owns it: a change here would be undone.
          const sent = (ctx.body as { name?: unknown } | undefined)?.name;
          if (sent === undefined) return;
          const session = await getSessionFromCtx(ctx);
          const owner = session ? await nameOwnedBy(db, session.user.id) : undefined;
          if (owner) {
            throw new APIError("FORBIDDEN", {
              code: "NAME_FROM_DIRECTORY",
              message: `Your name comes from ${owner}. Change it there.`,
            });
          }
          return;
        }
        if (ctx.path !== "/sign-in/email") return;
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? "");
        const off = await db
          .selectFrom("member")
          .select("id")
          .where("email", "=", email.trim().toLowerCase())
          .where("disabled_at", "is not", null)
          .executeTakeFirst();
        if (off) {
          await writeAudit(
            db,
            { principal: ANONYMOUS, userAgent: ctx.headers?.get("user-agent") ?? undefined },
            { action: "member.sign_in_refused", targetType: "member", targetId: off.id },
          );
          // The same words as a wrong password: whether an account exists is not given away.
          throw new APIError("UNAUTHORIZED", {
            code: "INVALID_EMAIL_OR_PASSWORD",
            message: "Invalid email or password",
          });
        }
        const provider = await memberPasswordRefusedBy(db, email);
        if (!provider) return;
        // A recovery code lets an owner in with their password while the provider is broken.
        // It is spent here, as it is let through, so no code ever works twice; a wrong
        // password with it costs the code.
        const offered = ctx.headers?.get(RECOVERY_HEADER);
        const code = offered ? await findRecoveryCode(db, email, offered) : undefined;
        if (code && (await useRecoveryCode(db, code.id))) {
          await writeAudit(
            db,
            { principal: ANONYMOUS, userAgent: ctx.headers?.get("user-agent") ?? undefined },
            {
              action: "member.recovery_code_used",
              targetType: "member",
              targetId: code.memberId,
              tenantId: provider.tenantId,
              details: { identityProvider: provider.name },
            },
          );
          return;
        }
        await writeAudit(
          db,
          { principal: ANONYMOUS, userAgent: ctx.headers?.get("user-agent") ?? undefined },
          {
            action: "sso.password_refused",
            targetType: "identity_provider",
            targetId: provider.id,
            tenantId: provider.tenantId,
            details: { identityProvider: provider.name, email: email.trim().toLowerCase() },
          },
        );
        throw new APIError("FORBIDDEN", {
          code: "SSO_REQUIRED",
          message: `Sign in with ${provider.name}. Passwords are turned off for your organization.`,
        });
      }),
    },
    logger: {
      log: (level, message, ...args) => {
        recent.push(`${new Date().toISOString()} ${level} ${message}`);
        if (recent.length > 20) recent.shift();
        log[level]({ source: "auth", args }, message);
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await writeAudit(db, actorFor(session.userId, session), {
              action: "member.signed_in",
              targetType: "member",
              targetId: session.userId,
            });
          },
        },
        delete: {
          after: async (session) => {
            await writeAudit(db, actorFor(session.userId, session), {
              action: "member.signed_out",
              targetType: "member",
              targetId: session.userId,
            });
          },
        },
      },
      user: {
        update: {
          after: async (user) => {
            // The library changes a person's own name and nothing else of theirs.
            await writeAudit(db, actorFor(user.id), {
              action: "member.renamed",
              targetType: "member",
              targetId: user.id,
              details: { name: user.name },
            });
          },
        },
      },
      account: {
        update: {
          after: async (account) => {
            if (account.providerId !== "credential") return;
            await writeAudit(db, actorFor(account.userId), {
              action: "member.password_changed",
              targetType: "member",
              targetId: account.userId,
            });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
