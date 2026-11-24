import { newId, sql } from "@volvel/db";
import type { Db, Principal, Trx } from "../audit.js";
import { check } from "../authorize.js";
import { badRequest, HttpError, notFound } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { workspaceSchema } from "./apply.js";
import {
  deleteRows,
  describeTable,
  findRows,
  getRow,
  insertRows,
  isKey,
  type Row,
  type RowTarget,
  scopeFor,
  updateRow,
  withData,
} from "./rows.js";

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
  return {
    file: toStoredFile(row),
    createdBy: { type: row.created_by_type, id: row.created_by_id },
    content: await kernel.storage.get(row.storage_key),
  };
}

/** Every file column of a tenant's tables, or of one workspace's, active or retired. */
async function fileColumns(kernel: Kernel, tenantId: string, workspaceId?: string) {
  let query = kernel.db
    .selectFrom("data_column")
    .innerJoin("data_table", "data_table.id", "data_column.table_id")
    .select([
      "data_table.workspace_id as workspaceId",
      "data_table.name as tableName",
      "data_table.physical_name as table",
      "data_table.resource_id as resourceId",
      "data_column.name as columnName",
      "data_column.physical_name as column",
    ])
    .where("data_table.tenant_id", "=", tenantId)
    .where("data_column.type", "=", "file");
  if (workspaceId) query = query.where("data_table.workspace_id", "=", workspaceId);
  return query.execute();
}

/** A table that names a file: which table and column, and how many rows (none known when it could not be asked). */
export interface FileNaming {
  table: string;
  column: string;
  rows: number | null;
}

/**
 * What names each of these files: for each, the tables and columns whose rows hold it, in any
 * table of any workspace, a dedicated database's included. A file no row names has no entry. A
 * table that cannot be asked names every file, with no count: a file kept in doubt is better
 * than one a row points to that is gone.
 */
export async function namingOf(
  kernel: Kernel,
  tenantId: string,
  ids: string[],
  workspaceId?: string,
): Promise<Map<string, FileNaming[]>> {
  const naming = new Map<string, FileNaming[]>();
  if (ids.length === 0) return naming;
  const add = (id: string, one: FileNaming) => naming.set(id, [...(naming.get(id) ?? []), one]);
  const store = await kernel.data.forTenant(tenantId);
  for (const column of await fileColumns(kernel, tenantId, workspaceId)) {
    try {
      const found = await sql<{ id: string; rows: string }>`
        select ${sql.ref(column.column)}::text as id, count(*) as rows
        from ${sql.id(workspaceSchema(column.workspaceId), column.table)}
        where ${sql.ref(column.column)} in (${sql.join(ids)})
        group by 1
      `.execute(store.owner);
      for (const row of found.rows) {
        add(row.id, { table: column.tableName, column: column.columnName, rows: Number(row.rows) });
      }
    } catch (error) {
      kernel.log.warn({ err: error, table: column.tableName }, "a file column could not be read");
      for (const id of ids) {
        add(id, { table: column.tableName, column: column.columnName, rows: null });
      }
    }
  }
  return naming;
}

/** Which of these files a row of the tenant still names (see `namingOf`). */
export async function namedFiles(
  kernel: Kernel,
  tenantId: string,
  ids: string[],
  workspaceId?: string,
): Promise<Set<string>> {
  return new Set((await namingOf(kernel, tenantId, ids, workspaceId)).keys());
}

/**
 * Whether this person may have a file: they uploaded it, or may read every row, or may read a
 * row that names it. Any other file of the workspace is none of theirs, and is said not to
 * exist.
 */
export interface FileCaller {
  principal: Principal;
  allowed(permission: string, target: Record<string, string | undefined>): Promise<boolean>;
}

/** A person as the permission check sees them, for a script acting for that person. */
export const callerOf = (kernel: Kernel, principal: Principal): FileCaller => ({
  principal,
  allowed: async (permission, target) =>
    (await check(kernel.db, principal, permission, target)).allowed,
});

