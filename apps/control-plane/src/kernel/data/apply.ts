import { createHash } from "node:crypto";
import { newId, sql } from "@vynxlabs/db";
import type { ColumnType, TableBody, TablePolicy } from "@vynxlabs/manifest";
import type { Db, Trx } from "../audit.js";
import { badRequest, conflict, notFound } from "../errors.js";
import type { AppliedResource } from "../kinds.js";
import { type CatalogTable, type NewColumn, planTable, type Step } from "./plan.js";

/** The database role that requests for tenant data switch to. Row policies apply to it. */

export const workspaceSchema = (workspaceId: string) => `ws_${workspaceId.replaceAll("-", "")}`;

const SQL_TYPE: Record<ColumnType, string> = {
  text: "text",
  integer: "bigint",
  number: "double precision",
  boolean: "boolean",
  timestamp: "timestamptz",
  date: "date",
  json: "jsonb",
  uuid: "uuid",
  reference: "uuid",
  file: "uuid",
};

/** Every table and column a workspace has, active or retired. */
export async function loadCatalog(db: Db | Trx, workspaceId: string): Promise<CatalogTable[]> {
  const tables = await db
    .selectFrom("data_table")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .orderBy("name")
    .execute();
  if (tables.length === 0) return [];
  const columns = await db
    .selectFrom("data_column")
    .selectAll()
    .where(
      "table_id",
      "in",
      tables.map((table) => table.id),
    )
    .orderBy("created_at")
    .orderBy("name")
    .execute();
  return tables.map((table) => ({
    id: table.id,
    name: table.name,
    physicalName: table.physical_name,
    status: table.status,
    policy: table.policy,
    previousNames: table.previous_names,
    columns: columns
      .filter((column) => column.table_id === table.id)
      .map((column) => ({
        id: column.id,
        name: column.name,
        physicalName: column.physical_name,
        type: column.type,
        required: column.required,
        unique: column.is_unique,
        default: column.default_value,
        referenceTable: column.reference_table,
        previousNames: column.previous_names,
        status: column.status,
      })),
  }));
}

function literal(type: ColumnType, value: unknown) {
  if (type === "json") return sql`${sql.lit(JSON.stringify(value))}::jsonb`;
  return sql`${sql.lit(value as string | number | boolean)}::${sql.raw(SQL_TYPE[type])}`;
}

function columnDefinition(column: NewColumn) {
  const parts = [sql`${sql.id(column.physicalName)} ${sql.raw(SQL_TYPE[column.type])}`];
  if (column.default !== null && column.default !== undefined) {
    parts.push(sql`default ${literal(column.type, column.default)}`);
  }
  if (column.required) parts.push(sql`not null`);
  return sql.join(parts, sql` `);
}

export const constraintName = (prefix: string, table: string, column: string) =>
  `${prefix}_${createHash("sha256").update(`${table}.${column}`).digest("hex").slice(0, 16)}`;

/** Lifts the rule that a column must have a value, in whichever form it was put in place. */
async function dropRequired(
  trx: Trx,
  target: ReturnType<typeof sql.id>,
  table: string,
  column: string,
) {
  await sql`alter table ${target} alter column ${sql.id(column)} drop not null`.execute(trx);
  await sql`alter table ${target} drop constraint if exists ${sql.id(constraintName("nn", table, column))}`.execute(
    trx,
  );
}

/** A problem with the data already in a table, which the author has to resolve. */
const refuse = (table: string, column: string, message: string) =>
  conflict(`The table "${table}" cannot be changed: column "${column}" ${message}`);

/**
 * Changes a workspace's tables to match one table's definition, in the
 * caller's transaction. Schema changes are transactional in Postgres, so if
 * anything later in the deploy fails, none of this happened.
 */
