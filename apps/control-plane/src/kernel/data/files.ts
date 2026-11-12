import { newId } from "@vynxlabs/db";
import type { Db, Principal, Trx } from "../audit.js";
import { HttpError, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";

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