export async function mayReadFile(
  kernel: Kernel,
  ctx: FileCaller,
  workspace: { tenantId: string; id: string },
  file: { id: string; createdBy: { type: string; id: string | null } },
): Promise<boolean> {
  const { principal } = ctx;
  if (
    principal.id !== null &&
    file.createdBy.id === principal.id &&
    file.createdBy.type === principal.type
  ) {
    return true;
  }
  const at = { tenantId: workspace.tenantId, workspaceId: workspace.id };
  if (await ctx.allowed("data_all:read", at)) return true;
  for (const column of await fileColumns(kernel, workspace.tenantId, workspace.id)) {
    const here = { ...at, ...(column.resourceId ? { resourceId: column.resourceId } : {}) };
    if (!(await ctx.allowed("data:read", here))) continue;
    const everything = await ctx.allowed("data_all:read", here);
    const scope = await scopeFor(kernel, workspace.tenantId, principal, everything);
    const store = await kernel.data.forTenant(workspace.tenantId);
    const target = await describeTable(store.owner, workspace.id, column.tableName);
    const found = await withData(kernel, workspace.tenantId, scope, (data) =>
      findRows(data, target, {
        filter: { column: column.columnName, op: "eq", value: file.id },
        limit: 1,
      }),
    );
    if (found.items.length > 0) return true;
  }
  return false;
}

/**
 * A file a row is given must be one of this workspace's: an ID that names nothing, or another
 * workspace's file, would be read through the row. Checked for every insert and update.
 */
async function assertFilesHere(
  kernel: Kernel,
  workspace: { tenantId: string; id: string },
  target: RowTarget,
  inputs: unknown[],
  caller?: FileCaller,
  current: ReadonlySet<string> = new Set(),
): Promise<void> {
  const columns = target.columns.filter((column) => column.type === "file");
  if (columns.length === 0) return;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const wanted = new Map<string, string>();
  for (const input of inputs) {
    if (input === null || typeof input !== "object") continue;
    for (const column of columns) {
      const value = (input as Record<string, unknown>)[column.name];
      if (typeof value === "string" && UUID.test(value))
        wanted.set(value.toLowerCase(), column.name);
    }
  }
  if (wanted.size === 0) return;
  const there = await kernel.db
    .selectFrom("file")
    .select("id")
    .where("id", "in", [...wanted.keys()])
    .where("workspace_id", "=", workspace.id)
    .where("tenant_id", "=", workspace.tenantId)
    .execute();
  const have = new Set(there.map((row) => row.id));
  // The same answer for a file that is not there and one the caller may not have, so nothing is
  // learned from the difference. A value the row already holds is not asked again.
  const refuse = (name: string) =>
    badRequest("A file given to a row is not a file of this workspace.", [
      { path: `/${name}`, message: "upload the file to this workspace first, then name it" },
    ]);
  for (const [id, name] of wanted) if (!have.has(id)) throw refuse(name);
  if (!caller) return;
  const files = await kernel.db
    .selectFrom("file")
    .select(["id", "created_by_type", "created_by_id"])
    .where("id", "in", [...wanted.keys()])
    .execute();
  for (const file of files) {
    if (current.has(file.id)) continue;
    const may = await mayReadFile(kernel, caller, workspace, {
      id: file.id,
      createdBy: { type: file.created_by_type, id: file.created_by_id },
    });
    if (!may) throw refuse(wanted.get(file.id) ?? "");
  }
}

/** A file a row names again is no longer noted: its note would let it go while a row names it. */
async function clearNotes(
  kernel: Kernel,
  workspace: { tenantId: string; id: string },
  ids: string[],
) {
  if (ids.length === 0) return;
  await kernel.db
    .deleteFrom("row_file_history")
    .where("file_id", "in", ids)
    .where("workspace_id", "=", workspace.id)
    .where("tenant_id", "=", workspace.tenantId)
    .execute();
}

const fileIdsIn = (target: RowTarget, rows: Row[]) =>
  rows.flatMap((row) =>
    target.columns.flatMap((column) =>
      column.type === "file" && typeof row[column.name] === "string"
        ? [row[column.name] as string]
        : [],
    ),
  );

/** Inserts rows, each file they name being one of the workspace's, and no longer noted. */
export async function insertRowsKeepingFiles(
  kernel: Kernel,
  data: Parameters<typeof insertRows>[0],
  workspace: { tenantId: string; id: string },
  target: RowTarget,
  inputs: unknown[],
  scope: Parameters<typeof insertRows>[3],
  caller?: FileCaller,
): Promise<Row[]> {
  await assertFilesHere(kernel, workspace, target, inputs, caller);
  const rows = await insertRows(data, target, inputs, scope);
  await clearNotes(kernel, workspace, fileIdsIn(target, rows));
  return rows;
}

/** A row that would be deleted along with another, and the files it names. */
interface Cascaded {
  table: string;
  id: string;
  /** The row asked to be deleted, which brings this one with it. */
  root: string;
  row: Row;
  columns: string[];
}

