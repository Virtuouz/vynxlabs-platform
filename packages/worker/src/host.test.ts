import { type spawn as Spawn, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
let routeOff = false;
let asked = 0;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "worker-host-"));
  leases = [{ id: "lease-1", tenantId: "tenant-1", token: "vxw_tenant-1", idleExitSeconds: 7 }];
  ended = [];
  routeOff = false;
  asked = 0;
  server = createServer((request, response) => {
    asked += 1;
    if (routeOff) {
      // As a control plane whose MANAGED_WORKERS is not host answers: the route is not there.
      response.statusCode = 404;
      return response.end();
    }
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
    expect(seen.env.VOLVEL_URL).toBe(url);
    expect(seen.env.VOLVEL_WORKER_IDLE_EXIT).toBe("7");
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

  test("each worker alive has a user and a private directory of its own (HOST-03)", async () => {
    leases = [
      { id: "a", tenantId: "t-a", token: "vxw_a", idleExitSeconds: 1 },
      { id: "b", tenantId: "t-b", token: "vxw_b", idleExitSeconds: 1 },
      { id: "c", tenantId: "t-c", token: "vxw_c", idleExitSeconds: 1 },
    ];
    // This test cannot switch users, so it records what it was asked to start, and
    // starts the worker as itself. A worker that stays until told to exit holds its user.
    const started: { uid: number; gid: number; home: string; tmp: string; cwd: string }[] = [];
    const modes: number[] = [];
    const bin = join(scratch, "stay.mjs");
    await writeFile(
      bin,
      "process.stdin.resume(); process.once('SIGTERM', () => process.exit(0)); setTimeout(() => process.exit(0), 700);",
    );
    const own = self();
    const recording = ((command: string, args: string[], options: Record<string, unknown>) => {
      const env = options.env as Record<string, string>;
      started.push({
        uid: options.uid as number,
        gid: options.gid as number,
        home: env.HOME as string,
        tmp: env.TMPDIR as string,
        cwd: options.cwd as string,
      });
      void stat(env.HOME as string).then((info) => modes.push(info.mode & 0o777));
      const { uid: _uid, gid: _gid, ...rest } = options;
      return spawn(command, args, { ...rest, uid: own.uid, gid: own.gid } as never);
    }) as unknown as typeof Spawn;
    const host = new WorkerHost({
      url,
      token: TOKEN,
      user: { uid: 20000, gid: 30000, count: 3 },
      scratchRoot: scratch,
      spawn: recording,
      workerBin: bin,
      leaseWaitSeconds: 0,
      maxWorkers: 3,
    });
    const running = host.run();
    for (let i = 0; i < 100 && started.length < 3; i++) await sleep(50);
    expect(started.map((one) => one.uid)).toEqual([20000, 20001, 20002]);
    expect(started.map((one) => one.gid)).toEqual([30000, 30001, 30002]);
    expect(new Set(started.map((one) => one.home)).size).toBe(3);
    for (const one of started) {
      expect(one.tmp).toBe(one.home);
      expect(one.cwd).toBe(one.home);
      expect(one.home.startsWith(scratch)).toBe(true);
    }
    expect(modes).toEqual([0o700, 0o700, 0o700]);
    // When a worker is gone, so is its directory, and its user is the next one's.
    for (let i = 0; i < 100 && ended.length < 3; i++) await sleep(50);
    await host.stop(1);
    await running;
    for (const one of started) await expect(stat(one.home)).rejects.toThrow(/ENOENT/);
    expect(ended.sort()).toEqual(["a", "b", "c"]);
  });

  test("a control plane whose managed workers are not set to host is said once, and asked again only after a long pause (HOST-19)", async () => {
    routeOff = true;
    const logged: { level: string; message: string }[] = [];
    const host = new WorkerHost({
      url,
      token: TOKEN,
      user: self(),
      workerBin: await fakeWorker(),
      leaseWaitSeconds: 0,
      routeOffPauseMs: 400,
      log: (level, message) => logged.push({ level, message }),
    });
    const running = host.run();
    await sleep(900);
    await host.stop(1);
    await running;
    const said = logged.filter((one) => /MANAGED_WORKERS/.test(one.message));
    expect(said).toHaveLength(1);
    expect(said[0]?.message).toMatch(/not set to host/);
    expect(logged.map((one) => one.message).join("\n")).not.toContain("could not be reached");
    expect(asked).toBeLessThanOrEqual(4);
  });

  test("a worker that cannot be started ends its lease and is not called unreachable (HOST-06)", async () => {
    const logged: {
      level: string;
      message: string;
      fields?: Record<string, unknown> | undefined;
    }[] = [];
    const refusing = (() => {
      throw Object.assign(new Error("spawn EPERM"), { code: "EPERM" });
    }) as unknown as typeof Spawn;
    const host = new WorkerHost({
      url,
      token: TOKEN,
      user: { uid: 20000, gid: 30000, count: 2 },
      scratchRoot: scratch,
      spawn: refusing,
      leaseWaitSeconds: 0,
      startFailurePauseMs: 20,
      log: (level, message, fields) => logged.push({ level, message, fields }),
    });
    const running = host.run();
    for (let i = 0; i < 100 && ended.length === 0; i++) await sleep(50);
    await host.stop(1);
    await running;
    expect(ended).toEqual(["lease-1"]);
    expect(host.running).toBe(0);
    expect(logged.map((one) => one.message).join("\n")).not.toContain("could not be reached");
    const failed = logged.find((one) => one.message === "a worker could not be started");
    expect(failed?.fields?.error).toContain("EPERM");
    // The host, not running as root here, says what that means.
    expect(JSON.stringify(failed?.fields)).toMatch(/root|CAP_SETUID/);
  });

  test("a worker that cannot be signalled keeps its lease, and stopping does not end the host (HOST-04)", async () => {
    const bin = join(scratch, "stay.mjs");
    await writeFile(
      bin,
      "setInterval(() => {}, 1000); process.once('SIGTERM', () => process.exit(0));",
    );
    const own = self();
    let refuse = true;
    const logged: string[] = [];
    const children: ReturnType<typeof spawn>[] = [];
    // A child whose `kill` fails as it does for another user's process without CAP_KILL.
    const stubborn = ((command: string, args: string[], options: Record<string, unknown>) => {
      const { uid: _uid, gid: _gid, ...rest } = options;
      const child = spawn(command, args, { ...rest, uid: own.uid, gid: own.gid } as never);
      const kill = child.kill.bind(child);
      child.kill = ((signal?: NodeJS.Signals) => {
        if (!refuse) return kill(signal);
        child.emit("error", Object.assign(new Error("kill EPERM"), { code: "EPERM" }));
        return false;
      }) as typeof child.kill;
      children.push(child);
      return child;
    }) as unknown as typeof Spawn;
    const host = new WorkerHost({
      url,
      token: TOKEN,
      user: self(),
      scratchRoot: scratch,
      spawn: stubborn,
      workerBin: bin,
      leaseWaitSeconds: 0,
      log: (_level, message) => logged.push(message),
    });
    const running = host.run();
    for (let i = 0; i < 100 && children.length === 0; i++) await sleep(50);
    await sleep(200);
    // Both signals are refused. The stop gives up, says so, and the host is still here.
    await host.stop(0.1, 0.3);
    await running;
    expect(logged).toContain("a signal to a worker was refused: the worker is still running");
    expect(logged).toContain("a worker could not be stopped and is left running");
    expect(logged).not.toContain("a worker could not be started");
    expect(host.running).toBe(1);
    // Its lease is not said to be over while the worker runs.
    expect(ended).toEqual([]);
    refuse = false;
    children[0]?.kill("SIGTERM");
    for (let i = 0; i < 100 && ended.length === 0; i++) await sleep(50);
    expect(ended).toEqual(["lease-1"]);
  });
});
