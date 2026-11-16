import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { decryptFor, encryptFor } from "./kernel/execution/bindings.js";
import { accessToken } from "./kernel/execution/oauth.js";
import { endTask, queueTask } from "./kernel/execution/tasks.js";
import { type Client, startTestApp, type TestApp } from "./testing.js";

const PASSWORD = "a-good-long-password";

let t: TestApp;
let tenant: string;
let workspace: string;
let alice: Client;
let bob: Client;
let worker: Worker;
let working: Promise<unknown>;
let workerToken: string;
let outside: Server;
let outsideUrl: string;

/** What the stand-in provider and API were sent. */
const seen: { url: string; authorization: string | undefined; form: URLSearchParams }[] = [];
/** How the stand-in provider answers. */
const provider = {
  codes: new Map<string, string>(),
  /** Seconds the next code's access token lasts. */
  codeExpiresIn: 3600,
  /** What a refresh answers: a status and a body. */
  refresh: (_form: URLSearchParams): [number, Record<string, unknown>] => [
    200,
    { access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 },
  ],
  issued: 0,
};

const ws = () => `/tenants/${tenant}/workspaces/${workspace}`;
const id = () => ({ tenantId: tenant, workspaceId: workspace, path: "google" });
const SETTINGS = () => ({
  baseUrl: `${outsideUrl}/google-api`,
  authorizeUrl: `${outsideUrl}/authorize`,
  tokenUrl: `${outsideUrl}/token`,
  clientId: "client-1",
  scopes: ["read", "write"],
  authorizeParams: { access_type: "offline", response_type: "token" },
  testPath: "/me",
});

// biome-ignore lint/suspicious/noExplicitAny: list bodies are inspected freely
const listed = async (path: string): Promise<any> =>
  ((await alice.get(`${ws()}/connection-bindings`)).body.items as { path: string }[]).find(
    (item) => item.path === path,
  );

// biome-ignore lint/suspicious/noExplicitAny: task bodies are inspected freely
async function tried(path: string): Promise<any> {
  const queued = await alice.post(`${ws()}/connection-tests`, { path });
  expect(queued.status, JSON.stringify(queued.body)).toBe(202);
  for (let i = 0; i < 200; i++) {
    const task = (await alice.get(`${ws()}/tasks/${queued.body.id}`)).body;
    if (task.status === "succeeded" || task.status === "failed") {
      // The health is kept just after the task ends.
      await sleep(50);
      return task;
    }
    await sleep(50);
  }
  throw new Error("The test did not end.");
}

/** Presses Connect as `who`, and comes back from the provider as `back`. */
async function connect(who: Client, back: Client = who, providerSays?: Record<string, string>) {
  const started = await who.post(`${ws()}/connection-oauth`, {
    path: "google",
    returnTo: "/t/acme/workspaces/main/connections",
  });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  const url = new URL(started.body.url);
  // The member agrees at the provider, which sends the browser back with a code.
  const code = `code-${provider.codes.size + 1}`;
  provider.codes.set(code, url.searchParams.get("code_challenge") ?? "");
  const answer = new URLSearchParams(
    providerSays ?? { code, state: url.searchParams.get("state") ?? "" },
  );
  if (providerSays) answer.set("state", url.searchParams.get("state") ?? "");
  const returned = await back.get(`/oauth/connections/callback?${answer}`);
  return { started, url, returned };
}

const location = (response: { headers: Record<string, unknown> }) =>
  new URL(String(response.headers.location), "http://x");

/** Sets when the stored access token runs out, as time passing would. */
async function expireIn(ms: number) {
  const row = await t.db
    .selectFrom("connection_binding")
    .select(["oauth_tokens"])
    .where("workspace_id", "=", workspace)
    .where("path", "=", "google")
    .executeTakeFirstOrThrow();
  const name = "connection-oauth:google";
  const tokens = JSON.parse(
    await decryptFor(t.kernel, t.db, tenant, workspace, name, row.oauth_tokens as Buffer),
  );
  tokens.expiresAt = Date.now() + ms;
  await t.db
    .updateTable("connection_binding")
    .set({
      oauth_tokens: await encryptFor(
        t.kernel,
        t.db,
        tenant,
        workspace,
        name,
        JSON.stringify(tokens),
      ),
    })
    .where("workspace_id", "=", workspace)
    .where("path", "=", "google")
    .execute();
}

