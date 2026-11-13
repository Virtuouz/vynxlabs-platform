import { type CacheProvider, SAML, ValidateInResponseTo } from "@node-saml/node-saml";
import { readClaims } from "./claims.js";
import { elements, parseXml } from "./metadata.js";
import { type Asserted, SsoRefusal } from "./people.js";
import type { Provider, ProviderSecrets, SamlConfig } from "./providers.js";

type SamlProvider = Provider & { config: SamlConfig };

export const REQUEST_MINUTES = 10;
const TRANSIENT = "urn:oasis:names:tc:SAML:2.0:nameid-format:transient";
const EMAIL_FORMAT = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

export interface SamlAddresses {
  acs: string;
  entityId: string;
}

function samlFor(
  provider: SamlProvider,
  secrets: ProviderSecrets,
  addresses: SamlAddresses,
  cache: CacheProvider,
): SAML {
  const config = provider.config;
  return new SAML({
    entryPoint: config.entryPoint,
    issuer: addresses.entityId,
    callbackUrl: addresses.acs,
    idpCert: config.certificates,
    idpIssuer: config.idpIssuer,
    // An assertion made for another service is not one for this one.
    audience: addresses.entityId,
    // With both off the library still insists that one of the two is signed and valid.
    wantAssertionsSigned: config.signed === "assertion" || config.signed === "both",
    wantAuthnResponseSigned: config.signed === "response" || config.signed === "both",
    validateInResponseTo: config.allowIdpInitiated
      ? ValidateInResponseTo.ifPresent
      : ValidateInResponseTo.always,
    rejectReplayedAssertions: true,
    requestIdExpirationPeriodMs: REQUEST_MINUTES * 60_000,
    cacheProvider: cache,
    acceptedClockSkewMs: 60_000,
    maxAssertionAgeMs: 3_600_000,
    identifierFormat: config.nameIdFormat,
    // Asking for one way of signing in refuses people who signed in another, such as with a key.
    disableRequestedAuthnContext: true,
    ...(config.signRequests && secrets.privateKey
      ? {
          privateKey: secrets.privateKey,
          publicCert: config.spCertificate,
          signatureAlgorithm: "sha256" as const,
          digestAlgorithm: "sha256",
        }
      : {}),
    ...(secrets.privateKey ? { decryptionPvk: secrets.privateKey } : {}),
  });
}

/** A cache that never has anything, for making a request or metadata without a sign-in behind it. */
const NOTHING: CacheProvider = {
  saveAsync: async () => null,
  getAsync: async () => null,
  removeAsync: async () => null,
  consumeAsync: async () => null,
  saveIfAbsentAsync: async () => false,
};

/** What a provider's administrator loads to set this side up. */
export function samlMetadata(
  provider: SamlProvider,
  secrets: ProviderSecrets,
  addresses: SamlAddresses,
): string {
  const certificate = provider.config.spCertificate || null;
  return samlFor(provider, secrets, addresses, NOTHING).generateServiceProviderMetadata(
    certificate,
    provider.config.signRequests ? certificate : null,
  );
}

/** Where to send the browser, and the ID of the request, which the answer must name. */
export async function samlStart(
  provider: SamlProvider,
  secrets: ProviderSecrets,
  addresses: SamlAddresses,
  relayState: string,
): Promise<{ url: string; requestId: string }> {
  let requestId: string | undefined;
  const saml = samlFor(provider, secrets, addresses, {
    ...NOTHING,
    saveAsync: async (key, value) => {
      requestId = key;
      return { value, createdAt: Date.now() };
    },
  });
  const url = await saml.getAuthorizeUrlAsync(relayState, undefined, {});
  if (!requestId) throw new Error("The SAML request has no ID.");
  return { url, requestId };
}

/** Refuses SHA-1 anywhere in a document's signatures, unless the provider is allowed it. */
function refuseSha1(xml: string, what: string, allowed: boolean) {
  let root: ReturnType<typeof parseXml>;
  try {
    root = parseXml(xml, what);
  } catch (error) {
    throw new SsoRefusal(
      "invalid_answer",
      "The identity provider's answer could not be read.",
      (error as Error).message,
    );
  }
  if (allowed) return;
  // Only inside signatures: key transport for an encrypted assertion names a digest too.
  const signatures = elements(root, "Signature");
  for (const name of ["SignatureMethod", "DigestMethod"]) {
    for (const element of signatures.flatMap((signature) => elements(signature, name))) {
      const algorithm = (element.getAttribute?.("Algorithm") ?? "").toLowerCase();
      if (algorithm.endsWith("sha1") || algorithm.endsWith("md5")) {
        throw new SsoRefusal(
          "invalid_answer",
          "The identity provider's answer could not be accepted.",
          `${what} is signed with ${algorithm}, which is too weak. Set the provider to sign with SHA-256, or allow SHA-1 for it here.`,
        );
      }
    }
  }
}

