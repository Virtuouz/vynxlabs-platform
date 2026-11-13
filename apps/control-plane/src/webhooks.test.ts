import { createHmac } from "node:crypto";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { signatureProblem } from "./kernel/execution/triggers.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";
const SECRET = "whsec-shared-with-the-sender";

let t: TestApp;
let tenant: string;
let workspace: string;
let alice: Client;
let hooks: Record<string, string>;

const ws = () => `/tenants/${tenant}/workspaces/${workspace}`;
const script = (path: string): BundleManifest => ({
  kind: "script",
  schemaVersion: 1,
  path,
  ownership: "code",
  body: {
    entry: "take",
    input: {},
    output: {},
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
  },
});
const hook = (path: string, extra: Record<string, unknown> = {}): BundleManifest => ({
  kind: "trigger",
  schemaVersion: 1,
  path,
  ownership: "code",
  body: { type: "webhook", script: "take", ...extra },
});
const github = {
  scheme: "hmac-sha256",
  header: "X-Hub-Signature-256",
  secret: "HOOK_SECRET",
  prefix: "sha256=",
};
function bundle(): Bundle {
  const unsigned = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      script("take"),
      hook("plain"),
      hook("whole", { input: "request" }),
      hook("signed", { input: "request", verify: github }),
      hook("shop", {
        verify: {
          scheme: "hmac-sha256",
          header: "X-Shop-Hmac",
          secret: "HOOK_SECRET",
          encoding: "base64",
        },
      }),
      hook("chat", {
        verify: {
          scheme: "hmac-sha256",
          header: "X-Chat-Signature",
          secret: "HOOK_SECRET",
          prefix: "v0=",
          signed: "v0:{timestamp}:{body}",
          timestampHeader: "X-Chat-Request-Timestamp",
          toleranceSeconds: 300,
        },
      }),
    ],
    code: "export const take = { execute: async (input) => input };\n",
  };
  return { ...unsigned, digest: bundleDigest(unsigned) };
}

/** Sends a request to a webhook's address exactly as given, with no help from a client. */
const send = (name: string, payload: string, headers: Record<string, string> = {}, query = "") =>
  t.app.inject({ method: "POST", url: `/api/v1${hooks[name]}${query}`, headers, payload });
const inputOf = async (runId: string) => (await alice.get(`${ws()}/runs/${runId}`)).body.input;
const sign = (text: string, encoding: "hex" | "base64" = "hex") =>
  createHmac("sha256", SECRET).update(text).digest(encoding);

beforeAll(async () => {
  t = await startTestApp({ version: "0.5.0" });
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
  workspace = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
}, 60_000);
afterAll(() => t.stop());