export async function applyTable(
  trx: Trx,
  role: string,
  resource: AppliedResource,
): Promise<Step[]> {
  const body = resource.body as unknown as TableBody;
  const catalog = await loadCatalog(trx, resource.workspaceId);
  const plan = planTable(catalog, resource.path, body);
  if (plan.issues.length > 0) {
    throw badRequest(
      `The table "${resource.path}" cannot be changed as its definition asks.`,
      plan.issues,
    );
  }
  const schema = workspaceSchema(resource.workspaceId);
  await sql`create schema if not exists ${sql.id(schema)}`.execute(trx);
  await sql`grant usage on schema ${sql.id(schema)} to ${sql.id(role)}`.execute(trx);

  for (const step of plan.steps) await applyStep(trx, role, resource, schema, step);

  // The catalog row always points at the resource that declares the table.
  await trx
    .updateTable("data_table")
    .set({ resource_id: resource.id })
    .where("workspace_id", "=", resource.workspaceId)
    .where("name", "=", resource.path)
    .where("status", "=", "active")
    .execute();
  await reconcileIndexes(trx, resource.workspaceId, resource.path, body.indexes ?? []);
  await reconcileReferences(trx, resource.workspaceId, false);
  return plan.steps;
}

async function activeTable(trx: Trx, workspaceId: string, name: string) {
  return trx
    .selectFrom("data_table")
    .selectAll()
    .where("workspace_id", "=", workspaceId)
    .where("name", "=", name)
    .where("status", "=", "active")
    .executeTakeFirstOrThrow();
}

async function hasRows(trx: Trx, schema: string, table: string): Promise<boolean> {
  const found = await sql`select 1 from ${sql.id(schema, table)} limit 1`.execute(trx);
  return found.rows.length > 0;
}

