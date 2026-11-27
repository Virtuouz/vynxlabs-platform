import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { render } from "./report.mjs";
import { decideKnee, execute, labelRoute, parseArgs, percentile } from "./run.mjs";
import baseline from "./scenarios/baseline.mjs";

let server;
let url;
let slow = false;
const seen = [];
const dir = mkdtempSync(join(tmpdir(), "load-test-"));

beforeAll(async () => {
  server = createServer((request, response) => {
    seen.push({ url: request.url, auth: request.headers.authorization });
    const done = () => {
      if (request.url.includes("/summary")) {
        response.writeHead(503, { "retry-after": "1" }).end("busy");
      } else response.writeHead(200, { "content-type": "application/json" }).end("{}");
    };
    if (slow) setTimeout(done, 80);
    else done();
  });
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

test("percentile uses the nearest rank", () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  expect(percentile(sorted, 50)).toBe(5);
  expect(percentile(sorted, 95)).toBe(10);
  expect(percentile(sorted, 0)).toBe(1);
  expect(percentile([], 95)).toBe(0);
  expect(percentile([7], 99)).toBe(7);
});

test("routes are labelled with :id for ids and names after tenants and workspaces", () => {
  const id = "0b5f2d52-1a53-4a4c-8a53-6f1f3a1c9d10";
  expect(labelRoute("get", `/api/v1/tenants/acme/workspaces/${id}/runs/${id}?limit=5`)).toBe(
    "GET /api/v1/tenants/:id/workspaces/:id/runs/:id",
  );
  expect(labelRoute("POST", "/api/v1/hooks/abc")).toBe("POST /api/v1/hooks/:id");
  expect(labelRoute("GET", "/apps/acme/main/shop/index.html")).toBe(
    "GET /apps/:id/:id/shop/index.html",
  );
  expect(labelRoute("GET", "/api/v1/healthz")).toBe("GET /api/v1/healthz");
});

const limits = { p95LimitMs: 1000, errorLimit: 0.01 };
const stage = (users, p95, errorShare) => ({
  users,
  rps: users * 10,
  overall: { p95 },
  errorShare,
});

test("the knee is the last stage inside both limits", () => {
  const stages = [stage(5, 100, 0), stage(10, 400, 0), stage(15, 1500, 0), stage(20, 90, 0)];
  expect(decideKnee(stages, limits)).toMatchObject({ users: 10, rps: 100 });
  expect(decideKnee([stage(5, 100, 0), stage(10, 100, 0.5)], limits)).toMatchObject({ users: 5 });
  expect(decideKnee([stage(5, 2000, 0)], limits)).toBeNull();
  expect(decideKnee([stage(5, 100, 0), stage(10, 200, 0)], limits)?.users).toBe(10);
});

test("a ramp against a local server writes a result, counts a 503 as refused, and reports", async () => {
  slow = false;
  const args = {
    ...parseArgs(["baseline", "--url", url, "--start", "2", "--step", "2", "--max", "4"]),
    "stage-seconds": 1,
    file: join(dir, "baseline-test.json"),
    ramp: true,
  };
  const users = [{ label: "t", tenant: "acme", workspace: "main", apiKey: "vxk_test", extra: {} }];
  const result = await execute({
    scenario: baseline,
    users,
    args,
    log: () => {},
    signal: new AbortController().signal,
  });
  expect(result.stages.map((s) => s.users)).toEqual([2, 4]);
  const first = result.stages[0];
  expect(first.requests).toBeGreaterThan(10);
  expect(first.statuses[503]).toBeGreaterThan(0);
  expect(first.errorShare).toBe(0);
  expect(first.refusedShare).toBeGreaterThan(0);
  expect(first.retryAfterMissing).toBe(0);
  expect(Object.keys(first.routes)).toContain("GET /api/v1/tenants/:id/summary");
  expect(seen.every((r) => r.auth === "Bearer vxk_test")).toBe(true);
  expect(result.knee?.users).toBe(4);

  const [written] = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const saved = JSON.parse(readFileSync(join(dir, written), "utf8"));
  expect(saved.scenario).toBe("baseline");
  const text = render(saved, { routes: true });
  expect(text).toContain("| Users |");
  expect(text).toContain("Knee: 4 users");
  expect(text).toContain("Slowest routes");
});

test("a ramp stops at the first stage over the p95 limit", async () => {
  slow = true;
  const args = {
    ...parseArgs(["baseline", "--url", url, "--start", "1", "--step", "1", "--max", "5"]),
    "stage-seconds": 1,
    "p95-limit-ms": 20,
    ramp: true,
  };
  const users = [{ label: "t", tenant: "a", workspace: "b", apiKey: "k", extra: {} }];
  const result = await execute({
    scenario: baseline,
    users,
    args,
    log: () => {},
    signal: new AbortController().signal,
  });
  expect(result.stages).toHaveLength(1);
  expect(result.knee).toBeNull();
});
