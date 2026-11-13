import { newId } from "@vynxlabs/db";
import { type Actor, type Audit, type Db, type Trx, writeAudit } from "../audit.js";
import { createEndUser } from "../endusers.js";
import { HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { domainOfEmail, type Provider, provedDomains } from "./providers.js";

/** What a provider said about the person who signed in, after its answer was checked. */
export interface Asserted {
  /** The provider's own, lasting name for the person. */
  subject: string;
  email: string | undefined;
  /** What the provider says about the email: verified, not verified, or nothing. */
  emailVerified: boolean | undefined;
  name: string | undefined;
  groups: string[];
  attributes: Record<string, string>;
}

export type RefusalReason =
  | "provider_off"
  | "provider_error"
  | "invalid_answer"
  | "replayed"
  | "expired"
  | "no_subject"
  | "no_email"
  | "email_unverified"
  | "domain_not_proved"
  | "email_not_trusted"
  | "no_account"
  | "not_in_tenant"
  | "disabled";

/** A sign-in that was refused, with a reason for the record and words for the person. */
export class SsoRefusal extends Error {
  readonly reason: RefusalReason;
  /** More for the audit log and for an administrator. Never shown to the person signing in. */
  readonly detail: string | undefined;

  constructor(reason: RefusalReason, message: string, detail?: string) {
    super(message);
    this.name = "SsoRefusal";
    this.reason = reason;
    this.detail = detail;
  }
}

export interface Resolved {
  principalType: "member" | "end_user";
  principalId: string;
  /** Whether the person was made by this sign-in, or tied to the provider by it. */
  created: boolean;
  linked: boolean;
  groupsAdded: string[];
  groupsRemoved: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Finds, or makes, the person a provider's answer stands for, and sets their
 * groups and attributes from it.
 *
 * A person is found by the provider's subject. Email is used once, to tie an
 * account to a subject the first time, and only when it can be believed: for
 * a member, when the email's domain is one the provider has proved; for an end
 * user, the same, or when the tenant has said to take the provider's word.
 */
export async function resolvePerson(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  provider: Provider,
  asserted: Asserted,
): Promise<Resolved> {
  const tenantId = provider.tenantId;
  const principalType = provider.audience === "members" ? "member" : "end_user";
  const link = await trx
    .selectFrom("identity_link")
    .select(["id", "principal_id"])
    .where("provider_id", "=", provider.id)
    .where("subject", "=", asserted.subject)
    .executeTakeFirst();

  let principalId = link?.principal_id;
  let created = false;
  const email = asserted.email?.trim().toLowerCase();

  if (!principalId) {
    if (!email || email.length > 320 || !EMAIL.test(email)) {
      throw new SsoRefusal(
        "no_email",
        "The identity provider did not send an email address.",
        "No email came with the sign-in. Check which claim holds it.",
      );
    }
    if (asserted.emailVerified === false) {
      throw new SsoRefusal(
        "email_unverified",
        "The identity provider says this email address has not been verified.",
      );
    }
    const proved = (await provedDomains(trx, provider.id)).has(domainOfEmail(email) ?? "");

    if (principalType === "member") {
      // A member is one person on the whole instance, so nothing less than the domain will do.
      if (!proved) {
        throw new SsoRefusal(
          "domain_not_proved",
          "This email address is not in a domain this sign-in is set up for.",
          `The domain of ${email} has not been proved for this provider.`,
        );
      }
      const existing = await trx
        .selectFrom("member")
        .select("id")
        .where("email", "=", email)
        .executeTakeFirst();
      if (existing) principalId = existing.id;
      else {
        if (!provider.provision) throw noAccount(email);
        principalId = newId();
        const now = new Date();
        await trx
          .insertInto("member")
          .values({
            id: principalId,
            email,
            name: asserted.name?.trim() || email,
            email_verified: true,
            created_at: now,
            updated_at: now,
          })
          .execute();
        await audit({
          action: "member.created",
          targetType: "member",
          targetId: principalId,
          details: { email, identityProvider: provider.name },
        });
        created = true;
      }
    } else {
      const existing = await trx
        .selectFrom("end_user")
        .select("id")
        .where("tenant_id", "=", tenantId as string)
        .where("email", "=", email)
        .executeTakeFirst();
      if (existing) {
        const onItsWord =
          (provider.config.trustEmail ?? false) &&
          (provider.protocol === "saml" || asserted.emailVerified === true);
        if (!proved && !onItsWord) {
          throw new SsoRefusal(
            "email_not_trusted",
            "An account with this email address exists, and this sign-in is not set up to take it over.",
            `An end user ${email} exists. Prove the email's domain for this provider, or let the provider's word on emails be taken.`,
          );
        }
        principalId = existing.id;
      } else {
        if (!provider.provision) throw noAccount(email);
        const user = await createEndUser(kernel, trx, audit, {
          tenantId: tenantId as string,
          email,
          ...(asserted.name?.trim() ? { name: asserted.name.trim() } : {}),
        });
        principalId = user.id;
        created = true;
      }
    }

    // One person has one subject at a provider. A second is someone else using their email.
    const other = await trx
      .selectFrom("identity_link")
      .select("id")
      .where("provider_id", "=", provider.id)
      .where("principal_id", "=", principalId)
      .executeTakeFirst();
    if (other) {
      throw new SsoRefusal(
        "email_not_trusted",
        "This account is already tied to another sign-in at the identity provider.",
        `The account of ${email} is linked to a different subject. Remove that link if the person's identity at the provider was replaced.`,
      );
    }
    await trx
      .insertInto("identity_link")
      .values({
        id: newId(),
        provider_id: provider.id,
        tenant_id: tenantId,
        subject: asserted.subject,
        principal_type: principalType,
        principal_id: principalId,
        email,
        last_signed_in_at: new Date(),
      })
      .execute();
    await audit({
      action: "identity_link.created",
      targetType: principalType,
      targetId: principalId,
      tenantId: tenantId,
      details: { identityProvider: provider.name, email, created },
    });
  } else {
    await trx
      .updateTable("identity_link")
      .set({ last_signed_in_at: new Date(), ...(email ? { email } : {}) })
      .where("id", "=", link?.id as string)
      .execute();
  }

  if (principalType === "member") {
    const member = await trx
      .selectFrom("member")
      .select("id")
      .where("id", "=", principalId)
      .executeTakeFirst();
    if (!member) throw noAccount(email ?? asserted.subject);
    if (tenantId !== null) await ensureTenantMember(trx, audit, provider, tenantId, principalId);
    else if (created) await giveRole(trx, audit, provider, null, principalId);
  } else {
    const user = await trx
      .selectFrom("end_user")
      .select(["id", "disabled_at", "attributes"])
      .where("id", "=", principalId)
      .where("tenant_id", "=", tenantId as string)
      .executeTakeFirst();
    if (!user) throw noAccount(email ?? asserted.subject);
    if (user.disabled_at) {
      throw new SsoRefusal("disabled", "This account has been turned off.");
    }
    await setAttributes(trx, provider, principalId, user.attributes, asserted.attributes);
  }

  const groups =
    tenantId === null
      ? { added: [], removed: [] }
      : await syncGroups(trx, provider, principalType, principalId, asserted.groups);
  if (groups.added.length > 0 || groups.removed.length > 0) {
    await audit({
      action: "sso.groups_changed",
      targetType: principalType,
      targetId: principalId,
      tenantId: tenantId,
      details: { identityProvider: provider.name, added: groups.added, removed: groups.removed },
    });
  }
  return {
    principalType,
    principalId,
    created,
    linked: !link,
    groupsAdded: groups.added,
    groupsRemoved: groups.removed,
  };
}

const noAccount = (who: string) =>
  new SsoRefusal(
    "no_account",
    "There is no account here for you yet. Ask whoever looks after this for one.",
    `${who} has no account, and the provider does not create people on first sign-in.`,
  );

async function ensureTenantMember(
  trx: Trx,
  audit: Audit,
  provider: Provider,
  tenantId: string,
  memberId: string,
) {
  const belongs = await trx
    .selectFrom("tenant_member")
    .select("member_id")
    .where("tenant_id", "=", tenantId)
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  if (belongs) return;
  if (!provider.provision) {
    throw new SsoRefusal(
      "not_in_tenant",
      "Your account has not been added here. Ask whoever looks after this to add you.",
      "The member exists but does not belong to this tenant, and the provider does not add people on first sign-in.",
    );
  }
  await trx
    .insertInto("tenant_member")
    .values({ tenant_id: tenantId, member_id: memberId })
    .execute();
  await audit({
    action: "tenant_member.added",
    targetType: "member",
    targetId: memberId,
    tenantId,
    details: { identityProvider: provider.name },
  });
  await giveRole(trx, audit, provider, tenantId, memberId);
}

/** Gives someone the provider's default role, where the provider is: a tenant, or the instance. */
async function giveRole(
  trx: Trx,
  audit: Audit,
  provider: Provider,
  tenantId: string | null,
  memberId: string,
) {
  if (!provider.defaultRoleId) return;
  const role = await trx
    .selectFrom("role")
    .select(["id", "name"])
    .where("id", "=", provider.defaultRoleId)
    .executeTakeFirst();
  if (!role) return;
  const scope = tenantId === null ? "instance" : "tenant";
  let held = trx
    .selectFrom("binding")
    .select("id")
    .where("scope_type", "=", scope)
    .where("principal_type", "=", "member")
    .where("principal_id", "=", memberId)
    .where("role_id", "=", role.id);
  held = tenantId === null ? held : held.where("tenant_id", "=", tenantId);
  if (await held.executeTakeFirst()) return;
  const id = newId();
  await trx
    .insertInto("binding")
    .values({
      id,
      scope_type: scope,
      tenant_id: tenantId,
      workspace_id: null,
      resource_id: null,
      principal_type: "member",
      principal_id: memberId,
      role_id: role.id,
      source_resource_id: null,
    })
    .execute();
  await audit({
    action: "binding.created",
    targetType: "binding",
    targetId: id,
    tenantId: tenantId,
    details: { scope, memberId, role: role.name, identityProvider: provider.name },
  });
}

/**
 * Sets membership of every group the provider maps, and of no other. A group
 * nobody mapped is left as people here made it.
 */
async function syncGroups(
  trx: Trx,
  provider: Provider,
  principalType: "member" | "end_user",
  principalId: string,
  sent: string[],
): Promise<{ added: string[]; removed: string[] }> {
  const forMembers = principalType === "member";
  const maps = await trx
    .selectFrom("identity_group_map")
    .select(["claim_value", "member_group_id", "end_user_group_id"])
    .where("provider_id", "=", provider.id)
    .execute();
  const groupOf = (map: (typeof maps)[number]) =>
    (forMembers ? map.member_group_id : map.end_user_group_id) as string | null;
  const mapped = new Set(maps.map(groupOf).filter((id): id is string => id !== null));
  if (mapped.size === 0) return { added: [], removed: [] };
  const values = new Set(sent);
  const wanted = new Set(
    maps
      .filter((map) => map.claim_value === "*" || values.has(map.claim_value))
      .map(groupOf)
      .filter((id): id is string => id !== null),
  );
  const current = new Set(
    forMembers
      ? (
          await trx
            .selectFrom("group_member")
            .select("group_id")
            .where("member_id", "=", principalId)
            .where("group_id", "in", [...mapped])
            .execute()
        ).map((row) => row.group_id)
      : (
          await trx
            .selectFrom("end_user_group_member")
            .select("group_id")
            .where("end_user_id", "=", principalId)
            .where("group_id", "in", [...mapped])
            .execute()
        ).map((row) => row.group_id),
  );
  const added = [...wanted].filter((id) => !current.has(id)).sort();
  const removed = [...current].filter((id) => !wanted.has(id)).sort();
  for (const id of added) {
    if (forMembers) {
      await trx
        .insertInto("group_member")
        .values({ group_id: id, member_id: principalId })
        .execute();
    } else {
      await trx
        .insertInto("end_user_group_member")
        .values({ group_id: id, end_user_id: principalId })
        .execute();
    }
  }
  if (removed.length > 0) {
    if (forMembers) {
      await trx
        .deleteFrom("group_member")
        .where("member_id", "=", principalId)
        .where("group_id", "in", removed)
        .execute();
    } else {
      await trx
        .deleteFrom("end_user_group_member")
        .where("end_user_id", "=", principalId)
        .where("group_id", "in", removed)
        .execute();
    }
  }
  const names = await namesOf(trx, forMembers, [...added, ...removed]);
  return {
    added: added.map((id) => names.get(id) ?? id),
    removed: removed.map((id) => names.get(id) ?? id),
  };
}

async function namesOf(trx: Trx, forMembers: boolean, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await trx
    .selectFrom(forMembers ? "principal_group" : "end_user_group")
    .select(["id", "name"])
    .where("id", "in", ids)
    .execute();
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Sets each attribute the provider maps to what it sent, and removes one it no longer sends. */
async function setAttributes(
  trx: Trx,
  provider: Provider,
  userId: string,
  current: unknown,
  sent: Record<string, string>,
) {
  const mapped = Object.keys(provider.config.attributes ?? {});
  if (mapped.length === 0) return;
  const before = (current ?? {}) as Record<string, unknown>;
  const after = { ...before };
  for (const name of mapped) {
    if (sent[name] === undefined) delete after[name];
    else after[name] = sent[name];
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  await trx
    .updateTable("end_user")
    .set({ attributes: JSON.stringify(after), updated_at: new Date() })
    .where("id", "=", userId)
    .execute();
}

// ----- Requiring single sign-on -----

/**
 * The provider that makes a member's password no use, if one does: a provider
 * that is required and has proved the email's domain. The people who run the
 * instance keep their passwords, so that a broken provider cannot lock
 * everyone out.
 */
export async function memberPasswordRefusedBy(
  db: Db | Trx,
  rawEmail: string,
): Promise<{ id: string; name: string; tenantId: string | null } | undefined> {
  const email = rawEmail.trim().toLowerCase();
  const domain = domainOfEmail(email);
  if (!domain) return undefined;
  const provider = await db
    .selectFrom("identity_provider")
    .innerJoin("identity_domain", "identity_domain.provider_id", "identity_provider.id")
    .select(["identity_provider.id", "identity_provider.name", "identity_provider.tenant_id"])
    .where("identity_provider.audience", "=", "members")
    .where("identity_provider.enabled", "=", true)
    .where("identity_provider.enforce", "=", true)
    .where("identity_provider.paused", "=", false)
    .where("identity_domain.domain", "=", domain)
    .where("identity_domain.verified_at", "is not", null)
    .executeTakeFirst();
  if (!provider) return undefined;
  const operator = await db
    .selectFrom("binding")
    .innerJoin("member", "member.id", "binding.principal_id")
    .select("binding.id")
    .where("binding.scope_type", "=", "instance")
    .where("binding.principal_type", "=", "member")
    .where("member.email", "=", email)
    .executeTakeFirst();
  if (operator) return undefined;
  return { id: provider.id, name: provider.name, tenantId: provider.tenant_id };
}

/**
 * The same for an end user of a tenant. A required provider with proved
 * domains covers the emails in them. One with none covers everybody.
 */
export async function endUserPasswordRefusedBy(
  db: Db | Trx,
  tenantId: string,
  rawEmail: string,
): Promise<{ id: string; name: string } | undefined> {
  const providers = await db
    .selectFrom("identity_provider")
    .select(["id", "name"])
    .where("tenant_id", "=", tenantId)
    .where("audience", "=", "end_users")
    .where("enabled", "=", true)
    .where("enforce", "=", true)
    .where("paused", "=", false)
    .execute();
  const domain = domainOfEmail(rawEmail.trim().toLowerCase());
  for (const provider of providers) {
    const domains = await provedDomains(db, provider.id);
    if (domains.size === 0 || (domain !== undefined && domains.has(domain))) return provider;
  }
  return undefined;
}

/** The providers a member with this email can sign in through. */
export async function memberProvidersFor(db: Db | Trx, rawEmail: string) {
  const domain = domainOfEmail(rawEmail.trim().toLowerCase());
  if (!domain) return [];
  return db
    .selectFrom("identity_provider")
    .innerJoin("identity_domain", "identity_domain.provider_id", "identity_provider.id")
    .select(["identity_provider.id", "identity_provider.name"])
    .where("identity_provider.audience", "=", "members")
    .where("identity_provider.enabled", "=", true)
    .where("identity_provider.paused", "=", false)
    .where("identity_domain.domain", "=", domain)
    .where("identity_domain.verified_at", "is not", null)
    .execute();
}

/** Refuses a password for an end user their tenant requires single sign-on of, and records it. */
export async function requireEndUserPasswordAllowed(
  db: Db,
  tenantId: string,
  email: string,
  actor: Actor,
): Promise<void> {
  const provider = await endUserPasswordRefusedBy(db, tenantId, email);
  if (!provider) return;
  await writeAudit(db, actor, {
    action: "sso.password_refused",
    targetType: "identity_provider",
    targetId: provider.id,
    tenantId,
    details: { identityProvider: provider.name, email: email.trim().toLowerCase() },
  });
  throw new HttpError(
    403,
    "sso_required",
    `Sign in with ${provider.name}. Passwords are turned off here.`,
  );
}
