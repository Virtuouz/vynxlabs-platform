import { Database } from "@volvel/db";
import { createTestDatabase, type TestDatabase } from "@volvel/db/testing";
import { isGrantablePermission, isKnownPermission, PERMISSION_KINDS } from "@volvel/manifest";
import type { RouteOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { API_TAGS } from "./api-description.js";
import { buildApp } from "./app.js";
import { MemoryObjectStore } from "./storage.js";
import { testConfig } from "./testing.js";

let testDb: TestDatabase;
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let storageUp = true;
let storageDelayMs = 0;
const routes: RouteOptions[] = [];

class FlakyStore extends MemoryObjectStore {
  override async check() {
    if (storageDelayMs) await new Promise((resolve) => setTimeout(resolve, storageDelayMs));
    if (!storageUp) throw new Error("connection refused to 10.0.0.5");
  }
}
const storage = new FlakyStore();

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
      checks: {
        database: { ok: true, readOnly: false, latencyMs: expect.any(Number) },
        objectStore: { ok: true },
      },
    });
  });

  test("readyz returns 503 and names the failing check without leaking its cause", async () => {
    storageUp = false;
    try {
      const response = await app.inject({ url: "/api/v1/readyz" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: "not_ready",
        checks: {
          database: { ok: true, readOnly: false, latencyMs: expect.any(Number) },
          objectStore: { ok: false, error: "Error" },
        },
      });
    } finally {
      storageUp = true;
    }
  });

  test("the database's latency is the database's, not the slower of the two checks (INS-23)", async () => {
    storageDelayMs = 700;
    try {
      const response = await app.inject({ url: "/api/v1/readyz" });
      expect(response.statusCode).toBe(200);
      expect(response.json().checks.database.latencyMs).toBeLessThan(500);
    } finally {
      storageDelayMs = 0;
    }
  });

  test("instance reports the core version and migration level", async () => {
    const response = await app.inject({ url: "/api/v1/instance" });
    expect(response.json()).toEqual({
      coreVersion: "1.2.3",
      apiVersion: "v1",
      migrationLevel: await database.migrationLevel(),
      appsAddress: "console",
      mail: false,
      publicUrl: "http://localhost:8080",
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

  test("says what each route needs, as the route itself declares it", async () => {
    const description = (await app.inject({ url: "/api/v1/openapi.json" })).json();
    const api = routes.filter(
      (route) =>
        route.url.startsWith("/api/") && route.method !== "HEAD" && !route.url.includes("/auth/"),
    );
    let checked = 0;
    for (const route of api) {
      const path = route.url.replace(/:(\w+)/g, "{$1}").replace(/\*$/, "{*}");
      for (const method of [route.method].flat()) {
        const operation = description.paths[path]?.[String(method).toLowerCase()];
        if (!operation) continue;
        expect(operation["x-access"], `${method} ${route.url}`).toEqual(
          (route.config as { access?: unknown }).access,
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(description.paths["/api/v1/tenants/{t}/workspaces/{w}/tables"].get["x-access"]).toEqual({
      kind: "permission",
      permission: "table:read",
      scope: "workspace",
    });
  });

  test("WLK-15: a run says in its schema that a trigger source's run names its source", async () => {
    const description = (await app.inject({ url: "/api/v1/openapi.json" })).json();
    const run =
      description.paths["/api/v1/tenants/{t}/workspaces/{w}/runs/{id}"].get.responses["200"]
        .content["application/json"].schema;
    expect(run.properties.trigger.properties.relay.properties.mode.enum).toEqual([
      "webhook",
      "poll",
    ]);
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

/** Lists that answer `items` with no cursor and have not yet said, with `listOf`, whether they are whole. Only shorter. */
const LISTS_NOT_YET_SAID: string[] = [
  "GET /api/v1/me/recent",
  "GET /api/v1/kinds",
  "GET /api/v1/core-nodes",
  "GET /api/v1/permissions",
  "GET /api/v1/tenants/{t}/me/groups",
  "GET /api/v1/tenants/{t}/principals",
  "GET /api/v1/tenants/{t}/workspaces/{w}/aliases",
  "GET /api/v1/tenants/{t}/workspaces/{w}/scripts",
  "GET /api/v1/tenants/{t}/workspaces/{w}/runs/{id}/logs",
  "GET /api/v1/tenants/{t}/workspaces/{w}/triggers",
  "GET /api/v1/tenants/{t}/workspaces/{w}/connectors",
  "GET /api/v1/tenants/{t}/workspaces/{w}/connection-groups",
  "GET /api/v1/tenants/{t}/workspaces/{w}/variable-values",
  "GET /api/v1/tenants/{t}/workers",
  "GET /api/v1/tenants/{t}/queue",
  "GET /api/v1/tenants/{t}/workspaces/{w}/draft-history/{*}",
  "GET /api/v1/tenants/{t}/git-branches",
  "GET /api/v1/tenants/{t}/workspaces/{w}/git/operations",
  "GET /api/v1/tenants/{t}/workspaces/{w}/flows",
  "GET /api/v1/tenants/{t}/workspaces/{w}/tables",
  "GET /api/v1/tenants/{t}/workspaces/{w}/aggregate/{*}",
  "GET /api/v1/tenants/{t}/workspaces/{w}/queries",
  "GET /api/v1/tenants/{t}/workspaces/{w}/data-source-bindings",
  "GET /api/v1/tenants/{t}/workspaces/{w}/data-source-tables/{*}",
  "GET /api/v1/tenants/{t}/workspaces/{w}/interfaces",
  "GET /api/v1/tenants/{t}/workspaces/{w}/docs/search",
  "GET /api/v1/worker/runs/{id}/connection-groups/{*}",
  "GET /api/v1/tenants/{t}/search",
  "GET /api/v1/tenants/{t}/workspaces/{w}/alerts",
  "GET /api/v1/tenants/{t}/workspaces/{w}/references",
  "GET /api/v1/tenants/{t}/workspaces/{w}/drift",
];

describe("API description, as a reference is drawn from it", () => {
  type Operation = {
    tags?: string[];
    summary?: string;
    description?: string;
    operationId?: string;
    security?: unknown;
    responses: Record<string, { description?: string; content?: Record<string, unknown> }>;
    "x-access"?: { kind: string; says?: string };
  };
  const operationsOf = async () => {
    const description = (await app.inject({ url: "/api/v1/openapi.json" })).json();
    const all: { where: string; operation: Operation }[] = [];
    for (const [path, item] of Object.entries<Record<string, Operation>>(description.paths)) {
      // The route made to test validation is not the API's.
      if (path.startsWith("/test/")) continue;
      for (const [method, operation] of Object.entries(item)) {
        all.push({ where: `${method.toUpperCase()} ${path}`, operation });
      }
    }
    // Ours are the ones that say what they need. The sign-in library's say nothing of the kind.
    return { description, ours: all.filter((one) => one.operation["x-access"]), all };
  };
  const apiRoutes = () =>
    routes.filter(
      (route) =>
        route.url.startsWith("/api/") &&
        route.method !== "HEAD" &&
        !route.url.includes("/auth/") &&
        !route.url.startsWith("/api/v1/test"),
    );

  test("every route has a summary and a description of its own", () => {
    const missing = apiRoutes()
      .filter((route) => !route.schema?.summary || !route.schema?.description)
      .map((route) => `${[route.method].flat().join("/")} ${route.url}`);
    expect(missing).toEqual([]);
  });

  test("every operation is tagged from the one list, and each tag in it is used", async () => {
    const { description, ours, all } = await operationsOf();
    const listed = new Set<string>(API_TAGS.map((tag) => tag.name));
    const used = new Set<string>();
    for (const { where, operation } of all) {
      expect(operation.tags?.length, `${where} has a tag`).toBeGreaterThan(0);
      for (const tag of operation.tags ?? []) {
        expect(listed.has(tag), `${where} is tagged ${tag}, which is not in API_TAGS`).toBe(true);
        used.add(tag);
      }
    }
    expect(ours.length).toBeGreaterThan(300);
    expect(API_TAGS.map((tag) => tag.name).filter((name) => !used.has(name))).toEqual([]);
    expect(description.tags.map((tag: { name: string }) => tag.name)).toEqual([...listed]);
    expect(description.tags.every((tag: { description: string }) => tag.description)).toBe(true);
  });

  test("it says how to authenticate, where it is served, and what an error looks like", async () => {
    const { description, ours } = await operationsOf();
    expect(description.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(description.components.securitySchemes.cookieAuth).toMatchObject({ type: "apiKey" });
    expect(description.servers).toEqual([expect.objectContaining({ url: "/" })]);
    expect(description.components.schemas.Problem.properties.code).toBeDefined();
    expect(description["x-error-codes"].length).toBeGreaterThan(40);
    for (const { where, operation } of ours) {
      const failure = operation.responses["5XX"];
      expect(JSON.stringify(failure?.content), `${where} says how it fails`).toContain(
        "#/components/schemas/Problem",
      );
      const access = operation["x-access"]?.kind;
      if (access !== "public") {
        expect(operation.responses["401"], `${where} can answer 401`).toBeDefined();
        expect(operation.responses["403"], `${where} can answer 403`).toBeDefined();
        expect(operation.security, `${where} names its schemes`).toEqual([
          { bearerAuth: [] },
          { cookieAuth: [] },
        ]);
      } else {
        expect(operation.security, `${where} is open`).toEqual([]);
      }
    }
  });

  test("every operation has an identifier, no two the same, and every response a description", async () => {
    const { ours, all } = await operationsOf();
    const ids = all.map((one) => one.operation.operationId);
    expect(all.filter((one) => !one.operation.operationId).map((one) => one.where)).toEqual([]);
    expect(ids.filter((id, at) => ids.indexOf(id) !== at)).toEqual([]);
    for (const { where, operation } of ours) {
      for (const [status, response] of Object.entries(operation.responses)) {
        expect(
          response.description && response.description !== "Default Response",
          `${where} ${status} says what it is`,
        ).toBeTruthy();
      }
    }
  });

  test("a route that decides for itself, or asks for a token, says what it needs", async () => {
    const { ours } = await operationsOf();
    const custom = ours.filter((one) => one.operation["x-access"]?.kind === "custom");
    expect(custom.length).toBeGreaterThan(50);
    for (const { where, operation } of custom) {
      const says = operation["x-access"]?.says;
      expect(says, `${where} says what is decided`).toBeTruthy();
      expect(operation.description).toContain(says);
    }
    const hook = ours.find((one) => one.where === "POST /api/v1/hooks/{token}");
    expect(hook?.operation["x-access"]?.says).toMatch(/token/);
  });

  test("a list that has no cursor says whether it is whole or cut short", async () => {
    const { description, ours } = await operationsOf();
    const lists: string[] = [];
    const unsaid: string[] = [];
    for (const { where, operation } of ours) {
      const response = operation.responses["200"] as
        | {
            description?: string;
            content?: Record<string, { schema?: { properties?: Record<string, unknown> } }>;
          }
        | undefined;
      const properties = response?.content?.["application/json"]?.schema?.properties;
      if (!properties?.items || properties.nextCursor) continue;
      lists.push(where);
      if (!/has no cursor/.test(response?.description ?? "")) unsaid.push(where);
    }
    expect(lists.length).toBeGreaterThan(30);
    // The lists not yet declared with `listOf`, which only get shorter. A new list is declared with it.
    expect(unsaid).toEqual(LISTS_NOT_YET_SAID);
    expect(description.paths).toBeDefined();
  });

  test("it says how the API changes", async () => {
    const { description } = await operationsOf();
    expect(description.info.description).toContain("90 days");
    expect(description.info.description).toContain("only grows");
  });
});

describe("permissions", () => {
  test("every permission a route asks for is in the list that roles are built from", () => {
    const asked = routes
      .map((route) => (route.config as { access?: { permission?: string } } | undefined)?.access)
      .map((access) => access?.permission)
      .filter((permission): permission is string => permission !== undefined);
    expect(asked.length).toBeGreaterThan(50);
    expect(asked.filter((permission) => !isKnownPermission(permission))).toEqual([]);
  });

  test("the list is served to anyone signed in, with what each permission allows", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/permissions" });
    expect(response.statusCode).toBe(401);
    expect(PERMISSION_KINDS.every((entry) => Object.keys(entry.verbs).length > 0)).toBe(true);
    expect(isGrantablePermission("secret:*")).toBe(true);
    expect(isGrantablePermission("*:read")).toBe(true);
    expect(isGrantablePermission("tenant:export")).toBe(false);
    expect(isGrantablePermission("nothing:read")).toBe(false);
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
