import { chmod, lstat, mkdir, readdir, rm, stat } from "node:fs/promises";
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

/** A file nobody holds a row for is left alone this long: its upload may still be arriving. */
const ARRIVING_MS = 15 * 60_000;

/**
 * Forgets uploads whose hour has passed, and removes their files where this replica holds
 * them. Then sweeps this replica's folder: a file with no live row (its row expired or was
 * thrown away through another replica, the check failed, the process restarted) is removed
 * once it has not been written to for a while. Returns how many uploads were forgotten.
 */
export async function removeExpiredImports(kernel: Kernel): Promise<number> {
  const gone = await kernel.db
    .deleteFrom("import_staging")
    .where("expires_at", "<=", new Date())
    .returning("id")
    .execute();
  for (const row of gone) await rm(join(STAGE_DIR, `${row.id}.tar`), { force: true });
  const names = await readdir(STAGE_DIR).catch(() => [] as string[]);
  const files = names.filter((name) => name.endsWith(".tar"));
  if (files.length > 0) {
    const live = new Set(
      (await kernel.db.selectFrom("import_staging").select("id").execute()).map((row) => row.id),
    );
    for (const name of files) {
      if (live.has(name.slice(0, -4))) continue;
      const path = join(STAGE_DIR, name);
      const found = await stat(path).catch(() => undefined);
      if (found && Date.now() - found.mtimeMs > ARRIVING_MS) await rm(path, { force: true });
    }
  }
  return gone.length;
}