beforeAll(async () => {
  outside = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const url = request.url ?? "";
      const form = new URLSearchParams(body);
      seen.push({ url, authorization: request.headers.authorization, form });
      response.setHeader("content-type", "application/json");
      const send = (status: number, value: unknown) => {
        response.statusCode = status;
        response.end(JSON.stringify(value));
      };
      if (url === "/token") {
        if (form.get("client_secret") !== "client-secret" || form.get("client_id") !== "client-1") {
          return send(401, { error: "invalid_client" });
        }
        if (form.get("grant_type") === "authorization_code") {
          const challenge = provider.codes.get(form.get("code") ?? "");
          provider.codes.delete(form.get("code") ?? "");
          const verified =
            challenge !== undefined &&
            createHash("sha256")
              .update(form.get("code_verifier") ?? "")
              .digest("base64url") === challenge;
          if (!verified) return send(400, { error: "invalid_grant" });
          provider.issued += 1;
          return send(200, {
            access_token: "at-1",
            refresh_token: "rt-1",
            expires_in: provider.codeExpiresIn,
            scope: "read write",
          });
        }
        const [status, value] = provider.refresh(form);
        return send(status, value);
      }
      // The API: a bearer token it knows is let in.
      const token = request.headers.authorization?.replace(/^Bearer /, "");
      if (url.startsWith("/google-api")) {
        return ["at-1", "at-2", "at-3"].includes(token ?? "")
          ? send(200, { me: "alice" })
          : send(401, { error: "who are you" });
      }
      if (url.startsWith("/api")) {
        return token === "good" ? send(200, {}) : send(401, {});
      }
      send(404, {});
    });
  });
  await new Promise<void>((resolve) => outside.listen(0, "127.0.0.1", resolve));
  outsideUrl = `http://127.0.0.1:${(outside.address() as AddressInfo).port}`;

  t = await startTestApp();
  const url = await t.app.listen({ host: "127.0.0.1", port: 0 });
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
  for (const [email, name] of [
    ["alice@acme.example", "Alice"],
    ["bob@acme.example", "Bob"],
  ] as const) {
    const created = await t.admin.post(`/tenants/${tenant}/members`, {
      email,
      name,
      password: PASSWORD,
    });
    await t.admin.post(`/tenants/${tenant}/bindings`, {
      principalType: "member",
      principalId: created.body.id,
      roleId: roles.tenant_admin,
    });
  }
  await t.admin.delete(`/tenants/${tenant}/access-grants/${grant.body.id}`);
  alice = await t.signIn("alice@acme.example", PASSWORD);
  bob = await t.signIn("bob@acme.example", PASSWORD);
  workspace = (
    await alice.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "dev",
      // Its triggers are exercised here: a dev workspace would otherwise start them paused.
      triggersPaused: false,
    })
  ).body.id;
  workerToken = (
    await alice.post(`/tenants/${tenant}/worker-credentials`, {
      name: "test",
      workspaceId: workspace,
    })
  ).body.token;
  worker = new Worker({ url, token: workerToken, claimWaitSeconds: 1 });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker?.stop();
  await working;
  await t?.stop();
  outside?.close();
});

describe("a connection's health is what its last Test found", () => {
  test("a wrong credential fails with the status, a right one is reached, and a change forgets it", async () => {
    const bind = (credential?: string) =>
      alice.put(`${ws()}/connection-bindings/api`, {
        config: { baseUrl: `${outsideUrl}/api`, auth: { type: "bearer" } },
        ...(credential ? { credential } : {}),
      });
    expect((await bind("wrong")).status).toBe(204);
    expect((await listed("api")).health).toBeNull();

    expect((await tried("api")).result).toMatchObject({ ok: false, status: 401 });
    expect((await listed("api")).health).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/^HTTP 401: .*answered 401/),
      latencyMs: null,
    });

    // New settings: what was found no longer says anything.
    await bind("good");
    expect((await listed("api")).health).toBeNull();
    await tried("api");
    const health = (await listed("api")).health;
    expect(health).toMatchObject({ ok: true, problem: null });
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(health.checkedAt)).toBeGreaterThan(Date.now() - 60_000);

    // The same settings again keep it.
    await bind();
    expect((await listed("api")).health).toMatchObject({ ok: true });

    // A test nobody answered says so.
    const task = await queueTask(t.db, {
      tenantId: tenant,
      workspaceId: workspace,
      kind: "test-connection",
      subject: "api",
      request: { connection: "api" },
    });
    await endTask(t.kernel, undefined, task.id, {
      error: { message: "No worker took it in time." },
    });
    expect((await listed("api")).health).toMatchObject({
      ok: false,
      problem: "No worker took it in time.",
    });

    await alice.delete(`${ws()}/connection-bindings/api`);
    const left = await t.db
      .selectFrom("health_check")
      .select("path")
      .where("workspace_id", "=", workspace)
      .where("kind", "=", "connection")
      .execute();
    expect(left).toEqual([]);
  }, 30_000);
});