async function applyStep(
  trx: Trx,
  role: string,
  resource: AppliedResource,
  schema: string,
  step: Step,
) {
  const { workspaceId, tenantId } = resource;

  if (step.op === "create_table") {
    const target = sql.id(schema, step.physicalName);
    await sql`
      create table ${target} (
        id uuid primary key,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
        ${step.columns.length > 0 ? sql`, ${sql.join(step.columns.map(columnDefinition))}` : sql``}
      )
    `.execute(trx);
    // The platform's own role owns the table and is not subject to its policies.
    // Requests for data switch to the data role, which is.
    await sql`alter table ${target} enable row level security`.execute(trx);
    await sql`grant select, insert, update, delete on ${target} to ${sql.id(role)}`.execute(trx);
    const tableId = newId();
    await trx
      .insertInto("data_table")
      .values({
        id: tableId,
        tenant_id: tenantId,
        workspace_id: workspaceId,
        resource_id: resource.id,
        name: step.name,
        physical_name: step.physicalName,
        status: "active",
      })
      .execute();
    for (const column of step.columns) {
      await insertColumn(trx, tableId, column);
      if (column.unique) await setUnique(trx, schema, step.physicalName, column.physicalName, true);
    }
    return;
  }

  if (step.op === "rename_table") {
    await trx
      .updateTable("data_table")
      .set({
        name: step.to,
        previous_names: sql`array_append(array_remove(previous_names, ${step.to}), ${step.from})`,
      })
      .where("id", "=", step.tableId)
      .execute();
    return;
  }
  if (step.op === "restore_table") {
    await trx
      .updateTable("data_table")
      .set({ status: "active", retired_at: null })
      .where("id", "=", step.tableId)
      .execute();
    return;
  }

  const table = await activeTable(trx, workspaceId, step.table);
  const target = sql.id(schema, table.physical_name);

  if (step.op === "set_policy") {
    await setPolicy(trx, role, schema, table, step.policy);
    return;
  }

  if (step.op === "add_column") {
    const { column } = step;
    if (column.required && (column.default === null || column.default === undefined)) {
      if (await hasRows(trx, schema, table.physical_name)) {
        throw refuse(
          step.table,
          column.name,
          "is required and the table already has rows. Give it a default, so existing rows have a value.",
        );
      }
    }
    await sql`alter table ${target} add column ${columnDefinition(column)}`.execute(trx);
    await insertColumn(trx, table.id, column);
    if (column.unique) await setUnique(trx, schema, table.physical_name, column.physicalName, true);
    return;
  }

  const column = await trx
    .selectFrom("data_column")
    .selectAll()
    .where("id", "=", step.columnId)
    .executeTakeFirstOrThrow();
  const physical = sql.id(column.physical_name);

  switch (step.op) {
    case "rename_column":
      await trx
        .updateTable("data_column")
        .set({
          name: step.to,
          previous_names: sql`array_append(array_remove(previous_names, ${step.to}), ${step.from})`,
        })
        .where("id", "=", column.id)
        .execute();
      break;
    case "restore_column":
      await trx
        .updateTable("data_column")
        .set({ status: "active", retired_at: null })
        .where("id", "=", column.id)
        .execute();
      break;
    case "retire_column":
      // The data stays. The rules go, so that rows can still be written without it.
      await dropRequired(trx, target, table.physical_name, column.physical_name);
      await setUnique(trx, schema, table.physical_name, column.physical_name, false);
      await sql`alter table ${target} drop constraint if exists ${sql.id(constraintName("fk", table.physical_name, column.physical_name))}`.execute(
        trx,
      );
      await trx
        .updateTable("data_column")
        .set({ status: "retired", retired_at: new Date(), required: false, is_unique: false })
        .where("id", "=", column.id)
        .execute();
      break;
    case "widen_column":
      await sql`
        alter table ${target} alter column ${physical} type ${sql.raw(SQL_TYPE[step.to])}
        using ${physical}::${sql.raw(SQL_TYPE[step.to])}
      `.execute(trx);
      await trx
        .updateTable("data_column")
        .set({ type: step.to })
        .where("id", "=", column.id)
        .execute();
      break;
    case "set_default":
      if (step.default === null || step.default === undefined) {
        await sql`alter table ${target} alter column ${physical} drop default`.execute(trx);
      } else {
        await sql`alter table ${target} alter column ${physical} set default ${literal(column.type as ColumnType, step.default)}`.execute(
          trx,
        );
      }
      await trx
        .updateTable("data_column")
        .set({
          default_value:
            step.default === null || step.default === undefined
              ? null
              : JSON.stringify(step.default),
        })
        .where("id", "=", column.id)
        .execute();
      break;
    case "set_required":
      if (step.required) {
        const fallback = (
          await trx
            .selectFrom("data_column")
            .select("default_value")
            .where("id", "=", column.id)
            .executeTakeFirstOrThrow()
        ).default_value;
        if (fallback !== null && fallback !== undefined) {
          await sql`update ${target} set ${physical} = ${literal(column.type as ColumnType, fallback)} where ${physical} is null`.execute(
            trx,
          );
        }
        const missing =
          await sql`select 1 from ${target} where ${physical} is null limit 1`.execute(trx);
        const lenient = sql.id(constraintName("nn", table.physical_name, column.physical_name));
        await sql`alter table ${target} drop constraint if exists ${lenient}`.execute(trx);
        if (missing.rows.length === 0) {
          await sql`alter table ${target} alter column ${physical} set not null`.execute(trx);
        } else if (step.restored) {
          // Rows written while the column was retired have no value for it. Going back to
          // an earlier definition must always be possible, so the column comes back required
          // for every row written from now on, and those rows keep their gap.
          await sql`alter table ${target} add constraint ${lenient} check (${physical} is not null) not valid`.execute(
            trx,
          );
        } else {
          throw refuse(
            step.table,
            step.name,
            "is now required, and some rows have no value for it. Give it a default, or fill those rows first.",
          );
        }
      } else {
        await dropRequired(trx, target, table.physical_name, column.physical_name);
      }
      await trx
        .updateTable("data_column")
        .set({ required: step.required })
        .where("id", "=", column.id)
        .execute();
      break;
    case "set_unique":
      if (step.unique) {
        const repeated = await sql`
          select 1 from ${target} where ${physical} is not null group by ${physical} having count(*) > 1 limit 1
        `.execute(trx);
        if (repeated.rows.length > 0) {
          throw refuse(
            step.table,
            step.name,
            "is now unique, and some rows share a value. Make the values distinct first.",
          );
        }
      }
      await setUnique(trx, schema, table.physical_name, column.physical_name, step.unique);
      await trx
        .updateTable("data_column")
        .set({ is_unique: step.unique })
        .where("id", "=", column.id)
        .execute();
      break;
    case "set_reference":
      await trx
        .updateTable("data_column")
        .set({ reference_table: step.referenceTable })
        .where("id", "=", column.id)
        .execute();
      break;
  }
}

