import { X509Certificate } from "node:crypto";
import { newId } from "@vynxlabs/db";
import { generate } from "selfsigned";
import { portalUrl } from "../apps/address.js";
import type { Audit, Db, Trx } from "../audit.js";
import { badRequest, conflict, HttpError, notFound } from "../errors.js";
import { decryptFor, encryptFor } from "../execution/bindings.js";
import type { Kernel } from "../kernel.js";
import { readIdpMetadata } from "./metadata.js";

export type Audience = "members" | "end_users";
export type Protocol = "oidc" | "saml";

/** Which claim, or SAML attribute, holds each thing. Empty means the usual names are tried. */
export interface ClaimNames {
  subject?: string;
  email?: string;
  name?: string;
  groups?: string;
}

interface Common {
  claims: ClaimNames;
  /** End users only: an attribute of the person here, and the claim it is read from. */
  attributes: Record<string, string>;
  /**
   * End users only. Lets a first sign-in take over an account that already has
   * the same email, on the provider's word alone that the email is verified.
   */
  trustEmail: boolean;
}

export interface OidcConfig extends Common {
  issuer: string;
  clientId: string;
  scopes: string[];
  /** Also read the provider's user-info address, for claims it leaves out of the ID token. */
  userinfo: boolean;
}

export type SamlSigned = "either" | "assertion" | "response" | "both";

export interface SamlConfig extends Common {
  /** Where sign-in requests are sent. */
  entryPoint: string;
  /** The provider's entity ID. Every assertion must come from it. */
  idpIssuer: string;
  /** The provider's signing certificates. Several, so that one can be replaced without a gap. */
  certificates: string[];
  /** What must carry a signature. With `either`, one of the two always does. */
  signed: SamlSigned;
  /** Sign the requests sent to the provider. On unless turned off. */
  signRequests: boolean;
  /**
   * Publish this side's certificate for encrypting assertions, so that a provider set up
   * from the metadata encrypts them. An encrypted assertion is opened whether or not this is on.
   */
  encryptAssertions: boolean;
  /** Accept SHA-1 in signatures. Off unless a provider can do no better. */
  allowSha1: boolean;
  /** Accept an answer nobody here asked for. */
  allowIdpInitiated: boolean;
  nameIdFormat: string | null;
  /** This side's certificate, for signed requests and encrypted assertions. Public. */
  spCertificate: string;
}

export interface Provider {
  id: string;
  tenantId: string | null;
  audience: Audience;
  protocol: Protocol;
  name: string;
  config: OidcConfig | SamlConfig;
  hasSecret: boolean;
  enabled: boolean;
  enforce: boolean;
  provision: boolean;
  defaultRoleId: string | null;
  lastTest: Record<string, unknown> | null;
  paused: boolean;
  scim: ScimSettings;
  createdAt: Date;
  updatedAt: Date;
}

/** How a provider's pushes over SCIM are taken. */
export interface ScimSettings {
  /**
   * The pushed field that holds the name the provider signs the person in by. With one
   * set, a pushed person is tied to the provider at once. With none, their first sign-in
   * ties them, under the rules for any first sign-in.
   */
  subjectFrom: "externalId" | "userName" | null;
  /** Whether a person's groups come from what is pushed, in place of what a sign-in says. */
  groups: "sign_in" | "scim";
  /** Make a group here for a pushed group that nothing maps yet. */
  createGroups: boolean;
}

export function scimSettings(raw: unknown): ScimSettings {
  const given = (raw ?? {}) as Partial<ScimSettings>;
  return {
    subjectFrom:
      given.subjectFrom === "externalId" || given.subjectFrom === "userName"
        ? given.subjectFrom
        : null,
    groups: given.groups === "scim" ? "scim" : "sign_in",
    createGroups: given.createGroups === true,
  };
}

export const isOidc = (
  provider: Provider,
): provider is Provider & { protocol: "oidc"; config: OidcConfig } => provider.protocol === "oidc";
export const isSaml = (
  provider: Provider,
): provider is Provider & { protocol: "saml"; config: SamlConfig } => provider.protocol === "saml";

