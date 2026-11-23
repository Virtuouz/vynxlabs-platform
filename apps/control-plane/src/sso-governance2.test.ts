import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { dns } from "./kernel/apps/challenge.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: test responses are inspected freely
type Any = any;

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let alice: Client;
const txt = new Map<string, string>();

const providers = () => `/tenants/${tenant}/identity-providers`;

beforeAll(async () => {
  dns.resolveTxt = async (name) => (txt.has(name) ? [[txt.get(name) as string]] : []);
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "acme" })).body.id as string;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
}, 60_000);

afterAll(async () => {
  await t?.stop();
});

/** An OIDC provider that only describes itself, publishing the issuer it is told to. */
async function describedIssuer(
  published: (origin: string) => string,
): Promise<{ origin: string; stop: () => Promise<void> }> {
  let origin = "";
  const server: Server = createServer((request, response) => {
    if (!(request.url ?? "").endsWith("/.well-known/openid-configuration")) {
      response.writeHead(404).end();
      return;
    }
    const issuer = published(origin);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, stop: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function prove(id: string, domain: string) {
  const added = await alice.post(`${providers()}/${id}/domains`, { domain });
  expect(added.status, JSON.stringify(added.body)).toBe(201);
  txt.set(added.body.record.name, added.body.record.value);
  const checked = await alice.post(`${providers()}/${id}/domains/${added.body.id}/checks`);
  expect(checked.body.verified, JSON.stringify(checked.body)).toBe(true);
  return added.body.id as string;
}

describe("connecting an OIDC provider (GOV-13, GOV-15)", () => {
  test("a public client, with no secret, can be turned on (GOV-13)", async () => {
    const idp = await describedIssuer((origin) => origin);
    try {
      const made = await alice.post(providers(), {
        audience: "members",
        protocol: "oidc",
        name: "Public",
        config: { issuer: idp.origin, clientId: "console" },
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      await prove(made.body.id, "public.example");
      const on = await alice.patch(`${providers()}/${made.body.id}`, { enabled: true });
      expect(on.status, JSON.stringify(on.body)).toBe(200);
      expect(on.body.hasSecret).toBe(false);

      // A secret once stored can be cleared again.
      const given = await alice.patch(`${providers()}/${made.body.id}`, { clientSecret: "s3cret" });
      expect(given.body.hasSecret).toBe(true);
      const cleared = await alice.patch(`${providers()}/${made.body.id}`, { clientSecret: null });
      expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
      expect(cleared.body.hasSecret).toBe(false);
    } finally {
      await idp.stop();
    }
  });

  test("an issuer that publishes a trailing slash connects, typed either way (GOV-15)", async () => {
    const idp = await describedIssuer((origin) => `${origin}/app/slash/`);
    try {
      for (const typed of [`${idp.origin}/app/slash`, `${idp.origin}/app/slash/`]) {
        const made = await alice.post(providers(), {
          audience: "members",
          protocol: "oidc",
          name: `Slash ${typed.endsWith("/")}`,
          config: { issuer: typed, clientId: "console" },
        });
        expect(made.status, `${typed} ${JSON.stringify(made.body)}`).toBe(201);
      }
    } finally {
      await idp.stop();
    }
    // One that publishes none still connects when a slash is typed.
    const plain = await describedIssuer((origin) => `${origin}/app/plain`);
    try {
      const made = await alice.post(providers(), {
        audience: "members",
        protocol: "oidc",
        name: "Plain",
        config: { issuer: `${plain.origin}/app/plain/`, clientId: "console" },
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
    } finally {
      await plain.stop();
    }
  });
});

export type { Any };
