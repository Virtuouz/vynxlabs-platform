import { expect, test } from "vitest";
import { describeApi } from "./testing.js";

// No database is made for this file: the description must not need one.
test("the API describes itself with no database, sign-in routes and access rules included", async () => {
  const description = (await describeApi("9.9.9")) as {
    info: { version: string };
    paths: Record<string, Record<string, { "x-access"?: unknown; tags?: string[] }>>;
  };
  expect(description.info.version).toBe("9.9.9");
  const paths = Object.keys(description.paths);
  expect(paths.length).toBeGreaterThan(250);
  expect(paths).toContain("/api/v1/openapi.json");
  // The authentication library's routes are in it.
  expect(paths.some((path) => path.startsWith("/api/v1/auth/"))).toBe(true);
  // What a route needs is written from the route's own configuration.
  expect(description.paths["/api/v1/openapi.json"]?.get?.["x-access"]).toBeDefined();
});

test("every operation has a summary and a description, the sign-in library's included, and only served sign-in routes are listed", async () => {
  const description = (await describeApi("9.9.9")) as {
    paths: Record<string, Record<string, { summary?: string; description?: string }>>;
  };
  const methods = new Set(["get", "post", "put", "patch", "delete"]);
  const missing: string[] = [];
  for (const [path, item] of Object.entries(description.paths)) {
    if (path.startsWith("/api/v1/test")) continue;
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue;
      if (!operation.summary || !operation.description)
        missing.push(`${method.toUpperCase()} ${path}`);
    }
  }
  expect(missing).toEqual([]);
  // Members are made by an admin and no social provider is set up: those routes are not served.
  const paths = Object.keys(description.paths);
  for (const off of ["/sign-up/email", "/sign-in/social", "/change-email", "/delete-user"]) {
    expect(paths, off).not.toContain(`/api/v1/auth${off}`);
  }
  expect(paths).toContain("/api/v1/auth/sign-in/email");
});
