import { createHash, randomBytes } from "node:crypto";
import type { CacheProvider } from "@node-saml/node-saml";
import { newId } from "@vynxlabs/db";
import { type Actor, ANONYMOUS, type Db, mutate, writeAudit } from "../audit.js";
import type { Kernel } from "../kernel.js";
import { summarize } from "./claims.js";
import { type OidcPending, oidcFinish, oidcStart } from "./oidc.js";
import { type Asserted, resolvePerson, SsoRefusal } from "./people.js";
import {
  addressesOf,
  isLive,
  isOidc,
  isSaml,
  openSecrets,
  type Provider,
  slugOf,
} from "./providers.js";
import { REQUEST_MINUTES, samlFinish, samlStart } from "./saml.js";

/** How long someone has to sign in at the provider and come back. */
const STATE_MINUTES = REQUEST_MINUTES;
/** How long the last step, back at the address the sign-in began at, may take. */
const FINISH_SECONDS = 120;

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");

/** The cookie that ties one sign-in to the browser that began it. */
export const stateCookie = (stateId: string) => `vx_sso_${stateId.replaceAll("-", "")}`;
export const STATE_COOKIE_SECONDS = STATE_MINUTES * 60;

export interface Began {
  /** Where to send the browser. */
  url: string;
  cookie: { name: string; value: string };
}

/**
 * Begins a sign-in: makes the request to the provider and remembers it. `base`
 * is the address the sign-in ends at, which is where it began.
 */
export async function begin(
  kernel: Kernel,
  provider: Provider,
  input: { purpose: "sign_in" | "test"; base: string; returnTo?: string; startedBy?: string },
): Promise<Began> {
  if (input.purpose === "sign_in" && !isLive(provider)) {
    throw new SsoRefusal("provider_off", "This way of signing in is turned off.");
  }
  const id = newId();
  const state = random();
  const browser = random();
  const secrets = await openSecrets(kernel, kernel.db, provider);
  const addresses = addressesOf(kernel, provider, await slugOf(kernel.db, provider.tenantId));
  let url: string;
  let sealed: Buffer | null = null;
  let requestId: string | null = null;
  if (isOidc(provider)) {
    const started = await oidcStart(provider, secrets, addresses.callback, state);
    url = started.url;
    sealed = kernel.vault.sealForInstance(`sso-state:${id}`, JSON.stringify(started.pending));
  } else if (isSaml(provider)) {
    const started = await samlStart(provider, secrets, addresses, state);
    url = started.url;
    requestId = started.requestId;
  } else throw new Error("Unknown protocol.");
  await kernel.db
    .insertInto("sso_state")
    .values({
      id,
      provider_id: provider.id,
      tenant_id: provider.tenantId,
      purpose: input.purpose,
      state_hash: hash(state),
      browser_hash: hash(browser),
      secrets: sealed,
      request_id: requestId,
      origin: input.base,
      return_to: input.returnTo ?? null,
      started_by: input.startedBy ?? null,
      expires_at: new Date(Date.now() + STATE_MINUTES * 60_000),
    })
    .execute();
  return { url, cookie: { name: stateCookie(id), value: browser } };
}

/** What node-saml keeps between a request and its answer, held in the database so any replica can answer. */
function samlCache(db: Db, provider: Provider): CacheProvider {
  const consume = async (key: string | null) => {
    if (!key) return null;
    const taken = await db
      .updateTable("sso_state")
      .set({ answered_at: new Date() })
      .where("provider_id", "=", provider.id)
      .where("request_id", "=", key)
      .where("answered_at", "is", null)
      .where("expires_at", ">", new Date())
      .returning("created_at")
      .executeTakeFirst();
    return taken ? taken.created_at.toISOString() : null;
  };
  return {
    // The request is saved with the rest of the sign-in, in `begin`.
    saveAsync: async () => null,
    getAsync: async (key) => {
      const row = await db
        .selectFrom("sso_state")
        .select("created_at")
        .where("provider_id", "=", provider.id)
        .where("request_id", "=", key)
        .where("answered_at", "is", null)
        .where("expires_at", ">", new Date())
        .executeTakeFirst();
      return row ? row.created_at.toISOString() : null;
    },
    removeAsync: consume,
    consumeAsync: consume,
    saveIfAbsentAsync: async (key, _value, expiresAtMs) => {
      const saved = await db
        .insertInto("sso_assertion")
        .values({
          provider_id: provider.id,
          tenant_id: provider.tenantId,
          assertion_key: hash(key),
          expires_at: new Date(expiresAtMs),
        })
        .onConflict((conflict) => conflict.doNothing())
        .returning("provider_id")
        .executeTakeFirst();
      return saved !== undefined;
    },
  };
}

