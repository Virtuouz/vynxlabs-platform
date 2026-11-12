import { newId, sql } from "@vynxlabs/db";
import { type Actor, type Audit, mutate, type Trx } from "../audit.js";
import { loadCatalog, reconcileReferences, workspaceSchema } from "../data/apply.js";
import { bindSource, credentialName as sourceCredentialName } from "../data/sources.js";
import { bindConnection, decryptFor, readConnection } from "../execution/bindings.js";
import { deployBundle, order } from "../execution/deploy.js";
import { adoptBundle } from "../execution/promote.js";
import type { WorkspaceRef } from "../http.js";
import type { Kernel } from "../kernel.js";
import { putResource } from "../resources.js";
import { revealSecret, setSecret } from "../secrets.js";

export interface CloneOptions {
  withData: boolean;
  /** On: the clone cannot reach real systems. Off: it gets the source's connections and secrets. */
  safe: boolean;
}

export interface CloneReport {
  resources: number;
  variables: number;
  /** Zero when safety is on. */
  connections: number;
  dataSources: number;
  secrets: number;
  tables: number;
  rows: number;
  files: number;
}

const SYSTEM_COLUMNS = ["id", "created_at", "updated_at"];

/** Copies what is bound per workspace and may be copied: always variables, the rest only with safety off. */
async function copyBindings(
  kernel: Kernel,
  trx: Trx,
  source: WorkspaceRef,
  target: WorkspaceRef,
  safe: boolean,
  report: CloneReport,
) {
  const variables = await trx
    .selectFrom("variable_value")
    .select(["path", "value"])
    .where("workspace_id", "=", source.id)
    .execute();
  for (const variable of variables) {
    await trx
      .insertInto("variable_value")
      .values({
        id: newId(),
        tenant_id: target.tenantId,
        workspace_id: target.id,
        path: variable.path,
        value: variable.value,
        updated_at: new Date(),
      })
      .execute();
  }
  report.variables = variables.length;
  if (safe) return;

  // Every value is encrypted for the workspace it is in, so each is opened and sealed again.
  const secrets = await trx
    .selectFrom("secret")
    .select("name")
    .where("workspace_id", "=", source.id)
    .execute();
  for (const { name } of secrets) {
    const at = { tenantId: source.tenantId, workspaceId: source.id, name };
    const value = await revealSecret(trx, kernel.vault, at);
    if (value !== undefined) {
      await setSecret(trx, kernel.vault, { ...at, workspaceId: target.id }, value);
    }
  }
  report.secrets = secrets.length;

  const connections = await trx
    .selectFrom("connection_binding")
    .select("path")
    .where("workspace_id", "=", source.id)
    .execute();
  for (const { path } of connections) {
    const at = { tenantId: source.tenantId, workspaceId: source.id, path };
    const bound = await readConnection(kernel, trx, at);
    if (!bound) continue;
    await bindConnection(
      kernel,
      trx,
      { ...at, workspaceId: target.id },
      bound.config as Record<string, unknown>,
      bound.credential ?? null,
    );
  }
  report.connections = connections.length;

  const sources = await trx
    .selectFrom("data_source_binding")
    .select(["path", "config", "credential"])
    .where("workspace_id", "=", source.id)
    .execute();
  for (const bound of sources) {
    const password = bound.credential
      ? await decryptFor(
          kernel,
          trx,
          source.tenantId,
          source.id,
          sourceCredentialName(bound.path),
          bound.credential,
        )
      : null;
    await bindSource(
      kernel,
      trx,
      { tenantId: target.tenantId, workspaceId: target.id, path: bound.path },
      bound.config as never,
      password,
    );
  }
  report.dataSources = sources.length;
}

/** Copies the source's files, and returns which new file stands for which old one. */
async function copyFiles(kernel: Kernel, trx: Trx, source: WorkspaceRef, target: WorkspaceRef) {
  const files = await trx
    .selectFrom("file")
    .selectAll()
    .where("workspace_id", "=", source.id)
    .orderBy("id")
    .execute();
  const renamed = new Map<string, string>();
  for (const file of files) {
    const id = newId();
    const key = `files/${target.tenantId}/${target.id}/${id}`;
    await kernel.storage.put(key, await kernel.storage.get(file.storage_key), file.content_type);
    await trx
      .insertInto("file")
      .values({
        id,
        tenant_id: target.tenantId,
        workspace_id: target.id,
        name: file.name,
        content_type: file.content_type,
        size_bytes: Number(file.size_bytes),
        storage_key: key,
        created_by_type: file.created_by_type,
        created_by_id: file.created_by_id,
        created_at: file.created_at,
      })
      .execute();
    renamed.set(file.id, id);
  }
  return renamed;
}

