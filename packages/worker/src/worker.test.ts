import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { type Bundle, bundleDigest } from "@volvel/manifest";
import { afterEach, describe, expect, it } from "vitest";
import { allowedCall, type Job } from "./context.js";
import { type MachineProbe, procProbe } from "./machine.js";
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

/** Writes lines of \`size\` characters, \`count\` of them, and one huge line when told. */
export const wide = {
  async execute(input, ctx) {
    for (let i = 0; i < input.count; i += 1) ctx.log.info("w" + i + ":" + "x".repeat(input.size));
    if (input.huge) ctx.log.info("huge:" + "y".repeat(input.huge));
    ctx.log.info("last");
    return { ok: true };
  },
};

/** Writes with console. */
export const consoler = {
  async execute() {
    console.log("hello", { a: 1 });
    console.error("bad");
    return { ok: true };
  },
};

/** Gives back more than the limit. */
export const bulky = {
  async execute() {
    return { blob: "z".repeat(11 * 1024 * 1024) };
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

/** Holds \`mb\` of Buffers, outside the JavaScript heap, then waits. */
export const buffers = {
  async execute(input) {
    const held = [];
    for (let i = 0; i < input.mb / 10; i += 1) held.push(Buffer.alloc(10 * 1024 * 1024, i));
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return { held: held.length };
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
      token: process.env.VOLVEL_WORKER_TOKEN ?? null,
      environHasToken: environ.includes("wt-secret"),
      keys: Object.keys(process.env).sort(),
    };
  },
};

/** What a describe task calls. It tries to reach the control plane the only way it could. */
export const __vx_describe = (entry) =>
  new Promise((resolve) => {
    process.on("message", (message) => {
      if (message.t === "reply" && message.id === 999) resolve({ entry, answer: message });
    });
    process.send({ t: "call", id: 999, method: "GET", path: "/secrets/api-key" });
  });

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
  /** The most bytes a log request may hold before it is answered 413, as an older control plane did. */
  maxLogBody: number;
  /** How many log requests fail before they start to succeed. Infinity: they never do. */
  failLogs: number;
  /** Runs whose next heartbeat is told the run was canceled. */
  cancel: Set<string>;
}

