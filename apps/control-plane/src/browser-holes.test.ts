import { createHash } from "node:crypto";
import { type Bundle, type BundleManifest, bundleDigest } from "@volvel/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type Client, startTestApp, type TestApp } from "./testing.js";

/**
 * p35-rt-browser: an app of kind `docs` may carry any file with any content type, and the front door
 * serves it at the console's own address even where no APPS_URL is set (the mode in which an
 * app written as code is refused with 503). Copy to apps/control-plane/src/ and run:
 *   pnpm --filter @volvel/control-plane exec vitest run rt-01-1.test.ts
 * Default test config: appsUrl undefined, appsOnConsoleAddress false.
 */
const PASSWORD = "a-good-long-password";
const MAIN = "localhost:8080";

let t: TestApp;
let tenant: string;
let prod: string;
let alice: Client;
const ws = () => `/tenants/${tenant}/workspaces/${prod}`;
const manifest = (kind: string, path: string, body: object, more: object = {}): BundleManifest =>
  ({ kind, path, schemaVersion: 1, ownership: "code", body, ...more }) as BundleManifest;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

beforeAll(async () => {
  t = await startTestApp();
  const roles = Object.fromEntries(
    (
      await t.db.selectFrom("role").select(["id", "name"]).where("builtin", "=", true).execute()
    ).map((role) => [role.name, role.id]),
  );
  tenant = (await t.admin.post("/tenants", { slug: "acme", name: "Acme" })).body.id;
  const grant = await t.admin.post(`/tenants/${tenant}/access-grants`, {
    reason: "Setup",
    roleId: roles.tenant_admin,
  });
  const member = await t.admin.post(`/tenants/${tenant}/members`, {
    email: "alice@acme.example",
    name: "Alice",
    password: PASSWORD,
  });
  await t.admin.post(`/tenants/${tenant}/bindings`, {
    principalType: "member",
    principalId: member.body.id,
    roleId: roles.tenant_admin,
  });
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  prod = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
}, 60_000);
afterAll(async () => {
  await t?.stop();
});

import { ownPath } from "./kernel/return-path.js";
import { publicPath } from "./problem.js";

const TOKEN = "Zx9aQ_0123456789abcdefghijklmnopqrstuvwxyzABC";

describe("p35 browser: a return address stays on this address", () => {
  test("a tab, a line break, any control or white space character, or a backslash is refused", () => {
    for (const bad of [
      "/\t/evil.example",
      "/\n/evil.example",
      "/\u0000/x",
      "/a b",
      "/\\evil",
      "//evil",
      "/\u2028/x",
      "/\u007f/x",
      "evil",
      "",
    ]) {
      expect(ownPath(bad), JSON.stringify(bad)).toBeUndefined();
    }
    expect(ownPath("/t/acme/flows?x=1#y")).toBe("/t/acme/flows?x=1#y");
  });

  test("the staff link of a portal does not send a signed-in member to another site", async () => {
    const me = await t.signIn("alice@acme.example", PASSWORD);
    const response = await t.app.inject({
      method: "GET",
      url: "/portal/acme/staff?return=%2F%09%2Fevil.example",
      headers: { host: MAIN, ...me.headers },
    });
    expect(response.statusCode).toBe(303);
    const seen = new URL(
      String(response.headers.location).replace(/[\t\r\n]/g, ""),
      `http://${MAIN}`,
    );
    expect(seen.host).toBe(MAIN);
  });

  test("the sign-in page of a portal does not carry such a value into its form", async () => {
    const response = await t.app.inject({
      method: "GET",
      url: "/portal/acme/sign-in?return=%2F%09%2Fevil.example",
      headers: { host: MAIN },
    });
    expect(response.body).not.toContain("evil.example");
  });
});

describe("p35 browser: a token in a console address is not written down", () => {
  test("the pages an approval mail, a password link and a form open", () => {
    expect(publicPath({ url: `/approve/${TOKEN}` })).toBe("/approve/:token");
    expect(publicPath({ url: `/reset-password/${TOKEN}?x=1` })).toBe("/reset-password/:token");
    expect(publicPath({ url: `/portal/acme/forms/vxf_${TOKEN}` })).toBe(
      "/portal/acme/forms/:token",
    );
    expect(publicPath({ url: "/portal/acme/forms/contact" })).toBe("/portal/acme/forms/contact");
  });
});

describe("p35 browser: a docs app's files run as no origin at the console's address", () => {
  test("an HTML page and a script of a docs app are served inside a sandbox, and never sniffed", async () => {
    const html = Buffer.from('<!doctype html><script src="evil.js"></script>');
    const js = Buffer.from("fetch('/api/v1/me')");
    for (const file of [html, js]) {
      const up = await alice.upload(
        `${ws()}/bundle-assets/${sha(file)}`,
        file,
        "application/octet-stream",
        {},
        "PUT",
      );
      expect([200, 201], JSON.stringify(up.body)).toContain(up.status);
    }
    const unsigned = {
      formatVersion: 4 as const,
      sdkVersion: "0.5.0",
      core: { min: "0.0.0", below: "99.0.0" },
      manifests: [
        manifest("doc", "handbook/index", {
          source: "---\ntitle: Handbook\ndescription: Home.\n---\n\nWords.\n",
        }),
        manifest("app", "help", { title: "Handbook", docs: "handbook" }),
        manifest("binding", "bindings/help", {
          role: "portal_user",
          principal: { type: "anonymous" },
          resource: "help",
        }),
      ],
      code: "export {};",
      assets: [
        {
          app: "help",
          path: "evil.html",
          sha256: sha(html),
          size: html.length,
          contentType: "text/html",
        },
        {
          app: "help",
          path: "evil.js",
          sha256: sha(js),
          size: js.length,
          contentType: "text/javascript",
        },
      ],
    };
    const bundle = { ...unsigned, digest: bundleDigest(unsigned) } as Bundle;
    const uploaded = await alice.post(`${ws()}/bundles`, bundle);
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
    const deployed = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(deployed.status, JSON.stringify(deployed.body)).toBeLessThan(300);

    for (const name of ["evil.html", "evil.js"]) {
      const response = await t.app.inject({
        method: "GET",
        url: `/apps/acme/main/help/${name}`,
        headers: { host: MAIN },
      });
      expect(response.statusCode, name).toBe(200);
      expect(String(response.headers["content-security-policy"]), name).toMatch(
        /(^|; )sandbox($|;)/,
      );
      expect(response.headers["x-content-type-options"], name).toBe("nosniff");
    }
    // The pages the platform draws for the docs app are not in a sandbox.
    const page = await t.app.inject({
      method: "GET",
      url: "/apps/acme/main/help/",
      headers: { host: MAIN },
    });
    expect(page.statusCode).toBe(200);
    expect(String(page.headers["content-security-policy"] ?? "")).not.toMatch(/sandbox/);
  });
});