/**
 * Copies rows table by table, inside the database that holds them. Only what
 * the clone's definitions declare is copied: retired columns and tables stay
 * behind with the source.
 */
async function copyRows(
  kernel: Kernel,
  trx: Trx,
  source: WorkspaceRef,
  target: WorkspaceRef,
  files: Map<string, string>,
  report: CloneReport,
) {
  const { db } = await kernel.data.within(trx, source.tenantId);
  const from = (await loadCatalog(db, source.id)).filter((table) => table.status === "active");
  const to = (await loadCatalog(db, target.id)).filter((table) => table.status === "active");
  const fromSchema = workspaceSchema(source.id);
  const toSchema = workspaceSchema(target.id);

  // Rows refer to each other across tables, in any order. The references are
  // taken off while the rows go in, and put back, and checked, afterwards.
  const references = await sql<{ table: string; name: string }>`
    select c.conrelid::regclass::text as "table", c.conname as name
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = ${toSchema} and c.contype = 'f'
  `.execute(db);
  for (const reference of references.rows) {
    await sql`alter table ${sql.raw(reference.table)} drop constraint ${sql.id(reference.name)}`.execute(
      db,
    );
  }

  for (const table of to) {
    const original = from.find((candidate) => candidate.name === table.name);
    if (!original) continue;
    const pairs = table.columns
      .filter((column) => column.status === "active")
      .flatMap((column) => {
        const match = original.columns.find(
          (candidate) => candidate.status === "active" && candidate.name === column.name,
        );
        return match
          ? [{ to: column.physicalName, from: match.physicalName, type: column.type }]
          : [];
      });
    const targetColumns = [...SYSTEM_COLUMNS, ...pairs.map((pair) => pair.to)];
    const sourceColumns = [...SYSTEM_COLUMNS, ...pairs.map((pair) => pair.from)];
    const copied = await sql`
      insert into ${sql.id(toSchema, table.physicalName)} (${sql.join(targetColumns.map((name) => sql.id(name)))})
      select ${sql.join(sourceColumns.map((name) => sql.id(name)))}
      from ${sql.id(fromSchema, original.physicalName)}
    `.execute(db);
    report.rows += Number(copied.numAffectedRows ?? 0n);
    report.tables += 1;

    // A file column holds a file's ID. The clone has its own copy of each file.
    for (const pair of pairs.filter((candidate) => candidate.type === "file")) {
      const entries = [...files];
      for (let start = 0; start < entries.length; start += 500) {
        const chunk = entries.slice(start, start + 500);
        await sql`
          update ${sql.id(toSchema, table.physicalName)} as t set ${sql.id(pair.to)} = m.new
          from (values ${sql.join(chunk.map(([old, fresh]) => sql`(${old}::uuid, ${fresh}::uuid)`))}) as m(old, new)
          where t.${sql.id(pair.to)} = m.old
        `.execute(db);
      }
    }
  }
  await reconcileReferences(db, target.id, true);
}

