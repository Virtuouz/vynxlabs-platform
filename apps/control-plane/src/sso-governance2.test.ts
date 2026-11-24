import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId } from "@volvel/db";
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
  // A console to serve, so that a page at an address is the console or it is not.
  const consoleDir = mkdtempSync(join(tmpdir(), "console-"));
  mkdirSync(consoleDir, { recursive: true });
  writeFileSync(join(consoleDir, "index.html"), "<title>Console</title>");
  t = await startTestApp({ config: { consoleDir } });
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

describe("a group mapping an access release made (GOV-19)", () => {
  test("is listed as the release's, and an empty save leaves it", async () => {
    const idp = await describedIssuer((origin) => origin);
    try {
      const made = await alice.post(providers(), {
        audience: "members",
        protocol: "oidc",
        name: "Mapped",
        config: { issuer: idp.origin, clientId: "console" },
      });
      const id = made.body.id as string;
      const group = await alice.post(`/tenants/${tenant}/groups`, { name: "Finance" });
      expect(group.status, JSON.stringify(group.body)).toBe(201);
      const other = await alice.post(`/tenants/${tenant}/groups`, { name: "Staff" });
      await t.db
        .insertInto("identity_group_map")
        .values({
          id: newId(),
          provider_id: id,
          tenant_id: tenant,
          claim_value: "finance",
          member_group_id: group.body.id,
          managed_by: "release",
        })
        .execute();
      const put = await alice.put(`${providers()}/${id}/group-maps`, {
        items: [{ value: "everyone", groupId: other.body.id }],
      });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      const by = Object.fromEntries(
        put.body.items.map((item: Any) => [item.value, item.managedBy]),
      );
      expect(by).toEqual({ finance: "release", everyone: "hand" });
      const emptied = await alice.put(`${providers()}/${id}/group-maps`, { items: [] });
      expect(emptied.body.items.map((item: Any) => item.value)).toEqual(["finance"]);
    } finally {
      await idp.stop();
    }
  });
});

describe("a hostname that is registered and not enabled (GOV-24)", () => {
  const page = async (host: string) =>
    (await t.app.inject({ method: "GET", url: "/", headers: { host } })).statusCode;

  test("a proved one is not served, and a name nobody registered is still the instance", async () => {
    const ws = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "main",
        name: "Main",
        type: "production",
      })
    ).body.id as string;
    const host = "held.portal.test";
    const made = await alice.post(`/tenants/${tenant}/domains`, {
      workspaceId: ws,
      app: "",
      hostname: host,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    // Not proved: the name may be anyone's, so nobody can switch it off. Words only.
    expect(await page(host)).toBe(200);
    txt.set(made.body.challenge.name, made.body.challenge.value);
    const checked = await alice.post(`/tenants/${tenant}/domains/${made.body.id}/checks`);
    expect(checked.body.verifiedAt, JSON.stringify(checked.body)).not.toBeNull();
    // Proved and not enabled: it serves nothing, and says so.
    const refused = await t.app.inject({ method: "GET", url: "/", headers: { host } });
    expect(refused.statusCode).toBe(404);
    expect(refused.body).toContain("not served");
    // Its check address still answers, so a check can say whether the name reaches the instance.
    expect(
      (await t.app.inject({ method: "GET", url: "/api/v1/domain-check", headers: { host } }))
        .statusCode,
    ).toBe(200);
    // A name nobody registered is the instance by another name, as before.
    expect(await page("nobody.portal.test")).toBe(200);
    // Removing the registration lets the name serve the console again at once.
    expect((await alice.delete(`/tenants/${tenant}/domains/${made.body.id}`)).status).toBe(204);
    expect(await page(host)).toBe(200);
  });
});

describe("a verified name whose record is gone (GOV-25, D45)", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  test("a hostname keeps its first date, says since when the record is gone, and is audited", async () => {
    const ws = (
      await alice.post(`/tenants/${tenant}/workspaces`, {
        slug: "gone",
        name: "Gone",
        type: "dev",
      })
    ).body.id as string;
    const made = await alice.post(`/tenants/${tenant}/domains`, {
      workspaceId: ws,
      app: "",
      hostname: "gone.portal.test",
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const url = `/tenants/${tenant}/domains/${made.body.id}/checks`;
    txt.set(made.body.challenge.name, made.body.challenge.value);
    const first = (await alice.post(url)).body;
    expect(first.verifiedAt).not.toBeNull();
    expect(first.recordGoneAt).toBeNull();
    await sleep(15);
    // Checked again with the record there: the first date stays.
    expect((await alice.post(url)).body.verifiedAt).toBe(first.verifiedAt);
    // The record is taken away.
    txt.delete(made.body.challenge.name);
    const gone = (await alice.post(url)).body;
    expect(gone.verifiedAt).toBe(first.verifiedAt);
    expect(gone.recordGoneAt).not.toBeNull();
    expect(gone.checkError).toContain("No TXT record");
    // The tenant's count of hostnames to look at includes it.
    expect((await alice.get(`/tenants/${tenant}/summary`)).body.domainsToFix).toBeGreaterThan(0);
    await sleep(15);
    // Gone since the first check that did not find it, not since the latest.
    expect((await alice.post(url)).body.recordGoneAt).toBe(gone.recordGoneAt);
    const listed = (await alice.get(`/tenants/${tenant}/domains`)).body.items.find(
      (one: Any) => one.id === made.body.id,
    );
    expect(listed.recordGoneAt).toBe(gone.recordGoneAt);
    // Shown and audited, once; nothing stops.
    const entries = await t.db
      .selectFrom("audit_entry")
      .select("target_id")
      .where("action", "=", "app_domain.record_gone")
      .execute();
    expect(entries.filter((entry) => entry.target_id === made.body.id)).toHaveLength(1);
    // Found again: back to plain verified.
    txt.set(made.body.challenge.name, made.body.challenge.value);
    const back = (await alice.post(url)).body;
    expect(back.recordGoneAt).toBeNull();
    expect(back.verifiedAt).toBe(first.verifiedAt);
  });

  test("an email domain of a provider does the same", async () => {
    const idp = await describedIssuer((origin) => origin);
    try {
      const made = await alice.post(providers(), {
        audience: "members",
        protocol: "oidc",
        name: "Gone",
        config: { issuer: idp.origin, clientId: "console" },
      });
      const id = made.body.id as string;
      const added = await alice.post(`${providers()}/${id}/domains`, { domain: "gone.example" });
      const url = `${providers()}/${id}/domains/${added.body.id}/checks`;
      txt.set(added.body.record.name, added.body.record.value);
      const first = (await alice.post(url)).body;
      expect(first.verified).toBe(true);
      txt.delete(added.body.record.name);
      const gone = (await alice.post(url)).body;
      expect(gone.verified).toBe(true);
      expect(gone.verifiedAt).toBe(first.verifiedAt);
      expect(gone.recordGoneAt).not.toBeNull();
      expect(gone.problem).toContain("No TXT record");
      const entries = await t.db
        .selectFrom("audit_entry")
        .select("target_id")
        .where("action", "=", "identity_domain.record_gone")
        .execute();
      expect(entries.filter((entry) => entry.target_id === added.body.id)).toHaveLength(1);
      txt.set(added.body.record.name, added.body.record.value);
      expect((await alice.post(url)).body.recordGoneAt).toBeNull();
    } finally {
      await idp.stop();
    }
  });
});