const sameAddress = (a: string, b: string) => {
  try {
    return new URL(a).toString() === new URL(b).toString();
  } catch {
    return false;
  }
};

export interface SamlAnswer {
  asserted: Asserted;
  received: Record<string, unknown>;
  /** The request this answers. Absent when the provider began on its own. */
  inResponseTo: string | undefined;
}

/**
 * Checks a provider's posted answer. The library checks the signature against
 * the provider's certificates, the issuer, the audience, the validity window,
 * that the answer names a request this instance made and that request only
 * once, and that the assertion was not seen before. On top of that: no SHA-1,
 * and the recipient and destination must be this address.
 */
export async function samlFinish(
  provider: SamlProvider,
  secrets: ProviderSecrets,
  addresses: SamlAddresses,
  cache: CacheProvider,
  body: { SAMLResponse: string; RelayState?: string },
): Promise<SamlAnswer> {
  const config = provider.config;
  const xml = Buffer.from(body.SAMLResponse, "base64").toString("utf8");
  refuseSha1(xml, "The response", config.allowSha1);

  let profile: Awaited<ReturnType<SAML["validatePostResponseAsync"]>>["profile"];
  try {
    ({ profile } = await samlFor(provider, secrets, addresses, cache).validatePostResponseAsync({
      SAMLResponse: body.SAMLResponse,
    }));
  } catch (error) {
    const message = (error as Error).message;
    throw new SsoRefusal(
      /already been received/i.test(message) ? "replayed" : "invalid_answer",
      "The identity provider's answer could not be accepted.",
      message,
    );
  }
  if (!profile) {
    throw new SsoRefusal("invalid_answer", "The identity provider did not sign you in.");
  }

  const assertionXml = profile.getAssertionXml?.() ?? "";
  // An encrypted assertion's own signature could only be read once it was opened.
  refuseSha1(assertionXml, "The assertion", config.allowSha1);
  const assertion = parseXml(assertionXml, "The assertion");
  const recipients = elements(assertion, "SubjectConfirmationData")
    .map((data) => data.getAttribute?.("Recipient"))
    .filter((recipient): recipient is string => !!recipient);
  if (!recipients.some((recipient) => sameAddress(recipient, addresses.acs))) {
    throw new SsoRefusal(
      "invalid_answer",
      "The identity provider's answer could not be accepted.",
      `The assertion's recipient is ${recipients.join(", ") || "missing"}. It must be ${addresses.acs}.`,
    );
  }
  const destination = parseXml(xml, "The response").getAttribute?.("Destination");
  if (destination && !sameAddress(destination, addresses.acs)) {
    throw new SsoRefusal(
      "invalid_answer",
      "The identity provider's answer could not be accepted.",
      `The response's destination is ${destination}. It must be ${addresses.acs}.`,
    );
  }

  const attributes = (profile.attributes ?? {}) as Record<string, unknown>;
  const names = config.claims;
  const read = readClaims(attributes, names, config.attributes, {
    subject: [],
    email: [
      "email",
      "mail",
      "urn:oid:0.9.2342.19200300.100.1.3",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    ],
    name: [
      "name",
      "displayName",
      "urn:oid:2.16.840.1.113730.3.1.241",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    ],
    groups: [
      "groups",
      "memberOf",
      "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
      "http://schemas.xmlsoap.org/claims/Group",
    ],
  });
  let subject: string | undefined = read.subject;
  if (!names.subject) {
    if (profile.nameIDFormat === TRANSIENT) {
      throw new SsoRefusal(
        "no_subject",
        "The identity provider did not say who you are in a way that lasts.",
        "The name ID is transient: a new one every sign-in. Set the provider to send a persistent name ID, or name an attribute to use as the subject.",
      );
    }
    subject = profile.nameID || undefined;
  }
  if (!subject) {
    throw new SsoRefusal("no_subject", "The identity provider did not say who you are.");
  }
  const nameIdIsEmail =
    profile.nameIDFormat === EMAIL_FORMAT || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.nameID);
  return {
    asserted: {
      ...read,
      subject,
      email: read.email ?? (!names.email && nameIdIsEmail ? profile.nameID : undefined),
      emailVerified: undefined,
    },
    received: { nameID: profile.nameID, nameIDFormat: profile.nameIDFormat, ...attributes },
    inResponseTo: typeof profile.inResponseTo === "string" ? profile.inResponseTo : undefined,
  };
}
