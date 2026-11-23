/**
 * OAuth 2.0 connections. A member authorizes one in the console; the control
 * plane exchanges the code and refreshes the tokens, through the egress guard
 * (decision 0001, named exception: OAuth connection token endpoints). A worker
 * is handed the current access token and nothing else: the refresh token and
 * the client's secret never leave the control plane.
 */
import { createHash, randomBytes } from "node:crypto";
import type { ConnectionOAuth } from "@volvel/db";
import { newId, sql } from "@volvel/db";
import { validateJson } from "@volvel/manifest";
import type { OAuth2Config } from "@volvel/sdk";
import { type Actor, type Db, mutate, SYSTEM, type Trx } from "../audit.js";
import { forgetHealth, recordHealth } from "../data/health.js";
import { guardedFetch } from "../egress.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { type BindingName, decryptFor, encryptFor } from "./bindings.js";
import { BUILTIN_CONFIG_SCHEMAS } from "./connectors.js";
import { openRow, sealRow } from "./sealed.js";

/** How long a member has to agree at the provider and come back. */
export const STATE_MINUTES = 10;
/** An access token this close to running out is refreshed before it is handed out. */
export const REFRESH_AHEAD_MS = 2 * 60_000;
/** How long the provider has to answer. */
const TOKEN_TIMEOUT_MS = 10_000;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");

/** Where every provider sends a member back. One address for the whole instance. */
export const callbackAddress = (kernel: Kernel) =>
  `${kernel.hosts.mainOrigin}/api/v1/oauth/connections/callback`;

/** What is kept sealed: the tokens. */
interface Tokens {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch milliseconds. Null when the provider did not say. */
  expiresAt: number | null;
  scope: string | null;
}

/** The fields that say which authorization the tokens belong to. Changing one forgets them. */
const IDENTITY = ["authorizeUrl", "tokenUrl", "clientId", "scopes"] as const;

/** JSON with its keys in order: what Postgres gives back is not in the order it was given. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Whether two JSON values are the same, whatever the order of their keys. */
export const sameJson = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Whether a new configuration makes the tokens a connection holds belong to something else. */
export function authorizationChanged(before: unknown, after: unknown): boolean {
  const a = (before ?? {}) as Record<string, unknown>;
  const b = (after ?? {}) as Record<string, unknown>;
  return IDENTITY.some((field) => !sameJson(a[field], b[field]));
}

/**
 * Whether a binding's settings are an OAuth client's. Such settings fit no
 * other built-in connector, and the credential stored with them is the
 * client's secret, which is never handed to a worker, whatever the connection
 * is declared as so far.
 */
export function isOAuthSettings(config: unknown): boolean {
  const c = (config ?? {}) as Record<string, unknown>;
  return typeof c.tokenUrl === "string" && typeof c.authorizeUrl === "string";
}

/** A token endpoint's refusal, or that it could not be reached. */
export class TokenRefused extends Error {
  readonly status: number | null;
  readonly error: string | null;
  /** Worth trying again later: the provider failed, rather than said no. */
  readonly transient: boolean;
  constructor(message: string, status: number | null, error: string | null, transient: boolean) {
    super(message);
    this.name = "TokenRefused";
    this.status = status;
    this.error = error;
    this.transient = transient;
  }
}

const stateName = (stateId: string) => `connection-oauth-state:${stateId}`;

/** The binding, checked to be an OAuth one that can be authorized. */
async function oauthBinding(kernel: Kernel, db: Db | Trx, id: BindingName) {
  const row = await db
    .selectFrom("connection_binding")
    .select(["id", "config", "credential", "oauth_tokens", "oauth"])
    .where("tenant_id", "=", id.tenantId)
    .where("workspace_id", "=", id.workspaceId)
    .where("path", "=", id.path)
    .executeTakeFirst();
  if (!row) throw notFound(`A binding for ${id.path}`);
  const issues = validateJson(BUILTIN_CONFIG_SCHEMAS.oauth2 as object, row.config);
  if (issues.length > 0) {
    throw badRequest(`${id.path} is not set up as an OAuth connection.`, issues);
  }
  return {
    ...row,
    config: row.config as unknown as OAuth2Config,
    secret: row.credential
      ? await openRow(
          kernel,
          db,
          "connection",
          { tenantId: id.tenantId, workspaceId: id.workspaceId, rowId: row.id, path: id.path },
          row.credential,
          "client secret",
        )
      : undefined,
  };
}

