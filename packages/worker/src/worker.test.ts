import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { type Bundle, bundleDigest } from "@vynxlabs/manifest";
import { afterEach, describe, expect, it } from "vitest";
import { Worker } from "./worker.js";

/** A script that writes `count` log lines, pausing every 50 so heartbeats can send some. */
const CODE = `
export const chatty = {
  async execute(input, ctx) {
    for (let i = 0; i < input.count; i += 1) {
      ctx.log.info("line " + i);
      if (i % 50 === 0) await new Promise((resolve) => setTimeout(resolve, input.pause));
    }
    return { wrote: input.count };
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

interface Platform {
  url: string;
  lines: string[];
  logRequests: number;
  ended: { kind: "complete" | "fail"; body: Record<string, unknown> } | null;
  /** How many log requests fail before they start to succeed. Infinity: they never do. */
  failLogs: number;
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

/** A control plane that hands out one job, then nothing, and records what the worker sends. */
async function platform(count: number, failLogs: number, pause = 0): Promise<Platform> {
  const content = bundle();
  const runId = randomUUID();
  let handedOut = false;
  const state: Platform = { url: "", lines: [], logRequests: 0, ended: null, failLogs };
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
    if (path === "/claim") {
      if (handedOut) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return reply(response, 200, { job: null });
      }
      handedOut = true;
      return reply(response, 200, {
        job: {
          runId,
          attempt: 1,
          workspaceId: randomUUID(),
          script: { path: "chatty", entry: "chatty" },
          input: { count, pause },
          bundle: { id: randomUUID(), digest: content.digest },
          timeoutSeconds: 30,
          heartbeatSeconds: 1,
          idempotencyKey: "key",
          trigger: { type: "api" },
        },
      });
    }
    if (path.startsWith("/bundles/")) return reply(response, 200, content);
    if (path.endsWith("/heartbeat")) return reply(response, 200, { cancelled: false });
    if (path.endsWith("/logs")) {
      state.logRequests += 1;
      if (state.failLogs > 0) {
        state.failLogs -= 1;
        return reply(response, 503, { detail: "Not now." });
      }
      const entries = body.entries as { message: string }[];
      if (entries.length > 500) return reply(response, 400, { detail: "Too many entries." });
      state.lines.push(...entries.map((entry) => entry.message));
      return reply(response, 204);
    }
    if (path.endsWith("/complete")) {
      state.ended = { kind: "complete", body };
      return reply(response, 204);
    }
    if (path.endsWith("/fail")) {
      state.ended = { kind: "fail", body };
      return reply(response, 200, { final: true });
    }
    return reply(response, 404, { detail: path });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return state;
}

/** Runs a worker until it has reported the one job's end. */
async function work(state: Platform) {
  const worker = new Worker({
    url: state.url,
    token: "token",
    concurrency: 1,
    claimWaitSeconds: 1,
  });
  const running = worker.run();
  const deadline = Date.now() + 20_000;
  while (!state.ended && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  worker.stop();
  await running;
}

describe("log delivery", () => {
  it("keeps lines the control plane could not take and delivers them all, in order", async () => {
    // About four seconds of writing: the heartbeats' sends fail three times, then succeed.
    const state = await platform(1200, 3, 150);
    await work(state);
    expect(state.ended?.kind).toBe("complete");
    expect(state.ended?.body.logsLost).toBeUndefined();
    expect(state.lines).toEqual(Array.from({ length: 1200 }, (_, i) => `line ${i}`));
  });

  it("says how many lines were lost when the control plane never takes them", async () => {
    const state = await platform(20, Number.POSITIVE_INFINITY);
    await work(state);
    expect(state.ended?.kind).toBe("complete");
    expect(state.ended?.body.logsLost).toBe(20);
    expect(state.lines).toEqual([]);
  });
});
