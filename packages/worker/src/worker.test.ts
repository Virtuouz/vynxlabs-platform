import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { type Bundle, bundleDigest } from "@vynxlabs/manifest";
import { afterEach, describe, expect, it } from "vitest";
import { allowedCall, type Job } from "./context.js";
import { Worker } from "./worker.js";

/** The scripts these tests run, all in one bundle. */
const CODE = `
import { readFileSync } from "node:fs";

/** Writes \`count\` log lines, pausing every 50 so heartbeats can send some. */
export const chatty = {
  async execute(input, ctx) {
    for (let i = 0; i < input.count; i += 1) {
      ctx.log.info("line " + i);
      if (i % 50 === 0) await new Promise((resolve) => setTimeout(resolve, input.pause));
    }
    return { wrote: input.count };
  },
};

/** Says which process it is, then never yields and never looks at its signal. */
export const spin = {
  async execute(input, ctx) {
    ctx.log.info("pid", { pid: process.pid });
    await new Promise((resolve) => setTimeout(resolve, 100));
    for (;;) {}
  },
};

/** Keeps everything it allocates. */
export const hog = {
  async execute() {
    const kept = [];
    for (;;) kept.push(new Array(1_000_000).fill(Math.random()));
  },
};

/** What a script can see of credentials. */
export const nosy = {
  async execute() {
    let environ = "";
    try {
      environ = readFileSync("/proc/self/environ", "utf8");
    } catch {}
    return {
      token: process.env.PLATFORM_WORKER_TOKEN ?? null,
      environHasToken: environ.includes("wt-secret"),
      keys: Object.keys(process.env).sort(),
    };
  },
};

/** Reaches the control plane through its context. */
export const caller = {
  async execute(input, ctx) {
    const secret = await ctx.secret("api-key");
    await ctx.events.publish("did.it", { secret });
    return { secret };
  },
};
`;

function bundle(): Bundle {
  const body: Omit<Bundle, "digest"> = {
    formatVersion: 1,
    sdkVersion: "0.5.0",
    core: { min: "0.1.0", below: "99.0.0" },
    manifests: [],
    code: CODE,
  } as unknown as Omit<Bundle, "digest">;
  return { ...body, digest: bundleDigest(body) } as Bundle;
}

interface Ended {
  runId: string;
  kind: "complete" | "fail";
  body: Record<string, unknown>;
}

interface Platform {
  url: string;
  lines: string[];
  fields: Record<string, unknown>[];
  ended: Ended[];
  /** Every request the worker made, as "METHOD path". */
  requests: string[];
  bodies: Record<string, unknown>[];
  /** How many log requests fail before they start to succeed. Infinity: they never do. */
  failLogs: number;
  /** Runs whose next heartbeat is told the run was canceled. */
  cancel: Set<string>;
}

