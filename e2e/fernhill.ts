import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Which Fernhill a worker walks. The specs of the `fernhill` project change what they find in
 * Fernhill (its apps, rows, queries, feedback table), so a worker of its own copy each, seeded
 * by `fernhill-copies.setup.ts` with FERNHILL_SLUG: `fernhill-w0`, `fernhill-w1`... The first
 * `fernhill` is left to `screenshots`, whose pictures are of the example as it was seeded.
 *
 * A worker claims a copy the first time a spec asks, and keeps it until it ends. Claims are
 * files named for the copy that hold the worker's process id; one whose process is gone is
 * taken over (a worker the runner restarted after a crash). `E2E_FERNHILL_TENANT` names one
 * tenant for every worker instead.
 */
export const FERNHILL_COPIES = Math.max(1, Number(process.env.E2E_FERNHILL_COPIES ?? 3));
export const copySlug = (index: number) => `fernhill-w${index}`;

let mine: string | undefined;

/** This worker's Fernhill. In the runner itself (listing tests), the first copy. */
export function fernhillTenant(): string {
  if (process.env.E2E_FERNHILL_TENANT) return process.env.E2E_FERNHILL_TENANT;
  if (mine) return mine;
  if (process.env.TEST_WORKER_INDEX === undefined) return copySlug(0);
  const dir = join(
    tmpdir(),
    `volvel-fernhill-claims-${Buffer.from(process.env.E2E_URL ?? "http://localhost:8080")
      .toString("base64url")
      .slice(0, 40)}`,
  );
  mkdirSync(dir, { recursive: true });
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  for (let waited = 0; waited < 600_000; waited += 500) {
    for (let index = 0; index < FERNHILL_COPIES; index += 1) {
      const file = join(dir, copySlug(index));
      try {
        writeFileSync(file, String(process.pid), { flag: "wx" });
        mine = copySlug(index);
        return mine;
      } catch {
        let holder = 0;
        try {
          holder = Number(readFileSync(file, "utf8"));
          process.kill(holder, 0);
        } catch (error) {
          // The holder is gone (or the file was just made and is empty: leave it).
          if (holder && (error as NodeJS.ErrnoException).code === "ESRCH") {
            rmSync(file, { force: true });
            index -= 1;
          }
        }
      }
    }
    Atomics.wait(sleeper, 0, 0, 500);
  }
  throw new Error(`No copy of Fernhill is free: ${FERNHILL_COPIES} workers already hold them.`);
}
