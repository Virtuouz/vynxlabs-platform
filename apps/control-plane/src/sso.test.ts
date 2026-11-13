import {
  createHash,
  createSign,
  generateKeyPairSync,
  type KeyObject,
  randomUUID,
} from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { inflateRawSync } from "node:zlib";
import { generate } from "selfsigned";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { SignedXml } from "xml-crypto";
import { encrypt } from "xml-encryption";
import { dns } from "./kernel/apps/challenge.js";
import { ADMIN, type Client, startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";
const MAIN = "localhost:8080";
const ORIGIN = `http://${MAIN}`;
const SHOP = "shop.acme.test";

let t: TestApp;
let tenant: string;
let alice: Client;
let roles: Record<string, string>;
/** What DNS answers in these tests. */
const txt = new Map<string, string>();

// ----- A browser -----

/** A browser at one address: it keeps the cookies it is given and sends them back there. */
function browser(host = MAIN) {
  const jar = new Map<string, string>();
  const call = async (
    method: "GET" | "POST",
    url: string,
    options: { json?: unknown; form?: Record<string, string>; origin?: string } = {},
  ) => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    const response = await t.app.inject({
      method,
      url,
      headers: {
        host,
        ...(cookie ? { cookie } : {}),
        ...(method !== "GET" ? { origin: options.origin ?? `http://${host}` } : {}),
        ...(options.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(options.json !== undefined ? { payload: options.json as object } : {}),
      ...(options.form ? { payload: new URLSearchParams(options.form).toString() } : {}),
    });
    for (const line of ([] as string[]).concat(response.headers["set-cookie"] ?? [])) {
      const [pair = ""] = line.split(";");
      const at = pair.indexOf("=");
      const value = pair.slice(at + 1);
      if (value === "" || /max-age=0/i.test(line)) jar.delete(pair.slice(0, at));
      else jar.set(pair.slice(0, at), value);
    }
    let body: Any = response.body;
    if ((response.headers["content-type"] ?? "").toString().includes("json")) {
      body = response.json();
    }
    return {
      status: response.statusCode,
      body,
      location: response.headers.location as string | undefined,
    };
  };
  return {
    jar,
    get: (url: string) => call("GET", url),
    post: (url: string, json: unknown) => call("POST", url, { json }),
    /** A form posted from a page of this address, or of another site. */
    form: (url: string, form: Record<string, string>, origin?: string) =>
      call("POST", url, { form, ...(origin ? { origin } : {}) }),
    /** Who the console would say is signed in. */
    async member(): Promise<string | null> {
      const session = await call("GET", "/api/v1/auth/get-session");
      return session.body?.user?.email ?? null;
    },
  };
}
type Browser = ReturnType<typeof browser>;

/** The path and query of an address at this instance. */
const local = (url: string) => {
  const parsed = new URL(url, ORIGIN);
  return `${parsed.pathname}${parsed.search}`;
};

async function audit(action: string): Promise<Any[]> {
  return (
    await t.db
      .selectFrom("audit_entry")
      .select(["action", "details", "target_id", "actor_type", "actor_id"])
      .where("action", "=", action)
      .orderBy("id")
      .execute()
  ).map((row) => ({ ...row, details: row.details }));
}

// ----- An OIDC provider -----

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");

/** A small OIDC provider. What it puts in the next ID token can be bent, to see it refused. */
class OidcProvider {
  readonly keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  readonly stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });
  readonly clientId = "vynx-console";
  readonly clientSecret = "oidc-secret-71c0";
  issuer = "";
  #server!: Server;
  readonly #codes = new Map<
    string,
    { nonce: string; challenge: string; redirectUri: string; claims: Record<string, unknown> }
  >();
  /** Changes to the next token only. */
  bend: { nonce?: string; audience?: string; issuer?: string; key?: KeyObject; expired?: boolean } =
    {};
  /** What the token address saw last. */
  seen: { verifierMatched?: boolean; secret?: string | null } = {};

  async start() {
    this.#server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", this.issuer);
      const json = (status: number, body: unknown) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      };
      if (url.pathname === "/.well-known/openid-configuration") {
        return json(200, {
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/authorize`,
          token_endpoint: `${this.issuer}/token`,
          jwks_uri: `${this.issuer}/jwks`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["client_secret_post"],
        });
      }
      if (url.pathname === "/jwks") {
        return json(200, {
          keys: [{ ...this.keys.publicKey.export({ format: "jwk" }), kid: "k1", use: "sig" }],
        });
      }
      if (url.pathname === "/token" && request.method === "POST") {
        const chunks: Buffer[] = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => {
          const form = new URLSearchParams(Buffer.concat(chunks).toString());
          const pending = this.#codes.get(form.get("code") ?? "");
          this.#codes.delete(form.get("code") ?? "");
          const challenge = createHash("sha256")
            .update(form.get("code_verifier") ?? "")
            .digest("base64url");
          this.seen = {
            verifierMatched: pending?.challenge === challenge,
            secret: form.get("client_secret"),
          };
          if (
            !pending ||
            pending.challenge !== challenge ||
            form.get("client_secret") !== this.clientSecret ||
            form.get("redirect_uri") !== pending.redirectUri
          ) {
            return json(400, { error: "invalid_grant" });
          }
          const bend = this.bend;
          this.bend = {};
          const now = Math.floor(Date.now() / 1000);
          const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "k1" }));
          const payload = b64(
            JSON.stringify({
              iss: bend.issuer ?? this.issuer,
              aud: bend.audience ?? this.clientId,
              iat: bend.expired ? now - 7200 : now,
              exp: bend.expired ? now - 3600 : now + 300,
              nonce: bend.nonce ?? pending.nonce,
              ...pending.claims,
            }),
          );
          const signature = createSign("RSA-SHA256")
            .update(`${header}.${payload}`)
            .sign(bend.key ?? this.keys.privateKey);
          return json(200, {
            access_token: "at",
            token_type: "Bearer",
            expires_in: 300,
            id_token: `${header}.${payload}.${b64(signature)}`,
          });
        });
        return;
      }
      json(404, {});
    });
    await new Promise<void>((resolve) => this.#server.listen(0, "127.0.0.1", resolve));
    this.issuer = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  stop() {
    return new Promise((resolve) => this.#server.close(resolve));
  }

  /** The person signs in at the provider. Answers with where the browser is sent back to. */
  approve(authorizeUrl: string, claims: Record<string, unknown>): string {
    const asked = new URL(authorizeUrl);
    expect(asked.origin).toBe(this.issuer);
    expect(asked.searchParams.get("response_type")).toBe("code");
    expect(asked.searchParams.get("code_challenge_method")).toBe("S256");
    expect(asked.searchParams.get("client_id")).toBe(this.clientId);
    const code = randomUUID();
    const redirectUri = asked.searchParams.get("redirect_uri") as string;
    this.#codes.set(code, {
      nonce: asked.searchParams.get("nonce") as string,
      challenge: asked.searchParams.get("code_challenge") as string,
      redirectUri,
      claims,
    });
    const back = new URL(redirectUri);
    back.searchParams.set("code", code);
    back.searchParams.set("state", asked.searchParams.get("state") as string);
    return back.toString();
  }
}

// ----- A SAML provider -----

const SHA256 = {
  signature: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  digest: "http://www.w3.org/2001/04/xmlenc#sha256",
};
const SHA1 = {
  signature: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  digest: "http://www.w3.org/2000/09/xmldsig#sha1",
};
const C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";

interface SamlOptions {
  inResponseTo?: string | undefined;
  nameId?: string;
  nameIdFormat?: string;
  attributes?: Record<string, string | string[]>;
  /** What carries a signature. */
  sign?: "assertion" | "response" | "none";
  sha1?: boolean;
  audience?: string;
  recipient?: string;
  destination?: string;
  issuer?: string;
  /** Seconds from now that the assertion stops being good. Negative for one that has run out. */
  goodFor?: number;
  key?: string;
  /** Changes the document after it was signed. */
  after?: (xml: string) => string;
  /** This side's certificate, to encrypt the assertion for. */
  encryptFor?: string;
}

class SamlProvider {
  key = "";
  certificate = "";
  strangerKey = "";
  readonly entityId = "https://idp.acme.test/saml";
  readonly entryPoint = "https://idp.acme.test/saml/sso";

  async start() {
    const made = await generate([{ name: "commonName", value: "idp" }], {
      keySize: 2048,
      algorithm: "sha256",
    });
    this.key = made.private;
    this.certificate = made.cert;
    this.strangerKey = (
      await generate([{ name: "commonName", value: "x" }], { keySize: 2048, algorithm: "sha256" })
    ).private;
  }

  get metadata() {
    const body = this.certificate.replace(/-----[A-Z ]+-----|\s/g, "");
    return `<?xml version="1.0"?><md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${this.entityId}"><md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>${body}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.acme.test/saml/post"/><md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="${this.entryPoint}"/></md:IDPSSODescriptor></md:EntityDescriptor>`;
  }

  /** Reads the request the platform sent the browser here with. */
  read(redirect: string): { id: string; relayState: string; acs: string; xml: string } {
    const url = new URL(redirect);
    expect(`${url.origin}${url.pathname}`).toBe(this.entryPoint);
    const xml = inflateRawSync(
      Buffer.from(url.searchParams.get("SAMLRequest") as string, "base64"),
    ).toString("utf8");
    return {
      id: /\bID="([^"]+)"/.exec(xml)?.[1] as string,
      acs: /AssertionConsumerServiceURL="([^"]+)"/.exec(xml)?.[1] as string,
      relayState: url.searchParams.get("RelayState") as string,
      xml,
    };
  }

  /** The provider's answer, as the value of the form field the browser posts. */
  async respond(acs: string, audience: string, options: SamlOptions = {}): Promise<string> {
    const now = Date.now();
    const instant = new Date(now).toISOString();
    const until = new Date(now + (options.goodFor ?? 300) * 1000).toISOString();
    const before = new Date(now - 60_000).toISOString();
    const issuer = options.issuer ?? this.entityId;
    const answers = options.inResponseTo ? ` InResponseTo="${options.inResponseTo}"` : "";
    const attributes = Object.entries(options.attributes ?? {})
      .map(
        ([name, value]) =>
          `<saml:Attribute Name="${name}">${([] as string[])
            .concat(value)
            .map((one) => `<saml:AttributeValue>${one}</saml:AttributeValue>`)
            .join("")}</saml:Attribute>`,
      )
      .join("");
    const assertion = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a${randomUUID()}" Version="2.0" IssueInstant="${instant}"><saml:Issuer>${issuer}</saml:Issuer><saml:Subject><saml:NameID Format="${
      options.nameIdFormat ?? "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent"
    }">${options.nameId ?? "subject-1"}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${until}" Recipient="${
      options.recipient ?? acs
    }"${answers}/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${before}" NotOnOrAfter="${until}"><saml:AudienceRestriction><saml:Audience>${
      options.audience ?? audience
    }</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${instant}" SessionIndex="_s1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>${
      attributes ? `<saml:AttributeStatement>${attributes}</saml:AttributeStatement>` : ""
    }</saml:Assertion>`;
    const wrap = (inner: string) =>
      `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_r${randomUUID()}" Version="2.0" IssueInstant="${instant}" Destination="${
        options.destination ?? acs
      }"${answers}><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${inner}</samlp:Response>`;
    const algorithms = options.sha1 ? SHA1 : SHA256;
    const signed = (xml: string, element: "Assertion" | "Response") => {
      const signer = new SignedXml({
        privateKey: options.key ?? this.key,
        signatureAlgorithm: algorithms.signature,
        canonicalizationAlgorithm: C14N,
      });
      signer.addReference({
        xpath: `/*[local-name(.)='${element}']`,
        digestAlgorithm: algorithms.digest,
        transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", C14N],
      });
      signer.computeSignature(xml, {
        location: {
          reference: `/*[local-name(.)='${element}']/*[local-name(.)='Issuer']`,
          action: "after",
        },
      });
      return signer.getSignedXml();
    };
    const mode = options.sign ?? "assertion";
    let inner = mode === "assertion" ? signed(assertion, "Assertion") : assertion;
    if (options.encryptFor) {
      const certificate = options.encryptFor;
      const encrypted = await new Promise<string>((resolve, reject) =>
        encrypt(
          inner,
          {
            rsa_pub: certificate,
            pem: certificate,
            encryptionAlgorithm: "http://www.w3.org/2009/xmlenc11#aes256-gcm",
            keyEncryptionAlgorithm: "http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p",
            disallowEncryptionWithInsecureAlgorithm: true,
          },
          (error, result) => (error ? reject(error) : resolve(result)),
        ),
      );
      inner = `<saml:EncryptedAssertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${encrypted}</saml:EncryptedAssertion>`;
    }
    let xml = wrap(inner);
    if (mode === "response") xml = signed(xml, "Response");
    if (options.after) xml = options.after(xml);
    return Buffer.from(xml).toString("base64");
  }
}

const oidc = new OidcProvider();
const saml = new SamlProvider();

async function seed(slug: string, email: string) {
  const id = (await t.admin.post("/tenants", { slug, name: slug })).body.id as string;
  const grant = await t.admin.post(`/tenants/${id}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${id}/members`, {
    email,
    name: email,
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${id}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${id}/access-grants/${grant.body.id}`);
  return { id, client: await t.signIn(email, PASSWORD), memberId: member.body.id as string };
}

const providers = () => `/tenants/${tenant}/identity-providers`;

/** Lists a domain for a provider, publishes its record and has it checked. */
async function prove(provider: string, domain: string, as = alice, base = providers()) {
  const added = await as.post(`${base}/${provider}/domains`, { domain });
  expect(added.status, JSON.stringify(added.body)).toBe(201);
  if (added.body.record) txt.set(added.body.record.name, added.body.record.value);
  const checked = await as.post(`${base}/${provider}/domains/${added.body.id}/checks`);
  expect(checked.status, JSON.stringify(checked.body)).toBe(200);
  return checked.body;
}

beforeAll(async () => {
  dns.resolveTxt = async (name) => (txt.has(name) ? [[txt.get(name) as string]] : []);
  await oidc.start();
  await saml.start();
  t = await startTestApp();
  roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  const acme = await seed("acme", "alice@acme.example");
  tenant = acme.id;
  alice = acme.client;
});

afterAll(async () => {
  await oidc.stop();
  await t?.stop();
});

// ----- Members, over OIDC -----

describe("a tenant's members signing in over OIDC", () => {
  let provider: string;
  let staff: string;

  /** Goes to the provider and back. Ends at the address the last step sent the browser to. */
  async function signIn(
    as: Browser,
    claims: Record<string, unknown>,
    options: { finishIn?: Browser; returnTo?: string } = {},
  ) {
    const started = await as.get(
      `/api/v1/sso/${provider}/start${options.returnTo ? `?return=${encodeURIComponent(options.returnTo)}` : ""}`,
    );
    expect(started.status).toBe(302);
    const back = oidc.approve(started.location as string, claims);
    const answered = await as.get(local(back));
    expect(answered.status).toBe(302);
    if (!answered.location?.includes("/auth/sso/finish")) return answered;
    return (options.finishIn ?? as).get(local(answered.location));
  }

  test("a provider is made off, with the addresses to give its administrator", async () => {
    const wrong = await alice.post(providers(), {
      audience: "members",
      protocol: "oidc",
      name: "Acme Login",
      config: { issuer: "http://127.0.0.1:9/nothing", clientId: oidc.clientId },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.detail).toContain("openid-configuration");

    const created = await alice.post(providers(), {
      audience: "members",
      protocol: "oidc",
      name: "Acme Login",
      config: { issuer: oidc.issuer, clientId: oidc.clientId },
      clientSecret: oidc.clientSecret,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    provider = created.body.id;
    expect(created.body).toMatchObject({
      enabled: false,
      enforce: false,
      hasSecret: true,
      config: { issuer: oidc.issuer, scopes: ["openid", "email", "profile"] },
      addresses: { callback: `${ORIGIN}/api/v1/sso/${provider}/callback` },
    });
    // The secret is sealed, and never comes back.
    expect(JSON.stringify(created.body)).not.toContain(oidc.clientSecret);
    const stored = await t.db
      .selectFrom("identity_provider")
      .select("secrets")
      .where("id", "=", provider)
      .executeTakeFirstOrThrow();
    expect(stored.secrets?.toString("latin1")).not.toContain(oidc.clientSecret);

    // Off, it signs nobody in.
    const off = await browser().get(`/api/v1/sso/${provider}/start`);
    expect(off.location).toBe("/?sso_error=provider_off");
  });

  test("it cannot be turned on until a domain is proved in DNS", async () => {
    const early = await alice.patch(`${providers()}/${provider}`, { enabled: true });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe("domain_needed");

    const added = await alice.post(`${providers()}/${provider}/domains`, {
      domain: "Acme.Example",
    });
    expect(added.body).toMatchObject({ domain: "acme.example", verified: false });
    expect(added.body.record.name).toBe("_vx-challenge.acme.example");
    const unproved = await alice.post(`${providers()}/${provider}/domains/${added.body.id}/checks`);
    expect(unproved.body).toMatchObject({ verified: false });
    expect(unproved.body.problem).toContain("No TXT record");
    expect((await alice.patch(`${providers()}/${provider}`, { enabled: true })).status).toBe(409);

    txt.set(added.body.record.name, added.body.record.value);
    const proved = await alice.post(`${providers()}/${provider}/domains/${added.body.id}/checks`);
    expect(proved.body).toMatchObject({ verified: true, problem: null });
    const on = await alice.patch(`${providers()}/${provider}`, { enabled: true });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(on.body.enabled).toBe(true);
    expect((await audit("identity_provider.enabled")).length).toBe(1);

    // The sign-in screen learns of the provider by the email's domain alone.
    const known = await t.anonymous.get("/sso/providers?email=someone@acme.example");
    expect(known.body).toMatchObject({
      providers: [{ id: provider, name: "Acme Login" }],
      password: true,
    });
    expect(
      (await t.anonymous.get("/sso/providers?email=x@elsewhere.example")).body.providers,
    ).toEqual([]);
  });

  test("a member of a proved domain is tied to the provider's subject, and signed in", async () => {
    const chrome = browser();
    const done = await signIn(
      chrome,
      { sub: "u-alice", email: "Alice@Acme.Example", email_verified: true, name: "Alice" },
      { returnTo: "/tenants/acme/settings" },
    );
    expect(done.status).toBe(302);
    expect(done.location).toBe("/tenants/acme/settings");
    expect(await chrome.member()).toBe("alice@acme.example");
    // The exchange used PKCE and the client secret.
    expect(oidc.seen).toEqual({ verifierMatched: true, secret: oidc.clientSecret });
    // The cookie that tied the sign-in to this browser is gone.
    expect([...chrome.jar.keys()].filter((name) => name.startsWith("vx_sso_"))).toEqual([]);

    const links = (await alice.get(`${providers()}/${provider}/links`)).body.items;
    expect(links).toMatchObject([
      { subject: "u-alice", email: "alice@acme.example", principalType: "member" },
    ]);
    expect((await audit("sso.signed_in")).at(-1)?.details).toMatchObject({
      linked: true,
      created: false,
    });
    expect((await audit("member.signed_in")).length).toBeGreaterThan(0);

    // From then on the subject is who she is, whatever email comes with it.
    const again = browser();
    await signIn(again, {
      sub: "u-alice",
      email: "renamed@elsewhere.example",
      email_verified: true,
    });
    expect(await again.member()).toBe("alice@acme.example");
    expect((await audit("sso.signed_in")).at(-1)?.details).toMatchObject({ linked: false });
  });

  test("an email is believed only in a proved domain, and never when the provider doubts it", async () => {
    const chrome = browser();
    // Someone at the provider who claims the operator's email.
    const stranger = await signIn(chrome, {
      sub: "u-eve",
      email: ADMIN.email,
      email_verified: true,
    });
    expect(stranger.location).toBe("/?sso_error=domain_not_proved");
    const doubted = await signIn(chrome, {
      sub: "u-eve",
      email: "alice@acme.example",
      email_verified: false,
    });
    expect(doubted.location).toBe("/?sso_error=email_unverified");
    const none = await signIn(chrome, { sub: "u-eve" });
    expect(none.location).toBe("/?sso_error=no_email");
    // A second subject cannot take an account that is already tied to one.
    const second = await signIn(chrome, {
      sub: "u-eve",
      email: "alice@acme.example",
      email_verified: true,
    });
    expect(second.location).toBe("/?sso_error=email_not_trusted");
    // Nobody is made without the tenant saying so.
    const unknown = await signIn(chrome, {
      sub: "u-bob",
      email: "bob@acme.example",
      email_verified: true,
    });
    expect(unknown.location).toBe("/?sso_error=no_account");
    expect(await chrome.member()).toBeNull();

    const reasons = (await audit("sso.refused")).map((entry) => entry.details.reason);
    expect(reasons).toEqual(
      expect.arrayContaining([
        "domain_not_proved",
        "email_unverified",
        "no_email",
        "email_not_trusted",
        "no_account",
      ]),
    );
  });

  test("a token that does not check out is refused", async () => {
    const chrome = browser();
    const claims = { sub: "u-alice", email: "alice@acme.example", email_verified: true };
    for (const bend of [
      { nonce: "another-nonce" },
      { audience: "another-client" },
      { issuer: "https://another.example" },
      { key: oidc.stranger.privateKey },
      { expired: true },
    ]) {
      oidc.bend = bend;
      const refused = await signIn(chrome, claims);
      expect(refused.location, JSON.stringify(Object.keys(bend))).toBe(
        "/?sso_error=invalid_answer",
      );
    }
    expect(await chrome.member()).toBeNull();
  });

  test("an answer works once, and only in the browser that began", async () => {
    const chrome = browser();
    const started = await chrome.get(`/api/v1/sso/${provider}/start`);
    const back = oidc.approve(started.location as string, {
      sub: "u-alice",
      email: "alice@acme.example",
      email_verified: true,
    });
    const answered = await chrome.get(local(back));
    expect(answered.location).toContain("/api/v1/auth/sso/finish?code=");

    // The provider's answer, sent a second time.
    expect((await chrome.get(local(back))).location).toBe("/?sso_error=expired");
    // The last step, tried in a browser that did not begin the sign-in.
    const thief = browser();
    expect((await thief.get(local(answered.location as string))).location).toBe(
      "/?sso_error=expired",
    );
    expect(await thief.member()).toBeNull();
    expect((await audit("sso.refused")).at(-1)?.details.reason).toBe("wrong_browser");

    expect((await chrome.get(local(answered.location as string))).location).toBe("/");
    expect(await chrome.member()).toBe("alice@acme.example");
    // And the last step works once.
    const replay = browser();
    for (const [name, value] of chrome.jar) replay.jar.set(name, value);
    expect((await chrome.get(local(answered.location as string))).location).toBe(
      "/?sso_error=expired",
    );

    // A made-up state finds nothing.
    const forged = await chrome.get(`/api/v1/sso/${provider}/callback?code=x&state=made-up`);
    expect(forged.location).toBe("/?sso_error=expired");
  });

  test("with provisioning on, a new person is made with the default role and mapped groups", async () => {
    staff = (await alice.post(`/tenants/${tenant}/groups`, { name: "staff" })).body.id;
    const finance = (await alice.post(`/tenants/${tenant}/groups`, { name: "finance" })).body.id;
    const byHand = (await alice.post(`/tenants/${tenant}/groups`, { name: "by-hand" })).body.id;
    const mapped = await alice.put(`${providers()}/${provider}/group-maps`, {
      items: [
        { value: "*", groupId: staff },
        { value: "Finance Team", groupId: finance },
      ],
    });
    expect(mapped.status, JSON.stringify(mapped.body)).toBe(200);
    expect(mapped.body.items).toMatchObject([
      { value: "*", groupName: "staff" },
      { value: "Finance Team", groupName: "finance" },
    ]);
    const settings = await alice.patch(`${providers()}/${provider}`, {
      provision: true,
      defaultRoleId: roles.viewer,
    });
    expect(settings.status, JSON.stringify(settings.body)).toBe(200);

    const chrome = browser();
    await signIn(chrome, {
      sub: "u-bob",
      email: "bob@acme.example",
      email_verified: true,
      name: "Bob Builder",
      groups: ["Finance Team", "Something Else"],
    });
    expect(await chrome.member()).toBe("bob@acme.example");
    const bob = await t.db
      .selectFrom("member")
      .selectAll()
      .where("email", "=", "bob@acme.example")
      .executeTakeFirstOrThrow();
    expect(bob.name).toBe("Bob Builder");
    // No password was made for him.
    const accounts = await t.db
      .selectFrom("member_account" as never)
      .selectAll()
      .where("member_id" as never, "=", bob.id as never)
      .execute();
    expect(accounts).toEqual([]);
    const members = (await alice.get(`/tenants/${tenant}/members`)).body.items;
    expect(members.map((member: Any) => member.email)).toContain("bob@acme.example");
    const bindings = await t.db
      .selectFrom("binding")
      .select(["role_id", "scope_type", "tenant_id"])
      .where("principal_id", "=", bob.id)
      .execute();
    expect(bindings).toEqual([{ role_id: roles.viewer, scope_type: "tenant", tenant_id: tenant }]);
    const groupsOf = async () =>
      (
        await t.db
          .selectFrom("group_member")
          .innerJoin("principal_group", "principal_group.id", "group_member.group_id")
          .select("principal_group.name")
          .where("group_member.member_id", "=", bob.id)
          .orderBy("principal_group.name")
          .execute()
      ).map((row) => row.name);
    expect(await groupsOf()).toEqual(["finance", "staff"]);

    // A group nobody mapped is left as people made it. A mapped one follows the provider.
    await alice.put(`/tenants/${tenant}/groups/${byHand}/members/${bob.id}`);
    await signIn(browser(), { sub: "u-bob", email: "bob@acme.example", groups: [] });
    expect(await groupsOf()).toEqual(["by-hand", "staff"]);
    expect((await audit("sso.groups_changed")).at(-1)?.details).toMatchObject({
      removed: ["finance"],
    });
    // He was given the role once.
    expect(
      (await t.db.selectFrom("binding").select("id").where("principal_id", "=", bob.id).execute())
        .length,
    ).toBe(1);
  });

  test("a try-out shows what the provider sent and signs nobody in", async () => {
    const started = await alice.post(`${providers()}/${provider}/tests`);
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const chrome = browser();
    const back = oidc.approve(started.body.url, {
      sub: "u-carol",
      email: "carol@acme.example",
      email_verified: true,
      groups: ["Finance Team"],
    });
    const page = await chrome.get(local(back));
    expect(page.status).toBe(200);
    expect(page.body).toContain("The provider answered");
    expect(await chrome.member()).toBeNull();
    const test = (await alice.get(`${providers()}/${provider}`)).body.lastTest;
    expect(test).toMatchObject({
      ok: true,
      subject: "u-carol",
      email: "carol@acme.example",
      groups: ["Finance Team"],
      received: { sub: "u-carol" },
    });
    expect(test.would).toContain("A new account would be created");
    expect(test.would).toContain("join finance");
    // Working it out changed nothing.
    expect(
      await t.db
        .selectFrom("member")
        .select("id")
        .where("email", "=", "carol@acme.example")
        .execute(),
    ).toEqual([]);

    // A try-out that would be refused says why.
    const second = await alice.post(`${providers()}/${provider}/tests`);
    await chrome.get(
      local(oidc.approve(second.body.url, { sub: "u-dan", email: "dan@elsewhere.example" })),
    );
    expect((await alice.get(`${providers()}/${provider}`)).body.lastTest).toMatchObject({
      ok: false,
      reason: "domain_not_proved",
    });
  });

  test("required, it leaves the domain's members no password, and the operator theirs", async () => {
    const before = browser();
    expect(
      (
        await before.post("/api/v1/auth/sign-in/email", {
          email: "alice@acme.example",
          password: PASSWORD,
        })
      ).status,
    ).toBe(200);

    const required = await alice.patch(`${providers()}/${provider}`, { enforce: true });
    expect(required.body.enforce).toBe(true);
    expect((await audit("identity_provider.enforced")).length).toBe(1);

    const refused = await browser().post("/api/v1/auth/sign-in/email", {
      email: "Alice@acme.example",
      password: PASSWORD,
    });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("sso_required");
    expect(refused.body.detail).toContain("Acme Login");
    expect((await audit("sso.password_refused")).at(-1)?.details).toMatchObject({
      email: "alice@acme.example",
    });
    expect((await t.anonymous.get("/sso/providers?email=alice@acme.example")).body.password).toBe(
      false,
    );

    // Other domains are untouched, and the operator keeps a way in.
    expect((await browser().post("/api/v1/auth/sign-in/email", ADMIN)).status).toBe(200);

    // Turning the provider off lifts the requirement with it.
    const off = await alice.patch(`${providers()}/${provider}`, { enabled: false });
    expect(off.body).toMatchObject({ enabled: false, enforce: false });
    expect(
      (
        await browser().post("/api/v1/auth/sign-in/email", {
          email: "alice@acme.example",
          password: PASSWORD,
        })
      ).status,
    ).toBe(200);
    await alice.patch(`${providers()}/${provider}`, { enabled: true });
  });

  test("a domain of members belongs to one provider on the instance", async () => {
    const globex = await seed("globex", "gina@globex.example");
    const base = `/tenants/${globex.id}/identity-providers`;
    const theirs = await globex.client.post(base, {
      audience: "members",
      protocol: "oidc",
      name: "Globex",
      config: { issuer: oidc.issuer, clientId: oidc.clientId },
      clientSecret: oidc.clientSecret,
    });
    // Another tenant is given a different record to publish, and Acme's does not prove it.
    const added = await globex.client.post(`${base}/${theirs.body.id}/domains`, {
      domain: "acme.example",
    });
    expect(added.body.record.value).not.toBe(txt.get("_vx-challenge.acme.example"));
    const unproved = await globex.client.post(
      `${base}/${theirs.body.id}/domains/${added.body.id}/checks`,
    );
    expect(unproved.body.verified).toBe(false);
    // Even with the record, the domain is taken.
    const kept = txt.get(added.body.record.name);
    txt.set(added.body.record.name, added.body.record.value);
    const taken = await globex.client.post(
      `${base}/${theirs.body.id}/domains/${added.body.id}/checks`,
    );
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("domain_taken");
    txt.set(added.body.record.name, kept as string);
    // And one tenant cannot reach another's provider.
    expect((await globex.client.get(`${providers()}/${provider}`)).status).toBe(404);
    expect((await globex.client.get(`${base}/${provider}`)).status).toBe(404);
  });

  test("removing the last proved domain turns the provider off, and removing a link unties a person", async () => {
    const links = (await alice.get(`${providers()}/${provider}/links`)).body.items;
    const bob = links.find((link: Any) => link.email === "bob@acme.example");
    expect((await alice.delete(`${providers()}/${provider}/links/${bob.id}`)).status).toBe(204);
    expect((await alice.delete(`${providers()}/${provider}/links/${bob.id}`)).status).toBe(404);
    // His next sign-in ties him again, by his proved email.
    const chrome = browser();
    await signIn(chrome, { sub: "u-bob-2", email: "bob@acme.example", email_verified: true });
    expect(await chrome.member()).toBe("bob@acme.example");

    const domains = (await alice.get(`${providers()}/${provider}/domains`)).body.items;
    expect(domains).toHaveLength(1);
    expect((await alice.delete(`${providers()}/${provider}/domains/${domains[0].id}`)).status).toBe(
      204,
    );
    expect((await alice.get(`${providers()}/${provider}`)).body.enabled).toBe(false);
    expect((await alice.delete(`${providers()}/${provider}`)).status).toBe(204);
    expect((await alice.get(providers())).body.items).toEqual([]);
    // The people it signed in stay.
    expect(
      await t.db
        .selectFrom("member")
        .select("id")
        .where("email", "=", "bob@acme.example")
        .execute(),
    ).toHaveLength(1);
  });
});

// ----- The instance's own provider -----

describe("the instance's own provider", () => {
  test("signs in the people who run the instance, by a domain the operator answers for", async () => {
    const base = "/instance/identity-providers";
    expect((await alice.get(base)).status).toBe(403);
    const created = await t.admin.post(base, {
      audience: "members",
      protocol: "oidc",
      name: "Operators",
      config: { issuer: oidc.issuer, clientId: oidc.clientId },
      clientSecret: oidc.clientSecret,
      provision: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
    expect(created.body.tenantId).toBeNull();
    // Nobody to prove a domain to: the operator's word is enough.
    const domain = await prove(id, "example.com", t.admin, base);
    expect(domain).toMatchObject({ verified: true, record: null });
    expect((await t.admin.patch(`${base}/${id}`, { enabled: true, enforce: true })).status).toBe(
      200,
    );
    expect((await t.admin.get(base)).body.items).toHaveLength(1);
    expect((await t.admin.get(`${base}/${id}/domains`)).body.items).toHaveLength(1);

    const chrome = browser();
    const started = await chrome.get(`/api/v1/sso/${id}/start`);
    const answered = await chrome.get(
      local(
        oidc.approve(started.location as string, {
          sub: "op-1",
          email: ADMIN.email,
          email_verified: true,
        }),
      ),
    );
    await chrome.get(local(answered.location as string));
    expect(await chrome.member()).toBe(ADMIN.email);

    // The break-glass account: the operator's password still works with the provider required.
    expect((await browser().post("/api/v1/auth/sign-in/email", ADMIN)).status).toBe(200);
    // Someone new in the domain is made, with nothing they may do.
    const fresh = browser();
    const again = await fresh.get(`/api/v1/sso/${id}/start`);
    const back = await fresh.get(
      local(
        oidc.approve(again.location as string, {
          sub: "op-2",
          email: "new@example.com",
          email_verified: true,
        }),
      ),
    );
    await fresh.get(local(back.location as string));
    expect(await fresh.member()).toBe("new@example.com");
    const links = (await t.admin.get(`${base}/${id}/links`)).body.items;
    expect(links).toHaveLength(2);
    expect((await t.admin.delete(`${base}/${id}/links/${links[0].id}`)).status).toBe(204);
    const tried = await t.admin.post(`${base}/${id}/tests`);
    expect(tried.status).toBe(201);
    const domains = (await t.admin.get(`${base}/${id}/domains`)).body.items;
    expect((await t.admin.delete(`${base}/${id}/domains/${domains[0].id}`)).status).toBe(204);
    expect((await t.admin.get(`${base}/${id}`)).body.enabled).toBe(false);
    expect((await t.admin.delete(`${base}/${id}`)).status).toBe(204);
  });
});

// ----- End users, over SAML -----

describe("a tenant's end users signing in over SAML", () => {
  let provider: string;
  let acs: string;
  let entityId: string;
  let spCertificate: string;
  let customers: string;
  const portal = "/portal/acme";

  /** Begins at the portal and reads the request the browser was sent to the provider with. */
  async function start(as: Browser, at = portal) {
    const started = await as.get(`${at}/sso/${provider}/start`);
    expect(started.status).toBe(302);
    return saml.read(started.location as string);
  }
  /** The browser posts the provider's answer, as a form from the provider's site. */
  const post = (as: Browser, response: string, relayState?: string) =>
    as.form(
      `${portal}/sso/${provider}/acs`,
      { SAMLResponse: response, ...(relayState ? { RelayState: relayState } : {}) },
      "https://idp.acme.test",
    );
  /** The whole way round. */
  async function signIn(as: Browser, options: SamlOptions = {}) {
    const request = await start(as);
    const answered = await post(
      as,
      await saml.respond(acs, entityId, { inResponseTo: request.id, ...options }),
      request.relayState,
    );
    if (answered.status !== 302) return answered;
    return as.get(local(answered.location as string));
  }
  const signedInAs = async (as: Browser) =>
    (await as.get(`/api/v1/tenants/${tenant}/session`)).body?.principal?.email ?? null;
  const lastRefusal = async () => (await audit("sso.refused")).at(-1)?.details;

  test("a provider is set up from its metadata, and publishes this side's", async () => {
    const created = await alice.post(providers(), {
      audience: "end_users",
      protocol: "saml",
      name: "Acme Customers",
      config: {
        metadataXml: saml.metadata,
        attributes: { customer_id: "customerId" },
        claims: { groups: "roles" },
      },
      provision: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    provider = created.body.id;
    acs = created.body.addresses.acs;
    entityId = created.body.addresses.entityId;
    spCertificate = created.body.config.spCertificate;
    expect(acs).toBe(`${ORIGIN}/portal/acme/sso/${provider}/acs`);
    expect(created.body.config).toMatchObject({
      entryPoint: saml.entryPoint,
      idpIssuer: saml.entityId,
      signed: "either",
      allowSha1: false,
      allowIdpInitiated: false,
    });
    expect(created.body.config.certificates).toHaveLength(1);
    // The private key is this side's secret.
    expect(JSON.stringify(created.body)).not.toContain("PRIVATE KEY");
    expect(created.body.hasSecret).toBe(false);

    const metadata = await browser().get(`${portal}/sso/${provider}/metadata`);
    expect(metadata.status).toBe(200);
    expect(metadata.body).toContain(`entityID="${entityId}"`);
    expect(metadata.body).toContain(`Location="${acs}"`);
    expect(metadata.body).toContain("<ds:X509Certificate>");

    // Bad settings are said as they are saved.
    const bad = await alice.post(providers(), {
      audience: "end_users",
      protocol: "saml",
      name: "Bad",
      config: { entryPoint: saml.entryPoint, idpIssuer: "x", certificates: ["not a certificate"] },
    });
    expect(bad.status).toBe(400);
    const hostile = await alice.post(providers(), {
      audience: "end_users",
      protocol: "saml",
      name: "Bad",
      config: { metadataXml: `<!DOCTYPE x [<!ENTITY a "b">]>${saml.metadata}` },
    });
    expect(hostile.status).toBe(400);
    expect(hostile.body.detail).toContain("document type");

    // A provider of end users needs no domain to be turned on: the pool is the tenant's own.
    const on = await alice.patch(`${providers()}/${provider}`, { enabled: true });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    const page = await browser().get(`${portal}/sign-in?return=%2Fapps%2Facme%2Fmain%2Fx%2F`);
    expect(page.body).toContain(
      `href="/portal/acme/sso/${provider}/start?return=%2Fapps%2Facme%2Fmain%2Fx%2F"`,
    );
    expect(page.body).toContain("Sign in with Acme Customers");
    expect(
      (await t.anonymous.get(`/tenants/${tenant}/end-user-auth/providers`)).body,
    ).toMatchObject({
      providers: [{ id: provider, name: "Acme Customers", path: `/sso/${provider}/start` }],
      password: true,
    });
  });

  test("a signed assertion makes the person, with their groups and attributes", async () => {
    customers = (await alice.post(`/tenants/${tenant}/end-user-groups`, { name: "customers" })).body
      .id;
    const gold = (await alice.post(`/tenants/${tenant}/end-user-groups`, { name: "gold" })).body.id;
    const mapped = await alice.put(`${providers()}/${provider}/group-maps`, {
      items: [
        { value: "*", groupId: customers },
        { value: "gold", groupId: gold },
      ],
    });
    expect(mapped.status, JSON.stringify(mapped.body)).toBe(200);
    // A group of members is not one a provider of end users can map to.
    const wrong = (await alice.post(`/tenants/${tenant}/groups`, { name: "not-for-end-users" }))
      .body.id;
    expect(
      (
        await alice.put(`${providers()}/${provider}/group-maps`, {
          items: [{ value: "x", groupId: wrong }],
        })
      ).status,
    ).toBe(400);

    const chrome = browser();
    const request = await start(chrome);
    expect(request.acs).toBe(acs);
    const answered = await post(
      chrome,
      await saml.respond(acs, entityId, {
        inResponseTo: request.id,
        nameId: "cust-77",
        attributes: {
          email: "Pat@Customer.Example",
          name: "Pat",
          roles: ["gold", "other"],
          customerId: "C-1001",
        },
      }),
      request.relayState,
    );
    expect(answered.status).toBe(302);
    expect(answered.location).toContain(`${ORIGIN}/portal/acme/sso/${provider}/finish?code=`);
    const done = await chrome.get(local(answered.location as string));
    expect(done.status).toBe(302);
    expect(done.location).toBe("/portal/acme/");
    expect(await signedInAs(chrome)).toBe("pat@customer.example");

    const pat = (await alice.get(`/tenants/${tenant}/end-users`)).body.items.find(
      (user: Any) => user.email === "pat@customer.example",
    );
    expect(pat).toMatchObject({ name: "Pat", attributes: { customer_id: "C-1001" } });
    expect([...pat.groups].sort()).toEqual(["customers", "gold"]);
    expect((await audit("end_user.signed_in")).length).toBeGreaterThan(0);

    // The next sign-in follows the provider: out of gold, and the attribute it stopped sending is gone.
    await signIn(browser(), { nameId: "cust-77", attributes: { email: "pat@customer.example" } });
    const later = (await alice.get(`/tenants/${tenant}/end-users`)).body.items.find(
      (user: Any) => user.email === "pat@customer.example",
    );
    expect(later.groups).toEqual(["customers"]);
    expect(later.attributes).toEqual({});
  });

  test("an answer is accepted once, and only for a request this instance made", async () => {
    const chrome = browser();
    const request = await start(chrome);
    const response = await saml.respond(acs, entityId, {
      inResponseTo: request.id,
      nameId: "cust-77",
      attributes: { email: "pat@customer.example" },
    });
    expect((await post(chrome, response, request.relayState)).status).toBe(302);
    // The same form, posted again.
    const replayed = await post(browser(), response, request.relayState);
    expect(replayed.status).toBe(403);
    expect(replayed.body).toContain("You could not be signed in");
    expect((await lastRefusal()).reason).toBe("invalid_answer");

    // An answer to a request nobody made.
    const unasked = await post(
      chrome,
      await saml.respond(acs, entityId, { inResponseTo: "_made-up", nameId: "cust-77" }),
    );
    expect(unasked.status).toBe(403);
    // An answer to no request at all, which this provider is not allowed.
    const begun = await post(chrome, await saml.respond(acs, entityId, { nameId: "cust-77" }));
    expect(begun.status).toBe(403);
    expect((await lastRefusal()).detail).toMatch(/InResponseTo/);

    // One person's answer, delivered into another browser's sign-in.
    const victim = browser();
    const theirs = await start(victim);
    const attacker = browser();
    const mine = await start(attacker);
    const crossed = await post(
      victim,
      await saml.respond(acs, entityId, { inResponseTo: mine.id, nameId: "cust-77" }),
      theirs.relayState,
    );
    expect(crossed.status).toBe(403);
    expect((await lastRefusal()).detail).toContain("relay state");
    // And the last step only finishes in the browser that began.
    const own = await post(
      attacker,
      await saml.respond(acs, entityId, {
        inResponseTo: (await start(attacker)).id,
        nameId: "cust-77",
      }),
    );
    expect(own.status).toBe(403);
    const honest = browser();
    const asked = await start(honest);
    const answered = await post(
      honest,
      await saml.respond(acs, entityId, { inResponseTo: asked.id, nameId: "cust-77" }),
      asked.relayState,
    );
    const elsewhere = await browser().get(local(answered.location as string));
    expect(elsewhere.status).toBe(410);
    expect((await lastRefusal()).reason).toBe("wrong_browser");
    expect(await signedInAs(honest)).toBeNull();
  });

  test("an assertion that does not check out is refused", async () => {
    const cases: [string, SamlOptions, RegExp][] = [
      ["no signature", { sign: "none" }, /signature/i],
      ["signed by someone else", { key: saml.strangerKey }, /signature/i],
      [
        "changed after it was signed",
        {
          attributes: { email: "pat@customer.example" },
          after: (xml) => xml.replace("pat@customer", "eve@customer"),
        },
        /signature/i,
      ],
      ["made for another service", { audience: "https://another.example/metadata" }, /audience/i],
      ["sent by another provider", { issuer: "https://another-idp.example" }, /issuer/i],
      ["run out", { goodFor: -600 }, /NotOnOrAfter|expired|valid/i],
      [
        "addressed to another recipient",
        { recipient: "https://another.example/acs" },
        /recipient/i,
      ],
      [
        "sent to another destination",
        { destination: "https://another.example/acs" },
        /destination/i,
      ],
      ["signed with SHA-1", { sha1: true }, /too weak/i],
      [
        "a subject that changes every time",
        { nameIdFormat: "urn:oasis:names:tc:SAML:2.0:nameid-format:transient" },
        /transient/i,
      ],
      [
        "with a document type",
        { after: (xml) => `<!DOCTYPE r [<!ENTITY x "y">]>${xml}` },
        /document type/i,
      ],
    ];
    for (const [name, options, why] of cases) {
      const chrome = browser();
      const refused = await signIn(chrome, { nameId: "cust-88", ...options });
      expect(refused.status, name).toBe(403);
      const entry = await lastRefusal();
      expect(`${entry.detail ?? entry.message}`, name).toMatch(why);
      expect(await signedInAs(chrome), name).toBeNull();
    }
    expect(
      await t.db
        .selectFrom("identity_link")
        .select("id")
        .where("subject", "=", "cust-88")
        .execute(),
    ).toEqual([]);
  });

  test("a signed response that covers the assertion is enough, and an encrypted assertion is opened", async () => {
    const chrome = browser();
    const whole = await signIn(chrome, {
      sign: "response",
      nameId: "cust-77",
      attributes: { email: "pat@customer.example" },
    });
    expect(whole.status).toBe(302);
    expect(await signedInAs(chrome)).toBe("pat@customer.example");

    // A provider that must sign the assertion itself is held to it.
    await alice.patch(`${providers()}/${provider}`, { config: { signed: "assertion" } });
    expect((await signIn(browser(), { sign: "response", nameId: "cust-77" })).status).toBe(403);
    await alice.patch(`${providers()}/${provider}`, { config: { signed: "either" } });

    const sealed = browser();
    const opened = await signIn(sealed, {
      nameId: "cust-77",
      attributes: { email: "pat@customer.example" },
      encryptFor: spCertificate,
    });
    expect(opened.status).toBe(302);
    expect(await signedInAs(sealed)).toBe("pat@customer.example");
  });

  test("SHA-1, and a sign-in the provider begins, are each allowed only when turned on, and recorded", async () => {
    const weak = await alice.patch(`${providers()}/${provider}`, {
      config: { allowSha1: true, allowIdpInitiated: true },
    });
    expect(weak.body.config).toMatchObject({ allowSha1: true, allowIdpInitiated: true });
    expect((await audit("identity_provider.sha1_allowed")).length).toBe(1);
    expect((await audit("identity_provider.idp_initiated_allowed")).length).toBe(1);

    const old = browser();
    expect((await signIn(old, { sha1: true, nameId: "cust-77" })).status).toBe(302);

    // Begun at the provider: no request, no cookie.
    const chrome = browser();
    const unasked = await saml.respond(acs, entityId, { nameId: "cust-77" });
    const answered = await post(chrome, unasked);
    expect(answered.status).toBe(302);
    await chrome.get(local(answered.location as string));
    expect(await signedInAs(chrome)).toBe("pat@customer.example");
    // The same assertion a second time is known by its ID.
    const replayed = await post(browser(), unasked);
    expect(replayed.status).toBe(403);
    expect((await lastRefusal()).reason).toBe("replayed");

    const strict = await alice.patch(`${providers()}/${provider}`, {
      config: { allowSha1: false, allowIdpInitiated: false },
    });
    expect(strict.body.config).toMatchObject({ allowSha1: false, allowIdpInitiated: false });
    expect((await audit("identity_provider.sha1_refused")).length).toBe(1);
    expect((await signIn(browser(), { sha1: true, nameId: "cust-77" })).status).toBe(403);
  });

  test("an account that exists is only taken over by a proved domain, or on the tenant's say-so", async () => {
    const invited = await alice.post(`/tenants/${tenant}/end-users`, {
      email: "sam@customer.example",
      name: "Sam",
    });
    expect(invited.status, JSON.stringify(invited.body)).toBe(201);
    const chrome = browser();
    const refused = await signIn(chrome, {
      nameId: "cust-sam",
      attributes: { email: "sam@customer.example" },
    });
    expect(refused.status).toBe(403);
    expect((await lastRefusal()).reason).toBe("email_not_trusted");

    await prove(provider, "customer.example");
    expect(
      (await signIn(chrome, { nameId: "cust-sam", attributes: { email: "sam@customer.example" } }))
        .status,
    ).toBe(302);
    expect(await signedInAs(chrome)).toBe("sam@customer.example");

    // The other way: the tenant takes the provider's word.
    const kim = await alice.post(`/tenants/${tenant}/end-users`, {
      email: "kim@other.example",
      name: "Kim",
    });
    expect(
      (await signIn(browser(), { nameId: "cust-kim", attributes: { email: "kim@other.example" } }))
        .status,
    ).toBe(403);
    await alice.patch(`${providers()}/${provider}`, { config: { trustEmail: true } });
    const trusted = browser();
    expect(
      (await signIn(trusted, { nameId: "cust-kim", attributes: { email: "kim@other.example" } }))
        .status,
    ).toBe(302);
    expect(await signedInAs(trusted)).toBe("kim@other.example");
    await alice.patch(`${providers()}/${provider}`, { config: { trustEmail: false } });

    // Someone turned off stays out.
    await alice.patch(`/tenants/${tenant}/end-users/${kim.body.endUser.id}`, { disabled: true });
    expect((await signIn(browser(), { nameId: "cust-kim" })).status).toBe(403);
    expect((await lastRefusal()).reason).toBe("disabled");
  });

  test("a try-out works for a provider of end users too", async () => {
    const started = await alice.post(`${providers()}/${provider}/tests`);
    const request = saml.read(started.body.url);
    const chrome = browser();
    const page = await post(
      chrome,
      await saml.respond(acs, entityId, {
        inResponseTo: request.id,
        nameId: "cust-new",
        attributes: { email: "new@customer.example", roles: "gold", customerId: "C-9" },
      }),
      request.relayState,
    );
    expect(page.status).toBe(200);
    expect(page.body).toContain("The provider answered");
    expect(await signedInAs(chrome)).toBeNull();
    const test = (await alice.get(`${providers()}/${provider}`)).body.lastTest;
    expect(test).toMatchObject({
      ok: true,
      subject: "cust-new",
      email: "new@customer.example",
      groups: ["gold"],
      attributes: { customer_id: "C-9" },
    });
    expect(test.would).toContain("A new account would be created");
    // A failed try-out is shown to whoever is trying, with the reason.
    const second = saml.read((await alice.post(`${providers()}/${provider}/tests`)).body.url);
    const failed = await post(
      chrome,
      await saml.respond(acs, entityId, { inResponseTo: second.id, sign: "none" }),
      second.relayState,
    );
    expect(failed.body).toContain("The test did not pass");
    expect((await alice.get(`${providers()}/${provider}`)).body.lastTest).toMatchObject({
      ok: false,
      reason: "invalid_answer",
    });
  });

  test("it begins and ends at a hostname the tenant registered, with one address at the provider", async () => {
    const workspace = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "main",
        name: "Main",
        type: "production",
      })
    ).body.id as string;
    await t.db
      .insertInto("app_domain")
      .values({
        id: randomUUID(),
        tenant_id: tenant,
        workspace_id: workspace,
        app_path: "portal",
        hostname: SHOP,
        enabled: true,
        verified_at: new Date(),
        created_by_type: "system",
        created_by_id: null,
      })
      .execute();
    const shop = browser(SHOP);
    const page = await shop.get("/_/sign-in");
    expect(page.body).toContain(`href="/_/sso/${provider}/start"`);
    const started = await shop.get(`/_/sso/${provider}/start?return=%2Forders`);
    const request = saml.read(started.location as string);
    // The provider is asked to answer at the one address it knows.
    expect(request.acs).toBe(acs);
    // The provider's answer arrives at that address, where this browser has no cookie.
    const main = browser();
    const answered = await post(
      main,
      await saml.respond(acs, entityId, { inResponseTo: request.id, nameId: "cust-77" }),
      request.relayState,
    );
    expect(answered.location).toContain(`http://${SHOP}/_/sso/${provider}/finish?code=`);
    // The code is for the hostname, and for the browser that began there.
    const code = new URL(answered.location as string);
    expect((await main.get(`/portal/acme/sso/${provider}/finish${code.search}`)).status).toBe(410);
    const done = await shop.get(`${code.pathname}${code.search}`);
    expect(done.status).toBe(302);
    expect(done.location).toBe("/orders");
    expect((await shop.get(`/api/v1/tenants/${tenant}/session`)).body.principal.email).toBe(
      "pat@customer.example",
    );
    // The provider does not answer at the hostname.
    expect(
      (await shop.form(`/_/sso/${provider}/acs`, { SAMLResponse: "x" }, "https://idp.acme.test"))
        .status,
    ).toBe(404);
  });

  test("required, it leaves end users no password", async () => {
    const invited = await alice.post(`/tenants/${tenant}/end-users`, {
      email: "lee@customer.example",
      name: "Lee",
    });
    expect(invited.status, JSON.stringify(invited.body)).toBe(201);
    const token = new URL(invited.body.invitation.url).searchParams.get("token") as string;
    expect(
      (await browser().form(`${portal}/set-password`, { token, password: PASSWORD })).status,
    ).toBe(303);
    const chrome = browser();
    expect(
      (
        await chrome.form(`${portal}/sign-in`, {
          email: "lee@customer.example",
          password: PASSWORD,
        })
      ).status,
    ).toBe(303);

    await alice.patch(`${providers()}/${provider}`, { enforce: true });
    // Covered: an email in the provider's proved domain. Others keep their password.
    const refused = await browser().form(`${portal}/sign-in`, {
      email: "lee@customer.example",
      password: PASSWORD,
    });
    expect(refused.status).toBe(403);
    expect(refused.body).toContain("Sign in with Acme Customers");
    const api = await t.anonymous.post(`/tenants/${tenant}/end-user-auth/sign-in`, {
      email: "lee@customer.example",
      password: PASSWORD,
    });
    expect(api.status).toBe(403);
    expect(api.body.code).toBe("sso_required");
    expect(
      (
        await t.anonymous.get(
          `/tenants/${tenant}/end-user-auth/providers?email=lee@customer.example`,
        )
      ).body.password,
    ).toBe(false);
    expect(
      (await t.anonymous.get(`/tenants/${tenant}/end-user-auth/providers?email=x@other.example`))
        .body.password,
    ).toBe(true);

    // With no domain listed, it is required of everyone, and the page asks for no password.
    const domains = (await alice.get(`${providers()}/${provider}/domains`)).body.items;
    await alice.delete(`${providers()}/${provider}/domains/${domains[0].id}`);
    const page = await browser().get(`${portal}/sign-in`);
    expect(page.body).not.toContain('type="password"');
    expect(page.body).toContain("Sign in with Acme Customers");
    await alice.patch(`${providers()}/${provider}`, { enforce: false });
    expect((await browser().get(`${portal}/sign-in`)).body).toContain('type="password"');
  });
});

// ----- Members, over SAML -----

describe("a tenant's members signing in over SAML", () => {
  test("the provider posts to the API's own address, and the member is signed in", async () => {
    const created = await alice.post(providers(), {
      audience: "members",
      protocol: "saml",
      name: "Acme SAML",
      config: { metadataXml: saml.metadata, signRequests: true },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
    const { acs, entityId, metadata } = created.body.addresses;
    expect(acs).toBe(`${ORIGIN}/api/v1/sso/${id}/acs`);
    await prove(id, "acme.example");
    expect((await alice.patch(`${providers()}/${id}`, { enabled: true })).status).toBe(200);

    const published = await browser().get(local(metadata));
    expect(published.status).toBe(200);
    expect(published.body).toContain('AuthnRequestsSigned="true"');

    const chrome = browser();
    const started = await chrome.get(`/api/v1/sso/${id}/start`);
    // The request is signed, as this provider was told to expect.
    expect(new URL(started.location as string).searchParams.get("SigAlg")).toBe(SHA256.signature);
    const request = saml.read(started.location as string);
    // The provider's form arrives from its own site, carrying no cookie of this one.
    const postForm = (form: Record<string, string>) =>
      t.anonymous.upload(
        `/sso/${id}/acs`,
        new URLSearchParams(form).toString(),
        "application/x-www-form-urlencoded",
      );
    const answered = await postForm({
      SAMLResponse: await saml.respond(acs, entityId, {
        inResponseTo: request.id,
        nameId: "alice@acme.example",
        nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      }),
      RelayState: request.relayState,
    });
    expect(answered.status).toBe(302);
    await chrome.get(local(answered.headers.location as string));
    expect(await chrome.member()).toBe("alice@acme.example");

    // A bad answer sends the browser back to the console with the reason.
    const again = saml.read((await chrome.get(`/api/v1/sso/${id}/start`)).location as string);
    const refused = await postForm({
      SAMLResponse: await saml.respond(acs, entityId, { inResponseTo: again.id, sign: "none" }),
      RelayState: again.relayState,
    });
    expect(refused.headers.location).toBe("/?sso_error=invalid_answer");
  });
});

// ----- Moving a tenant -----

describe("a tenant with providers, exported and imported", () => {
  test("its providers arrive paused and its domains unproved, until someone confirms them", async () => {
    const passphrase = "a long passphrase for the export";
    const exported = await alice.post(`/tenants/${tenant}/exports`, { passphrase });
    expect(exported.status).toBe(200);
    const b = await startTestApp();
    try {
      const imported = await b.admin.upload(
        "/instance/tenant-imports",
        exported.bytes,
        "application/x-tar",
        {
          "x-export-passphrase": passphrase,
        },
      );
      expect(imported.status, JSON.stringify(imported.body)).toBe(201);
      const there = await b.signIn("alice@acme.example", PASSWORD);
      const list = (await there.get(providers())).body.items as Any[];
      expect(list.map((provider) => provider.name).sort()).toEqual(["Acme Customers", "Acme SAML"]);
      expect(list.every((provider) => provider.paused)).toBe(true);
      const members = list.find((provider) => provider.name === "Acme SAML");
      const domains = (await there.get(`${providers()}/${members.id}/domains`)).body.items;
      expect(domains).toMatchObject([{ domain: "acme.example", verified: false }]);
      // Who was tied to whom came along, and so did the mapping.
      expect((await there.get(`${providers()}/${members.id}/links`)).body.items).toMatchObject([
        { email: "alice@acme.example", principalType: "member" },
      ]);
      const customers = list.find((provider) => provider.name === "Acme Customers");
      expect(
        (await there.get(`${providers()}/${customers.id}/group-maps`)).body.items,
      ).toHaveLength(2);

      // Paused, a provider signs nobody in and requires nothing.
      const paused = await b.app.inject({
        method: "GET",
        url: `/api/v1/sso/${members.id}/start`,
        headers: { host: MAIN },
      });
      expect(paused.headers.location).toBe("/?sso_error=provider_off");
      // The key it was sealed with came too: saving it again works, and turns it back on
      // once its domain is proved to this instance.
      const saved = await there.patch(`${providers()}/${customers.id}`, { name: "Acme Customers" });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect(saved.body.paused).toBe(false);
      const resumed = await there.patch(`${providers()}/${members.id}`, { name: "Acme SAML" });
      expect(resumed.status).toBe(409);
      expect(resumed.body.code).toBe("domain_needed");
      const metadata = await b.app.inject({
        method: "GET",
        url: `/portal/acme/sso/${customers.id}/metadata`,
        headers: { host: MAIN },
      });
      expect(metadata.statusCode).toBe(200);
    } finally {
      await b.stop();
    }
  });
});

describe("the write path", () => {
  test("every successful change left an audit entry", () => {
    expect(t.unaudited).toEqual([]);
  });

  test("every single sign-on route that changes something was exercised and audited", () => {
    expect(t.unexercised((route) => /\/(identity-providers|sso)(\/|$)/.test(route))).toEqual([]);
  });
});