/** Does the copying, in the caller's transaction. */
async function copyWorkspace(
  kernel: Kernel,
  trx: Trx,
  audit: Audit,
  actor: Actor,
  source: WorkspaceRef,
  target: WorkspaceRef,
  options: CloneOptions,
): Promise<CloneReport> {
  const report: CloneReport = {
    resources: 0,
    variables: 0,
    connections: 0,
    dataSources: 0,
    secrets: 0,
    tables: 0,
    rows: 0,
    files: 0,
  };
  await copyBindings(kernel, trx, source, target, options.safe, report);

  const from = await trx
    .selectFrom("workspace")
    .select("active_bundle_id")
    .where("id", "=", source.id)
    .executeTakeFirstOrThrow();
  if (from.active_bundle_id) {
    const bundle = await adoptBundle(
      kernel,
      trx,
      audit,
      from.active_bundle_id,
      target,
      actor.principal,
    );
    const deployed = await deployBundle(kernel, trx, audit, target, actor.principal, bundle.id, {
      promotedFrom: source.id,
      // With safety on the clone is unbound on purpose. Its scripts say so when they run.
      allowMissingBindings: true,
    });
    report.resources += deployed.summary.created;
  }

  // What was made in the console is not in any bundle.
  const made = (
    await trx
      .selectFrom("resource")
      .select(["path", "kind", "schema_version", "body"])
      .where("workspace_id", "=", source.id)
      .where("ownership", "=", "ui")
      .execute()
  ).sort((a, b) => order(a.kind) - order(b.kind));
  for (const resource of made) {
    await putResource(kernel, trx, audit, target, {
      path: resource.path,
      kind: resource.kind,
      schemaVersion: resource.schema_version,
      ownership: "ui",
      body: resource.body,
    });
    report.resources += 1;
  }
  if (made.some((resource) => resource.kind === "table")) {
    const { db } = await kernel.data.within(trx, target.tenantId);
    await reconcileReferences(db, target.id, true);
  }

  // Where each node of a flow was placed on the canvas.
  await sql`
    insert into flow_layout (resource_id, positions, updated_at)
    select mine.id, theirs_layout.positions, now()
    from flow_layout theirs_layout
    join resource theirs on theirs.id = theirs_layout.resource_id and theirs.workspace_id = ${source.id}
    join resource mine on mine.workspace_id = ${target.id} and mine.path = theirs.path and mine.kind = theirs.kind
  `.execute(trx);

  if (options.withData) {
    const files = await copyFiles(kernel, trx, source, target);
    report.files = files.size;
    await copyRows(kernel, trx, source, target, files, report);
  }
  return report;
}

/**
 * Carries out a clone that has been recorded, and records how it ended. The
 * copying is one transaction: a clone that fails leaves an empty workspace
 * behind, which can be deleted, and never a half-filled one.
 */
export async function runClone(kernel: Kernel, actor: Actor, cloneId: string): Promise<void> {
  const clone = await kernel.db
    .selectFrom("workspace_clone")
    .selectAll()
    .where("id", "=", cloneId)
    .executeTakeFirstOrThrow();
  const refs = await kernel.db
    .selectFrom("workspace")
    .select(["id", "tenant_id", "slug"])
    .where("id", "in", [clone.source_workspace_id, clone.workspace_id])
    .execute();
  const ref = (id: string): WorkspaceRef => {
    const row = refs.find((candidate) => candidate.id === id);
    if (!row) throw new Error("The workspace is gone.");
    return { id: row.id, tenantId: row.tenant_id, slug: row.slug };
  };
  try {
    const source = ref(clone.source_workspace_id);
    const target = ref(clone.workspace_id);
    const options = { withData: clone.with_data, safe: clone.safe };
    await mutate(kernel.db, actor, async (trx, audit) => {
      const report = await copyWorkspace(kernel, trx, audit, actor, source, target, options);
      await trx
        .updateTable("workspace_clone")
        .set({ status: "succeeded", report: JSON.stringify(report), finished_at: new Date() })
        .where("id", "=", cloneId)
        .execute();
      await audit({
        action: "workspace.clone_finished",
        targetType: "workspace",
        targetId: target.id,
        tenantId: target.tenantId,
        workspaceId: target.id,
        details: { sourceWorkspaceId: source.id, ...options, ...report },
      });
    });
  } catch (error) {
    kernel.log.error({ err: error, cloneId }, "a workspace clone failed");
    await kernel.db
      .updateTable("workspace_clone")
      .set({ status: "failed", error: (error as Error).message, finished_at: new Date() })
      .where("id", "=", cloneId)
      .execute();
  }
}

/** Clones that were running when the process stopped never finished: their transaction was rolled back. */
export async function failInterruptedClones(kernel: Kernel, startedBefore: Date): Promise<void> {
  await kernel.db
    .updateTable("workspace_clone")
    .set({
      status: "failed",
      error:
        "The instance restarted while this clone was running. Delete the workspace and clone again.",
      finished_at: new Date(),
    })
    .where("status", "=", "running")
    .where("created_at", "<", startedBefore)
    .execute();
}