export type Answer =
  | { protocol: "oidc"; query: URLSearchParams }
  | { protocol: "saml"; body: Record<string, string> };

export type Answered =
  | { purpose: "test"; ok: boolean }
  /** Where to send the browser for the last step. */
  | { purpose: "sign_in"; finishUrl: string };

interface StateRow {
  id: string;
  purpose: "sign_in" | "test";
  origin: string;
  secrets: Buffer | null;
  started_by: string | null;
}

/**
 * Takes a provider's answer, checks it, and works out who it stands for. Every
 * refusal is written to the audit log with its reason before it is thrown.
 */
export async function answer(
  kernel: Kernel,
  provider: Provider,
  given: Answer,
  actor: Actor,
  /** For a sign-in the provider began: where it ends. */
  unaskedBase: string,
): Promise<Answered> {
  let row: StateRow | undefined;
  try {
    const secrets = await openSecrets(kernel, kernel.db, provider);
    const addresses = addressesOf(kernel, provider, await slugOf(kernel.db, provider.tenantId));
    let result: { asserted: Asserted; received: Record<string, unknown> };

    if (given.protocol === "oidc" && isOidc(provider)) {
      const state = given.query.get("state") ?? "";
      // Taken once: a second answer with the same state finds nothing.
      row = await kernel.db
        .updateTable("sso_state")
        .set({ answered_at: new Date() })
        .where("state_hash", "=", hash(state))
        .where("provider_id", "=", provider.id)
        .where("answered_at", "is", null)
        .where("expires_at", ">", new Date())
        .returning(["id", "purpose", "origin", "secrets", "started_by"])
        .executeTakeFirst();
      if (!row?.secrets) throw expired();
      const pending = JSON.parse(
        kernel.vault.openForInstance(`sso-state:${row.id}`, row.secrets),
      ) as OidcPending;
      result = await oidcFinish(provider, secrets, addresses.callback, given.query, state, pending);
    } else if (given.protocol === "saml" && isSaml(provider)) {
      const posted = given.body.SAMLResponse;
      if (!posted) {
        throw new SsoRefusal("invalid_answer", "The identity provider sent no answer.");
      }
      const relay = given.body.RelayState;
      const byRelay = relay
        ? await kernel.db
            .selectFrom("sso_state")
            .select(["id", "purpose", "origin", "secrets", "started_by", "request_id"])
            .where("state_hash", "=", hash(relay))
            .where("provider_id", "=", provider.id)
            .executeTakeFirst()
        : undefined;
      // Known before the answer is checked only so that a failed try-out can be shown to
      // whoever is trying. Nothing is believed on the strength of it.
      if (byRelay?.purpose === "test") row = byRelay;
      const checked = await samlFinish(
        provider,
        secrets,
        addresses,
        samlCache(kernel.db, provider),
        {
          SAMLResponse: posted,
        },
      );
      if (checked.inResponseTo) {
        // The request the signed answer names must be the one this browser's sign-in made.
        if (!byRelay || byRelay.request_id !== checked.inResponseTo) {
          throw new SsoRefusal(
            "invalid_answer",
            "The identity provider's answer could not be accepted.",
            "The answer names a request that is not the one its relay state belongs to.",
          );
        }
        row = byRelay;
      } else {
        // Only reached when the provider is allowed to begin: otherwise the library refused.
        row = await kernel.db
          .insertInto("sso_state")
          .values({
            id: newId(),
            provider_id: provider.id,
            tenant_id: provider.tenantId,
            purpose: "sign_in",
            state_hash: hash(random()),
            browser_hash: "",
            origin: unaskedBase,
            answered_at: new Date(),
            expires_at: new Date(Date.now() + STATE_MINUTES * 60_000),
          })
          .returning(["id", "purpose", "origin", "secrets", "started_by"])
          .executeTakeFirstOrThrow();
      }
      result = checked;
    } else {
      throw new SsoRefusal("invalid_answer", "This is not how this provider answers.");
    }

    if (row.purpose === "test") {
      await recordTest(kernel, provider, row, actor, result);
      return { purpose: "test", ok: true };
    }
    if (!isLive(provider)) {
      throw new SsoRefusal("provider_off", "This way of signing in is turned off.");
    }
    const code = random();
    const state = row;
    await mutate(kernel.db, actor, async (trx, audit) => {
      const person = await resolvePerson(kernel, trx, audit, provider, result.asserted);
      await trx
        .updateTable("sso_state")
        .set({ finish_hash: hash(code), principal_id: person.principalId, answered_at: new Date() })
        .where("id", "=", state.id)
        .execute();
      await audit({
        action: "sso.signed_in",
        targetType: person.principalType,
        targetId: person.principalId,
        tenantId: provider.tenantId,
        details: {
          identityProvider: provider.name,
          identityProviderId: provider.id,
          created: person.created,
          linked: person.linked,
        },
      });
    });
    return { purpose: "sign_in", finishUrl: finishUrl(provider, row.origin, code) };
  } catch (error) {
    if (!(error instanceof SsoRefusal)) throw error;
    if (row?.purpose === "test") {
      await recordTest(kernel, provider, row, actor, undefined, error);
      return { purpose: "test", ok: false };
    }
    await refused(kernel.db, provider, actor, error);
    throw error;
  }
}

