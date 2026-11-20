import { newId } from "@volvel/db";
import type { Db, Principal, Trx } from "../audit.js";
import { HttpError, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { getRow, type Row, type RowTarget, updateRow } from "./rows.js";

/** The largest file the platform stores. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface StoredFile {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

interface FileRow {
  id: string;
  name: string;
  content_type: string;
  size_bytes: string;
  created_at: Date;
}
export const toStoredFile = (row: FileRow): StoredFile => ({
  id: row.id,
  name: row.name,
  contentType: row.content_type,
  sizeBytes: Number(row.size_bytes),
  createdAt: row.created_at.toISOString(),
});

/** Keeps a file's bytes in the object store and its record in the workspace. */
export async function storeFile(
  kernel: Kernel,
  db: Db | Trx,
  workspace: { tenantId: string; id: string },
  by: Principal | { type: string; id: string | null },
  file: { name: string; contentType: string; content: Buffer },
): Promise<StoredFile> {
  if (file.content.length > MAX_FILE_BYTES) {
    throw new HttpError(
      413,
      "payload_too_large",
      `A file can be at most ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
    );
  }
  const id = newId();
  const key = `files/${workspace.tenantId}/${workspace.id}/${id}`;
  await kernel.storage.put(key, file.content, file.contentType);
  const row = await db
    .insertInto("file")
    .values({
      id,
      tenant_id: workspace.tenantId,
      workspace_id: workspace.id,
      name: file.name.slice(0, 255),
      content_type: file.contentType.slice(0, 255),
      size_bytes: file.content.length,
      storage_key: key,
      created_by_type: by.type,
      created_by_id: by.id,
    })
    .returning(["id", "name", "content_type", "size_bytes", "created_at"])
    .executeTakeFirstOrThrow();
  return toStoredFile(row);
}

export async function readFile(kernel: Kernel, db: Db | Trx, workspaceId: string, id: string) {
  const row = await db
    .selectFrom("file")
    .selectAll()
    .where("id", "=", id)
    .where("workspace_id", "=", workspaceId)
    .executeTakeFirst();
  if (!row) throw notFound("The file");
  return { file: toStoredFile(row), content: await kernel.storage.get(row.storage_key) };
}

/**
 * Changes a row, and notes each file it no longer names (replaced, or removed) in the row's
 * history, so the file stays until that history has run out. A file a row names again is no
 * longer noted. The row may live in a database of its own, so the note is made after the row
 * is changed: at worst a file goes unnoted, and a file nothing deletes is kept.
 */
export async function updateRowKeepingFiles(
  kernel: Kernel,
  data: Parameters<typeof updateRow>[0],
  workspace: { tenantId: string; id: string },
  by: Principal | { type: string; id: string | null },
  target: RowTarget,
  id: string,
  patch: unknown,
): Promise<Row> {
  const named =
    patch !== null && typeof patch === "object"
      ? target.columns.filter((column) => column.type === "file" && column.name in patch)
      : [];
  if (named.length === 0) return updateRow(data, target, id, patch);
  const before = await getRow(data, target, id);
  const after = await updateRow(data, target, id, patch);
  for (const column of named) {
    const was = before[column.name];
    const now = after[column.name];
    if (typeof now === "string") {
      await kernel.db.deleteFrom("row_file_history").where("file_id", "=", now).execute();
    }
    if (typeof was !== "string" || was === now) continue;
    const file = await kernel.db
      .selectFrom("file")
      .select("id")
      .where("id", "=", was)
      .where("workspace_id", "=", workspace.id)
      .executeTakeFirst();
    if (!file) continue;
    await kernel.db
      .insertInto("row_file_history")
      .values({
        id: newId(),
        tenant_id: workspace.tenantId,
        workspace_id: workspace.id,
        file_id: was,
        table_name: target.name,
        row_id: id,
        column_name: column.name,
        replaced_by_type: by.type,
        replaced_by_id: by.id,
      })
      .execute();
  }
  return after;
}
