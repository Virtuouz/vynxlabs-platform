import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { type Bundle, type BundleManifest, bundleDigest } from "@vynxlabs/manifest";
import { Worker } from "@vynxlabs/worker";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  otlpMetrics,
  parseTraceparent,
  readHeaders,
  readPrometheus,
  spanIdOf,
} from "./kernel/telemetry.js";
import { startTestApp, type TestApp } from "./testing.js";

// biome-ignore lint/suspicious/noExplicitAny: what a collector is sent is inspected freely
type Any = any;

// A collector's stand-in: it keeps what it is sent, and by whom.
const received: { path: string; headers: Record<string, unknown>; body: Any }[] = [];
let collector: Server;
let endpoint: string;

let t: TestApp;
let worker: Worker;
let working: Promise<unknown>;
let ws: string;

const manifest = (kind: string, path: string, body: Record<string, unknown>): BundleManifest => ({
  kind,
  schemaVersion: 1,
  path,
  ownership: "code",
  body,
});

function bundle(): Bundle {
  const script = (entry: string) => ({
    entry,
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 30,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
  });
  const body = {
    formatVersion: 1 as const,
    sdkVersion: "0.5.0",
    core: { min: "0.0.0", below: "99.0.0" },
    manifests: [
      manifest("script", "double", script("double")),
      manifest("script", "broken", script("broken")),
      manifest("flow", "twice", {
        nodes: {
          start: { type: "trigger", trigger: { type: "manual" } },
          first: { type: "script", script: "double", input: "{'n': trigger.n}" },
        },
        edges: [{ from: "start", to: "first" }],
      }),
    ],
    code:
      "export const double = { execute: async (input) => ({ n: input.n * 2 }) };" +
      "export const broken = { execute: async () => { throw new Error('It broke.'); } };",
  };
  return { ...body, digest: bundleDigest(body) } as Bundle;
}

const spans = () =>
  received
    .filter((one) => one.path === "/v1/traces")
    .flatMap((one) => one.body.resourceSpans)
    .flatMap((resource: Any) => resource.scopeSpans)
    .flatMap((scope: Any) => scope.spans) as Any[];
const attribute = (span: Any, key: string) => {
  const value = span.attributes.find((one: Any) => one.key === key)?.value;
  return value?.stringValue ?? value?.intValue ?? value?.boolValue;
};
/** Waits until the collector has a span that is so, and gives every span of its trace. */
async function traceWith(found: (span: Any) => boolean): Promise<Any[]> {
  for (let tries = 0; tries < 100; tries++) {
    await t.kernel.telemetry.flush();
    const span = spans().find(found);
    if (span) return spans().filter((one) => one.traceId === span.traceId);
    await sleep(100);
  }
  throw new Error("The collector was never sent that span.");
}
const settled = async (path: string) => {
  for (let tries = 0; tries < 200; tries++) {
    const answer = (await t.admin.get(path)).body;
    if (answer.status !== "queued" && answer.status !== "running") return answer;
    await sleep(100);
  }
  throw new Error(`${path} did not end.`);
};

beforeAll(async () => {
  collector = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        path: request.url ?? "",
        headers: request.headers,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      });
      response.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((resolve) => collector.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(collector.address() as AddressInfo).port}`;

  t = await startTestApp({
    config: {
      metricsToken: "s".repeat(40),
      telemetry: {
        endpoint,
        headers: { authorization: "Bearer collector-key" },
        serviceName: "platform-under-test",
        traces: true,
        metrics: true,
        metricsIntervalMs: 3_600_000,
      },
    },
  });
  const url = await t.app.listen({ host: "127.0.0.1", port: 0 });
  const tenant = (await t.admin.post("/tenants", { slug: "traced", name: "Traced" })).body.id;
  const role = await t.db
    .selectFrom("role")
    .select("id")
    .where("builtin", "=", true)
    .where("name", "=", "tenant_admin")
    .executeTakeFirstOrThrow();
  await t.admin.post(`/tenants/${tenant}/access-grants`, { reason: "Setup", roleId: role.id });
  const workspace = (
    await t.admin.post(`/tenants/${tenant}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    })
  ).body.id;
  ws = `/tenants/${tenant}/workspaces/${workspace}`;
  const uploaded = await t.admin.post(`${ws}/bundles`, bundle());
  expect(uploaded.status, JSON.stringify(uploaded.body)).toBeLessThan(300);
  expect((await t.admin.post(`${ws}/deployments`, { bundleId: uploaded.body.id })).status).toBe(
    201,
  );
  const credential = await t.admin.post(`/tenants/${tenant}/worker-credentials`, { name: "w" });
  worker = new Worker({
    url,
    token: credential.body.token,
    claimWaitSeconds: 1,
    concurrency: 2,
    // This worker was told where to send its own spans. One that is not sends none.
    telemetry: { endpoint, serviceName: "worker-under-test" },
  });
  working = worker.run();
}, 60_000);

