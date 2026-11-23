import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestApp, type TestApp } from "./testing.js";

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.stop();
});

// D55: the product is Volvel; no series is named for the platform.
test("every series an instance serves is named volvel_ (D55)", async () => {
  await t.app.inject({ url: "/api/v1/healthz" });
  const metrics = await t.admin.get("/metrics");
  expect(metrics.status).toBe(200);
  const names = new Set<string>();
  for (const line of metrics.body.split("\n")) {
    const named = /^(?:# (?:HELP|TYPE) )?([a-z_]+)/.exec(line);
    if (named?.[1]) names.add(named[1]);
  }
  expect(names.size).toBeGreaterThan(10);
  expect([...names].filter((name) => !name.startsWith("volvel_"))).toEqual([]);
});
