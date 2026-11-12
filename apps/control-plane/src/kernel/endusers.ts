import { createHash, randomBytes } from "node:crypto";
import { newId } from "@vynxlabs/db";
import { MIN_PASSWORD_LENGTH } from "../config.js";
import type { Audit, Db, Trx } from "./audit.js";
import { badRequest, conflict, HttpError, notFound } from "./errors.js";
import type { Kernel } from "./kernel.js";

/** How long an invitation stays good, and how long a reset does. */
export const INVITE_DAYS = 7;
export const RESET_HOURS = 2;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export function cleanEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 320 || !EMAIL.test(email)) {
    throw badRequest("That is not an email address.", [
      { path: "/email", message: "must be an email address" },
    ]);
  }
  return email;
}

export function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    throw badRequest(`A password must be at least ${MIN_PASSWORD_LENGTH} characters.`, [
      { path: "/password", message: `must be ${MIN_PASSWORD_LENGTH} to 200 characters` },
    ]);
  }
}

const passwords = async (kernel: Kernel) => (await kernel.auth.$context).password;

/**
 * Adds a person to a tenant's end-user pool. Without a password the account
 * cannot be signed in to until an invitation link is used.
 */
export async function createEndUser(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  input: { tenantId: string; email: string; name?: string; password?: string },
  how: "created" | "signed_up" = "created",
) {
  const email = cleanEmail(input.email);
  if (input.password !== undefined) checkPassword(input.password);
  const taken = await trx
    .selectFrom("end_user")
    .select("id")
    .where("tenant_id", "=", input.tenantId)
    .where("email", "=", email)
    .executeTakeFirst();
  if (taken) throw conflict("An end user with that email already exists in this tenant.");
  const row = await trx
    .insertInto("end_user")
    .values({
      id: newId(),
      tenant_id: input.tenantId,
      email,
      name: input.name?.trim() ?? "",
      password_hash:
        input.password === undefined ? null : await (await passwords(kernel)).hash(input.password),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await audit({
    action: `end_user.${how}`,
    targetType: "end_user",
    targetId: row.id,
    tenantId: input.tenantId,
    details: { email },
  });
  return row;
}

/**
 * Makes a one-time link token for setting a password. Earlier unused tokens of
 * the same purpose stop working, so only the newest link is good.
 */
export async function createPasswordToken(
  trx: Trx,
  user: { id: string; tenantId: string },
  purpose: "invite" | "reset",
): Promise<{ token: string; expiresAt: Date }> {
  await trx
    .deleteFrom("end_user_token")
    .where("end_user_id", "=", user.id)
    .where("purpose", "=", purpose)
    .where("used_at", "is", null)
    .execute();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + (purpose === "invite" ? INVITE_DAYS * 86_400_000 : RESET_HOURS * 3_600_000),
  );
  await trx
    .insertInto("end_user_token")
    .values({
      id: newId(),
      tenant_id: user.tenantId,
      end_user_id: user.id,
      purpose,
      token_hash: hash(token),
      expires_at: expiresAt,
    })
    .execute();
  return { token, expiresAt };
}

/** Who a link token is for, while it is still good. For showing the form. */
export async function readPasswordToken(db: Db | Trx, tenantId: string, token: string) {
  return db
    .selectFrom("end_user_token")
    .innerJoin("end_user", "end_user.id", "end_user_token.end_user_id")
    .select(["end_user.id", "end_user.email", "end_user.name", "end_user_token.purpose"])
    .where("end_user_token.token_hash", "=", hash(token))
    .where("end_user_token.tenant_id", "=", tenantId)
    .where("end_user_token.used_at", "is", null)
    .where("end_user_token.expires_at", ">", new Date())
    .where("end_user.disabled_at", "is", null)
    .executeTakeFirst();
}

/**
 * Sets a password from a link, once. Every sign-in the person had is ended: a
 * reset is what someone does when they think another person knows the old one.
 */
export async function setPasswordWithToken(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  input: { tenantId: string; token: string; password: string; name?: string },
) {
  checkPassword(input.password);
  const taken = await trx
    .updateTable("end_user_token")
    .set({ used_at: new Date() })
    .where("token_hash", "=", hash(input.token))
    .where("tenant_id", "=", input.tenantId)
    .where("used_at", "is", null)
    .where("expires_at", ">", new Date())
    .returning(["end_user_id", "purpose"])
    .executeTakeFirst();
  if (!taken) {
    throw new HttpError(
      410,
      "link_expired",
      "This link has been used or has run out. Ask for a new one.",
    );
  }
  const user = await trx
    .updateTable("end_user")
    .set({
      password_hash: await (await passwords(kernel)).hash(input.password),
      updated_at: new Date(),
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    })
    .where("id", "=", taken.end_user_id)
    .where("disabled_at", "is", null)
    .returningAll()
    .executeTakeFirst();
  if (!user) throw notFound("The account");
  await trx
    .deleteFrom("app_session")
    .where("principal_type", "=", "end_user")
    .where("principal_id", "=", user.id)
    .execute();
  await audit({
    action: taken.purpose === "invite" ? "end_user.invitation_accepted" : "end_user.password_reset",
    targetType: "end_user",
    targetId: user.id,
    tenantId: input.tenantId,
  });
  return user;
}

// A hash of nothing anyone uses, so that a wrong email takes as long as a wrong password.
let decoy: Promise<string> | undefined;

/** The end user with that email and password, or null. Says nothing about which was wrong. */
export async function checkEndUserPassword(
  kernel: Kernel,
  tenantId: string,
  rawEmail: string,
  password: string,
) {
  const hasher = await passwords(kernel);
  const email = rawEmail.trim().toLowerCase();
  const user = await kernel.db
    .selectFrom("end_user")
    .selectAll()
    .where("tenant_id", "=", tenantId)
    .where("email", "=", email)
    .executeTakeFirst();
  decoy ??= hasher.hash(randomBytes(24).toString("hex"));
  const stored = user?.password_hash ?? (await decoy);
  const matches = await hasher.verify({ hash: stored, password }).catch(() => false);
  if (!user?.password_hash || user.disabled_at || !matches) return null;
  return user;
}

export async function changeEndUserPassword(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  input: {
    tenantId: string;
    id: string;
    current: string;
    password: string;
    keepSessionId?: string;
  },
) {
  checkPassword(input.password);
  const hasher = await passwords(kernel);
  const user = await trx
    .selectFrom("end_user")
    .select(["id", "password_hash"])
    .where("id", "=", input.id)
    .where("tenant_id", "=", input.tenantId)
    .forUpdate()
    .executeTakeFirst();
  if (!user) throw notFound("The account");
  const matches =
    user.password_hash !== null &&
    (await hasher.verify({ hash: user.password_hash, password: input.current }).catch(() => false));
  if (!matches) throw badRequest("The current password is not right.");
  await trx
    .updateTable("end_user")
    .set({ password_hash: await hasher.hash(input.password), updated_at: new Date() })
    .where("id", "=", user.id)
    .execute();
  // Every other sign-in ends. The one that made the change stays.
  let others = trx
    .deleteFrom("app_session")
    .where("principal_type", "=", "end_user")
    .where("principal_id", "=", user.id);
  if (input.keepSessionId) others = others.where("id", "!=", input.keepSessionId);
  await others.execute();
  await audit({
    action: "end_user.password_changed",
    targetType: "end_user",
    targetId: user.id,
    tenantId: input.tenantId,
  });
}

/** Whether people may make their own account in this tenant. */
export async function signUpAllowed(db: Db | Trx, tenantId: string): Promise<boolean> {
  const portal = await db
    .selectFrom("tenant_portal")
    .select("sign_up")
    .where("tenant_id", "=", tenantId)
    .executeTakeFirst();
  return portal?.sign_up ?? false;
}