/**
 * The rows that go when these rows are deleted, because a reference column says `cascade`, at
 * any depth, and name a file. Read before the delete: the database removes them by itself.
 */
async function cascadedRows(
  kernel: Kernel,
  workspace: { tenantId: string; id: string },
  tableName: string,
  ids: string[],
): Promise<Cascaded[]> {
  const edges = await kernel.db
    .selectFrom("data_column")
    .innerJoin("data_table", "data_table.id", "data_column.table_id")
    .select([
      "data_table.name as table",
      "data_table.physical_name as physical",
      "data_column.physical_name as column",
      "data_column.reference_table as parent",
    ])
    .where("data_table.workspace_id", "=", workspace.id)
    .where("data_table.status", "=", "active")
    .where("data_column.status", "=", "active")
    .where("data_column.on_delete", "=", "cascade")
    .where("data_column.reference_table", "is not", null)
    .execute();
  if (edges.length === 0) return [];
  const files = await fileColumns(kernel, workspace.tenantId, workspace.id);
  const owner = (await kernel.data.forTenant(workspace.tenantId)).owner;
  const schema = workspaceSchema(workspace.id);
  const found: Cascaded[] = [];
  const seen = new Set<string>([tableName]);
  let frontier = new Map<string, Map<string, string>>([
    [tableName, new Map(ids.map((id) => [id, id]))],
  ]);
  for (let depth = 0; depth < 20 && frontier.size > 0; depth += 1) {
    const next = new Map<string, Map<string, string>>();
    for (const [parent, members] of frontier) {
      for (const edge of edges.filter((one) => one.parent === parent)) {
        const named = files.filter(
          (one) => one.tableName === edge.table && one.workspaceId === workspace.id,
        );
        const keys = [...members.keys()];
        const result = await sql<Row>`
          select id::text as id, ${sql.ref(edge.column)}::text as parent_id${
            named.length > 0
              ? sql`, ${sql.join(named.map((one) => sql`${sql.ref(one.column)}::text as ${sql.id(one.columnName)}`))}`
              : sql``
          }
          from ${sql.id(schema, edge.physical)}
          where ${sql.ref(edge.column)}::text in (${sql.join(keys)})
        `.execute(owner);
        for (const row of result.rows) {
          const root = members.get(String(row.parent_id));
          if (root === undefined) continue;
          if (named.length > 0)
            found.push({
              table: edge.table,
              id: String(row.id),
              root,
              row,
              columns: named.map((one) => one.columnName),
            });
          // A table is followed once: a loop of rules ends where it began.
          if (!seen.has(edge.table) || next.has(edge.table)) {
            const level = next.get(edge.table) ?? new Map<string, string>();
            level.set(String(row.id), root);
            next.set(edge.table, level);
          }
        }
      }
    }
    for (const name of next.keys()) seen.add(name);
    frontier = next;
  }
  return found;
}

/**
 * Deletes rows and notes the files they named in each row's history, as a replaced file is,
 * so they stay until that history has run out. Rows that are not there are reported missing.
 */
export async function deleteRowsKeepingFiles(
  kernel: Kernel,
  data: Parameters<typeof deleteRows>[0],
  workspace: { tenantId: string; id: string },
  by: Principal | { type: string; id: string | null },
  target: RowTarget,
  ids: string[],
): Promise<{ deleted: string[]; missing: string[] }> {
  const columns = target.columns.filter((column) => column.type === "file");
  const before = new Map<string, Row>();
  if (columns.length > 0) {
    for (const id of ids) {
      try {
        before.set(id, await getRow(data, target, id));
      } catch (error) {
        if (!(error instanceof HttpError && error.statusCode === 404)) throw error;
      }
    }
  }
  // Rows another table's `cascade` rule takes with them are read now, and noted once they are gone.
  const cascaded = await cascadedRows(
    kernel,
    workspace,
    target.name,
    ids.filter((id) => isKey(target, id)),
  );
  const done = await deleteRows(data, target, ids);
  const gone = new Set(done.deleted);
  for (const one of cascaded) {
    if (gone.has(one.root))
      await noteFiles(
        kernel,
        workspace,
        by,
        { name: one.table } as RowTarget,
        one.id,
        one.row,
        one.columns,
      );
  }
  for (const id of done.deleted) {
    const row = before.get(id);
    if (row)
      await noteFiles(
        kernel,
        workspace,
        by,
        target,
        id,
        row,
        columns.map((c) => c.name),
      );
  }
  return done;
}