async function insertColumn(trx: Trx, tableId: string, column: NewColumn) {
  await trx
    .insertInto("data_column")
    .values({
      id: newId(),
      table_id: tableId,
      name: column.name,
      physical_name: column.physicalName,
      type: column.type,
      required: column.required,
      is_unique: column.unique,
      default_value:
        column.default === null || column.default === undefined
          ? null
          : JSON.stringify(column.default),
      reference_table: column.referenceTable,
      status: "active",
    })
    .execute();
}

async function setUnique(trx: Trx, schema: string, table: string, column: string, unique: boolean) {
  const name = sql.id(constraintName("uq", table, column));
  await sql`alter table ${sql.id(schema, table)} drop constraint if exists ${name}`.execute(trx);
  if (unique) {
    await sql`alter table ${sql.id(schema, table)} add constraint ${name} unique (${sql.id(column)})`.execute(
      trx,
    );
  }
}

/** Replaces a table's row policy with the one its definition asks for. */
async function setPolicy(
  trx: Trx,
  role: string,
  schema: string,
  table: { id: string; physical_name: string },
  policy: TablePolicy,
) {
  const target = sql.id(schema, table.physical_name);
  await sql`drop policy if exists rows on ${target}`.execute(trx);
  if (policy.type === "owner") {
    const owner = await trx
      .selectFrom("data_column")
      .select("physical_name")
      .where("table_id", "=", table.id)
      .where("name", "=", policy.column)
      .where("status", "=", "active")
      .executeTakeFirstOrThrow();
    // A caller sees and writes a row when it is theirs, or when they may see every row.
    const allowed = sql`
      current_setting('app.data_all', true) = 'on'
      or ${sql.id(owner.physical_name)}::text = current_setting('app.principal', true)
    `;
    await sql`
      create policy rows on ${target} for all to ${sql.id(role)}
      using (${allowed}) with check (${allowed})
    `.execute(trx);
  } else {
    await sql`create policy rows on ${target} for all to ${sql.id(role)} using (true) with check (true)`.execute(
      trx,
    );
  }
  await trx
    .updateTable("data_table")
    .set({ policy: JSON.stringify(policy) })
    .where("id", "=", table.id)
    .execute();
}

/** Makes a table's indexes the ones its definition lists. Only indexes the platform made are touched. */
async function reconcileIndexes(
  trx: Trx,
  workspaceId: string,
  tableName: string,
  indexes: string[][],
) {
  const schema = workspaceSchema(workspaceId);
  const table = await activeTable(trx, workspaceId, tableName);
  const columns = await trx
    .selectFrom("data_column")
    .select(["name", "physical_name"])
    .where("table_id", "=", table.id)
    .where("status", "=", "active")
    .execute();
  const physical = (name: string) =>
    columns.find((column) => column.name === name)?.physical_name ?? name;
  const wanted = new Map(
    indexes.map((names) => {
      const physicalNames = names.map(physical);
      return [
        constraintName("ix", table.physical_name, physicalNames.join(",")),
        physicalNames,
      ] as const;
    }),
  );
  const existing = await sql<{ indexname: string }>`
    select indexname from pg_indexes
    where schemaname = ${schema} and tablename = ${table.physical_name} and indexname like 'ix\\_%'
  `.execute(trx);
  for (const { indexname } of existing.rows) {
    if (!wanted.has(indexname)) await sql`drop index ${sql.id(schema, indexname)}`.execute(trx);
  }
  for (const [name, names] of wanted) {
    await sql`
      create index if not exists ${sql.id(name)} on ${sql.id(schema, table.physical_name)}
      (${sql.join(names.map((column) => sql.id(column)))})
    `.execute(trx);
  }
}

