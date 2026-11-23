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
