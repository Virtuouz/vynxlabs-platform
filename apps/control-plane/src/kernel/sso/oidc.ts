import * as client from "openid-client";
import { readClaims } from "./claims.js";
import { type Asserted, SsoRefusal } from "./people.js";
import type { OidcConfig, Provider, ProviderSecrets } from "./providers.js";

type OidcProvider = Provider & { config: OidcConfig };

const HOUR = 3_600_000;
/** What each provider publishes about itself, kept for an hour, or until the provider is changed. */
const discovered = new Map<string, { key: string; at: number; config: client.Configuration }>();

async function configurationOf(
  provider: OidcProvider,
  secrets: ProviderSecrets,
): Promise<client.Configuration> {
  const key = `${provider.updatedAt.getTime()}:${secrets.clientSecret ? "s" : "p"}`;
  const kept = discovered.get(provider.id);
  if (kept && kept.key === key && Date.now() - kept.at < HOUR) return kept.config;
  const issuer = new URL(provider.config.issuer);
  const config = await client
    .discovery(
      issuer,
      provider.config.clientId,
      secrets.clientSecret,
      // Without a secret the client is a public one, and PKCE is what protects the exchange.
      secrets.clientSecret ? undefined : client.None(),
      {
        timeout: 10,
        ...(issuer.protocol === "http:" ? { execute: [client.allowInsecureRequests] } : {}),
      },
    )
    .catch((error: Error) => {
      throw new SsoRefusal(
        "provider_error",
        "The identity provider could not be reached. Try again in a moment.",
        `Reading ${provider.config.issuer}/.well-known/openid-configuration failed: ${error.message}`,
      );
    });
  // The library trusts an ID token that came straight from the token address over TLS, as
  // the specification allows. This has it check the signature against the published keys too.
  client.enableNonRepudiationChecks(config);
  if (discovered.size > 500) discovered.clear();
  discovered.set(provider.id, { key, at: Date.now(), config });
  return config;
}

/** Reads the provider's own description, to say now if the issuer is wrong. */
export async function checkOidc(provider: OidcProvider, secrets: ProviderSecrets): Promise<void> {
  discovered.delete(provider.id);
  await configurationOf(provider, secrets);
}

export interface OidcPending {
  nonce: string;
  verifier: string;
}

/** Where to send the browser, and what to keep for when it comes back. */
export async function oidcStart(
  provider: OidcProvider,
  secrets: ProviderSecrets,
  redirectUri: string,
  state: string,
): Promise<{ url: string; pending: OidcPending }> {
  const config = await configurationOf(provider, secrets);
  const verifier = client.randomPKCECodeVerifier();
  const nonce = client.randomNonce();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: provider.config.scopes.join(" "),
    state,
    nonce,
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  });
  return { url: url.toString(), pending: { nonce, verifier } };
}

/**
 * Exchanges the code the provider sent for an ID token, and checks the token:
 * its signature against the provider's published keys, its issuer, audience,
 * expiry and nonce. The library does each check. Nothing here loosens one.
 */
export async function oidcFinish(
  provider: OidcProvider,
  secrets: ProviderSecrets,
  redirectUri: string,
  query: URLSearchParams,
  state: string,
  pending: OidcPending,
): Promise<{ asserted: Asserted; received: Record<string, unknown> }> {
  const config = await configurationOf(provider, secrets);
  const current = new URL(redirectUri);
  current.search = query.toString();
  let claims: Record<string, unknown>;
  try {
    const tokens = await client.authorizationCodeGrant(config, current, {
      pkceCodeVerifier: pending.verifier,
      expectedState: state,
      expectedNonce: pending.nonce,
      idTokenExpected: true,
    });
    const token = tokens.claims();
    if (!token) throw new Error("no ID token came back");
    claims = { ...token };
    if (provider.config.userinfo) {
      const info = await client.fetchUserInfo(config, tokens.access_token, token.sub);
      // The ID token is signed. What it says wins over the user-info answer.
      claims = { ...info, ...claims };
    }
  } catch (error) {
    if (error instanceof client.AuthorizationResponseError) {
      throw new SsoRefusal(
        "provider_error",
        "The identity provider did not sign you in.",
        `The provider answered ${error.error}${error.error_description ? `: ${error.error_description}` : ""}.`,
      );
    }
    throw new SsoRefusal(
      "invalid_answer",
      "The identity provider's answer could not be accepted.",
      (error as Error).message,
    );
  }
  const names = provider.config.claims;
  const read = readClaims(claims, names, provider.config.attributes, {
    subject: ["sub"],
    email: ["email"],
    name: ["name", "preferred_username"],
    groups: ["groups"],
  });
  if (!read.subject) {
    throw new SsoRefusal("no_subject", "The identity provider did not say who you are.");
  }
  // The provider's word on an email only counts for the claim it was given about.
  const verified = names.email && names.email !== "email" ? undefined : claims.email_verified;
  return {
    asserted: {
      ...read,
      subject: read.subject,
      emailVerified:
        verified === true || verified === "true"
          ? true
          : verified === false || verified === "false"
            ? false
            : undefined,
    },
    received: claims,
  };
}