/** Deletes one row, and notes its files as `deleteRowsKeepingFiles` does. */
export async function deleteRowKeepingFiles(
  kernel: Kernel,
  data: Parameters<typeof deleteRows>[0],
  workspace: { tenantId: string; id: string },
  by: Principal | { type: string; id: string | null },
  target: RowTarget,
  id: string,
): Promise<void> {
  const done = await deleteRowsKeepingFiles(kernel, data, workspace, by, target, [id]);
  if (done.missing.length > 0) throw notFound("The row");
}

async function noteFiles(
  kernel: Kernel,
  workspace: { tenantId: string; id: string },
  by: Principal | { type: string; id: string | null },
  target: RowTarget,
  rowId: string,
  row: Row,
  columnNames: string[],
) {
  for (const name of columnNames) {
    const was = row[name];
    if (typeof was !== "string") continue;
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
        row_id: rowId,
        column_name: name,
        replaced_by_type: by.type,
        replaced_by_id: by.id,
      })
      .execute();
  }
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
  caller?: FileCaller,
): Promise<Row> {
  const named =
    patch !== null && typeof patch === "object"
      ? target.columns.filter((column) => column.type === "file" && column.name in patch)
      : [];
  if (named.length === 0) {
    await assertFilesHere(kernel, workspace, target, [patch], caller);
    return updateRow(data, target, id, patch);
  }
  const before = await getRow(data, target, id);
  await assertFilesHere(
    kernel,
    workspace,
    target,
    [patch],
    caller,
    new Set(fileIdsIn(target, [before])),
  );
  const after = await updateRow(data, target, id, patch);
  for (const column of named) {
    const was = before[column.name];
    const now = after[column.name];
    if (typeof now === "string") {
      await clearNotes(kernel, workspace, [now]);
    }
    if (typeof was !== "string" || was === now) continue;
    await noteFiles(kernel, workspace, by, target, id, { [column.name]: was }, [column.name]);
  }
  return after;
}

/**
 * The files that rows of a retired table, or a retired file column, name, read before it is
 * dropped for good. Noted after the drop, they stay for the audit period as any deleted row's do.
 */
export async function filesOfPurge(
  kernel: Kernel,
  workspace: { tenantId: string; id: string },
  request: {
    table: string;
    column?: string | undefined;
    columnId?: string | undefined;
    tableId?: string | undefined;
  },
): Promise<{ table: string; rowId: string; column: string; file: string }[]> {
  let query = kernel.db
    .selectFrom("data_column")
    .innerJoin("data_table", "data_table.id", "data_column.table_id")
    .select([
      "data_table.name as tableName",
      "data_table.physical_name as table",
      "data_column.name as columnName",
      "data_column.physical_name as column",
    ])
    .where("data_table.workspace_id", "=", workspace.id)
    .where("data_table.name", "=", request.table)
    .where("data_column.type", "=", "file");
  if (request.column !== undefined || request.columnId !== undefined) {
    query = query.where("data_column.status", "=", "retired");
    if (request.column !== undefined) query = query.where("data_column.name", "=", request.column);
    if (request.columnId !== undefined)
      query = query.where("data_column.id", "=", request.columnId);
  } else {
    query = query.where("data_table.status", "=", "retired");
    if (request.tableId !== undefined) query = query.where("data_table.id", "=", request.tableId);
  }
  const owner = (await kernel.data.forTenant(workspace.tenantId)).owner;
  const named: { table: string; rowId: string; column: string; file: string }[] = [];
  for (const column of await query.execute()) {
    const result = await sql<{ id: string; file: string }>`
      select id::text as id, ${sql.ref(column.column)}::text as file
      from ${sql.id(workspaceSchema(workspace.id), column.table)}
      where ${sql.ref(column.column)} is not null
    `.execute(owner);
    for (const row of result.rows)
      named.push({
        table: column.tableName,
        rowId: row.id,
        column: column.columnName,
        file: row.file,
      });
  }
  return named;
}

/** Notes files that went with rows dropped for good. */
export async function noteDroppedFiles(
  kernel: Kernel,
  workspace: { tenantId: string; id: string },
  by: Principal | { type: string; id: string | null },
  named: { table: string; rowId: string; column: string; file: string }[],
) {
  for (const one of named)
    await noteFiles(
      kernel,
      workspace,
      by,
      { name: one.table } as RowTarget,
      one.rowId,
      { [one.column]: one.file },
      [one.column],
    );
}