const expired = () =>
  new SsoRefusal(
    "expired",
    "This sign-in took too long, or was already used. Start again.",
    "No sign-in in progress matched the answer.",
  );

/** Writes a refusal to the audit log. The reason and the detail are for administrators. */
export async function refused(db: Db, provider: Provider, actor: Actor, refusal: SsoRefusal) {
  await writeAudit(db, actor, {
    action: "sso.refused",
    targetType: "identity_provider",
    targetId: provider.id,
    tenantId: provider.tenantId,
    details: {
      identityProvider: provider.name,
      reason: refusal.reason,
      message: refusal.message,
      ...(refusal.detail ? { detail: refusal.detail.slice(0, 1000) } : {}),
    },
  });
}

function finishUrl(provider: Provider, base: string, code: string): string {
  return provider.audience === "members"
    ? `${base}/sso/finish?code=${code}`
    : `${base}/sso/${provider.id}/finish?code=${code}`;
}

class Undo extends Error {
  readonly would: string;
  constructor(would: string) {
    super("undone");
    this.would = would;
  }
}

/**
 * Keeps what a try-out showed: what the provider sent, who that would be here,
 * and what would happen. Nothing else is changed: the sign-in is worked out
 * and then undone.
 */
async function recordTest(
  kernel: Kernel,
  provider: Provider,
  row: StateRow,
  actor: Actor,
  result: { asserted: Asserted; received: Record<string, unknown> } | undefined,
  failure?: SsoRefusal,
) {
  let would: string | undefined;
  let problem = failure;
  if (result) {
    try {
      await kernel.db.transaction().execute(async (trx) => {
        const person = await resolvePerson(kernel, trx, async () => {}, provider, result.asserted);
        const changes = [
          ...person.groupsAdded.map((group) => `join ${group}`),
          ...person.groupsRemoved.map((group) => `leave ${group}`),
        ];
        throw new Undo(
          `${
            person.created
              ? "A new account would be created"
              : person.linked
                ? "An existing account would be tied to this sign-in"
                : "The person would be signed in to their account"
          }${changes.length > 0 ? `, and would ${changes.join(", ")}` : ""}.`,
        );
      });
    } catch (error) {
      if (error instanceof Undo) would = error.would;
      else if (error instanceof SsoRefusal) problem = error;
      else throw error;
    }
  }
  const test = {
    at: new Date().toISOString(),
    ok: problem === undefined,
    ...(would ? { would } : {}),
    ...(problem
      ? { reason: problem.reason, message: problem.message, detail: problem.detail ?? null }
      : {}),
    ...(result
      ? {
          subject: result.asserted.subject,
          email: result.asserted.email ?? null,
          emailVerified: result.asserted.emailVerified ?? null,
          name: result.asserted.name ?? null,
          groups: result.asserted.groups.slice(0, 200),
          attributes: result.asserted.attributes,
          received: summarize(result.received),
        }
      : {}),
  };
  const who: Actor = row.started_by
    ? { ...actor, principal: { type: "member", id: row.started_by } }
    : actor;
  await mutate(kernel.db, who, async (trx, audit) => {
    await trx
      .updateTable("identity_provider")
      .set({ last_test: JSON.stringify(test) })
      .where("id", "=", provider.id)
      .execute();
    await audit({
      action: "identity_provider.tested",
      targetType: "identity_provider",
      targetId: provider.id,
      tenantId: provider.tenantId,
      details: {
        name: provider.name,
        ok: test.ok,
        ...(problem ? { reason: problem.reason } : {}),
      },
    });
  });
}

