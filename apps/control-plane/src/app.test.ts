import { Database } from "@vynxlabs/db";
import { createTestDatabase, type TestDatabase } from "@vynxlabs/db/testing";
import type { RouteOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "./app.js";
import type { ObjectStore } from "./storage.js";
import { testConfig } from "./testing.js";

let testDb: TestDatabase;
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let storageUp = true;
const routes: RouteOptions[] = [];

const storage: ObjectStore = {
  async check() {
    if (!storageUp) throw new Error("connection refused to 10.0.0.5");
  },
  async ensureBucket() {},
  close() {},
};

beforeAll(async () => {
  testDb = await createTestDatabase();
  database = new Database({ connectionString: testDb.connectionString });
  await database.migrate();
  app = await buildApp({
    database,
    storage,
    version: "1.2.3",
    config: testConfig(),
    onRoute: (route) => routes.push(route),
  });
  // A route that exists only to exercise validation and failure handling.
  app.post(
    "/test/echo",
    {
      schema: {
        body: {
          type: "object",
          properties: { count: { type: "integer", minimum: 1 } },
          required: ["count"],
        },
      },
    },
    async (request) => {
      if ((request.body as { count: number }).count === 13) throw new Error("secret detail");
      return request.body;
    },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await database.close();
  await testDb.drop();
});

describe("routes", () => {
  test("healthz", async () => {
    const response = await app.inject({ url: "/api/v1/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  test("readyz reports ready when Postgres and the object store answer", async () => {
    const response = await app.inject({ url: "/api/v1/readyz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ready",
      checks: { database: { ok: true }, objectStore: { ok: true } },
    });
  });

  test("readyz returns 503 and names the failing check without leaking its cause", async () => {
    storageUp = false;
    try {
      const response = await app.inject({ url: "/api/v1/readyz" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: "not_ready",
        checks: { database: { ok: true }, objectStore: { ok: false, error: "Error" } },
      });
    } finally {
      storageUp = true;
    }
  });

  test("instance reports the core version and migration level", async () => {
    const response = await app.inject({ url: "/api/v1/instance" });
    expect(response.json()).toEqual({
      coreVersion: "1.2.3",
      apiVersion: "v1",
      migrationLevel: await database.migrationLevel(),
    });
    expect(response.json().migrationLevel).toBeGreaterThan(0);
  });
});

describe("API description", () => {
  test("is OpenAPI 3.1 and lists every route, each with a response schema", async () => {
    const response = await app.inject({ url: "/api/v1/openapi.json" });
    expect(response.statusCode).toBe(200);
    const description = response.json();
    expect(description.openapi).toBe("3.1.0");
    expect(description.info.version).toBe("1.2.3");

    const api = routes.filter(
      (route) =>
        route.url.startsWith("/api/") && route.method !== "HEAD" && !route.url.includes("/auth/"),
    );
    expect(api.length).toBeGreaterThan(40);
    for (const route of api) {
      // The description writes a parameter as {name} and a wildcard as {*}.
      const path = route.url.replace(/:(\w+)/g, "{$1}").replace(/\*$/, "{*}");
      expect(route.schema?.response, `${route.url} needs a response schema`).toBeDefined();
      expect(description.paths[path], `${route.url} is not described`).toBeDefined();
    }
  });

  test("includes the sign-in routes served by the authentication library", async () => {
    const description = (await app.inject({ url: "/api/v1/openapi.json" })).json();
    expect(description.paths["/api/v1/auth/sign-in/email"]).toBeDefined();
    expect(description.paths["/api/v1/auth/sign-out"]).toBeDefined();
    expect(description.paths["/api/v1/auth/get-session"]).toBeDefined();
  });

  test("every route declares how it decides access", () => {
    const undeclared = routes
      .filter((route) => route.url.startsWith("/api/"))
      .filter((route) => !(route.config as { access?: unknown } | undefined)?.access)
      .map((route) => `${route.method} ${route.url}`);
    expect(undeclared).toEqual([]);
  });
});

describe("conventions", () => {
  test("an unknown route is a problem document", async () => {
    const response = await app.inject({ url: "/api/v1/nope?x=1" });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
    expect(response.json()).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      code: "not_found",
      detail: "No route matches GET /api/v1/nope.",
      instance: "/api/v1/nope",
      requestId: response.headers["x-request-id"],
    });
  });

  test("a validation failure lists each error with its path", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/test/echo",
      payload: { count: 0 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toMatch(/^application\/problem\+json\b/);
    expect(response.json()).toMatchObject({
      status: 400,
      code: "validation_failed",
      errors: [{ path: "/body/count", message: "must be >= 1" }],
    });
  });

  test("an unexpected failure is a 500 that hides the internal message", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/test/echo",
      payload: { count: 13 },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ status: 500, code: "internal_error" });
    expect(response.body).not.toContain("secret detail");
  });

  test("a malformed JSON body is a 400 problem document", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ status: 400, code: "bad_request" });
  });

  test("a well-formed incoming request ID is kept, anything else is replaced", async () => {
    const kept = await app.inject({
      url: "/api/v1/healthz",
      headers: { "x-request-id": "abc-123" },
    });
    expect(kept.headers["x-request-id"]).toBe("abc-123");

    const replaced = await app.inject({
      url: "/api/v1/healthz",
      headers: { "x-request-id": "has spaces and <tags>" },
    });
    expect(replaced.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