/**
 * Gives every reference column its foreign key. A table may refer to one that
 * comes later in the same deploy, so this runs again once all are in place,
 * and only then insists that every target exists.
 */
export async function reconcileReferences(trx: Trx, workspaceId: string, final: boolean) {
  const schema = workspaceSchema(workspaceId);
  const references = await trx
    .selectFrom("data_column")
    .innerJoin("data_table", "data_table.id", "data_column.table_id")
    .select([
      "data_column.physical_name",
      "data_column.name",
      "data_column.reference_table",
      "data_table.physical_name as table_physical",
      "data_table.name as table_name",
    ])
    .where("data_table.workspace_id", "=", workspaceId)
    .where("data_table.status", "=", "active")
    .where("data_column.status", "=", "active")
    .where("data_column.reference_table", "is not", null)
    .execute();
  for (const reference of references) {
    const target = await trx
      .selectFrom("data_table")
      .select("physical_name")
      .where("workspace_id", "=", workspaceId)
      .where("name", "=", reference.reference_table as string)
      .where("status", "=", "active")
      .executeTakeFirst();
    if (!target) {
      if (final) {
        throw badRequest(
          `The table "${reference.table_name}" refers to a table that does not exist.`,
          [
            {
              path: `/body/columns/${reference.name}/references`,
              message: `there is no table "${reference.reference_table}" in this workspace`,
            },
          ],
        );
      }
      continue;
    }
    const name = constraintName("fk", reference.table_physical, reference.physical_name);
    const exists = await sql`
      select 1 from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where n.nspname = ${schema} and c.conname = ${name}
    `.execute(trx);
    if (exists.rows.length > 0) continue;
    await sql`
      alter table ${sql.id(schema, reference.table_physical)}
      add constraint ${sql.id(name)} foreign key (${sql.id(reference.physical_name)})
      references ${sql.id(schema, target.physical_name)} (id)
    `.execute(trx);
  }
}

/**
 * Builds a workspace's tables from catalog rows that are already in place, as
 * an import does. Every column the catalog knows is made, retired ones too,
 * under exactly the names it records. No rule is put on yet, so that rows can
 * be loaded in any order.
 */
export async function restoreStructure(trx: Trx, role: string, workspaceId: string) {
  const catalog = await loadCatalog(trx, workspaceId);
  if (catalog.length === 0) return catalog;
  const schema = workspaceSchema(workspaceId);
  await sql`create schema if not exists ${sql.id(schema)}`.execute(trx);
  await sql`grant usage on schema ${sql.id(schema)} to ${sql.id(role)}`.execute(trx);
  for (const table of catalog) {
    const target = sql.id(schema, table.physicalName);
    const columns = table.columns.map((column) =>
      columnDefinition({
        name: column.name,
        physicalName: column.physicalName,
        type: column.type as ColumnType,
        required: false,
        unique: false,
        default: column.default,
        referenceTable: null,
      }),
    );
    await sql`
      create table ${target} (
        id uuid primary key,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
        ${columns.length > 0 ? sql`, ${sql.join(columns)}` : sql``}
      )
    `.execute(trx);
    await sql`alter table ${target} enable row level security`.execute(trx);
    await sql`grant select, insert, update, delete on ${target} to ${sql.id(role)}`.execute(trx);
  }
  return catalog;
}

/**
 * Puts the rules back on tables made by `restoreStructure`, once their rows
 * are in: required and unique columns, row policies, indexes and references.
 */