describe("a webhook that checks signatures", () => {
  test("cannot be deployed until the secret it checks against is set", async () => {
    const uploaded = await alice.post(`${ws()}/bundles`, bundle());
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
    const refused = await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id });
    expect(refused.status).toBe(409);
    expect(refused.body.errors).toEqual([
      {
        path: "/secrets/HOOK_SECRET",
        message: 'the secret "HOOK_SECRET" is not set in this workspace',
      },
    ]);
    await alice.put(`${ws()}/secrets/HOOK_SECRET`, { value: SECRET });
    expect((await alice.post(`${ws()}/deployments`, { bundleId: uploaded.body.id })).status).toBe(
      201,
    );
    hooks = Object.fromEntries(
      ((await alice.get(`${ws()}/triggers`)).body.items as { path: string; url: string }[]).map(
        (one) => [one.path, new URL(one.url).pathname.replace("/api/v1", "")],
      ),
    );
  });

  test("a signed request starts a run, and one that is not signed right starts nothing", async () => {
    const body = JSON.stringify({ action: "opened", number: 7 });
    const good = await send("signed", body, {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${sign(body)}`,
    });
    expect(good.statusCode, good.body).toBe(202);

    const before = (await alice.get(`${ws()}/runs?limit=200`)).body.items.length;
    for (const headers of [
      { "x-hub-signature-256": `sha256=${sign(`${body} `)}` },
      { "x-hub-signature-256": sign(body) }, // without the prefix the sender uses
      { "x-hub-signature-256": "sha256=zz" },
      {}, // not signed at all
    ]) {
      const refused = await send("signed", body, {
        "content-type": "application/json",
        ...headers,
      });
      expect(refused.statusCode).toBe(401);
      expect(refused.json().code).toBe("signature_invalid");
    }
    // The body is what was signed: one byte different and it does not match.
    const tampered = await send("signed", body.replace("7", "8"), {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${sign(body)}`,
    });
    expect(tampered.statusCode).toBe(401);
    expect((await alice.get(`${ws()}/runs?limit=200`)).body.items.length).toBe(before);
  });

  test("a signature written in base64 is checked the same way", async () => {
    const body = '{"id":1}';
    const headers = { "content-type": "application/json" };
    expect(
      (await send("shop", body, { ...headers, "x-shop-hmac": sign(body, "base64") })).statusCode,
    ).toBe(202);
    expect((await send("shop", body, { ...headers, "x-shop-hmac": sign(body) })).statusCode).toBe(
      401,
    );
  });

  test("a signature over a timestamp and the body is checked, and an old request is refused", async () => {
    const body = "token=abc&text=hello";
    const headers = (at: number) => ({
      "content-type": "application/x-www-form-urlencoded",
      "x-chat-request-timestamp": String(at),
      "x-chat-signature": `v0=${sign(`v0:${at}:${body}`)}`,
    });
    const now = Math.floor(Date.now() / 1000);
    const fresh = await send("chat", body, headers(now));
    expect(fresh.statusCode, fresh.body).toBe(202);
    expect(await inputOf(fresh.json().runId)).toEqual({ token: "abc", text: "hello" });
    // Signed correctly, and ten minutes old: a captured request sent again.
    const replayed = await send("chat", body, headers(now - 600));
    expect(replayed.statusCode).toBe(401);
    expect(replayed.json().detail).toBe("The request's timestamp is too far from now.");
    const noTime = await send("chat", body, {
      "content-type": "application/x-www-form-urlencoded",
      "x-chat-signature": `v0=${sign(body)}`,
    });
    expect(noTime.statusCode).toBe(401);
  });

  test("the check itself: what each mistake is called", () => {
    const request = (headers: Record<string, string>, raw = "{}") => ({
      method: "POST",
      headers,
      query: {},
      raw: Buffer.from(raw),
    });
    const verify = { scheme: "hmac-sha1" as const, header: "X-Sig", secret: "S" };
    const sha1 = createHmac("sha1", "k").update("{}").digest("hex");
    expect(signatureProblem(verify, "k", request({ "x-sig": sha1 }))).toBeUndefined();
    expect(signatureProblem(verify, "other", request({ "x-sig": sha1 }))).toBe(
      "The signature does not match.",
    );
    expect(signatureProblem(verify, "k", request({}))).toBe("The X-Sig header is missing.");
  });
});

describe("what a webhook hands to its script", () => {
  test("by default the body alone: JSON, a form's fields, or text", async () => {
    const json = await send("plain", '{"name":"Ada","tags":["a"]}', {
      "content-type": "application/json",
    });
    expect(await inputOf(json.json().runId)).toEqual({ name: "Ada", tags: ["a"] });

    const form = await send("plain", "name=Ada+L&tag=a&tag=b&note=%C3%A9", {
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(form.statusCode, form.body).toBe(202);
    expect(await inputOf(form.json().runId)).toEqual({ name: "Ada L", tag: ["a", "b"], note: "é" });

    const text = await send("plain", "just text", { "content-type": "text/plain" });
    expect(await inputOf(text.json().runId)).toBe("just text");
    const empty = await send("plain", "", {});
    expect(await inputOf(empty.json().runId)).toEqual({});
    const broken = await send("plain", "{not json", { "content-type": "application/json" });
    expect(broken.statusCode).toBe(400);
    expect(broken.json().detail).toBe("The body is not valid JSON.");
  });

  test("when asked, the whole request: headers, query, method and the body as it was sent", async () => {
    const raw = '{ "name":  "Ada" }';
    const accepted = await send(
      "whole",
      raw,
      {
        "content-type": "application/json",
        "x-sender-event": "ping",
        authorization: "Bearer theirs",
        cookie: "a=b",
      },
      "?source=shop&attempt=2",
    );
    expect(accepted.statusCode, accepted.body).toBe(202);
    const input = await inputOf(accepted.json().runId);
    expect(input).toMatchObject({
      method: "POST",
      query: { source: "shop", attempt: "2" },
      body: { name: "Ada" },
      // Byte for byte, spaces included, for a script that checks a signature itself.
      rawBody: raw,
    });
    expect(input.headers).toMatchObject({
      "content-type": "application/json",
      "x-sender-event": "ping",
    });
    // The sender's own credentials are not handed on, or kept with the run.
    expect(input.headers.authorization).toBeUndefined();
    expect(input.headers.cookie).toBeUndefined();
    expect(JSON.stringify(input)).not.toContain("Bearer theirs");
  });

  test("an unknown address is not found, whatever is sent to it", async () => {
    const response = await t.app.inject({
      method: "POST",
      url: "/api/v1/hooks/vxh_nobody",
      headers: { "content-type": "application/xml" },
      payload: "<a/>",
    });
    expect(response.statusCode).toBe(404);
  });
});