afterAll(async () => {
  worker?.stop();
  await working;
  await t?.stop();
  await new Promise((resolve) => collector?.close(resolve));
});

describe("the formats", () => {
  test("a traceparent is read only when it is one", () => {
    const trace = "0af7651916cd43dd8448eb211c80319c";
    expect(parseTraceparent(`00-${trace}-b7ad6b7169203331-01`)).toEqual({
      traceId: trace,
      spanId: "b7ad6b7169203331",
    });
    expect(parseTraceparent(`00-${"0".repeat(32)}-b7ad6b7169203331-01`)).toBeUndefined();
    expect(parseTraceparent(`00-${trace}-${"0".repeat(16)}-01`)).toBeUndefined();
    expect(parseTraceparent("anything else")).toBeUndefined();
    expect(parseTraceparent(undefined)).toBeUndefined();
    // A span's ID is the same whenever it is worked out, and is one.
    expect(spanIdOf("run", "abc")).toBe(spanIdOf("run", "abc"));
    expect(spanIdOf("run", "abc")).toMatch(/^[0-9a-f]{16}$/);
    expect(spanIdOf("run", "abc")).not.toBe(spanIdOf("wait", "abc"));
    expect(readHeaders("Authorization=Bearer%20abc, x-team = ops ,broken")).toEqual({
      authorization: "Bearer abc",
      "x-team": "ops",
    });
  });

  test("the metrics endpoint's text becomes the same series in OTLP", () => {
    const text = [
      "# HELP platform_runs_queued Runs waiting for a worker.",
      "# TYPE platform_runs_queued gauge",
      "platform_runs_queued 3",
      "# HELP platform_alerts_total Failure alerts.",
      "# TYPE platform_alerts_total counter",
      'platform_alerts_total{outcome="delivered"} 2',
      'platform_alerts_total{outcome="said \\"no\\""} 1',
      "# HELP platform_wait_seconds How long.",
      "# TYPE platform_wait_seconds histogram",
      'platform_wait_seconds_bucket{workspace="main",le="1"} 2',
      'platform_wait_seconds_bucket{workspace="main",le="5"} 5',
      'platform_wait_seconds_bucket{workspace="main",le="+Inf"} 6',
      'platform_wait_seconds_sum{workspace="main"} 14.5',
      'platform_wait_seconds_count{workspace="main"} 6',
      "",
    ].join("\n");
    expect(readPrometheus(text).map((family) => [family.name, family.type])).toEqual([
      ["platform_runs_queued", "gauge"],
      ["platform_alerts_total", "counter"],
      ["platform_wait_seconds", "histogram"],
    ]);
    const [gauge, counter, histogram] = otlpMetrics(text, new Date(1000), new Date(2000)) as Any[];
    expect(gauge.gauge.dataPoints).toEqual([
      { attributes: [], timeUnixNano: "2000000000", asDouble: 3 },
    ]);
    expect(counter.sum).toMatchObject({ aggregationTemporality: 2, isMonotonic: true });
    expect(counter.sum.dataPoints[1]).toEqual({
      attributes: [{ key: "outcome", value: { stringValue: 'said "no"' } }],
      startTimeUnixNano: "1000000000",
      timeUnixNano: "2000000000",
      asDouble: 1,
    });
    // Prometheus counts all at or under each bound; OTLP, each bucket's own, and one past the last.
    expect(histogram.histogram.dataPoints).toEqual([
      {
        attributes: [{ key: "workspace", value: { stringValue: "main" } }],
        startTimeUnixNano: "1000000000",
        timeUnixNano: "2000000000",
        count: "6",
        sum: 14.5,
        bucketCounts: ["2", "3", "1"],
        explicitBounds: [1, 5],
      },
    ]);
  });
});