/**
 * Begins an authorization: remembers a state and a PKCE verifier, and says
 * where to send the member's browser.
 */
export async function beginAuthorization(
  kernel: Kernel,
  trx: Trx,
  id: BindingName,
  input: { startedBy: string; returnTo?: string | undefined },
): Promise<{ url: string; stateId: string }> {
  const binding = await oauthBinding(kernel, trx, id);
  const stateId = newId();
  const state = random();
  const verifier = random();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await trx
    .insertInto("connection_oauth_state")
    .values({
      id: stateId,
      tenant_id: id.tenantId,
      workspace_id: id.workspaceId,
      path: id.path,
      state_hash: hash(state),
      secrets: await encryptFor(
        kernel,
        trx,
        id.tenantId,
        id.workspaceId,
        stateName(stateId),
        JSON.stringify({ verifier }),
      ),
      started_by: input.startedBy,
      return_to: input.returnTo ?? null,
      expires_at: new Date(Date.now() + STATE_MINUTES * 60_000),
    })
    .execute();
  const url = new URL(binding.config.authorizeUrl);
  for (const [name, value] of Object.entries(binding.config.authorizeParams ?? {})) {
    url.searchParams.set(name, value);
  }
  // What the flow depends on is set last, so an extra parameter cannot change it.
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", binding.config.clientId);
  url.searchParams.set("redirect_uri", callbackAddress(kernel));
  if (binding.config.scopes?.length) url.searchParams.set("scope", binding.config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), stateId };
}

/** Why an authorization did not finish, said to the member who began it. */
export class AuthorizationRefused extends Error {
  /** Where the member is sent, when it is known. */
  readonly returnTo: string | null;
  readonly connection: BindingName | null;
  constructor(message: string, returnTo: string | null, connection: BindingName | null) {
    super(message);
    this.name = "AuthorizationRefused";
    this.returnTo = returnTo;
    this.connection = connection;
  }
}

export interface Authorized {
  connection: BindingName;
  scopes: string[];
  returnTo: string | null;
}

/**
 * Takes the provider's answer: the state is claimed once, by the member who
 * began it, and the code is exchanged for tokens, which are sealed.
 */
export async function finishAuthorization(
  kernel: Kernel,
  query: URLSearchParams,
  /** Whoever's browser came back. */
  actor: Actor,
): Promise<Authorized> {
  const who = actor.principal;
  const memberId = who.type === "member" && who.id && who.appTenantId === undefined ? who.id : null;
  const state = query.get("state") ?? "";
  const pending = await kernel.db
    .selectFrom("connection_oauth_state")
    .selectAll()
    .where("state_hash", "=", hash(state))
    .executeTakeFirst();
  const gone = () =>
    new AuthorizationRefused(
      "This authorization ran out or was already used. Press Connect again.",
      pending?.return_to ?? null,
      null,
    );
  if (!pending) throw gone();
  const connection = {
    tenantId: pending.tenant_id,
    workspaceId: pending.workspace_id,
    path: pending.path,
  };
  if (memberId !== pending.started_by) {
    // Sent here by someone else, or signed out on the way: the tokens would go to a
    // connection this browser's member did not ask to authorize.
    throw new AuthorizationRefused(
      "This authorization was begun by someone else, or you were signed out on the way. Press Connect again.",
      null,
      null,
    );
  }
  // Taken once: a second answer with the same state finds nothing.
  const claimed = await kernel.db
    .updateTable("connection_oauth_state")
    .set({ answered_at: new Date() })
    .where("id", "=", pending.id)
    .where("answered_at", "is", null)
    .where("expires_at", ">", new Date())
    .returning("id")
    .executeTakeFirst();
  if (!claimed) throw gone();
  const refused = (message: string) =>
    new AuthorizationRefused(message, pending.return_to, connection);
  const error = query.get("error");
  if (error) {
    const said = query.get("error_description");
    throw refused(`The provider said no: ${error}${said ? ` (${said.slice(0, 300)})` : ""}.`);
  }
  const code = query.get("code");
  if (!code) throw refused("The provider sent no code.");
  const { verifier } = JSON.parse(
    await decryptFor(
      kernel,
      kernel.db,
      connection.tenantId,
      connection.workspaceId,
      stateName(pending.id),
      pending.secrets,
    ),
  ) as { verifier: string };
  const binding = await oauthBinding(kernel, kernel.db, connection);
  let tokens: Tokens;
  try {
    tokens = await tokenRequest(binding.config, binding.secret, {
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackAddress(kernel),
      code_verifier: verifier,
    });
  } catch (failure) {
    if (failure instanceof TokenRefused) throw refused(failure.message);
    throw failure;
  }
  if (!tokens.refreshToken) {
    kernel.log.info(
      { connection: connection.path },
      "an OAuth provider gave no refresh token: the connection works until its access token runs out",
    );
  }
  const scopes = tokens.scope
    ? tokens.scope.split(" ").filter(Boolean)
    : (binding.config.scopes ?? []);
  await mutate(kernel.db, actor, async (trx, audit) => {
    await storeTokens(kernel, trx, connection, binding.id, tokens, {
      status: "connected",
      expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
      scopes,
      connectedBy: pending.started_by,
      connectedAt: new Date().toISOString(),
    });
    await forgetHealth(trx, connection.workspaceId, connection.path);
    await audit({
      action: "connection.oauth_connected",
      targetType: "connection",
      targetId: connection.path,
      tenantId: connection.tenantId,
      workspaceId: connection.workspaceId,
      details: { scopes, refreshable: tokens.refreshToken !== null },
    });
  });
  return { connection, scopes, returnTo: pending.return_to };
}