interface Row {
  id: string;
  tenant_id: string | null;
  audience: Audience;
  protocol: Protocol;
  name: string;
  config: Record<string, unknown>;
  secrets: Buffer | null;
  enabled: boolean;
  enforce: boolean;
  provision: boolean;
  default_role_id: string | null;
  last_test: Record<string, unknown> | null;
  paused: boolean;
  scim: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const toProvider = (row: Row): Provider => ({
  id: row.id,
  tenantId: row.tenant_id,
  audience: row.audience,
  protocol: row.protocol,
  name: row.name,
  config: row.config as unknown as OidcConfig | SamlConfig,
  hasSecret: row.secrets !== null,
  enabled: row.enabled,
  enforce: row.enforce,
  provision: row.provision,
  defaultRoleId: row.default_role_id,
  lastTest: row.last_test,
  paused: row.paused,
  scim: scimSettings(row.scim),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** A provider by ID. `tenantId` narrows it to one tenant's, or with null to the instance's. */
export async function findProvider(
  db: Db | Trx,
  id: string,
  tenantId?: string | null,
): Promise<Provider | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  let select = db.selectFrom("identity_provider").selectAll().where("id", "=", id);
  if (tenantId === null) select = select.where("tenant_id", "is", null);
  else if (tenantId !== undefined) select = select.where("tenant_id", "=", tenantId);
  const row = await select.executeTakeFirst();
  return row ? toProvider(row) : undefined;
}

export async function listProviders(db: Db | Trx, tenantId: string | null): Promise<Provider[]> {
  let select = db.selectFrom("identity_provider").selectAll();
  select =
    tenantId === null
      ? select.where("tenant_id", "is", null)
      : select.where("tenant_id", "=", tenantId);
  return (await select.orderBy("created_at").orderBy("id").execute()).map(toProvider);
}

/** Whether a provider signs people in now. */
export const isLive = (provider: Provider) => provider.enabled && !provider.paused;

// ----- Secrets -----

export interface ProviderSecrets {
  clientSecret?: string;
  privateKey?: string;
}

const secretName = (id: string) => `sso:${id}`;

async function sealSecrets(
  kernel: Kernel,
  db: Db | Trx,
  provider: { id: string; tenantId: string | null },
  secrets: ProviderSecrets,
): Promise<Buffer> {
  const text = JSON.stringify(secrets);
  return provider.tenantId === null
    ? kernel.vault.sealForInstance(secretName(provider.id), text)
    : encryptFor(kernel, db, provider.tenantId, provider.tenantId, secretName(provider.id), text);
}

/** A provider's secrets, opened. For use, never for sending anywhere. */
export async function openSecrets(
  kernel: Kernel,
  db: Db | Trx,
  provider: { id: string; tenantId: string | null },
): Promise<ProviderSecrets> {
  const row = await db
    .selectFrom("identity_provider")
    .select("secrets")
    .where("id", "=", provider.id)
    .executeTakeFirst();
  if (!row?.secrets) return {};
  const text =
    provider.tenantId === null
      ? kernel.vault.openForInstance(secretName(provider.id), row.secrets)
      : await decryptFor(
          kernel,
          db,
          provider.tenantId,
          provider.tenantId,
          secretName(provider.id),
          row.secrets,
        );
  return JSON.parse(text) as ProviderSecrets;
}

// ----- Addresses -----

/** The addresses a provider's administrator is given. They never change for a provider. */
export function addressesOf(
  kernel: Kernel,
  provider: { id: string; audience: Audience },
  tenantSlug: string | null,
) {
  const base =
    provider.audience === "members" || tenantSlug === null
      ? `${kernel.hosts.mainOrigin}/api/v1/sso/${provider.id}`
      : `${portalUrl(kernel, tenantSlug)}/sso/${provider.id}`;
  return {
    start: `${base}/start`,
    /** OIDC: the redirect address. */
    callback: `${base}/callback`,
    /** SAML: where the provider posts its answer. */
    acs: `${base}/acs`,
    /** SAML: this side's metadata, and its entity ID. */
    metadata: `${base}/metadata`,
    entityId: `${base}/metadata`,
  };
}

export async function slugOf(db: Db | Trx, tenantId: string | null): Promise<string | null> {
  if (tenantId === null) return null;
  const tenant = await db
    .selectFrom("tenant")
    .select("slug")
    .where("id", "=", tenantId)
    .executeTakeFirst();
  return tenant?.slug ?? null;
}

// ----- Saving -----

const CLAIM = /^[\x21-\x7e][\x20-\x7e]{0,199}$/;
const ATTRIBUTE = /^[a-z][a-z0-9_]{0,62}$/;

const issue = (path: string, message: string) =>
  badRequest(`The provider's settings are not right: ${path.slice(1)} ${message}.`, [
    { path, message },
  ]);

function cleanUrl(kernel: Kernel, raw: unknown, path: string): string {
  let url: URL;
  try {
    url = new URL(String(raw ?? ""));
  } catch {
    throw issue(path, "must be an address");
  }
  // A plain-HTTP provider is for an instance that is itself on plain HTTP: someone trying it out.
  const devInstance = kernel.hosts.mainOrigin.startsWith("http://");
  if (url.protocol !== "https:" && !(devInstance && url.protocol === "http:")) {
    throw issue(path, "must be an https address");
  }
  if (url.username || url.password) throw issue(path, "must not carry a user name or password");
  return url.toString();
}

function cleanCommon(input: Record<string, unknown>, audience: Audience): Common {
  const claims: ClaimNames = {};
  const given = (input.claims ?? {}) as Record<string, unknown>;
  for (const key of ["subject", "email", "name", "groups"] as const) {
    const value = given[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !CLAIM.test(value)) {
      throw issue(`/claims/${key}`, "must be the name of a claim");
    }
    claims[key] = value;
  }
  const attributes: Record<string, string> = {};
  for (const [name, claim] of Object.entries((input.attributes ?? {}) as Record<string, unknown>)) {
    if (audience !== "end_users") {
      throw issue("/attributes", "can only be set for a provider of end users");
    }
    if (!ATTRIBUTE.test(name)) throw issue(`/attributes/${name}`, "is not a valid attribute name");
    if (typeof claim !== "string" || !CLAIM.test(claim)) {
      throw issue(`/attributes/${name}`, "must be the name of a claim");
    }
    attributes[name] = claim;
  }
  if (Object.keys(attributes).length > 50) throw issue("/attributes", "has more than 50 entries");
  if (input.trustEmail === true && audience !== "end_users") {
    throw issue("/trustEmail", "can only be set for a provider of end users");
  }
  return { claims, attributes, trustEmail: input.trustEmail === true };
}

/** One certificate as PEM, whether it was pasted as PEM or as the bare base64 of metadata. */
export function cleanCertificate(raw: string, path: string): string {
  const body = raw
    .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
  const pem = `-----BEGIN CERTIFICATE-----\n${(body.match(/.{1,64}/g) ?? []).join("\n")}\n-----END CERTIFICATE-----\n`;
  try {
    new X509Certificate(pem);
  } catch {
    throw issue(path, "is not an X.509 certificate");
  }
  return pem;
}

async function cleanConfig(
  kernel: Kernel,
  protocol: Protocol,
  audience: Audience,
  input: Record<string, unknown>,
  existing: OidcConfig | SamlConfig | undefined,
): Promise<OidcConfig | SamlConfig> {
  const merged = { ...(existing ?? {}), ...input } as Record<string, unknown>;
  const common = cleanCommon(merged, audience);
  if (protocol === "oidc") {
    const clientId = merged.clientId;
    if (typeof clientId !== "string" || clientId === "" || clientId.length > 500) {
      throw issue("/clientId", "is needed");
    }
    const scopes = (merged.scopes as unknown[] | undefined) ?? ["openid", "email", "profile"];
    if (
      !Array.isArray(scopes) ||
      scopes.length > 20 ||
      scopes.some(
        (scope) => typeof scope !== "string" || !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(scope),
      )
    ) {
      throw issue("/scopes", "must be a list of scope names");
    }
    const list = scopes as string[];
    return {
      ...common,
      issuer: cleanUrl(kernel, merged.issuer, "/issuer").replace(/\/$/, ""),
      clientId,
      scopes: list.includes("openid") ? list : ["openid", ...list],
      userinfo: merged.userinfo === true,
    };
  }

  // The provider's own metadata, when given, fills in what it describes.
  let described: Awaited<ReturnType<typeof readIdpMetadata>> | undefined;
  if (typeof input.metadataXml === "string" || typeof input.metadataUrl === "string") {
    described = await readIdpMetadata(
      typeof input.metadataXml === "string"
        ? { xml: input.metadataXml }
        : { url: cleanUrl(kernel, input.metadataUrl, "/metadataUrl") },
    );
  }
  const certificates = (
    (input.certificates as unknown[] | undefined) ??
    described?.certificates ??
    (merged.certificates as unknown[] | undefined) ??
    []
  ).map((certificate, index) => cleanCertificate(String(certificate), `/certificates/${index}`));
  if (certificates.length === 0) throw issue("/certificates", "needs at least one certificate");
  if (certificates.length > 10) throw issue("/certificates", "has more than 10 certificates");
  const signed = (merged.signed ?? "either") as SamlSigned;
  if (!["either", "assertion", "response", "both"].includes(signed)) {
    throw issue("/signed", "must be either, assertion, response or both");
  }
  const idpIssuer = String(input.idpIssuer ?? described?.issuer ?? merged.idpIssuer ?? "");
  if (idpIssuer === "" || idpIssuer.length > 1000) throw issue("/idpIssuer", "is needed");
  const nameIdFormat = merged.nameIdFormat;
  if (
    nameIdFormat !== undefined &&
    nameIdFormat !== null &&
    (typeof nameIdFormat !== "string" || !/^urn:[\x21-\x7e]{1,200}$/.test(nameIdFormat))
  ) {
    throw issue("/nameIdFormat", "must be a name-ID format");
  }
  return {
    ...common,
    entryPoint: cleanUrl(
      kernel,
      input.entryPoint ?? described?.entryPoint ?? merged.entryPoint,
      "/entryPoint",
    ),
    idpIssuer,
    certificates,
    signed,
    // On unless turned off: a provider set up from this side's metadata expects it, and one
    // that does not check signatures is not troubled by one.
    signRequests: merged.signRequests !== false,
    encryptAssertions: merged.encryptAssertions === true,
    allowSha1: merged.allowSha1 === true,
    allowIdpInitiated: merged.allowIdpInitiated === true,
    nameIdFormat: (nameIdFormat as string | null | undefined) ?? null,
    spCertificate: (existing as SamlConfig | undefined)?.spCertificate ?? "",
  };
}

/** A key and a certificate of this side's own, for one SAML provider. */
async function newSamlKey(): Promise<{ privateKey: string; certificate: string }> {
  const made = await generate([{ name: "commonName", value: "Vynxlabs platform" }], {
    keySize: 2048,
    algorithm: "sha256",
    notAfterDate: new Date(Date.now() + 10 * 365 * 86_400_000),
  });
  return { privateKey: made.private, certificate: made.cert };
}

export interface ProviderInput {
  name?: string;
  config?: Record<string, unknown>;
  /** OIDC. Leave out to keep the one stored. */
  clientSecret?: string;
  enabled?: boolean;
  enforce?: boolean;
  provision?: boolean;
  defaultRoleId?: string | null;
}

async function checkRole(trx: Trx, tenantId: string | null, roleId: string | null) {
  if (roleId === null) return;
  const role = await trx
    .selectFrom("role")
    .select(["id", "tenant_id", "workspace_id"])
    .where("id", "=", roleId)
    .executeTakeFirst();
  // A built-in role, or one of the tenant's own that is not tied to a workspace.
  const usable =
    role &&
    role.workspace_id === null &&
    (role.tenant_id === null || (tenantId !== null && role.tenant_id === tenantId));
  if (!usable) throw issue("/defaultRoleId", "is not a role that can be given here");
}

/** What must hold before a provider signs anyone in. */
async function checkCanEnable(trx: Trx, provider: Provider) {
  if (!provider.enabled) return;
  if (provider.audience === "members") {
    const proved = await trx
      .selectFrom("identity_domain")
      .select("id")
      .where("provider_id", "=", provider.id)
      .where("verified_at", "is not", null)
      .executeTakeFirst();
    if (!proved) {
      throw new HttpError(
        409,
        "domain_needed",
        "Prove at least one email domain before turning this provider on. Members are signed in only by an email in a domain the provider has proved.",
      );
    }
  }
  if (isOidc(provider) && !provider.hasSecret) {
    throw new HttpError(409, "secret_needed", "Give the client secret before turning this on.");
  }
}

export async function createProvider(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  where: { tenantId: string | null; audience: Audience; protocol: Protocol },
  input: ProviderInput & { name: string },
): Promise<Provider> {
  if (where.tenantId === null && where.audience !== "members") {
    throw badRequest("A provider of the instance signs in members.");
  }
  if (input.enabled || input.enforce) {
    // A provider is made off: it has no domain yet, and nobody has tried it.
    throw badRequest("A provider is created off. Try it, then turn it on.");
  }
  const id = newId();
  const config = await cleanConfig(
    kernel,
    where.protocol,
    where.audience,
    input.config ?? {},
    undefined,
  );
  const secrets: ProviderSecrets = {};
  if (where.protocol === "saml") {
    const key = await newSamlKey();
    (config as SamlConfig).spCertificate = key.certificate;
    secrets.privateKey = key.privateKey;
  } else if (input.clientSecret) secrets.clientSecret = input.clientSecret;
  await checkRole(trx, where.tenantId, input.defaultRoleId ?? null);
  const row = await trx
    .insertInto("identity_provider")
    .values({
      id,
      tenant_id: where.tenantId,
      audience: where.audience,
      protocol: where.protocol,
      name: input.name.trim(),
      config: JSON.stringify(config),
      secrets:
        Object.keys(secrets).length > 0
          ? await sealSecrets(kernel, trx, { id, tenantId: where.tenantId }, secrets)
          : null,
      provision: input.provision ?? false,
      default_role_id: input.defaultRoleId ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const provider = toProvider(row);
  await audit({
    action: "identity_provider.created",
    targetType: "identity_provider",
    targetId: id,
    tenantId: where.tenantId,
    details: { name: provider.name, audience: where.audience, protocol: where.protocol },
  });
  return provider;
}

export async function updateProvider(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  current: Provider,
  input: ProviderInput,
): Promise<Provider> {
  const config =
    input.config === undefined
      ? current.config
      : await cleanConfig(kernel, current.protocol, current.audience, input.config, current.config);
  if (input.defaultRoleId !== undefined) {
    await checkRole(trx, current.tenantId, input.defaultRoleId);
  }
  let sealed: Buffer | undefined;
  if (input.clientSecret !== undefined) {
    if (current.protocol !== "oidc") throw badRequest("Only an OIDC provider has a client secret.");
    sealed = await sealSecrets(kernel, trx, current, { clientSecret: input.clientSecret });
  }
  const enabled = input.enabled ?? current.enabled;
  // Turning a provider off stops it being required too.
  const enforce = input.enforce ?? (enabled ? current.enforce : false);
  if (enforce && !enabled) {
    throw badRequest("Single sign-on can only be required through a provider that is on.");
  }
  const row = await trx
    .updateTable("identity_provider")
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      config: JSON.stringify(config),
      ...(sealed ? { secrets: sealed } : {}),
      enabled,
      enforce,
      ...(input.provision !== undefined ? { provision: input.provision } : {}),
      ...(input.defaultRoleId !== undefined ? { default_role_id: input.defaultRoleId } : {}),
      // Saving is how someone says the provider has this instance's addresses.
      paused: false,
      updated_at: new Date(),
    })
    .where("id", "=", current.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  const provider = toProvider(row);
  await checkCanEnable(trx, provider);

  const sha1 = (value: OidcConfig | SamlConfig) => (value as SamlConfig).allowSha1 === true;
  const unasked = (value: OidcConfig | SamlConfig) =>
    (value as SamlConfig).allowIdpInitiated === true;
  await audit({
    action: "identity_provider.updated",
    targetType: "identity_provider",
    targetId: provider.id,
    tenantId: provider.tenantId,
    details: {
      name: provider.name,
      enabled: provider.enabled,
      enforce: provider.enforce,
      provision: provider.provision,
      secretChanged: sealed !== undefined,
      ...(current.paused ? { resumed: true } : {}),
    },
  });
  // Each of these lowers the bar or changes who may sign in how, so each is its own entry.
  const notable: [boolean, string, Record<string, unknown>][] = [
    [current.enabled !== provider.enabled, provider.enabled ? "enabled" : "disabled", {}],
    [
      current.enforce !== provider.enforce,
      provider.enforce ? "enforced" : "enforcement_lifted",
      {},
    ],
    [
      sha1(current.config) !== sha1(provider.config),
      sha1(provider.config) ? "sha1_allowed" : "sha1_refused",
      {},
    ],
    [
      unasked(current.config) !== unasked(provider.config),
      unasked(provider.config) ? "idp_initiated_allowed" : "idp_initiated_refused",
      {},
    ],
  ];
  for (const [changed, what, details] of notable) {
    if (!changed) continue;
    await audit({
      action: `identity_provider.${what}`,
      targetType: "identity_provider",
      targetId: provider.id,
      tenantId: provider.tenantId,
      details: { name: provider.name, ...details },
    });
  }
  return provider;
}

export async function deleteProvider(trx: Trx, audit: Audit, provider: Provider) {
  await trx.deleteFrom("identity_provider").where("id", "=", provider.id).execute();
  await audit({
    action: "identity_provider.deleted",
    targetType: "identity_provider",
    targetId: provider.id,
    tenantId: provider.tenantId,
    details: { name: provider.name, audience: provider.audience, protocol: provider.protocol },
  });
}

// ----- Domains -----

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function cleanDomain(raw: string): string {
  const domain = raw.trim().toLowerCase().replace(/^@/, "");
  if (!DOMAIN.test(domain)) {
    throw badRequest("That is not an email domain.", [
      { path: "/domain", message: "must be a domain such as example.com" },
    ]);
  }
  return domain;
}

/** The part of an email after the at sign, or undefined. */
export function domainOfEmail(email: string): string | undefined {
  const at = email.lastIndexOf("@");
  return at > 0 && at < email.length - 1 ? email.slice(at + 1).toLowerCase() : undefined;
}

export async function addDomain(trx: Trx, audit: Audit, provider: Provider, raw: string) {
  const domain = cleanDomain(raw);
  const taken = await trx
    .selectFrom("identity_domain")
    .select("id")
    .where("provider_id", "=", provider.id)
    .where("domain", "=", domain)
    .executeTakeFirst();
  if (taken) throw conflict("That domain is already listed for this provider.");
  const row = await trx
    .insertInto("identity_domain")
    .values({
      id: newId(),
      provider_id: provider.id,
      tenant_id: provider.tenantId,
      audience: provider.audience,
      domain,
      // Whoever runs the instance answers for its own providers. There is nobody to prove it to.
      verified_at: provider.tenantId === null ? new Date() : null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
    .catch((error: { code?: string }) => {
      if (error.code === "23505") throw domainTaken(domain);
      throw error;
    });
  await audit({
    action: "identity_domain.added",
    targetType: "identity_domain",
    targetId: row.id,
    tenantId: provider.tenantId,
    details: { domain, provider: provider.name },
  });
  return row;
}

export const domainTaken = (domain: string) =>
  new HttpError(
    409,
    "domain_taken",
    `Another provider of members has already proved ${domain}. A domain of members belongs to one provider on the whole instance.`,
  );

export async function findDomain(db: Db | Trx, provider: Provider, id: string) {
  const row = await db
    .selectFrom("identity_domain")
    .selectAll()
    .where("id", "=", id)
    .where("provider_id", "=", provider.id)
    .executeTakeFirst();
  if (!row) throw notFound("The domain");
  return row;
}

/** The domains a provider has proved. */
export async function provedDomains(db: Db | Trx, providerId: string): Promise<Set<string>> {
  const rows = await db
    .selectFrom("identity_domain")
    .select("domain")
    .where("provider_id", "=", providerId)
    .where("verified_at", "is not", null)
    .execute();
  return new Set(rows.map((row) => row.domain));
}
