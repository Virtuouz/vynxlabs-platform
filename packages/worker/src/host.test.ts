import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { WorkerHost } from "./host.js";

const TOKEN = "host-token-".padEnd(40, "x");
let scratch: string;
let server: Server;
let url: string;
let leases: { id: string; tenantId: string; token: string; idleExitSeconds: number }[];
let ended: string[];

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "worker-host-"));
  leases = [{ id: "lease-1", tenantId: "tenant-1", token: "vxw_tenant-1", idleExitSeconds: 7 }];
  ended = [];
  server = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.statusCode = 401;
      return response.end();
    }
    if (request.url === "/api/v1/worker-host/lease") {
      response.setHeader("content-type", "application/json");
      return response.end(JSON.stringify({ lease: leases.shift() ?? null }));
    }
    const done = /^\/api\/v1\/worker-host\/leases\/([^/]+)\/ended$/.exec(request.url ?? "");
    if (done) {
      ended.push(done[1] as string);
      response.statusCode = 204;
      return response.end();
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
});

/** A stand-in for the worker: writes what it was given, and exits. */
async function fakeWorker(): Promise<string> {
  const bin = join(scratch, "worker.mjs");
  await writeFile(
    bin,
    `import { writeFileSync } from "node:fs";
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  writeFileSync(${JSON.stringify(join(scratch, "seen.json"))}, JSON.stringify({
    args: process.argv.slice(2), stdin: input, env: process.env, uid: process.getuid(),
  }));
});
`,
  );
  return bin;
}

const self = () => ({ uid: process.getuid?.() ?? 0, gid: process.getgid?.() ?? 0 });

describe("the worker host", () => {
  test("starts a worker for each lease, with the tenant's credential on its input and nothing of its own", async () => {
    process.env.WORKER_HOST_TOKEN = TOKEN;
    const host = new WorkerHost({
      url,
      token: TOKEN,
      user: self(),
      workerBin: await fakeWorker(),
      leaseWaitSeconds: 0,
    });
    const running = host.run();
    for (let i = 0; i < 100 && ended.length === 0; i++) await sleep(50);
    await host.stop(1);
    await running;
    delete process.env.WORKER_HOST_TOKEN;

    const seen = JSON.parse(await readFile(join(scratch, "seen.json"), "utf8"));
    expect(seen.args).toEqual(["--token-stdin"]);
    expect(seen.stdin).toBe("vxw_tenant-1\n");
    expect(seen.env.PLATFORM_URL).toBe(url);
    expect(seen.env.PLATFORM_WORKER_IDLE_EXIT).toBe("7");
    // The host's token never reaches a worker.
    expect(JSON.stringify(seen.env)).not.toContain(TOKEN);
    expect(seen.env.WORKER_HOST_TOKEN).toBeUndefined();
    // When the worker exits, its lease is said to be over.
    expect(ended).toEqual(["lease-1"]);
  });

  test("a refused token stops the host", async () => {
    const host = new WorkerHost({
      url,
      token: "wrong",
      user: self(),
      workerBin: await fakeWorker(),
      leaseWaitSeconds: 0,
    });
    expect(await host.run()).toBe("refused");
    expect(host.running).toBe(0);
  });
});