async function storeTokens(
  kernel: Kernel,
  trx: Trx,
  id: BindingName,
  bindingId: string,
  tokens: Tokens,
  oauth: ConnectionOAuth,
) {
  await trx
    .updateTable("connection_binding")
    .set({
      oauth_tokens: await sealRow(
        kernel,
        trx,
        "connection-oauth",
        { tenantId: id.tenantId, workspaceId: id.workspaceId, rowId: bindingId, path: id.path },
        JSON.stringify(tokens),
      ),
      oauth: JSON.stringify(oauth),
    })
    .where("id", "=", bindingId)
    .execute();
}

/** Asks the token endpoint, as the client. Throws `TokenRefused` with what it said. */
async function tokenRequest(
  config: OAuth2Config,
  secret: string | undefined,
  params: Record<string, string>,
): Promise<Tokens> {
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  if (config.clientAuth === "basic" && secret !== undefined) {
    const encode = (value: string) => encodeURIComponent(value);
    headers.authorization = `Basic ${Buffer.from(`${encode(config.clientId)}:${encode(secret)}`).toString("base64")}`;
  } else {
    body.set("client_id", config.clientId);
    if (secret !== undefined) body.set("client_secret", secret);
  }
  let response: Awaited<ReturnType<typeof guardedFetch>>;
  try {
    response = await guardedFetch(config.tokenUrl, {
      method: "POST",
      headers,
      body: body.toString(),
      timeoutMs: TOKEN_TIMEOUT_MS,
    });
  } catch (error) {
    throw new TokenRefused(
      `The token address could not be reached: ${(error as Error).message}`,
      null,
      null,
      true,
    );
  }
  const text = await response.text();
  let said: Record<string, unknown> = {};
  try {
    said = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Some providers answer with a form unless told otherwise; read that too.
    said = Object.fromEntries(new URLSearchParams(text));
  }
  if (!response.ok || typeof said.access_token !== "string") {
    const error = typeof said.error === "string" ? said.error : null;
    const description =
      typeof said.error_description === "string" ? said.error_description.slice(0, 300) : null;
    const transient = response.status >= 500 || response.status === 429;
    throw new TokenRefused(
      `The token address answered ${response.status}${error ? `: ${error}` : ""}${description ? ` (${description})` : ""}.`,
      response.status,
      error,
      transient,
    );
  }
  const expiresIn = Number(said.expires_in);
  return {
    accessToken: said.access_token,
    refreshToken: typeof said.refresh_token === "string" ? said.refresh_token : null,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
    scope: typeof said.scope === "string" ? said.scope : null,
  };
}

/**
 * Why a worker was not handed a token. Not a 409, which tells a worker its
 * attempt is over: this is a failure of the attempt, said in its words.
 */
const unusable = (detail: string) => new HttpError(422, "connection_unusable", detail);

/**
 * The current access token of an OAuth connection, refreshed first when it
 * runs out within two minutes. One refresh at a time per connection: a second
 * caller waits for the first and finds the token fresh. A provider that
 * refuses the refresh marks the connection as needing a member to connect it
 * again; one that fails leaves it, and the token is handed out while it lasts.
 */