interface Asked {
  entry: string;
  input?: unknown;
  timeoutSeconds?: number;
  memoryMb?: number;
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

/** A control plane that hands out the given jobs in turn, then nothing, and records the rest. */
async function platform(jobs: Asked[], failLogs = 0): Promise<Platform & { runIds: string[] }> {
  const content = bundle();
  const queue = jobs.map((job) => ({ ...job, runId: randomUUID() }));
  const state = {
    url: "",
    lines: [] as string[],
    fields: [] as Record<string, unknown>[],
    ended: [] as Ended[],
    requests: [] as string[],
    bodies: [] as Record<string, unknown>[],
    failLogs,
    cancel: new Set<string>(),
    runIds: queue.map((job) => job.runId),
  };
  const read = async (request: IncomingMessage) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  };
  const reply = (response: ServerResponse, status: number, body?: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body === undefined ? "" : JSON.stringify(body));
  };
  const server = createServer(async (request, response) => {
    const path = (request.url ?? "").replace("/api/v1/worker", "");
    const body = await read(request);
    state.requests.push(`${request.method} ${path}`);
    state.bodies.push(body);
    const runId = path.split("/")[2] as string;
    if (path === "/claim") {
      const next = queue.shift();
      if (!next) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return reply(response, 200, { job: null });
      }
      return reply(response, 200, {
        job: {
          runId: next.runId,
          attempt: 1,
          workspaceId: randomUUID(),
          script: { path: next.entry, entry: next.entry },
          input: next.input ?? {},
          bundle: { id: randomUUID(), digest: content.digest },
          timeoutSeconds: next.timeoutSeconds ?? 30,
          ...(next.memoryMb ? { memoryMb: next.memoryMb } : {}),
          heartbeatSeconds: 1,
          idempotencyKey: "key",
          trigger: { type: "api" },
        },
      });
    }
    if (path.startsWith("/bundles/")) return reply(response, 200, content);
    if (path.endsWith("/heartbeat")) {
      return reply(response, 200, { cancelled: state.cancel.has(runId) });
    }
    if (path.endsWith("/logs")) {
      if (state.failLogs > 0) {
        state.failLogs -= 1;
        return reply(response, 503, { detail: "Not now." });
      }
      const entries = body.entries as { message: string; fields?: Record<string, unknown> }[];
      if (entries.length > 500) return reply(response, 400, { detail: "Too many entries." });
      state.lines.push(...entries.map((entry) => entry.message));
      state.fields.push(...entries.flatMap((entry) => (entry.fields ? [entry.fields] : [])));
      return reply(response, 204);
    }
    if (path.includes("/secrets/api-key")) return reply(response, 200, { value: "s3cret" });
    if (path.endsWith("/events")) return reply(response, 204);
    if (path.endsWith("/complete")) {
      state.ended.push({ runId, kind: "complete", body });
      return reply(response, 204);
    }
    if (path.endsWith("/fail")) {
      state.ended.push({ runId, kind: "fail", body });
      return reply(response, 200, { final: true });
    }
    return reply(response, 404, { detail: path });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return state;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, ms: number) {
  const deadline = Date.now() + ms;
  while (!check() && Date.now() < deadline) await pause(20);
  return check();
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Runs a worker until `done` holds, or 20 seconds pass. */
async function work(state: Platform, done: () => boolean, token = "token") {
  const worker = new Worker({ url: state.url, token, concurrency: 1, claimWaitSeconds: 1 });
  const running = worker.run();
  await until(done, 20_000);
  worker.stop();
  await running;
}

const pidOf = (state: Platform) =>
  state.fields.find((fields) => typeof fields.pid === "number")?.pid as number | undefined;

describe("log delivery", () => {
  it("keeps lines the control plane could not take and delivers them all, in order", async () => {
    // About four seconds of writing: the heartbeats' sends fail three times, then succeed.
    const state = await platform([{ entry: "chatty", input: { count: 1200, pause: 150 } }], 3);
    await work(state, () => state.ended.length === 1);
    expect(state.ended[0]?.kind).toBe("complete");
    expect(state.ended[0]?.body.logsLost).toBeUndefined();
    expect(state.lines).toEqual(Array.from({ length: 1200 }, (_, i) => `line ${i}`));
  });

  it("says how many lines were lost when the control plane never takes them", async () => {
    const state = await platform(
      [{ entry: "chatty", input: { count: 20, pause: 0 } }],
      Number.POSITIVE_INFINITY,
    );
    await work(state, () => state.ended.length === 1);
    expect(state.ended[0]?.kind).toBe("complete");
    expect(state.ended[0]?.body.logsLost).toBe(20);
    expect(state.lines).toEqual([]);
  });
});

describe("a process per attempt", () => {
  it("ends a script that ignores its time limit, process and all", async () => {
    const state = await platform([{ entry: "spin", timeoutSeconds: 2 }]);
    const started = Date.now();
    await work(state, () => state.ended.length === 1);
    expect(Date.now() - started).toBeLessThan(7000);
    expect(state.ended[0]).toMatchObject({ kind: "fail" });
    const timedOut = state.ended[0]?.body.error as { message: string } | undefined;
    expect(timedOut?.message).toContain("longer than its limit of 2 seconds");
    const pid = pidOf(state);
    expect(pid).toBeTypeOf("number");
    // Told to stop, then given a few seconds, then ended.
    expect(await until(() => !alive(pid as number), 5000)).toBe(true);
  });

  it("ends a canceled run's process, and reports nothing for it", async () => {
    const state = await platform([{ entry: "spin", timeoutSeconds: 60 }]);
    const [runId] = state.runIds;
    const worker = new Worker({
      url: state.url,
      token: "token",
      concurrency: 1,
      claimWaitSeconds: 1,
    });
    const running = worker.run();
    await until(() => pidOf(state) !== undefined, 10_000);
    const pid = pidOf(state) as number;
    expect(alive(pid)).toBe(true);
    state.cancel.add(runId as string);
    const canceledAt = Date.now();
    expect(await until(() => !alive(pid), 8000)).toBe(true);
    expect(Date.now() - canceledAt).toBeLessThan(5000 + 1000);
    worker.stop();
    await running;
    expect(state.ended).toEqual([]);
  });

  it("fails a script past its memory, and the next run on the worker still succeeds", async () => {
    const state = await platform([
      { entry: "hog", memoryMb: 64 },
      { entry: "chatty", input: { count: 1, pause: 0 } },
    ]);
    await work(state, () => state.ended.length === 2);
    expect(state.ended[0]).toMatchObject({ kind: "fail" });
    const failed = state.ended[0]?.body.error as { message: string } | undefined;
    expect(failed?.message).toBe("The script ran out of memory (64 MB).");
    expect(state.ended[1]).toMatchObject({ kind: "complete", body: { output: { wrote: 1 } } });
  });

  it("gives a script no credential and almost none of the worker's environment", async () => {
    const state = await platform([{ entry: "nosy" }]);
    await work(state, () => state.ended.length === 1, "wt-secret-token");
    const output = state.ended[0]?.body.output as {
      token: string | null;
      environHasToken: boolean;
      keys: string[];
    };
    expect(output.token).toBeNull();
    expect(output.environHasToken).toBe(false);
    for (const key of output.keys) {
      expect(["PATH", "TZ", "LANG", "TMPDIR", "NODE_EXTRA_CA_CERTS"]).toContain(key);
    }
  });

  it("makes a script's calls for it, for its own run and attempt", async () => {
    const state = await platform([{ entry: "caller" }]);
    await work(state, () => state.ended.length === 1);
    expect(state.ended[0]).toMatchObject({
      kind: "complete",
      body: { output: { secret: "s3cret" } },
    });
    const [runId] = state.runIds;
    expect(state.requests).toContain(`GET /runs/${runId}/secrets/api-key?attempt=1`);
    const event = state.bodies[state.requests.indexOf(`POST /runs/${runId}/events`)];
    expect(event).toEqual({ attempt: 1, event: "did.it", payload: { secret: "s3cret" } });
  });
});

describe("what a script may ask its worker to call", () => {
  const job = { runId: "r1" } as Job;
  it("allows its own run's reads and writes", () => {
    expect(allowedCall(job, "GET", "/runs/r1/secrets/key?attempt=1")).toBe(true);
    expect(allowedCall(job, "GET", "/runs/r1/connection-group-members/a%2Fb/crm")).toBe(true);
    expect(allowedCall(job, "POST", "/runs/r1/data")).toBe(true);
    expect(allowedCall(job, "POST", "/runs/r1/events")).toBe(true);
  });
  it("refuses another run, the run's own report, and anything that folds into a path elsewhere", () => {
    expect(allowedCall(job, "GET", "/runs/r2/secrets/key")).toBe(false);
    expect(allowedCall(job, "POST", "/runs/r1/complete")).toBe(false);
    expect(allowedCall(job, "POST", "/runs/r1/heartbeat")).toBe(false);
    expect(allowedCall(job, "POST", "/runs/r1/logs")).toBe(false);
    expect(allowedCall(job, "GET", "/runs/r1/secrets/../../r2/secrets/key")).toBe(false);
    expect(allowedCall(job, "GET", "/runs/r1/secrets/%2e%2e/%2E%2E/r2/secrets/key")).toBe(false);
    expect(allowedCall(job, "GET", "/runs/r1/secrets\\..\\..\\r2")).toBe(false);
    expect(allowedCall(job, "GET", "/claim")).toBe(false);
    expect(allowedCall(job, "DELETE", "/runs/r1/data")).toBe(false);
  });
});
