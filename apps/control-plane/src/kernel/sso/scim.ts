import { randomBytes } from "node:crypto";
import { newId, sql } from "@vynxlabs/db";
import type { FastifyRequest } from "fastify";
import type { Audit, Db, Trx } from "../audit.js";
import { cleanEmail, createEndUser } from "../endusers.js";
import { HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { hashApiKey } from "../principal.js";
import { giveRole, syncGroups } from "./people.js";
import { domainOfEmail, findProvider, type Provider, provedDomains } from "./providers.js";

/**
 * Provisioning over SCIM 2.0 (RFC 7643 and 7644): an identity provider pushes
 * the people and groups it holds, and says when one has left.
 *
 * What is pushed is kept as the provider sent it, in tables of its own, and
 * applied to the people and groups here. A person the provider turns off is
 * turned off here: an end user is disabled, a member is suspended in the
 * provider's tenant, and for the instance's own provider the member's account
 * is disabled everywhere. Deleting does the same and removes the tie to the
 * provider. An account is never deleted by a push.
 */

export const SCIM_TOKEN_PREFIX = "vxp_";

export const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
export const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

/** A refusal in the shape SCIM gives one. */
export class ScimError extends Error {
  readonly status: number;
  readonly scimType: string | undefined;
  constructor(status: number, detail: string, scimType?: string) {
    super(detail);
    this.name = "ScimError";
    this.status = status;
    this.scimType = scimType;
  }
}
const invalid = (detail: string, scimType = "invalidValue") => new ScimError(400, detail, scimType);
const taken = (detail: string) => new ScimError(409, detail, "uniqueness");
const missing = (what: string) => new ScimError(404, `${what} was not found.`);

// ----- Tokens -----

/** Makes a token for a provider to push with. It is returned once, and only its hash is kept. */
export async function createScimToken(
  trx: Trx,
  audit: Audit,
  provider: Provider,
  input: { name: string; expiresAt?: Date | null; createdBy: string | null },
) {
  const token = `${SCIM_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await trx
    .insertInto("scim_token")
    .values({
      id: newId(),
      provider_id: provider.id,
      tenant_id: provider.tenantId,
      name: input.name,
      prefix: token.slice(0, 12),
      token_hash: hashApiKey(token),
      expires_at: input.expiresAt ?? null,
      revoked_at: null,
      last_used_at: null,
      created_by: input.createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await audit({
    action: "scim_token.created",
    targetType: "identity_provider",
    targetId: provider.id,
    tenantId: provider.tenantId,
    details: { identityProvider: provider.name, name: input.name, prefix: row.prefix },
  });
  return { row, token };
}

export interface ScimCaller {
  provider: Provider;
  tokenId: string;
  tokenPrefix: string;
}

/**
 * Works out which provider is pushing, from its token. The token opens the
 * one provider it was made for, and nothing else on the instance.
 */
export async function resolveScimCaller(
  kernel: Kernel,
  request: FastifyRequest,
  providerId: string,
): Promise<ScimCaller> {
  const refused = () => new ScimError(401, "The token is not valid for this address.");
  const [scheme, token] = (request.headers.authorization ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.startsWith(SCIM_TOKEN_PREFIX)) throw refused();
  const row = await kernel.db
    .selectFrom("scim_token")
    .select(["id", "provider_id", "prefix", "revoked_at", "expires_at", "last_used_at"])
    .where("token_hash", "=", hashApiKey(token))
    .executeTakeFirst();
  const now = new Date();
  if (
    !row ||
    row.provider_id !== providerId ||
    row.revoked_at ||
    (row.expires_at && row.expires_at <= now)
  ) {
    throw refused();
  }
  const provider = await kernel.db
    .selectFrom("identity_provider")
    .select(["id", "tenant_id"])
    .where("id", "=", providerId)
    .executeTakeFirst();
  const found = provider && (await findProvider(kernel.db, provider.id, provider.tenant_id));
  if (!found) throw refused();
  if (found.paused) {
    throw new ScimError(
      403,
      "This provider is paused. Save it again in the console before pushing to it.",
    );
  }
  // Recording every use would turn each read into a write. Once a minute is enough.
  if (!row.last_used_at || now.getTime() - row.last_used_at.getTime() > 60_000) {
    await kernel.db
      .updateTable("scim_token")
      .set({ last_used_at: now })
      .where("id", "=", row.id)
      .execute();
  }
  return { provider: found, tokenId: row.id, tokenPrefix: row.prefix };
}

// ----- What a provider sends -----

/** `attribute eq "value"`: the one kind of filter providers use to look someone up. */
export function parseFilter(
  text: string | undefined,
  allowed: readonly string[],
): { attribute: string; value: string } | undefined {
  if (text === undefined || text.trim() === "") return undefined;
  const match = /^\s*([A-Za-z][A-Za-z0-9.:]*)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i.exec(text);
  const attribute = allowed.find((name) => name.toLowerCase() === match?.[1]?.toLowerCase());
  if (!match || !attribute) {
    throw invalid(
      `Only these filters are understood: ${allowed.map((name) => `${name} eq "…"`).join(", ")}.`,
      "invalidFilter",
    );
  }
  return { attribute, value: (match[2] as string).replace(/\\(.)/g, "$1") };
}

export interface UserFields {
  userName?: string;
  externalId?: string | null;
  email?: string;
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  active?: boolean;
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/** Entra sends `"False"` where the standard says `false`. */
function truth(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function primaryEmail(emails: unknown): string | undefined {
  if (!Array.isArray(emails)) return undefined;
  const list = emails.filter(
    (one): one is { value: string; primary?: unknown; type?: unknown } =>
      typeof one === "object" &&
      one !== null &&
      typeof (one as { value?: unknown }).value === "string",
  );
  const chosen =
    list.find((one) => truth(one.primary) === true) ??
    list.find((one) => one.type === "work") ??
    list[0];
  return text(chosen?.value);
}

/** The fields of a whole user, as a POST or a PUT sends one. Unknown attributes are passed over. */
export function userFields(body: unknown): UserFields {
  const given = (body ?? {}) as Record<string, unknown>;
  const name = (given.name ?? {}) as Record<string, unknown>;
  const fields: UserFields = {};
  const userName = text(given.userName);
  if (userName !== undefined) fields.userName = userName;
  if ("externalId" in given) fields.externalId = text(given.externalId) ?? null;
  const email = primaryEmail(given.emails);
  if (email !== undefined) fields.email = email;
  if ("displayName" in given) fields.displayName = text(given.displayName) ?? null;
  else if (text(name.formatted)) fields.displayName = text(name.formatted) ?? null;
  if ("givenName" in name) fields.givenName = text(name.givenName) ?? null;
  if ("familyName" in name) fields.familyName = text(name.familyName) ?? null;
  const active = truth(given.active);
  if (active !== undefined) fields.active = active;
  return fields;
}

interface Operation {
  op: string;
  path: string | undefined;
  value: unknown;
}

function operations(body: unknown): Operation[] {
  const list = (body as { Operations?: unknown } | undefined)?.Operations;
  if (!Array.isArray(list) || list.length === 0) {
    throw invalid("A PATCH needs a list of Operations.", "invalidSyntax");
  }
  return list.map((one) => {
    const given = (one ?? {}) as Record<string, unknown>;
    const op = String(given.op ?? "").toLowerCase();
    if (!["add", "replace", "remove"].includes(op)) {
      throw invalid(`"${String(given.op)}" is not an operation.`, "invalidSyntax");
    }
    return { op, path: text(given.path), value: given.value };
  });
}

const USER_URN = `${USER_SCHEMA}:`;

/** The changes a PATCH makes to a user. Paths that name what is not kept here are passed over. */
export function userChanges(body: unknown): UserFields {
  const changes: UserFields = {};
  const set = (rawPath: string, value: unknown, removed: boolean) => {
    const path = (rawPath.startsWith(USER_URN) ? rawPath.slice(USER_URN.length) : rawPath)
      .replace(/\s+/g, " ")
      .toLowerCase();
    const held = removed ? null : (text(value) ?? null);
    if (path === "username") {
      if (held) changes.userName = held;
    } else if (path === "externalid") changes.externalId = held;
    else if (path === "displayname" || path === "name.formatted") changes.displayName = held;
    else if (path === "name.givenname") changes.givenName = held;
    else if (path === "name.familyname") changes.familyName = held;
    else if (path === "active") {
      const active = removed ? undefined : truth(value);
      if (active !== undefined) changes.active = active;
    } else if (path === "emails") {
      const email = primaryEmail(value);
      if (email) changes.email = email;
    } else if (/^emails\[.*\]\.value$/.test(path)) {
      // Entra names the work address. Another kind of address is not the one kept here.
      if (/type eq "work"|primary eq (true|"true")/.test(path) && held) changes.email = held;
    } else if (path === "name" && typeof value === "object" && value !== null) {
      Object.assign(changes, userFields({ name: value }));
    }
  };
  for (const operation of operations(body)) {
    if (operation.path !== undefined) {
      set(operation.path, operation.value, operation.op === "remove");
      continue;
    }
    // Okta sends the attributes as one object, with no path.
    if (typeof operation.value !== "object" || operation.value === null) {
      throw invalid("An operation with no path needs an object of attributes.", "invalidSyntax");
    }
    for (const [path, value] of Object.entries(operation.value)) set(path, value, false);
  }
  return changes;
}

export interface GroupChanges {
  displayName?: string;
  externalId?: string | null;
  /** IDs of users to put in, to take out, or with `replace`, the whole membership. */
  add: string[];
  remove: string[];
  replace?: string[];
}

const memberIds = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
    .map((one) => text((one as { value?: unknown } | null)?.value))
    .filter((id): id is string => id !== undefined);

/** The changes a PATCH makes to a group. */
export function groupChanges(body: unknown): GroupChanges {
  const changes: GroupChanges = { add: [], remove: [] };
  for (const operation of operations(body)) {
    const path = (operation.path ?? "").replace(/\s+/g, " ");
    const lower = path.toLowerCase();
    // Entra takes one person out by naming them in the path.
    const named = /^members\[value eq "([^"]+)"\]$/i.exec(path);
    if (named) {
      if (operation.op === "remove") changes.remove.push(named[1] as string);
      continue;
    }
    if (lower === "members") {
      const ids = memberIds(operation.value);
      if (operation.op === "add") changes.add.push(...ids);
      else if (operation.op === "replace") changes.replace = ids;
      else if (ids.length > 0) changes.remove.push(...ids);
      else changes.replace = [];
      continue;
    }
    if (lower === "displayname") {
      const name = text(operation.value);
      if (name) changes.displayName = name;
      continue;
    }
    if (lower === "externalid") {
      changes.externalId = operation.op === "remove" ? null : (text(operation.value) ?? null);
      continue;
    }
    if (path === "" && typeof operation.value === "object" && operation.value !== null) {
      const given = operation.value as Record<string, unknown>;
      const name = text(given.displayName);
      if (name) changes.displayName = name;
      if ("externalId" in given) changes.externalId = text(given.externalId) ?? null;
      if ("members" in given) {
        if (operation.op === "add") changes.add.push(...memberIds(given.members));
        else changes.replace = memberIds(given.members);
      }
    }
  }
  return changes;
}

// ----- What is sent back -----

type UserRow = {
  id: string;
  external_id: string | null;
  user_name: string;
  email: string;
  display_name: string | null;
  given_name: string | null;
  family_name: string | null;
  active: boolean;
  principal_type: "member" | "end_user";
  principal_id: string;
  created_at: Date;
  updated_at: Date;
};
type GroupRow = {
  id: string;
  external_id: string | null;
  display_name: string;
  created_at: Date;
  updated_at: Date;
};

export const scimBase = (kernel: Kernel, providerId: string) =>
  `${kernel.config.publicUrl}/api/v1/scim/v2/${providerId}`;

export function userResource(row: UserRow, base: string) {
  const formatted =
    row.display_name ?? ([row.given_name, row.family_name].filter(Boolean).join(" ") || undefined);
  return {
    schemas: [USER_SCHEMA],
    id: row.id,
    ...(row.external_id ? { externalId: row.external_id } : {}),
    userName: row.user_name,
    ...(formatted || row.given_name || row.family_name
      ? {
          name: {
            ...(formatted ? { formatted } : {}),
            ...(row.given_name ? { givenName: row.given_name } : {}),
            ...(row.family_name ? { familyName: row.family_name } : {}),
          },
        }
      : {}),
    ...(row.display_name ? { displayName: row.display_name } : {}),
    emails: [{ value: row.email, type: "work", primary: true }],
    active: row.active,
    meta: {
      resourceType: "User",
      created: row.created_at.toISOString(),
      lastModified: row.updated_at.toISOString(),
      location: `${base}/Users/${row.id}`,
    },
  };
}

export function groupResource(
  row: GroupRow,
  members: { id: string; user_name: string }[] | undefined,
  base: string,
) {
  return {
    schemas: [GROUP_SCHEMA],
    id: row.id,
    ...(row.external_id ? { externalId: row.external_id } : {}),
    displayName: row.display_name,
    ...(members
      ? {
          members: members.map((member) => ({
            value: member.id,
            display: member.user_name,
            $ref: `${base}/Users/${member.id}`,
          })),
        }
      : {}),
    meta: {
      resourceType: "Group",
      created: row.created_at.toISOString(),
      lastModified: row.updated_at.toISOString(),
      location: `${base}/Groups/${row.id}`,
    },
  };
}

// ----- People -----

export async function findScimUser(db: Db | Trx, provider: Provider, id: string) {
  const row = /^[0-9a-f-]{36}$/i.test(id)
    ? await db
        .selectFrom("scim_user")
        .selectAll()
        .where("provider_id", "=", provider.id)
        .where("id", "=", id)
        .executeTakeFirst()
    : undefined;
  if (!row) throw missing("The user");
  return row;
}

/** The names of the pushed groups a person is in, for the provider's group map to read. */
export async function pushedGroupNames(
  trx: Db | Trx,
  providerId: string,
  principalId: string,
): Promise<string[]> {
  const rows = await trx
    .selectFrom("scim_group_member")
    .innerJoin("scim_group", "scim_group.id", "scim_group_member.group_id")
    .innerJoin("scim_user", "scim_user.id", "scim_group_member.user_id")
    .select("scim_group.display_name")
    .where("scim_user.provider_id", "=", providerId)
    .where("scim_user.principal_id", "=", principalId)
    .execute();
  return rows.map((row) => row.display_name);
}

/** Sets a person's groups here from the pushed groups they are in, when the provider says to. */
async function applyGroups(
  trx: Trx,
  audit: Audit,
  provider: Provider,
  person: { principal_type: "member" | "end_user"; principal_id: string },
  names?: string[],
) {
  if (provider.tenantId === null || provider.scim.groups !== "scim") return;
  const changed = await syncGroups(
    trx,
    provider,
    person.principal_type,
    person.principal_id,
    names ?? (await pushedGroupNames(trx, provider.id, person.principal_id)),
  );
  if (changed.added.length === 0 && changed.removed.length === 0) return;
  await audit({
    action: "sso.groups_changed",
    targetType: person.principal_type,
    targetId: person.principal_id,
    tenantId: provider.tenantId,
    details: { added: changed.added, removed: changed.removed },
  });
}

/** Turns a person on or off here, in the way that fits who they are. Changes nothing that already holds. */
async function setActive(
  trx: Trx,
  audit: Audit,
  provider: Provider,
  person: { principal_type: "member" | "end_user"; principal_id: string },
  active: boolean,
) {
  const id = person.principal_id;
  const now = new Date();
  if (person.principal_type === "end_user") {
    const user = await trx
      .selectFrom("end_user")
      .select(["disabled_at", "email"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!user || (user.disabled_at === null) === active) return;
    await trx
      .updateTable("end_user")
      .set({ disabled_at: active ? null : now, updated_at: now })
      .where("id", "=", id)
      .execute();
    if (!active) {
      await trx
        .deleteFrom("app_session")
        .where("principal_type", "=", "end_user")
        .where("principal_id", "=", id)
        .execute();
    }
    await audit({
      action: active ? "end_user.enabled" : "end_user.disabled",
      targetType: "end_user",
      targetId: id,
      tenantId: provider.tenantId,
      details: { email: user.email },
    });
    return;
  }
  if (provider.tenantId !== null) {
    const belongs = await trx
      .selectFrom("tenant_member")
      .select("suspended_at")
      .where("tenant_id", "=", provider.tenantId)
      .where("member_id", "=", id)
      .executeTakeFirst();
    if (!belongs || (belongs.suspended_at === null) === active) return;
    await trx
      .updateTable("tenant_member")
      .set({ suspended_at: active ? null : now })
      .where("tenant_id", "=", provider.tenantId)
      .where("member_id", "=", id)
      .execute();
    if (!active) {
      await trx
        .deleteFrom("app_session")
        .where("tenant_id", "=", provider.tenantId)
        .where("principal_type", "=", "member")
        .where("principal_id", "=", id)
        .execute();
    }
    await audit({
      action: active ? "tenant_member.resumed" : "tenant_member.suspended",
      targetType: "member",
      targetId: id,
      tenantId: provider.tenantId,
    });
    return;
  }
  const member = await trx
    .selectFrom("member")
    .select(["disabled_at", "email"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!member || (member.disabled_at === null) === active) return;
  await trx
    .updateTable("member")
    .set({ disabled_at: active ? null : now })
    .where("id", "=", id)
    .execute();
  // Every sign-in the person has ends now, on every device.
  if (!active) await trx.deleteFrom("member_session").where("member_id", "=", id).execute();
  await audit({
    action: active ? "member.enabled" : "member.disabled",
    targetType: "member",
    targetId: id,
    details: { email: member.email },
  });
}

/** Ties the person to the provider by the field the provider signs them in by, when one is named. */
async function tie(
  trx: Trx,
  audit: Audit,
  provider: Provider,
  person: { principal_type: "member" | "end_user"; principal_id: string; email: string },
  fields: { user_name: string; external_id: string | null },
) {
  const from = provider.scim.subjectFrom;
  const subject =
    from === "externalId" ? fields.external_id : from === "userName" ? fields.user_name : null;
  if (!subject) return;
  const [bySubject, byPerson] = await Promise.all([
    trx
      .selectFrom("identity_link")
      .select(["id", "principal_id"])
      .where("provider_id", "=", provider.id)
      .where("subject", "=", subject)
      .executeTakeFirst(),
    trx
      .selectFrom("identity_link")
      .select(["id", "subject"])
      .where("provider_id", "=", provider.id)
      .where("principal_id", "=", person.principal_id)
      .executeTakeFirst(),
  ]);
  if (bySubject && bySubject.principal_id !== person.principal_id) {
    throw taken("Someone else is already signed in by that name at this provider.");
  }
  if (bySubject) return;
  if (byPerson) {
    // The provider renamed the person. The tie follows.
    await trx.updateTable("identity_link").set({ subject }).where("id", "=", byPerson.id).execute();
  } else {
    await trx
      .insertInto("identity_link")
      .values({
        id: newId(),
        provider_id: provider.id,
        tenant_id: provider.tenantId,
        subject,
        principal_type: person.principal_type,
        principal_id: person.principal_id,
        email: person.email,
        last_signed_in_at: null,
      })
      .execute();
  }
  await audit({
    action: "identity_link.created",
    targetType: person.principal_type,
    targetId: person.principal_id,
    tenantId: provider.tenantId,
    details: { email: person.email, by: "push" },
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkedEmail(raw: string | undefined): string {
  let email: string;
  try {
    email = cleanEmail(raw ?? "");
  } catch {
    email = "";
  }
  if (!EMAIL.test(email) || email.length > 320) {
    throw invalid("A user needs an email address: a work email, or a userName that is one.");
  }
  return email;
}

async function refuseDuplicate(
  trx: Trx,
  provider: Provider,
  fields: { userName?: string | undefined; externalId?: string | null | undefined },
  except?: string,
) {
  if (fields.userName !== undefined) {
    const same = await trx
      .selectFrom("scim_user")
      .select("id")
      .where("provider_id", "=", provider.id)
      .where(sql<boolean>`lower(user_name) = ${fields.userName.toLowerCase()}`)
      .executeTakeFirst();
    if (same && same.id !== except) throw taken(`A user named ${fields.userName} already exists.`);
  }
  if (fields.externalId) {
    const same = await trx
      .selectFrom("scim_user")
      .select("id")
      .where("provider_id", "=", provider.id)
      .where("external_id", "=", fields.externalId)
      .executeTakeFirst();
    if (same && same.id !== except) {
      throw taken(`A user with the external ID ${fields.externalId} already exists.`);
    }
  }
}

/** Takes a pushed person in: finds or makes the account here, and ties it to the provider. */
export async function createScimUser(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  provider: Provider,
  fields: UserFields,
) {
  if (!fields.userName) throw invalid("A user needs a userName.");
  const email = checkedEmail(fields.email ?? fields.userName);
  await refuseDuplicate(trx, provider, fields);
  const name =
    fields.displayName ??
    ([fields.givenName, fields.familyName].filter(Boolean).join(" ") || undefined);
  const proved = (await provedDomains(trx, provider.id)).has(domainOfEmail(email) ?? "");
  const principalType = provider.audience === "members" ? "member" : "end_user";
  let principalId: string;

  if (principalType === "member") {
    // A member is one person on the whole instance, so nothing less than a proved domain will do.
    if (!proved) {
      throw invalid(
        `${email} is not in an email domain this provider has proved. Prove the domain in the console first.`,
      );
    }
    const existing = await trx
      .selectFrom("member")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirst();
    let created = false;
    if (existing) principalId = existing.id;
    else {
      principalId = newId();
      const now = new Date();
      await trx
        .insertInto("member")
        .values({
          id: principalId,
          email,
          name: name ?? email,
          email_verified: true,
          created_at: now,
          updated_at: now,
        })
        .execute();
      await audit({
        action: "member.created",
        targetType: "member",
        targetId: principalId,
        details: { email },
      });
      created = true;
    }
    if (provider.tenantId !== null) {
      const belongs = await trx
        .selectFrom("tenant_member")
        .select("member_id")
        .where("tenant_id", "=", provider.tenantId)
        .where("member_id", "=", principalId)
        .executeTakeFirst();
      if (!belongs) {
        await trx
          .insertInto("tenant_member")
          .values({ tenant_id: provider.tenantId, member_id: principalId })
          .execute();
        await audit({
          action: "tenant_member.added",
          targetType: "member",
          targetId: principalId,
          tenantId: provider.tenantId,
        });
        await giveRole(trx, audit, provider, provider.tenantId, principalId);
      }
    } else if (created) await giveRole(trx, audit, provider, null, principalId);
  } else {
    const tenantId = provider.tenantId as string;
    const existing = await trx
      .selectFrom("end_user")
      .select("id")
      .where("tenant_id", "=", tenantId)
      .where("email", "=", email)
      .executeTakeFirst();
    if (existing) {
      // The same rule as a first sign-in: an account is taken over only on a proved domain,
      // or when the tenant has said to take the provider's word.
      if (!proved && !(provider.config.trustEmail ?? false)) {
        throw taken(
          `An end user ${email} exists, and this provider may not take the account over. Prove the email's domain, or let the provider's word on emails be taken.`,
        );
      }
      principalId = existing.id;
    } else {
      principalId = (
        await createEndUser(kernel, trx, audit, { tenantId, email, ...(name ? { name } : {}) })
      ).id;
    }
  }

  const held = await trx
    .selectFrom("scim_user")
    .select("id")
    .where("provider_id", "=", provider.id)
    .where("principal_id", "=", principalId)
    .executeTakeFirst();
  if (held) throw taken(`${email} was already pushed, under another userName.`);
  const row = await trx
    .insertInto("scim_user")
    .values({
      id: newId(),
      provider_id: provider.id,
      tenant_id: provider.tenantId,
      external_id: fields.externalId ?? null,
      user_name: fields.userName,
      email,
      display_name: fields.displayName ?? null,
      given_name: fields.givenName ?? null,
      family_name: fields.familyName ?? null,
      active: fields.active ?? true,
      principal_type: principalType,
      principal_id: principalId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await audit({
    action: "scim.user_pushed",
    targetType: principalType,
    targetId: principalId,
    tenantId: provider.tenantId,
    details: { userName: row.user_name, email, active: row.active },
  });
  await tie(trx, audit, provider, row, row);
  await setActive(trx, audit, provider, row, row.active);
  await applyGroups(trx, audit, provider, row);
  return row;
}

/**
 * Applies changes to a pushed person. With `whole`, the fields are everything
 * the provider holds, as a PUT sends: what it left out is cleared. Returns the
 * person as they now stand. Nothing is written, or recorded, when nothing changed.
 */
export async function updateScimUser(
  trx: Trx,
  audit: Audit,
  provider: Provider,
  row: UserRow,
  fields: UserFields,
  whole = false,
) {
  const next = {
    user_name: fields.userName ?? row.user_name,
    external_id:
      fields.externalId !== undefined ? fields.externalId : whole ? null : row.external_id,
    email: fields.email !== undefined ? checkedEmail(fields.email) : row.email,
    display_name:
      fields.displayName !== undefined ? fields.displayName : whole ? null : row.display_name,
    given_name: fields.givenName !== undefined ? fields.givenName : whole ? null : row.given_name,
    family_name:
      fields.familyName !== undefined ? fields.familyName : whole ? null : row.family_name,
    active: fields.active ?? row.active,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
    (key) => next[key] !== row[key],
  );
  if (changed.length === 0) return row;
  await refuseDuplicate(
    trx,
    provider,
    { userName: next.user_name, externalId: next.external_id },
    row.id,
  );

  const name =
    next.display_name ??
    ([next.given_name, next.family_name].filter(Boolean).join(" ") || undefined);
  if (row.principal_type === "end_user") {
    if (next.email !== row.email) {
      const other = await trx
        .selectFrom("end_user")
        .select("id")
        .where("tenant_id", "=", provider.tenantId as string)
        .where("email", "=", next.email)
        .executeTakeFirst();
      if (other && other.id !== row.principal_id) {
        throw taken(`Another end user already has the email ${next.email}.`);
      }
    }
    await trx
      .updateTable("end_user")
      .set({ email: next.email, ...(name ? { name } : {}), updated_at: new Date() })
      .where("id", "=", row.principal_id)
      .execute();
  }
  // A member's email is the name of their account on the whole instance, in every tenant they
  // belong to. A push does not change it: the new address is kept with what was pushed.

  const updated = await trx
    .updateTable("scim_user")
    .set({ ...next, updated_at: new Date() })
    .where("id", "=", row.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  await audit({
    action: "scim.user_changed",
    targetType: row.principal_type,
    targetId: row.principal_id,
    tenantId: provider.tenantId,
    details: { userName: updated.user_name, changed },
  });
  if (changed.includes("external_id") || changed.includes("user_name")) {
    await tie(trx, audit, provider, updated, updated);
  }
  if (changed.includes("active")) await setActive(trx, audit, provider, updated, updated.active);
  return updated;
}

/** The provider says the person is gone: they are turned off here and the tie is removed. */
export async function deleteScimUser(trx: Trx, audit: Audit, provider: Provider, row: UserRow) {
  await setActive(trx, audit, provider, row, false);
  await trx
    .deleteFrom("identity_link")
    .where("provider_id", "=", provider.id)
    .where("principal_id", "=", row.principal_id)
    .execute();
  await trx.deleteFrom("scim_user").where("id", "=", row.id).execute();
  await applyGroups(trx, audit, provider, row, []);
  await audit({
    action: "scim.user_removed",
    targetType: row.principal_type,
    targetId: row.principal_id,
    tenantId: provider.tenantId,
    details: { userName: row.user_name, email: row.email },
  });
}

// ----- Groups -----

export async function findScimGroup(db: Db | Trx, provider: Provider, id: string) {
  const row = /^[0-9a-f-]{36}$/i.test(id)
    ? await db
        .selectFrom("scim_group")
        .selectAll()
        .where("provider_id", "=", provider.id)
        .where("id", "=", id)
        .executeTakeFirst()
    : undefined;
  if (!row) throw missing("The group");
  return row;
}

export const groupMembers = (db: Db | Trx, groupId: string) =>
  db
    .selectFrom("scim_group_member")
    .innerJoin("scim_user", "scim_user.id", "scim_group_member.user_id")
    .select([
      "scim_user.id",
      "scim_user.user_name",
      "scim_user.principal_type",
      "scim_user.principal_id",
    ])
    .where("scim_group_member.group_id", "=", groupId)
    .orderBy("scim_user.user_name")
    .execute();

/** A name an end-user group may have, made from the provider's name for it. */
export const groupSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+|-+$/g, "")
    .slice(0, 63);

/**
 * Makes sure a pushed group has a group here to stand for, when the provider
 * says pushed groups make their own. A group somebody already mapped is left
 * as they mapped it.
 */
async function ensureLocalGroup(
  trx: Trx,
  audit: Audit,
  provider: Provider,
  displayName: string,
): Promise<boolean> {
  const tenantId = provider.tenantId;
  if (tenantId === null || provider.scim.groups !== "scim" || !provider.scim.createGroups) {
    return false;
  }
  const mapped = await trx
    .selectFrom("identity_group_map")
    .select("id")
    .where("provider_id", "=", provider.id)
    .where("claim_value", "=", displayName)
    .executeTakeFirst();
  if (mapped) return false;
  const forMembers = provider.audience === "members";
  const name = forMembers ? displayName.slice(0, 200) : groupSlug(displayName);
  if (name === "") return false;
  const table = forMembers ? "principal_group" : "end_user_group";
  let group = await trx
    .selectFrom(table)
    .select("id")
    .where("tenant_id", "=", tenantId)
    .where("name", "=", name)
    .executeTakeFirst();
  if (!group) {
    group = { id: newId() };
    if (forMembers) {
      await trx
        .insertInto("principal_group")
        .values({ id: group.id, tenant_id: tenantId, name })
        .execute();
    } else {
      await trx
        .insertInto("end_user_group")
        .values({ id: group.id, tenant_id: tenantId, name, description: displayName.slice(0, 200) })
        .execute();
    }
    await audit({
      action: forMembers ? "group.created" : "end_user_group.created",
      targetType: forMembers ? "group" : "end_user_group",
      targetId: group.id,
      tenantId,
      details: { name, pushedAs: displayName },
    });
  }
  await trx
    .insertInto("identity_group_map")
    .values({
      id: newId(),
      provider_id: provider.id,
      tenant_id: tenantId,
      claim_value: displayName,
      member_group_id: forMembers ? group.id : null,
      end_user_group_id: forMembers ? null : group.id,
    })
    .execute();
  await audit({
    action: "identity_provider.groups_mapped",
    targetType: "identity_provider",
    targetId: provider.id,
    tenantId,
    details: { group: name, pushedAs: displayName },
  });
  return true;
}

/**
 * Brings the groups here into line with everything the provider has pushed.
 * Run when the provider is first told that pushed groups decide: what it
 * pushed before then is taken in at once, not when it next changes.
 */
export async function applyPushedGroups(trx: Trx, audit: Audit, provider: Provider) {
  if (provider.tenantId === null || provider.scim.groups !== "scim") return;
  const groups = await trx
    .selectFrom("scim_group")
    .select("display_name")
    .where("provider_id", "=", provider.id)
    .orderBy("display_name")
    .execute();
  for (const group of groups) await ensureLocalGroup(trx, audit, provider, group.display_name);
  const people = await trx
    .selectFrom("scim_user")
    .select(["principal_type", "principal_id"])
    .where("provider_id", "=", provider.id)
    .orderBy("id")
    .execute();
  for (const person of people) await applyGroups(trx, audit, provider, person);
}

async function refuseDuplicateGroup(
  trx: Trx,
  provider: Provider,
  displayName: string,
  except?: string,
) {
  const same = await trx
    .selectFrom("scim_group")
    .select("id")
    .where("provider_id", "=", provider.id)
    .where(sql<boolean>`lower(display_name) = ${displayName.toLowerCase()}`)
    .executeTakeFirst();
  if (same && same.id !== except) throw taken(`A group named ${displayName} already exists.`);
}

/** The pushed users among `ids`. An ID that is no user of this provider is refused. */
async function usersByIds(trx: Trx, provider: Provider, ids: string[]) {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return [];
  const valid = wanted.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const rows =
    valid.length === 0
      ? []
      : await trx
          .selectFrom("scim_user")
          .select(["id", "principal_type", "principal_id"])
          .where("provider_id", "=", provider.id)
          .where("id", "in", valid)
          .execute();
  if (rows.length !== wanted.length) {
    const known = new Set(rows.map((row) => row.id));
    throw invalid(`There is no user ${wanted.find((id) => !known.has(id))} to put in the group.`);
  }
  return rows;
}

export async function createScimGroup(trx: Trx, audit: Audit, provider: Provider, body: unknown) {
  const given = (body ?? {}) as Record<string, unknown>;
  const displayName = text(given.displayName);
  if (!displayName || displayName.length > 500) throw invalid("A group needs a displayName.");
  await refuseDuplicateGroup(trx, provider, displayName);
  const members = await usersByIds(trx, provider, memberIds(given.members));
  const row = await trx
    .insertInto("scim_group")
    .values({
      id: newId(),
      provider_id: provider.id,
      tenant_id: provider.tenantId,
      external_id: text(given.externalId) ?? null,
      display_name: displayName,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  if (members.length > 0) {
    await trx
      .insertInto("scim_group_member")
      .values(members.map((member) => ({ group_id: row.id, user_id: member.id })))
      .execute();
  }
  await audit({
    action: "scim.group_pushed",
    targetType: "identity_provider",
    targetId: provider.id,
    tenantId: provider.tenantId,
    details: { group: displayName, members: members.length },
  });
  await ensureLocalGroup(trx, audit, provider, displayName);
  for (const member of members) await applyGroups(trx, audit, provider, member);
  return row;
}

/** Applies changes to a pushed group, and to the groups here of everyone it touches. */
export async function updateScimGroup(
  trx: Trx,
  audit: Audit,
  provider: Provider,
  row: GroupRow,
  changes: GroupChanges,
) {
  const before = await groupMembers(trx, row.id);
  const current = new Set(before.map((member) => member.id));
  const wanted = new Set(changes.replace ?? current);
  for (const id of changes.add) wanted.add(id);
  for (const id of changes.remove) wanted.delete(id);
  const adding = [...wanted].filter((id) => !current.has(id));
  const removing = [...current].filter((id) => !wanted.has(id));
  const displayName = changes.displayName ?? row.display_name;
  const externalId = changes.externalId !== undefined ? changes.externalId : row.external_id;
  const renamed = displayName !== row.display_name;
  if (!renamed && externalId === row.external_id && adding.length === 0 && removing.length === 0) {
    return row;
  }
  if (displayName.length > 500) throw invalid("The displayName is too long.");
  if (renamed) await refuseDuplicateGroup(trx, provider, displayName, row.id);
  const added = await usersByIds(trx, provider, adding);

  if (added.length > 0) {
    await trx
      .insertInto("scim_group_member")
      .values(added.map((member) => ({ group_id: row.id, user_id: member.id })))
      .execute();
  }
  if (removing.length > 0) {
    await trx
      .deleteFrom("scim_group_member")
      .where("group_id", "=", row.id)
      .where("user_id", "in", removing)
      .execute();
  }
  const updated = await trx
    .updateTable("scim_group")
    .set({ display_name: displayName, external_id: externalId, updated_at: new Date() })
    .where("id", "=", row.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  if (renamed) {
    // What was mapped under the old name is mapped under the new one: it is the same group.
    await trx
      .updateTable("identity_group_map")
      .set({ claim_value: displayName })
      .where("provider_id", "=", provider.id)
      .where("claim_value", "=", row.display_name)
      .execute();
  }
  await audit({
    action: "scim.group_changed",
    targetType: "identity_provider",
    targetId: provider.id,
    tenantId: provider.tenantId,
    details: {
      group: displayName,
      ...(renamed ? { was: row.display_name } : {}),
      added: adding.length,
      removed: removing.length,
    },
  });
  const mapped = await ensureLocalGroup(trx, audit, provider, displayName);
  // A group that was renamed, or only now stands for a group here, concerns everyone in it.
  const touched =
    renamed || mapped
      ? [...before, ...added]
      : [...added, ...before.filter((member) => removing.includes(member.id))];
  const seen = new Set<string>();
  for (const member of touched) {
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    await applyGroups(trx, audit, provider, member);
  }
  return updated;
}

/** The provider no longer has the group. The group here stays, and its pushed people leave it. */
export async function deleteScimGroup(trx: Trx, audit: Audit, provider: Provider, row: GroupRow) {
  const members = await groupMembers(trx, row.id);
  await trx.deleteFrom("scim_group").where("id", "=", row.id).execute();
  await audit({
    action: "scim.group_removed",
    targetType: "identity_provider",
    targetId: provider.id,
    tenantId: provider.tenantId,
    details: { group: row.display_name, members: members.length },
  });
  for (const member of members) await applyGroups(trx, audit, provider, member);
}

/** What a refusal from the rest of the platform is, said as SCIM says it. */
export function asScimError(error: unknown): ScimError | undefined {
  if (error instanceof ScimError) return error;
  if (error instanceof HttpError) {
    return new ScimError(
      error.statusCode,
      error.message,
      error.statusCode === 409
        ? "uniqueness"
        : error.statusCode === 400
          ? "invalidValue"
          : undefined,
    );
  }
  return undefined;
}
