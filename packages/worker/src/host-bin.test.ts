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

  test("MANAGED_WORKERS_MAX is read, and checked, as the instance's setting of that name is (HOST-20)", () => {
    const result = run(["--url", "http://127.0.0.1:1"], { MANAGED_WORKERS_MAX: "0" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--max-workers must be a positive whole number.");
  });
});