export interface Finished {
  stateId: string;
  providerId: string;
  tenantId: string | null;
  principalId: string;
  returnTo: string | null;
}

/**
 * The last step, at the address the sign-in began at: exchanges the one-time
 * code for who signed in. The browser must be the one that began, which its
 * cookie shows. Returns null when the code is unknown, late, used, for
 * another address, or in another browser.
 */
export async function finish(
  db: Db,
  input: {
    code: string;
    base: string;
    audience: "members" | "end_users";
    cookie: (name: string) => string | undefined;
  },
  actor: Actor = { principal: ANONYMOUS },
): Promise<Finished | null> {
  if (input.code.length < 20 || input.code.length > 200) return null;
  const row = await db
    .selectFrom("sso_state")
    .innerJoin("identity_provider", "identity_provider.id", "sso_state.provider_id")
    .select([
      "sso_state.id",
      "sso_state.provider_id",
      "sso_state.tenant_id",
      "sso_state.principal_id",
      "sso_state.browser_hash",
      "sso_state.return_to",
      "identity_provider.name",
    ])
    .where("sso_state.finish_hash", "=", hash(input.code))
    .where("sso_state.origin", "=", input.base)
    .where("sso_state.purpose", "=", "sign_in")
    .where("sso_state.finished_at", "is", null)
    .where("sso_state.answered_at", ">", new Date(Date.now() - FINISH_SECONDS * 1000))
    .where("identity_provider.audience", "=", input.audience)
    .executeTakeFirst();
  if (!row?.principal_id) return null;
  if (
    row.browser_hash !== "" &&
    hash(input.cookie(stateCookie(row.id)) ?? "") !== row.browser_hash
  ) {
    await writeAudit(db, actor, {
      action: "sso.refused",
      targetType: "identity_provider",
      targetId: row.provider_id,
      tenantId: row.tenant_id,
      details: {
        identityProvider: row.name,
        reason: "wrong_browser",
        message: "The sign-in was finished in a browser that did not begin it.",
      },
    });
    return null;
  }
  const taken = await db
    .updateTable("sso_state")
    .set({ finished_at: new Date() })
    .where("id", "=", row.id)
    .where("finished_at", "is", null)
    .returning("id")
    .executeTakeFirst();
  if (!taken) return null;
  return {
    stateId: row.id,
    providerId: row.provider_id,
    tenantId: row.tenant_id,
    principalId: row.principal_id,
    returnTo: row.return_to,
  };
}

/** Removes sign-ins that never came back, and assertions that have run out by themselves. */
export async function removeExpiredSso(db: Db): Promise<void> {
  // A finished sign-in is kept a little longer than it could be used, for nothing but tidiness.
  const before = new Date(Date.now() - 3_600_000);
  await db.deleteFrom("sso_state").where("expires_at", "<=", before).execute();
  await db.deleteFrom("sso_assertion").where("expires_at", "<=", new Date()).execute();
}