describe("an OAuth connection", () => {
  test("is declared and bound with its client, and is not connected until a member authorizes it", async () => {
    expect(
      (
        await alice.put(`${ws()}/drafts/google`, {
          kind: "connection",
          schemaVersion: 1,
          body: { connector: "oauth2", description: "Google Sheets" },
        })
      ).status,
    ).toBeLessThan(300);
    // Settings that are not an OAuth client's are refused.
    expect(
      (
        await alice.put(`${ws()}/connection-bindings/google`, {
          config: { baseUrl: `${outsideUrl}/google-api` },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await alice.put(`${ws()}/connection-bindings/google`, {
          config: SETTINGS(),
          credential: "client-secret",
        })
      ).status,
    ).toBe(204);
    // The wizard draws a new connection's settings from the kinds the workspace has.
    const kinds = (await alice.get(`${ws()}/connectors`)).body.items;
    expect(kinds.map((kind: { name: string }) => kind.name)).toEqual(["http", "smtp", "oauth2"]);
    expect(kinds[2].configSchema.required).toEqual([
      "baseUrl",
      "authorizeUrl",
      "tokenUrl",
      "clientId",
    ]);
    expect(await listed("google")).toMatchObject({
      connector: "oauth2",
      defined: false,
      hasCredential: true,
      oauth: { status: "not_connected", scopes: [] },
    });
    // Tried before it is authorized: it says what to do.
    const task = await tried("google");
    expect(task.status).toBe("failed");
    expect(task.error.message).toMatch(/has not been authorized/);
    expect((await listed("google")).health).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/has not been authorized/),
    });
  }, 30_000);

  test("is authorized with PKCE, once, by the member who began it", async () => {
    // Someone else's browser cannot finish it, and does not use it up.
    const { url, returned } = await connect(alice, bob);
    expect(url.origin + url.pathname).toBe(`${outsideUrl}/authorize`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      // What the flow depends on is not overridden by an extra parameter.
      response_type: "code",
      client_id: "client-1",
      redirect_uri: `${t.config.publicUrl}/api/v1/oauth/connections/callback`,
      scope: "read write",
      code_challenge_method: "S256",
      access_type: "offline",
    });
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(returned.status).toBe(302);
    expect(location(returned).searchParams.get("oauth_error")).toMatch(/someone else/);
    expect(location(returned).pathname).toBe("/");
    expect(provider.issued).toBe(0);

    const anonymous = await t.anonymous.get(
      `/oauth/connections/callback?state=${url.searchParams.get("state")}&code=x`,
    );
    expect(location(anonymous).searchParams.get("oauth_error")).toMatch(/someone else/);

    // The member who began it: connected, and sent back where they were.
    const mine = await alice.get(
      `/oauth/connections/callback?state=${url.searchParams.get("state")}&code=code-1`,
    );
    expect(mine.status).toBe(302);
    expect(location(mine).pathname).toBe("/t/acme/workspaces/main/connections");
    expect(Object.fromEntries(location(mine).searchParams)).toEqual({
      oauth: "connected",
      connection: "google",
    });
    expect(provider.issued).toBe(1);
    expect((await listed("google")).oauth).toMatchObject({
      status: "connected",
      scopes: ["read", "write"],
      problem: null,
    });

    // Used once: the same answer again is refused.
    const replay = await alice.get(
      `/oauth/connections/callback?state=${url.searchParams.get("state")}&code=code-1`,
    );
    expect(location(replay).searchParams.get("oauth_error")).toMatch(/ran out or was already used/);
    expect(location(replay).pathname).toBe("/t/acme/workspaces/main/connections");

    // The tokens are sealed, not kept as text.
    const row = await t.db
      .selectFrom("connection_binding")
      .select(["oauth_tokens", "oauth"])
      .where("path", "=", "google")
      .executeTakeFirstOrThrow();
    expect(row.oauth_tokens?.toString("latin1")).not.toContain("rt-1");
    expect(JSON.stringify(row.oauth)).not.toContain("rt-1");

    const audit = await t.db
      .selectFrom("audit_entry")
      .select(["action", "details"])
      .where("action", "like", "connection.oauth%")
      .orderBy("occurred_at")
      .execute();
    expect(audit.map((entry) => entry.action)).toEqual([
      "connection.oauth_started",
      "connection.oauth_connected",
    ]);
  });

  test("a provider's refusal is said, and an answer that ran out is refused", async () => {
    const { returned } = await connect(alice, alice, {
      error: "access_denied",
      error_description: "The user said no",
    });
    expect(location(returned).searchParams.get("oauth_error")).toBe(
      "The provider said no: access_denied (The user said no).",
    );
    expect(location(returned).searchParams.get("connection")).toBe("google");

    const started = await alice.post(`${ws()}/connection-oauth`, { path: "google" });
    const state = new URL(started.body.url).searchParams.get("state");
    await t.db
      .updateTable("connection_oauth_state")
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where("answered_at", "is", null)
      .execute();
    const late = await alice.get(`/oauth/connections/callback?state=${state}&code=x`);
    expect(location(late).searchParams.get("oauth_error")).toMatch(/ran out/);
    // Only an address of this instance is a place to come back to.
    expect(
      (await alice.post(`${ws()}/connection-oauth`, { path: "google", returnTo: "//evil.example" }))
        .status,
    ).toBe(400);
    // Still connected: a refusal does not undo what was authorized.
    expect((await listed("google")).oauth.status).toBe("connected");
  });

  test("a Test reaches the API with the access token, and passes", async () => {
    const task = await tried("google");
    expect(task.result).toMatchObject({ ok: true, status: 200 });
    expect(seen.filter((call) => call.url === "/google-api/me").at(-1)?.authorization).toBe(
      "Bearer at-1",
    );
    expect((await listed("google")).health).toMatchObject({ ok: true });
  }, 30_000);

  test("a token about to run out is refreshed once, however many ask at once", async () => {
    await expireIn(60_000);
    const before = seen.filter((call) => call.form?.get("grant_type") === "refresh_token").length;
    const [first, second, third] = await Promise.all([
      accessToken(t.kernel, id()),
      accessToken(t.kernel, id()),
      accessToken(t.kernel, id()),
    ]);
    const refreshes = seen.filter((call) => call.form?.get("grant_type") === "refresh_token");
    expect(refreshes.length - before).toBe(1);
    expect(refreshes.at(-1)?.form?.get("refresh_token")).toBe("rt-1");
    for (const got of [first, second, third]) expect(got.accessToken).toBe("at-2");
    expect(Date.parse(first?.expiresAt ?? "")).toBeGreaterThan(Date.now() + 3_000_000);

    // A provider that rotates refresh tokens: the new one is used next time.
    provider.refresh = () => [200, { access_token: "at-3", expires_in: 3600 }];
    await expireIn(1000);
    expect((await accessToken(t.kernel, id())).accessToken).toBe("at-3");
    expect(seen.at(-1)?.form?.get("refresh_token")).toBe("rt-2");
    // And one that does not rotate it: the one held is kept.
    await expireIn(1000);
    await accessToken(t.kernel, id());
    expect(seen.at(-1)?.form?.get("refresh_token")).toBe("rt-2");

    // A run's Test is handed the refreshed token without anyone doing anything.
    await expireIn(1000);
    expect((await tried("google")).result).toMatchObject({ ok: true });
    expect(seen.filter((call) => call.url === "/google-api/me").at(-1)?.authorization).toBe(
      "Bearer at-3",
    );
  }, 30_000);

  test("a provider that fails, rather than refuses, leaves the token in use while it lasts", async () => {
    provider.refresh = () => [503, { error: "temporarily_unavailable" }];
    await expireIn(60_000);
    expect((await accessToken(t.kernel, id())).accessToken).toBe("at-3");
    await expireIn(-1000);
    await expect(accessToken(t.kernel, id())).rejects.toThrow(/could not be refreshed: .*503/);
    expect((await listed("google")).oauth.status).toBe("connected");
  });

  test("a refused refresh marks it for reconnecting, and a member reconnects it", async () => {
    provider.refresh = () => [400, { error: "invalid_grant", error_description: "Token revoked" }];
    await expireIn(1000);
    await expect(accessToken(t.kernel, id())).rejects.toThrow(/needs connecting again/);
    const shown = await listed("google");
    expect(shown.oauth).toMatchObject({
      status: "needs_reconnect",
      problem: expect.stringMatching(/refused the refresh: .*invalid_grant \(Token revoked\)/),
    });
    expect(shown.health).toMatchObject({ ok: false, problem: shown.oauth.problem });
    // Not asked again: a run is told at once.
    const asked = seen.length;
    await expect(accessToken(t.kernel, id())).rejects.toThrow(/needs connecting again/);
    expect(seen.length).toBe(asked);
    const failed = await tried("google");
    expect(failed.error.message).toMatch(/needs connecting again/);

    provider.refresh = () => [200, { access_token: "at-2", expires_in: 3600 }];
    const { returned } = await connect(alice);
    expect(location(returned).searchParams.get("oauth")).toBe("connected");
    expect((await listed("google")).oauth.status).toBe("connected");
    // Connecting again forgets what the last Test found.
    expect((await listed("google")).health).toBeNull();
    expect((await accessToken(t.kernel, id())).accessToken).toBe("at-1");
    const audit = await t.db
      .selectFrom("audit_entry")
      .select("action")
      .where("action", "=", "connection.oauth_refresh_failed")
      .execute();
    expect(audit).toHaveLength(1);
  }, 30_000);

  test("a worker is handed the access token, and never the refresh token or the client's secret", async () => {
    worker.stop();
    await working;
    const queued = await alice.post(`${ws()}/connection-tests`, { path: "google" });
    const claim = await t.app.inject({
      method: "POST",
      url: "/api/v1/worker/claim",
      headers: { authorization: `Bearer ${workerToken}` },
      payload: {
        workerId: "018f0000-0000-7000-8000-000000000009",
        waitSeconds: 0,
        kinds: ["test-connection"],
      },
    });
    const job = claim.json().job;
    expect(job.taskId).toBe(queued.body.id);
    const read = await t.app.inject({
      method: "GET",
      url: `/api/v1/worker/tasks/${job.taskId}/connection`,
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      connector: "oauth2",
      credential: "at-1",
      config: { clientId: "client-1" },
    });
    expect(read.json().expiresAt).toEqual(expect.any(String));
    expect(read.body).not.toContain("rt-");
    expect(read.body).not.toContain("client-secret");
  });

  test("pointing it at another client forgets its tokens", async () => {
    await alice.put(`${ws()}/connection-bindings/google`, {
      config: { ...SETTINGS(), clientId: "client-2" },
    });
    expect((await listed("google")).oauth.status).toBe("not_connected");
    await expect(accessToken(t.kernel, id())).rejects.toThrow(/has not been authorized/);
  });

  test("a connection group cannot be an OAuth one", async () => {
    const draft = await alice.put(`${ws()}/drafts/accounts`, {
      kind: "connection_group",
      schemaVersion: 1,
      body: { connector: "oauth2" },
    });
    const deployed = await alice.post(`${ws()}/changes/deploy`, {});
    expect(draft.status < 300 && deployed.status >= 400, JSON.stringify(deployed.body)).toBe(true);
    expect(JSON.stringify(deployed.body)).toMatch(/a group cannot use yet/);
    await alice.delete(`${ws()}/drafts/accounts`);
  });
});

describe("the write path", () => {
  test("the OAuth routes were exercised and audited", () => {
    expect(t.unexercised((route) => /\/(connection-oauth|oauth)(\/|$)/.test(route))).toEqual([]);
    expect(t.unaudited).toEqual([]);
  });
});
