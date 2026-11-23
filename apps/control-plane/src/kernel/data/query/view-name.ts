import { createHash } from "node:crypto";

/** The longest name Postgres keeps whole. */
const MAX_NAME_BYTES = 63;

/**
 * The name of the view that stands for a table in a workspace's query schema: the table's path,
 * and for one too long for Postgres to keep whole, a short name made from it. SQL a person writes
 * cannot say such a path (Postgres cuts it when it reads the text), so only what the platform
 * writes, a visual query, reads one.
 */
export function viewName(path: string): string {
  return Buffer.byteLength(path, "utf8") <= MAX_NAME_BYTES
    ? path
    : `v_${createHash("sha256").update(path).digest("hex").slice(0, 40)}`;
}

/** Whether SQL can name the table: its path is kept whole. */
export const namedInSql = (path: string): boolean =>
  Buffer.byteLength(path, "utf8") <= MAX_NAME_BYTES;
