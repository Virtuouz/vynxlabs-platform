import { createHash, createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "sso"'s pictures (packages/docs/shots/sso.mjs), by the name a shot's `setup` gives. */

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");

/**
 * A small OIDC provider for the one sign-in a try makes: it answers its own address book, signs
 * whoever comes with the claims it was given, and is stopped when the try is over.
 */
const identityProvider = async (claims: Record<string, unknown>) => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const clientId = "volvel";
  const clientSecret = "pictures-oidc-secret";
  let issuer = "";
  const codes = new Map<string, { nonce: string; challenge: string; redirectUri: string }>();
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", issuer);
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (url.pathname === "/.well-known/openid-configuration") {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      });
    }
    if (url.pathname === "/jwks") {
      return json(200, {
        keys: [{ ...keys.publicKey.export({ format: "jwk" }), kid: "k1", use: "sig" }],
      });
    }
    // The person signs in at once: the browser is sent back with a code.
    if (url.pathname === "/authorize") {
      const code = randomUUID();
      const redirectUri = url.searchParams.get("redirect_uri") as string;
      codes.set(code, {
        nonce: url.searchParams.get("nonce") as string,
        challenge: url.searchParams.get("code_challenge") as string,
        redirectUri,
      });
      const back = new URL(redirectUri);
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") as string);
      response.writeHead(302, { location: back.toString() });
      return response.end();
    }
    if (url.pathname === "/token" && request.method === "POST") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        const pending = codes.get(form.get("code") ?? "");
        const challenge = createHash("sha256")
          .update(form.get("code_verifier") ?? "")
          .digest("base64url");
        if (!pending || pending.challenge !== challenge)
          return json(400, { error: "invalid_grant" });
        const now = Math.floor(Date.now() / 1000);
        const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "k1" }));
        const payload = b64(
          JSON.stringify({
            iss: issuer,
            aud: clientId,
            iat: now,
            exp: now + 300,
            nonce: pending.nonce,
            ...claims,
          }),
        );
        const signature = createSign("RSA-SHA256")
          .update(`${header}.${payload}`)
          .sign(keys.privateKey);
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
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    issuer,
    clientId,
    clientSecret,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
};

/** A provider for the run's tenant, connected to a small identity provider and tried once, as Ada. */
const connectAndTry = async (given: Given) => {
  const idp = await identityProvider({
    sub: "ada-7f3c",
    email: "ada@acme.example",
    name: "Ada Lovelace",
    groups: ["finance"],
  });
  try {
    const base = `/tenants/${given.tenant.id}/identity-providers`;
    const provider = await given.call("POST", base, {
      audience: "members",
      protocol: "oidc",
      name: "Acme Keycloak",
      config: { issuer: idp.issuer, clientId: idp.clientId },
      clientSecret: idp.clientSecret,
    });
    await given.call("POST", `${base}/${provider.id}/domains`, { domain: "acme.example" });
    // The try: the address it gives is opened as a person would, and the provider signs them in.
    const { url } = await given.call("POST", `${base}/${provider.id}/tests`);
    const tab = await given.page.context().newPage();
    try {
      await tab.goto(url);
      await tab.getByRole("heading", { name: "The provider answered" }).waitFor();
    } finally {
      await tab.close();
    }
    return provider.id as string;
  } finally {
    await idp.stop();
  }
};

export const scenes: Record<string, Scene> = {
  // The run's tenant as it is, for the screens of the tenant itself (not of a workspace).
  "sso-tenant": async (given) => ({ at: `/t/${given.tenant.id}` }),

  // A hostname for the portal of a workspace, off and not yet proved.
  "sso-domain": async (given) => {
    await given.call("POST", `/tenants/${given.tenant.id}/domains`, {
      workspaceId: given.workspaces.dev,
      app: "",
      hostname: "portal.example.com",
    });
    return { at: `/t/${given.tenant.id}` };
  },

  // A pool named warehouse, and a standalone worker for it that is heard from for as long as the pictures are taken.
  "sso-workers": async (given) => {
    const base = `/tenants/${given.tenant.id}`;
    await given.call("POST", `${base}/worker-pools`, {
      name: "warehouse",
      description: "Scripts that talk to the warehouse network.",
    });
    const credential = await given.call("POST", `${base}/worker-credentials`, {
      name: "Warehouse worker",
      pool: "warehouse",
    });
    // A worker is online when it was heard from in the last minute and a half: it asks for work, without waiting, as one does.
    const worker = randomUUID();
    const hear = () =>
      fetch(`${new URL(given.page.url()).origin}/api/v1/worker/claim`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ workerId: worker, waitSeconds: 0, version: "0.5.0" }),
      }).catch(() => undefined);
    const first = await hear();
    if (!first?.ok) throw new Error(`worker claim: ${first?.status} ${await first?.text()}`);
    setInterval(hear, 30_000).unref();
    return { at: `/t/${given.tenant.id}` };
  },

  // An OIDC provider for members, off, with one try that passed (Ada, in the group finance).
  "sso-provider": async (given) => {
    await connectAndTry(given);
    return { at: `/t/${given.tenant.id}` };
  },
};