describe("one trace, from the request to the worker", () => {
  test("a run started by a request that is part of a trace joins it, with its wait and its execution", async () => {
    const trace = "4bf92f3577b34da6a3ce929d0e0e4736";
    const caller = "00f067aa0ba902b7";
    const response = await t.app.inject({
      method: "POST",
      url: `/api/v1${ws}/runs`,
      headers: {
        ...t.admin.headers,
        "content-type": "application/json",
        traceparent: `00-${trace}-${caller}-01`,
      },
      payload: { script: "double", input: { n: 2 } },
    });
    expect(response.statusCode, response.payload).toBe(201);
    expect(response.headers["x-trace-id"]).toBe(trace);
    const run = response.json();
    // The run says which trace it is part of.
    expect(run.traceId).toBe(trace);
    expect((await settled(`${ws}/runs/${run.id}`)).status).toBe("succeeded");

    const all = await traceWith(
      (span) => span.name.startsWith("attempt 1 of double") && span.traceId === trace,
    );
    const named = (name: string) => all.find((span) => span.name === name);
    const request = named("POST /api/v1/tenants/:t/workspaces/:w/runs");
    const whole = named("run double");
    const wait = named("wait for a worker");
    const execute = named("execute double");
    const attempt = named("attempt 1 of double");
    // Each hangs from the one before it: caller, request, run, execution, the worker's attempt.
    expect(request).toMatchObject({ parentSpanId: caller, kind: 2, status: { code: 1 } });
    expect(attribute(request, "http.response.status_code")).toBe("201");
    expect(attribute(request, "platform.request.id")).toBe(response.headers["x-request-id"]);
    expect(whole.parentSpanId).toBe(request.spanId);
    expect(attribute(whole, "platform.run.id")).toBe(run.id);
    expect(attribute(whole, "platform.run.state")).toBe("succeeded");
    expect(wait.parentSpanId).toBe(whole.spanId);
    expect(execute.parentSpanId).toBe(whole.spanId);
    expect(attempt.parentSpanId).toBe(execute.spanId);
    // In the order they happened.
    expect(BigInt(wait.endTimeUnixNano)).toBe(BigInt(execute.startTimeUnixNano));
    expect(BigInt(whole.startTimeUnixNano) <= BigInt(wait.startTimeUnixNano)).toBe(true);
    expect(BigInt(execute.endTimeUnixNano) >= BigInt(execute.startTimeUnixNano)).toBe(true);

    // Who sent what: the platform under its name and with the operator's header, the worker under its own.
    const fromPlatform = received.find(
      (one) =>
        one.path === "/v1/traces" &&
        JSON.stringify(one.body).includes('"run double"') &&
        JSON.stringify(one.body).includes(trace),
    );
    expect(fromPlatform?.headers.authorization).toBe("Bearer collector-key");
    expect(JSON.stringify(fromPlatform?.body.resourceSpans[0].resource)).toContain(
      "platform-under-test",
    );
    const fromWorker = received.find((one) => JSON.stringify(one.body).includes("attempt 1 of"));
    expect(JSON.stringify(fromWorker?.body.resourceSpans[0].resource)).toContain(
      "worker-under-test",
    );
    expect(fromWorker?.headers.authorization).toBeUndefined();
  });

  test("a run nobody's trace started gets a trace of its own, and a failure is said on its spans", async () => {
    const started = await t.admin.post(`${ws}/runs`, { script: "broken", input: {} });
    expect(started.status).toBe(201);
    expect(started.body.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(started.headers["x-trace-id"]).toBe(started.body.traceId);
    expect((await settled(`${ws}/runs/${started.body.id}`)).status).toBe("failed");
    const all = await traceWith(
      (span) => span.name === "run broken" && span.traceId === started.body.traceId,
    );
    const whole = all.find((span) => span.name === "run broken");
    expect(whole.status).toEqual({ code: 2, message: "It broke." });
    expect(all.find((span) => span.name === "execute broken").status.code).toBe(2);
    // The request itself did what it was asked: it is no error.
    expect(all.find((span) => span.name.startsWith("POST ")).status.code).toBe(1);
  });

  test("a flow run, its step and the run the step started are one trace", async () => {
    const started = await t.admin.post(`${ws}/flow-runs`, { flow: "twice", input: { n: 4 } });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    const trace = started.body.traceId;
    expect(trace).toMatch(/^[0-9a-f]{32}$/);
    const ended = await settled(`${ws}/flow-runs/${started.body.id}`);
    expect(ended.status).toBe("succeeded");
    const all = await traceWith((span) => span.name === "flow twice" && span.traceId === trace);
    const named = (name: string) => all.find((span) => span.name === name);
    const request = named("POST /api/v1/tenants/:t/workspaces/:w/flow-runs");
    const flow = named("flow twice");
    const step = named("step first");
    const run = named("run double");
    expect(flow.parentSpanId).toBe(request.spanId);
    expect(step.parentSpanId).toBe(flow.spanId);
    // The run a step started hangs from the step, and says which flow run it is of.
    expect(run.parentSpanId).toBe(step.spanId);
    expect(attribute(run, "platform.flow_run.id")).toBe(started.body.id);
    expect(named("execute double").parentSpanId).toBe(run.spanId);
    const stepRun = await t.db
      .selectFrom("run")
      .select("trace_id")
      .where("flow_run_id", "=", started.body.id)
      .executeTakeFirstOrThrow();
    expect(stepRun.trace_id).toBe(trace);
  });

  test("a worker asking for work and a scrape are not spans", async () => {
    await t.app.inject({
      url: "/api/v1/metrics",
      headers: { authorization: `Bearer ${"s".repeat(40)}` },
    });
    await t.kernel.telemetry.flush();
    const names = new Set(spans().map((span) => span.name as string));
    expect([...names].filter((name) => /metrics|\/workers\/|\/jobs/.test(name))).toEqual([]);
  });
});

describe("metrics", () => {
  test("a scraper reads them with the instance's token and no member, and nobody else does", async () => {
    const scrape = (authorization?: string) =>
      t.app.inject({
        url: "/api/v1/metrics",
        headers: authorization ? { authorization } : { cookie: "" },
      });
    expect((await scrape()).statusCode).toBe(401);
    expect((await scrape(`Bearer ${"x".repeat(40)}`)).statusCode).toBe(401);
    expect((await scrape("Bearer short")).statusCode).toBe(401);
    const read = await scrape(`Bearer ${"s".repeat(40)}`);
    expect(read.statusCode).toBe(200);
    expect(read.headers["content-type"]).toMatch(/^text\/plain/);
    // A member who holds `instance:read` still reads them as before.
    expect((await t.admin.get("/metrics")).status).toBe(200);

    // Requests are counted by the route's pattern and their status, and timed.
    const text = read.payload;
    expect(text).toMatch(
      /^platform_http_requests_total\{method="POST",route="\/api\/v1\/tenants\/:t\/workspaces\/:w\/runs",status="201"\} [1-9]\d*$/m,
    );
    expect(text).toMatch(
      /^platform_http_request_duration_seconds_bucket\{method="POST",route="\/api\/v1\/tenants\/:t\/workspaces\/:w\/runs",le="\+Inf"\} [1-9]\d*$/m,
    );
    // No address with an ID in it is a label.
    expect(text).not.toMatch(/route="[^"]*[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  test("the same series are sent by OTLP under the same names", async () => {
    const text = (
      await t.app.inject({
        url: "/api/v1/metrics",
        headers: { authorization: `Bearer ${"s".repeat(40)}` },
      })
    ).payload;
    expect(await t.kernel.telemetry.sendMetrics(text)).toBe(true);
    const sent = received.findLast((one) => one.path === "/v1/metrics");
    expect(sent?.headers.authorization).toBe("Bearer collector-key");
    const metrics = sent?.body.resourceMetrics[0].scopeMetrics[0].metrics as Any[];
    const names = metrics.map((metric) => metric.name);
    const written = [...text.matchAll(/^# TYPE (\S+) /gm)].map((found) => found[1]);
    // Every family the endpoint wrote a sample of is there, and nothing else.
    expect(new Set(names)).toEqual(
      new Set(
        written.filter((name) => new RegExp(`^${name}(_bucket|_sum|_count)?[{ ]`, "m").test(text)),
      ),
    );
    const requests = metrics.find((metric) => metric.name === "platform_http_requests_total");
    expect(requests.sum.isMonotonic).toBe(true);
    const duration = metrics.find(
      (metric) => metric.name === "platform_http_request_duration_seconds",
    );
    const point = duration.histogram.dataPoints[0];
    expect(point.bucketCounts).toHaveLength(point.explicitBounds.length + 1);
    expect(point.bucketCounts.reduce((sum: number, count: string) => sum + Number(count), 0)).toBe(
      Number(point.count),
    );
  });
});
