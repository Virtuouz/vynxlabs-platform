import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/** HOST-20: the host's own flags and variables are checked before it asks for work. */
const bin = fileURLToPath(new URL("../dist/host-bin.js", import.meta.url));
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [bin, ...args], {
    env: { PATH: process.env.PATH ?? "", WORKER_HOST_TOKEN: "t".repeat(40), ...env },
    encoding: "utf8",
    timeout: 10_000,
  });

describe("volvel-worker-host's settings", () => {
  test("a --max-workers that is not a whole number exits 2 and says which (HOST-20)", () => {
    const result = run(["--url", "http://127.0.0.1:1", "--max-workers", "x"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--max-workers must be a positive whole number.");
  });

  test("an empty value is no value: the shipped compose passes the managed worker settings empty", () => {
    const result = spawnSync(process.execPath, [bin, "--url", "http://127.0.0.1:1"], {
      env: {
        PATH: process.env.PATH ?? "",
        WORKER_HOST_TOKEN: "t".repeat(40),
        MANAGED_WORKER_UID: "",
        MANAGED_WORKER_GID: "",
        MANAGED_WORKER_USERS: "",
        MANAGED_WORKERS_MAX: "",
      },
      encoding: "utf8",
      timeout: 3000,
    });
    expect(result.stderr).not.toContain("must be");
    expect(result.status).not.toBe(2);
  });

  test("MANAGED_WORKERS_MAX is read, and checked, as the instance's setting of that name is (HOST-20)", () => {
    const result = run(["--url", "http://127.0.0.1:1"], { MANAGED_WORKERS_MAX: "0" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--max-workers must be a positive whole number.");
  });
});

/** HOST-MP3: a standalone worker's concurrency and idle exit are checked as the host's settings are. */
describe("volvel-worker's settings", () => {
  const worker = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
  const start = (env: Record<string, string>) =>
    spawnSync(process.execPath, [worker, "--url", "http://127.0.0.1:1", "--token", "t"], {
      env: { PATH: process.env.PATH ?? "", ...env },
      encoding: "utf8",
      timeout: 10_000,
    });

  test("VOLVEL_WORKER_CONCURRENCY that is not a whole number exits 2 and says which (HOST-MP3)", () => {
    const result = start({ VOLVEL_WORKER_CONCURRENCY: "many" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--concurrency (or VOLVEL_WORKER_CONCURRENCY)");
  });

  test("VOLVEL_WORKER_IDLE_EXIT is checked too (HOST-MP3)", () => {
    const result = start({ VOLVEL_WORKER_IDLE_EXIT: "0" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--idle-exit (or VOLVEL_WORKER_IDLE_EXIT)");
  });
});