export async function accessToken(
  kernel: Kernel,
  id: BindingName,
): Promise<{ accessToken: string; expiresAt: string | null }> {
  const outcome = await kernel.db.transaction().execute(async (trx) => {
    const found = await trx
      .selectFrom("connection_binding")
      .select("id")
      .where("tenant_id", "=", id.tenantId)
      .where("workspace_id", "=", id.workspaceId)
      .where("path", "=", id.path)
      .executeTakeFirst();
    if (!found) throw notFound(`The connection ${id.path}`);
    await sql`select pg_advisory_xact_lock(hashtext(${`oauth:${found.id}`}))`.execute(trx);
    // Read after the lock: whoever held it may have just refreshed.
    const binding = await oauthBinding(kernel, trx, id);
    if (!binding.oauth_tokens || !binding.oauth) {
      throw unusable(
        `The connection ${id.path} has not been authorized. Connect it in the console.`,
      );
    }
    if (binding.oauth.status === "needs_reconnect") {
      throw unusable(
        `The connection ${id.path} needs connecting again in the console: ${binding.oauth.problem ?? "the provider refused it"}`,
      );
    }
    const tokens = JSON.parse(
      await openRow(
        kernel,
        trx,
        "connection-oauth",
        { tenantId: id.tenantId, workspaceId: id.workspaceId, rowId: binding.id, path: id.path },
        binding.oauth_tokens,
        "connection",
      ),
    ) as Tokens;
    const now = Date.now();
    const fresh = tokens.expiresAt === null || tokens.expiresAt - now > REFRESH_AHEAD_MS;
    const handed = (held: Tokens) => ({
      accessToken: held.accessToken,
      expiresAt: held.expiresAt ? new Date(held.expiresAt).toISOString() : null,
    });
    if (fresh) return { ok: handed(tokens) };
    if (!tokens.refreshToken) {
      if ((tokens.expiresAt ?? 0) > now) return { ok: handed(tokens) };
      return {
        refused: {
          bindingId: binding.id,
          oauth: binding.oauth,
          problem: "Its access token ran out, and the provider gave no refresh token.",
        },
      };
    }
    let next: Tokens;
    try {
      next = await tokenRequest(binding.config, binding.secret, {
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      });
    } catch (failure) {
      if (!(failure instanceof TokenRefused)) throw failure;
      if (failure.transient) {
        if ((tokens.expiresAt ?? 0) > now) return { ok: handed(tokens) };
        throw unusable(`The connection ${id.path} could not be refreshed: ${failure.message}`);
      }
      return {
        refused: {
          bindingId: binding.id,
          oauth: binding.oauth,
          problem: `The provider refused the refresh: ${failure.message}`,
        },
      };
    }
    // A provider that rotates refresh tokens sends a new one; one that does not, does not.
    const kept: Tokens = {
      ...next,
      refreshToken: next.refreshToken ?? tokens.refreshToken,
      scope: next.scope ?? tokens.scope,
    };
    await storeTokens(kernel, trx, id, binding.id, kept, {
      ...binding.oauth,
      expiresAt: kept.expiresAt ? new Date(kept.expiresAt).toISOString() : null,
    });
    return { ok: handed(kept) };
  });
  if ("ok" in outcome) return outcome.ok;
  // Written after the lock is let go, and kept: the refusal is the news.
  const { bindingId, oauth, problem } = outcome.refused;
  await mutate(kernel.db, { principal: SYSTEM }, async (trx, audit) => {
    await trx
      .updateTable("connection_binding")
      .set({ oauth: JSON.stringify({ ...oauth, status: "needs_reconnect", problem }) })
      .where("id", "=", bindingId)
      .execute();
    await audit({
      action: "connection.oauth_refresh_failed",
      targetType: "connection",
      targetId: id.path,
      tenantId: id.tenantId,
      workspaceId: id.workspaceId,
      details: { problem },
    });
  });
  await recordHealth(kernel.db, {
    tenantId: id.tenantId,
    workspaceId: id.workspaceId,
    kind: "connection",
    path: id.path,
    problem,
    latencyMs: null,
  });
  throw unusable(`The connection ${id.path} needs connecting again in the console: ${problem}`);
}

/** Forgets authorizations that were never finished. */
export async function removeExpiredAuthorizations(db: Db): Promise<void> {
  await db
    .deleteFrom("connection_oauth_state")
    .where("expires_at", "<=", new Date(Date.now() - 3_600_000))
    .execute();
}
