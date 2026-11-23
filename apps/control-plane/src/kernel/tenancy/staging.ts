import { chmod, lstat, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpError } from "../errors.js";
import type { Kernel } from "../kernel.js";

/** Where uploaded exports wait to be imported, beside this control plane. */
export const STAGE_DIR = join(tmpdir(), "vx-staged-imports");

/**
 * The folder uploads wait in, made so that only this process's user can enter it. A
 * folder that is not ours, or is not a plain folder, is refused: an upload holds every
 * row of a tenant, and the name is fixed, so someone else could have made it first.
 */
export async function ensureStageDir(): Promise<string> {
  await mkdir(STAGE_DIR, { recursive: true, mode: 0o700 });
  const found = await lstat(STAGE_DIR);
  const mine = typeof process.getuid === "function" ? process.getuid() : found.uid;
  if (!found.isDirectory() || found.uid !== mine) {
    throw new HttpError(
      500,
      "conflict",
      `${STAGE_DIR} is not a folder of this control plane's own user, so no upload is kept in it. Remove it, or ask whoever runs the instance to.`,
    );
  }
  if ((found.mode & 0o777) !== 0o700) await chmod(STAGE_DIR, 0o700);
  return STAGE_DIR;
}

/** Forgets uploads whose hour has passed, and removes their files where this replica holds them. */
export async function removeExpiredImports(kernel: Kernel): Promise<number> {
  const gone = await kernel.db
    .deleteFrom("import_staging")
    .where("expires_at", "<=", new Date())
    .returning("id")
    .execute();
  for (const row of gone) await rm(join(STAGE_DIR, `${row.id}.tar`), { force: true });
  return gone.length;
}
