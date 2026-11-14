import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Kernel } from "../kernel.js";

/** Where uploaded exports wait to be imported, beside this control plane. */
export const STAGE_DIR = join(tmpdir(), "vx-staged-imports");

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
