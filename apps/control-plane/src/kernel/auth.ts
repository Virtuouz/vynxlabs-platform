import { newId } from "@vynxlabs/db";
import { betterAuth } from "better-auth";
import { openAPI } from "better-auth/plugins/open-api";
import type { FastifyBaseLogger } from "fastify";
import { type Config, MIN_PASSWORD_LENGTH } from "../config.js";
import { type Db, writeAudit } from "./audit.js";

const timestamps = { createdAt: "created_at", updatedAt: "updated_at" };

/** The authentication options, shared by the running service and the schema test. */
export function authOptions(db: Db, config: Pick<Config, "publicUrl" | "authSecret">) {
  return {
    appName: "Vynxlabs platform",
    baseURL: config.publicUrl,
    basePath: "/api/v1/auth",
    secret: config.authSecret,
    database: { db, type: "postgres" as const },
    // Never report usage anywhere.
    telemetry: { enabled: false },
    trustedOrigins: [config.publicUrl],
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
      modelName: "member_session",
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
      useSecureCookies: config.publicUrl.startsWith("https://"),
      database: { generateId: () => newId() },
    },
  };
}

export function createAuth(db: Db, config: Config, log: FastifyBaseLogger) {
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
    plugins: [openAPI({ disableDefaultReference: true })],
    logger: {
      log: (level, message, ...args) => {
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