interface Asked {
  /** A task in place of a run. */
  task?: { kind: string; request: Record<string, unknown> };
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
    maxLogBody: Number.POSITIVE_INFINITY,
    cancel: new Set<string>(),
    runIds: queue.map((job) => job.runId),
  };
  const rawBody = async (request: IncomingMessage) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    return text;
  };
  const reply = (response: ServerResponse, status: number, body?: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body === undefined ? "" : JSON.stringify(body));
  };
  const server = createServer(async (request, response) => {
    const path = (request.url ?? "").replace("/api/v1/worker", "");
    const raw = await rawBody(request);
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    state.requests.push(`${request.method} ${path}`);
    state.bodies.push(body);
    const runId = path.split("/")[2] as string;
    if (path === "/claim") {
      const next = queue.shift();
      if (!next) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return reply(response, 200, { job: null });
      }
      if (next.task) {
        return reply(response, 200, {
          job: {
            kind: next.task.kind,
            taskId: next.runId,
            workspaceId: randomUUID(),
            request: { ...next.task.request, bundle: { id: randomUUID(), digest: content.digest } },
            timeoutSeconds: 30,
            memoryMb: 256,
            heartbeatSeconds: 1,
          },
        });
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
      if (raw.length > state.maxLogBody) return reply(response, 413, { detail: "Too large." });
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

describe("log lines of any size", () => {
  it("sends 1.5 MB of lines in parts, so a limit of 1 MiB per request never holds them back", async () => {
    const state = await platform([{ entry: "wide", input: { count: 500, size: 3000 } }]);
    state.maxLogBody = 1024 * 1024;
    await work(state, () => state.ended.length === 1);
    expect(state.ended[0]?.kind).toBe("complete");
    expect(state.ended[0]?.body.logsLost).toBeUndefined();
    expect(state.lines).toHaveLength(501);
    expect(state.lines.at(-1)).toBe("last");
    expect(state.requests.filter((one) => one.endsWith("/logs")).length).toBeGreaterThan(2);
  });

  it("drops the one line a control plane refuses for its size, counts it, and sends the rest", async () => {
    const state = await platform([
      { entry: "wide", input: { count: 20, size: 100, huge: 200_000 } },
    ]);
    state.maxLogBody = 100_000;
    await work(state, () => state.ended.length === 1);
    expect(state.ended[0]?.kind).toBe("complete");
    expect(state.ended[0]?.body.logsLost).toBe(1);
    expect(state.lines).toHaveLength(21);
    expect(state.lines.some((line) => line.startsWith("huge:"))).toBe(false);
    expect(state.lines.at(-1)).toBe("last");
  });

  it("writes console output to the run's log", async () => {
    const state = await platform([{ entry: "consoler" }]);
    await work(state, () => state.ended.length === 1);
    expect(state.lines).toEqual(["hello { a: 1 }", "bad"]);
  });

  it("refuses an output over its limit before reporting the run done", async () => {
    const state = await platform([{ entry: "bulky" }]);
    await work(state, () => state.ended.length === 1);
    expect(state.ended[0]?.kind).toBe("fail");
    // The work was done: the control plane is told not to run it again.
    expect(state.ended[0]?.body.retry).toBe(false);
    expect(((state.ended[0]?.body ?? {}).error as { message: string }).message).toContain(
      "The output is larger than 10 MB",
    );
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

  it.skipIf(procProbe.memory() === undefined)(
    "fails a script that holds more than its memory outside the heap",
    async () => {
      const state = await platform([
        { entry: "buffers", memoryMb: 64, input: { mb: 300 } },
        { entry: "buffers", memoryMb: 512, input: { mb: 100 } },
      ]);
      await work(state, () => state.ended.length === 2);
      const failed = state.ended[0]?.body.error as { message: string } | undefined;
      expect(failed?.message).toBe("The script ran out of memory (64 MB).");
      // Within its memory, Buffers and all, a script is left alone.
      expect(state.ended[1]).toMatchObject({ kind: "complete", body: { output: { held: 10 } } });
    },
  );

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
    expect(allowedCall(job, "POST", "/runs/r1/tags")).toBe(true);
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

describe("tasks", () => {
  it("a describe task is given nothing to call: a call it makes is refused, and it says what it found", async () => {
    const control = await platform([
      { entry: "unused", task: { kind: "describe", request: { entry: "typed" } } },
    ]);
    const worker = new Worker({ url: control.url, token: "wt-secret", claimWaitSeconds: 0 });
    const running = worker.run();
    await until(() => control.requests.some((request) => request.endsWith("/complete")), 15_000);
    worker.stop();
    await running;
    // The claim said which kinds this worker takes.
    expect(control.bodies[0]).toMatchObject({
      kinds: ["run", "describe", "deliver", "test-connection"],
    });
    const done = control.requests.findIndex((request) => request.endsWith("/complete"));
    expect(control.requests[done]).toBe(`POST /tasks/${control.runIds[0]}/complete`);
    expect(control.bodies[done]).toEqual({
      result: {
        entry: "typed",
        answer: { t: "reply", id: 999, error: "This call is not open to a task." },
      },
    });
    // Nothing but the bundle and the report was asked of the control plane.
    expect(control.requests.filter((request) => !request.startsWith("POST /claim"))).toEqual([
      expect.stringMatching(/^GET \/bundles\//),
      `POST /tasks/${control.runIds[0]}/complete`,
    ]);
  });
});

describe("a machine shared with other workers", () => {
  /** A machine whose free memory the test sets. */
  const machine = (available: { mb: number }): MachineProbe => ({
    memory: () => ({ totalMb: 2048, availableMb: available.mb }),
    rssMb: () => undefined,
    children: () => [],
  });

  it("claims nothing while the machine is below its memory floor, then carries on", async () => {
    const state = await platform([{ entry: "chatty", input: { count: 1, pause: 0 } }]);
    const free = { mb: 100 };
    const worker = new Worker({
      url: state.url,
      token: "token",
      concurrency: 1,
      claimWaitSeconds: 1,
      machine: { name: "m1", slots: 4, floorMb: 200 },
      probe: machine(free),
    });
    const running = worker.run();
    await pause(1500);
    expect(state.requests.filter((request) => request === "POST /claim")).toEqual([]);
    free.mb = 1000;
    await until(() => state.ended.length === 1, 10_000);
    worker.stop();
    await running;
    expect(state.ended[0]).toMatchObject({ kind: "complete" });
    // Each claim names the machine and its slots, so the control plane can hold all its workers to them.
    const claim = state.bodies[state.requests.indexOf("POST /claim")];
    expect(claim?.machine).toEqual({ name: "m1", slots: 4 });
  });
});