export async function restoreRules(
  trx: Trx,
  role: string,
  workspaceId: string,
  indexes: Map<string, string[][]>,
) {
  const schema = workspaceSchema(workspaceId);
  for (const table of await loadCatalog(trx, workspaceId)) {
    const target = sql.id(schema, table.physicalName);
    for (const column of table.columns.filter((candidate) => candidate.status === "active")) {
      const physical = sql.id(column.physicalName);
      if (column.unique) {
        await setUnique(trx, schema, table.physicalName, column.physicalName, true);
      }
      if (column.required) {
        const missing =
          await sql`select 1 from ${target} where ${physical} is null limit 1`.execute(trx);
        if (missing.rows.length === 0) {
          await sql`alter table ${target} alter column ${physical} set not null`.execute(trx);
        } else {
          // The same lenient rule the source had: required of every row written from now on.
          await sql`alter table ${target} add constraint ${sql.id(constraintName("nn", table.physicalName, column.physicalName))} check (${physical} is not null) not valid`.execute(
            trx,
          );
        }
      }
    }
    const owner = table.policy.type === "owner" ? table.policy.column : undefined;
    const ownerIsThere = table.columns.some(
      (column) => column.status === "active" && column.name === owner,
    );
    await setPolicy(
      trx,
      role,
      schema,
      { id: table.id, physical_name: table.physicalName },
      owner === undefined || ownerIsThere ? table.policy : { type: "open" },
    );
    if (table.status === "active") {
      await reconcileIndexes(trx, workspaceId, table.name, indexes.get(table.name) ?? []);
    }
  }
  await reconcileReferences(trx, workspaceId, true);
}

/** Retires a table whose resource is being removed. Its data stays where it is. */
export async function retireTable(
  trx: Trx,
  resource: { id: string; workspaceId: string; path: string },
) {
  await trx
    .updateTable("data_table")
    .set({ status: "retired", retired_at: new Date(), resource_id: null })
    .where("workspace_id", "=", resource.workspaceId)
    .where("name", "=", resource.path)
    .where("status", "=", "active")
    .execute();
}

/**
 * Drops retired data for good: one retired column, or a whole retired table.
 * This is the only place the platform destroys tenant data, and only on request.
 */
export async function purgeRetired(
  trx: Trx,
  workspaceId: string,
  request: { table: string; column?: string | undefined },
) {
  const schema = workspaceSchema(workspaceId);
  if (request.column !== undefined) {
    const column = await trx
      .selectFrom("data_column")
      .innerJoin("data_table", "data_table.id", "data_column.table_id")
      .select([
        "data_column.id",
        "data_column.physical_name",
        "data_table.physical_name as table_physical",
      ])
      .where("data_table.workspace_id", "=", workspaceId)
      .where("data_table.name", "=", request.table)
      .where("data_column.name", "=", request.column)
      .where("data_column.status", "=", "retired")
      .executeTakeFirst();
    if (!column) throw notFound(`A retired column "${request.column}" in "${request.table}"`);
    await sql`alter table ${sql.id(schema, column.table_physical)} drop column ${sql.id(column.physical_name)}`.execute(
      trx,
    );
    await trx.deleteFrom("data_column").where("id", "=", column.id).execute();
    return { dropped: "column" as const };
  }
  const table = await trx
    .selectFrom("data_table")
    .select(["id", "physical_name"])
    .where("workspace_id", "=", workspaceId)
    .where("name", "=", request.table)
    .where("status", "=", "retired")
    .executeTakeFirst();
  if (!table) throw notFound(`A retired table "${request.table}"`);
  await sql`drop table ${sql.id(schema, table.physical_name)}`.execute(trx).catch((error) => {
    if ((error as { code?: string }).code === "2BP01") {
      throw conflict(
        `Another table still refers to "${request.table}". Remove that reference column first.`,
      );
    }
    throw error;
  });
  await trx.deleteFrom("data_table").where("id", "=", table.id).execute();
  return { dropped: "table" as const };
}
