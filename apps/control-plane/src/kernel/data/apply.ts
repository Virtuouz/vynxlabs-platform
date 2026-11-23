import { createHash } from "node:crypto";
import { newId, POLICY_NAMES, sql } from "@volvel/db";
import {
  type ColumnType,
  conditionColumn,
  isEnumType,
  type OnDelete,
  type RowRule,
  type TableBody,
  type TablePolicy,
} from "@volvel/manifest";
import type { Db, Trx } from "../audit.js";
import { badRequest, conflict, notFound } from "../errors.js";
import type { AppliedResource } from "../kinds.js";
import { type CatalogTable, type KeptValue, type NewColumn, planTable, type Step } from "./plan.js";

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
  // Held to the column's values by a check, not by a Postgres enum, which cannot lose a value.
  enum: "text",
  enum_list: "text[]",
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
    resourceId: table.resource_id,
    name: table.name,
    physicalName: table.physical_name,
    status: table.status,
    policy: table.policy,
    previousNames: table.previous_names,
    managedIn: table.managed_in,
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
        onDelete: column.on_delete as OnDelete | null,
        options: column.options,
        previousNames: column.previous_names,
        status: column.status,
      })),
    display: table.display_column,
  }));
}

const textArray = (values: readonly string[]) =>
  values.length === 0
    ? sql`'{}'::text[]`
    : sql`array[${sql.join(values.map((value) => sql.lit(value)))}]::text[]`;

function literal(type: ColumnType, value: unknown) {
  if (type === "json") return sql`${sql.lit(JSON.stringify(value))}::jsonb`;
  if (type === "enum_list") return textArray(value as string[]);
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

/**
 * Holds an enum column to its values: the ones it has, and the ones it had
 * and rows may still hold. With no values the column is held to nothing.
 */
async function setValuesCheck(
  trx: Trx,
  schema: string,
  table: string,
  column: { physicalName: string; type: string },
  allowed: readonly string[] | null,
) {
  const name = sql.id(constraintName("ev", table, column.physicalName));
  const target = sql.id(schema, table);
  await sql`alter table ${target} drop constraint if exists ${name}`.execute(trx);
  if (allowed === null) return;
  const physical = sql.id(column.physicalName);
  const check =
    column.type === "enum_list"
      ? sql`${physical} <@ ${textArray(allowed)}`
      : sql`${physical} = any (${textArray(allowed)})`;
  await sql`alter table ${target} add constraint ${name} check (${check})`.execute(trx);
}

/** Every value an enum column allows in a row: those it offers and those it has retired. */
const allowedValues = (
  options: { values?: KeptValue[]; retired?: string[] } | null | undefined,
) => [...(options?.values ?? []).map((one) => one.value), ...(options?.retired ?? [])];

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
  const plan = planTable(catalog, resource.path, body, resource.id);
  if (plan.issues.length > 0) {
    throw badRequest(
      `The table "${resource.path}" cannot be changed as its definition asks.`,
      plan.issues,
    );
  }
  const schema = workspaceSchema(resource.workspaceId);
  await sql`create schema if not exists ${sql.id(schema)}`.execute(trx);
  await sql`grant usage on schema ${sql.id(schema)} to ${sql.id(role)}`.execute(trx);

  // A policy names its column, and Postgres will not change the type of a column a policy
  // names. Policies are lifted for a widen and put back after, unless the save sets another.
  const widening = plan.steps.some((step) => step.op === "widen_column");
  const before = widening
    ? await trx
        .selectFrom("data_table")
        .select(["id", "physical_name", "policy"])
        .where("resource_id", "=", resource.id)
        .where("status", "=", "active")
        .executeTakeFirst()
    : undefined;
  if (before) {
    for (const name of POLICY_NAMES) {
      await sql`drop policy if exists ${sql.id(name)} on ${sql.id(schema, before.physical_name)}`.execute(
        trx,
      );
    }
  }

  for (const step of plan.steps) await applyStep(trx, role, resource, schema, step);

  if (before && !plan.steps.some((step) => step.op === "set_policy")) {
    await setPolicy(trx, role, schema, before, before.policy as TablePolicy);
  }

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
      if (column.values) {
        await setValuesCheck(
          trx,
          schema,
          step.physicalName,
          column,
          column.values.map((one) => one.value),
        );
      }
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
  if (step.op === "set_display") {
    await trx
      .updateTable("data_table")
      .set({ display_column: step.display })
      .where("id", "=", table.id)
      .execute();
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
    if (column.unique && column.default !== null && column.default !== undefined) {
      const several = await sql`select 1 from ${target} offset 1 limit 1`.execute(trx);
      if (several.rows.length > 0) {
        throw refuse(
          step.table,
          column.name,
          "is unique and has a default, so every row the table already has would get the same value. Add the column with no default, or fill it row by row first.",
        );
      }
    }
    await sql`alter table ${target} add column ${columnDefinition(column)}`.execute(trx);
    await insertColumn(trx, table.id, column);
    if (column.unique) await setUnique(trx, schema, table.physical_name, column.physicalName, true);
    if (column.values) {
      await setValuesCheck(
        trx,
        schema,
        table.physical_name,
        column,
        column.values.map((one) => one.value),
      );
    }
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
      if (column.default_value !== null && column.default_value !== undefined) {
        await sql`alter table ${target} alter column ${physical} set default ${literal(column.type as ColumnType, column.default_value)}`.execute(
          trx,
        );
      }
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
      // Rows written from now on get no value for it. The catalog keeps the default, to put back.
      await sql`alter table ${target} alter column ${physical} drop default`.execute(trx);
      await trx
        .updateTable("data_column")
        .set({ status: "retired", retired_at: new Date(), required: false, is_unique: false })
        .where("id", "=", column.id)
        .execute();
      break;
    case "widen_column":
      // An enum that becomes text is let go of its list.
      await setValuesCheck(
        trx,
        schema,
        table.physical_name,
        { physicalName: column.physical_name, type: column.type },
        null,
      );
      await trx
        .updateTable("data_column")
        .set({ options: null })
        .where("id", "=", column.id)
        .execute();
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
        const repeated = await sql<{ value: string; n: string }>`
          select ${physical}::text as value, count(*) as n from ${target}
          where ${physical} is not null group by ${physical} having count(*) > 1
          order by count(*) desc, ${physical}::text limit 4
        `.execute(trx);
        if (repeated.rows.length > 0) {
          // Name the values, so the person knows which rows to change.
          const shown = repeated.rows.slice(0, 3).map((row) => {
            const text = row.value.length > 40 ? `${row.value.slice(0, 40)}...` : row.value;
            return `"${text}" is in ${row.n} rows`;
          });
          throw refuse(
            step.table,
            step.name,
            `is now unique, and some rows share a value: ${shown.join(", ")}${repeated.rows.length > 3 ? " and more" : ""}. Make the values distinct first.`,
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
    case "set_on_delete":
      // The constraint itself is made again by `reconcileReferences`, which compares it with this.
      await trx
        .updateTable("data_column")
        .set({ on_delete: step.onDelete })
        .where("id", "=", column.id)
        .execute();
      break;
    case "to_enum": {
      const values = step.values.map((one) => one.value);
      const others = await sql<{ value: string }>`
        select distinct ${physical} as value from ${target}
        where ${physical} is not null and not (${physical} = any (${textArray(values)}))
        limit 6
      `.execute(trx);
      if (others.rows.length > 0) {
        const named = others.rows.slice(0, 5).map((row) => `"${row.value}"`);
        throw refuse(
          step.table,
          column.name,
          `cannot become an enum while rows hold other values: ${named.join(", ")}${
            others.rows.length > 5 ? " and more" : ""
          }. Add them to its values, or change those rows first.`,
        );
      }
      await setValuesCheck(
        trx,
        schema,
        table.physical_name,
        { physicalName: column.physical_name, type: "enum" },
        values,
      );
      await trx
        .updateTable("data_column")
        .set({ type: "enum", options: JSON.stringify({ values: step.values, retired: [] }) })
        .where("id", "=", column.id)
        .execute();
      break;
    }
    case "set_values": {
      const before = column.options ?? {};
      const now = step.values.map((one) => one.value);
      const renamed = new Set(step.renames.map((one) => one.from));
      // What the column had and no longer offers stays allowed, so no row is in the wrong.
      const retired = allowedValues(before).filter(
        (value) => !now.includes(value) && !renamed.has(value),
      );
      const held = { physicalName: column.physical_name, type: column.type };
      await setValuesCheck(trx, schema, table.physical_name, held, null);
      for (const { from, to } of step.renames) {
        if (column.type === "enum_list") {
          await sql`
            update ${target} set ${physical} = array_replace(${physical}, ${from}, ${to})
            where ${physical} @> array[${from}]::text[]
          `.execute(trx);
        } else {
          await sql`update ${target} set ${physical} = ${to} where ${physical} = ${from}`.execute(
            trx,
          );
        }
      }
      await setValuesCheck(trx, schema, table.physical_name, held, [...now, ...retired]);
      await trx
        .updateTable("data_column")
        .set({ options: JSON.stringify({ values: step.values, retired }) })
        .where("id", "=", column.id)
        .execute();
      break;
    }
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
      on_delete: column.onDelete,
      options: column.values ? JSON.stringify({ values: column.values, retired: [] }) : null,
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

/**
 * Who is asking, from the claim `withData` signs for the transaction. Written
 * as a subquery so that it is checked and read once for a statement, not once
 * for every row.
 */
const CLAIM = sql`(select vx.claim())`;
const PRINCIPAL = sql`(${CLAIM} ->> 'principal')`;
/** Who is asking, when someone is: no one is nobody's, so a request from no person owns no row. */
const SOMEONE = sql`coalesce(${PRINCIPAL}, '') <> ''`;
/** What the database writes for `SOMEONE` in a stored policy, to find the policies compiled before it. */
const SOMEONE_STORED = "->> 'principal'::text), ''::text) <> ''::text";
const GROUPS = sql`(select jsonb_array_elements_text(coalesce(${CLAIM} -> 'groups', '[]'::jsonb)))`;
const attribute = (name: string) => sql`(${CLAIM} -> 'attrs' ->> ${sql.lit(name)})`;

/** Replaces a table's row policy with the one its definition asks for. */
async function setPolicy(
  trx: Trx,
  role: string,
  schema: string,
  table: { id: string; physical_name: string },
  policy: TablePolicy,
) {
  const target = sql.id(schema, table.physical_name);
  for (const name of POLICY_NAMES) {
    await sql`drop policy if exists ${sql.id(name)} on ${target}`.execute(trx);
  }
  const physical = async (column: string) =>
    sql.id(
      (
        await trx
          .selectFrom("data_column")
          .select("physical_name")
          .where("table_id", "=", table.id)
          .where("name", "=", column)
          .where("status", "=", "active")
          .executeTakeFirstOrThrow()
      ).physical_name,
    );
  // Whoever may see every row is past every policy.
  const everything = sql`coalesce((${CLAIM} ->> 'all')::boolean, false)`;
  if (policy.type === "owner") {
    // A caller sees and writes a row when it is theirs, or when they may see every row.
    const allowed = sql`
      ${everything}
      or (${SOMEONE} and ${await physical(policy.column)}::text = ${PRINCIPAL})
    `;
    await sql`
      create policy rows on ${target} for all to ${sql.id(role)}
      using (${allowed}) with check (${allowed})
    `.execute(trx);
  } else if (policy.type === "rules") {
    const clause = async (rule: RowRule) => {
      const when = rule.when;
      if ("everyone" in when) return sql`true`;
      const column = await physical(when.column);
      if ("is" in when) {
        // No one is nobody's: a request from no person matches no row.
        return sql`(${SOMEONE} and ${column}::text = ${PRINCIPAL})`;
      }
      if ("in" in when) return sql`${column}::text in ${GROUPS}`;
      // An attribute no one has is empty, and equals no row's empty text.
      const wanted = attribute(when.equals.attribute);
      return sql`(coalesce(${wanted}, '') <> '' and ${column}::text = ${wanted})`;
    };
    const any = async (rules: RowRule[]) =>
      rules.length === 0 ? sql`false` : sql.join(await Promise.all(rules.map(clause)), sql` or `);
    // To change a row a person must be able to see it, so every rule lets them read.
    const read = sql`${everything} or ${await any(policy.rules)}`;
    const write = sql`${everything} or ${await any(policy.rules.filter((rule) => rule.allow !== "read"))}`;
    const to = sql.id(role);
    await sql`create policy rows_read on ${target} for select to ${to} using (${read})`.execute(
      trx,
    );
    await sql`create policy rows_insert on ${target} for insert to ${to} with check (${write})`.execute(
      trx,
    );
    await sql`create policy rows_update on ${target} for update to ${to} using (${write}) with check (${write})`.execute(
      trx,
    );
    await sql`create policy rows_delete on ${target} for delete to ${to} using (${write})`.execute(
      trx,
    );
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

/**
 * Compiles again every row policy that is not as it should be for this role. Two things
 * are wrong: a policy that still reads who is asking from the plain settings an earlier
 * version used, and an active table that has no policy for the role at all, as a table has
 * after `pg_dump` is restored where the role did not exist. Run once for a database when
 * it is opened: after it, a policy trusts only the signed claim, and every table has one.
 */
export async function upgradePolicies(owner: Db, role: string): Promise<number> {
  // Also those compiled before a request from no person was kept from owning a row: they
  // read who is asking, and lack the check that someone is.
  const old = await sql<{ schema: string; table: string; legacy: boolean; missing: boolean }>`
    select schema, "table", bool_or(legacy) as legacy, bool_and(missing) as missing from (
    select schemaname as schema, tablename as "table",
      bool_or(coalesce(qual, '') like '%current_setting(''app.%'
        or coalesce(with_check, '') like '%current_setting(''app.%') as legacy,
      false as missing
    from pg_policies
    where schemaname ~ '^ws_[0-9a-f]{32}$'
    group by schemaname, tablename
    having bool_or(coalesce(qual, '') like '%current_setting(''app.%'
        or coalesce(with_check, '') like '%current_setting(''app.%')
      or (bool_or(coalesce(qual, '') like '%vx.claim%')
        and not bool_or(coalesce(qual, '') like ${`%${SOMEONE_STORED}%`}))
    union all
    select t.schemaname, t.tablename, false, true from pg_tables t
    join data_table d on d.physical_name = t.tablename
      and t.schemaname = 'ws_' || replace(d.workspace_id::text, '-', '')
    where d.status = 'active'
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = t.schemaname and p.tablename = t.tablename and ${role} = any (p.roles)
      )
    ) found group by schema, "table"
  `.execute(owner);
  if (old.rows.length === 0) return 0;
  let done = 0;
  await owner.transaction().execute(async (trx) => {
    for (const { schema, table, legacy, missing } of old.rows) {
      const hex = schema.slice(3);
      const workspaceId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      const row = await trx
        .selectFrom("data_table")
        .select(["id", "physical_name", "policy", "status"])
        .where("workspace_id", "=", workspaceId)
        .where("physical_name", "=", table)
        .executeTakeFirst();
      if (!row) continue;
      const kept = row.policy as TablePolicy;
      const asksWho =
        kept.type === "owner" ||
        (kept.type === "rules" &&
          kept.rules.some((rule) => "is" in rule.when || "equals" in rule.when));
      if (!legacy && !missing && !asksWho) continue;
      // A retired table is read by nobody, and its policy may name a column that is gone.
      // It is then left with none, which lets nothing through, and is given its policy
      // again when the table comes back.
      const policy = row.policy as TablePolicy;
      const named =
        policy.type === "owner"
          ? [policy.column]
          : policy.type === "rules"
            ? policy.rules.flatMap((rule) => conditionColumn(rule.when) ?? [])
            : [];
      const there = await trx
        .selectFrom("data_column")
        .select("name")
        .where("table_id", "=", row.id)
        .where("status", "=", "active")
        .execute();
      const whole = named.every((name) => there.some((column) => column.name === name));
      if (whole) {
        if (missing) {
          await sql`alter table ${sql.id(schema, table)} enable row level security`.execute(trx);
        }
        await setPolicy(trx, role, schema, row, policy);
      } else if (missing) {
        // Nothing to drop, and no policy that could be made: it is left as it is.
        continue;
      } else {
        const target = sql.id(schema, table);
        for (const name of POLICY_NAMES) {
          await sql`drop policy if exists ${sql.id(name)} on ${target}`.execute(trx);
        }
      }
      done += 1;
    }
  });
  return done;
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

/** What each rule is in a constraint, and the letter Postgres keeps for it. */
const ON_DELETE: Record<OnDelete, { sql: string; code: string }> = {
  // Plain, as every reference was made before the rule could be said.
  restrict: { sql: "", code: "a" },
  set_null: { sql: "on delete set null", code: "n" },
  cascade: { sql: "on delete cascade", code: "c" },
};

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
      "data_column.on_delete",
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
          `The table "${reference.table_name}" (column "${reference.name}") refers to "${reference.reference_table}", which this deploy does not hold. Keep "${reference.reference_table}", or change "${reference.table_name}" in the same deploy.`,
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
    const rule = (reference.on_delete ?? "restrict") as OnDelete;
    // What the constraint there is points at, and what it does on a delete.
    const existing = await sql<{ target: string; action: string }>`
      select t.relname as target, c.confdeltype as action
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      join pg_class t on t.oid = c.confrelid
      where n.nspname = ${schema} and c.conname = ${name}
    `.execute(trx);
    const there = existing.rows[0];
    const own = sql.id(schema, reference.table_physical);
    if (there) {
      if (there.target === target.physical_name && there.action === ON_DELETE[rule].code) continue;
      // It points at another table, or does something else on a delete: made again as asked.
      await sql`alter table ${own} drop constraint ${sql.id(name)}`.execute(trx);
    }
    // Rows that came back with a table may name a row that is gone. They are left as they are,
    // and every row written from now on is held to the key. A key pointed at another table is
    // still refused while a row would point nowhere.
    if (there && there.target !== target.physical_name) {
      // Pointed at another table while rows hold IDs: said by column and count, not as a refusal of the key.
      const stray = await sql<{ n: string }>`
        select count(*) as n from ${own} as r
        where r.${sql.id(reference.physical_name)} is not null and not exists (
          select 1 from ${sql.id(schema, target.physical_name)} as t where t.id = r.${sql.id(reference.physical_name)}
        )
      `.execute(trx);
      const count = Number(stray.rows[0]?.n ?? 0);
      if (count > 0) {
        throw conflict(
          `The column "${reference.name}" of "${reference.table_name}" cannot refer to "${reference.reference_table}": ` +
            `${count} ${count === 1 ? "row holds" : "rows hold"} an ID that is not a row of it. Empty those values, or change them, first.`,
        );
      }
    }
    const dangling = there
      ? { rows: [] }
      : await sql`
      select 1 from ${own} as r
      where r.${sql.id(reference.physical_name)} is not null and not exists (
        select 1 from ${sql.id(schema, target.physical_name)} as t where t.id = r.${sql.id(reference.physical_name)}
      ) limit 1
    `.execute(trx);
    await sql`
      alter table ${own}
      add constraint ${sql.id(name)} foreign key (${sql.id(reference.physical_name)})
      references ${sql.id(schema, target.physical_name)} (id) ${sql.raw(ON_DELETE[rule].sql)}
      ${sql.raw(dangling.rows.length > 0 ? "not valid" : "")}
    `.execute(trx);
    // Finding the rows that point at one, for a join or for the delete's own check, without reading them all.
    await sql`
      create index if not exists ${sql.id(constraintName("rx", reference.table_physical, reference.physical_name))}
      on ${own} (${sql.id(reference.physical_name)})
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
        // A retired column fills with nothing; the catalog keeps its default for its return.
        default: column.status === "retired" ? null : column.default,
        referenceTable: null,
        onDelete: null,
        values: null,
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
      if (isEnumType(column.type)) {
        await setValuesCheck(
          trx,
          schema,
          table.physicalName,
          column,
          allowedValues(column.options),
        );
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
    // A policy that names a column the table no longer has cannot be made: the table is left open.
    const named =
      table.policy.type === "owner"
        ? [table.policy.column]
        : table.policy.type === "rules"
          ? table.policy.rules.flatMap((rule) => conditionColumn(rule.when) ?? [])
          : [];
    const allThere = named.every((name) =>
      table.columns.some((column) => column.status === "active" && column.name === name),
    );
    await setPolicy(
      trx,
      role,
      schema,
      { id: table.id, physical_name: table.physicalName },
      allThere ? table.policy : { type: "open" },
    );
    if (table.status === "active") {
      await reconcileIndexes(trx, workspaceId, table.name, indexes.get(table.name) ?? []);
    }
  }
  await reconcileReferences(trx, workspaceId, true);
}

/**
 * Refuses to retire a table that active tables refer to, naming each column that does (D27):
 * no deploy to the workspace could succeed until they were changed. A table that refers to
 * itself does not hold itself.
 */
export async function refuseRetiringReferred(trx: Trx, workspaceId: string, name: string) {
  const referrers = await trx
    .selectFrom("data_column")
    .innerJoin("data_table", "data_table.id", "data_column.table_id")
    .select(["data_table.name as table", "data_column.name as column"])
    .where("data_table.workspace_id", "=", workspaceId)
    .where("data_table.status", "=", "active")
    .where("data_table.name", "!=", name)
    .where("data_column.status", "=", "active")
    .where("data_column.reference_table", "=", name)
    .orderBy("data_table.name")
    .orderBy("data_column.name")
    .execute();
  if (referrers.length === 0) return;
  const named = referrers.map((one) => `"${one.table}" (column "${one.column}")`);
  throw conflict(
    `The table "${name}" cannot be deleted: ${named.join(", ")} ${referrers.length === 1 ? "refers" : "refer"} to it. ` +
      "Delete or change those references first.",
  );
}

/** Refuses a table whose reference columns name a table the workspace does not have. */
export async function refuseMissingTargets(
  trx: Trx,
  workspaceId: string,
  name: string,
  columns: Record<string, { type?: string; references?: string }>,
) {
  const issues: { path: string; message: string }[] = [];
  for (const [column, definition] of Object.entries(columns)) {
    const target = definition.references;
    if (definition.type !== "reference" || !target || target === name) continue;
    const found = await trx
      .selectFrom("data_table")
      .select("id")
      .where("workspace_id", "=", workspaceId)
      .where("name", "=", target)
      .where("status", "=", "active")
      .executeTakeFirst();
    if (!found) {
      issues.push({
        path: `/body/columns/${column}/references`,
        message: `there is no table "${target}" in this workspace`,
      });
    }
  }
  if (issues.length > 0)
    throw badRequest(`The table "${name}" refers to a table that does not exist.`, issues);
}

/** Retires a table whose resource is being removed. Its data stays where it is. */
export async function retireTable(
  trx: Trx,
  resource: { id: string; workspaceId: string; path: string; ownership?: string },
) {
  // Its rows are kept, but they are no longer part of the tables that remain: a row they refer
  // to may be deleted without them, and is not held by them. The keys come back with the table.
  const leaving = await trx
    .selectFrom("data_table")
    .select(["id", "physical_name"])
    .where("workspace_id", "=", resource.workspaceId)
    .where("name", "=", resource.path)
    .where("status", "=", "active")
    .executeTakeFirst();
  if (leaving) {
    const references = await trx
      .selectFrom("data_column")
      .select("physical_name")
      .where("table_id", "=", leaving.id)
      .where("reference_table", "is not", null)
      .execute();
    for (const column of references) {
      await sql`alter table ${sql.id(workspaceSchema(resource.workspaceId), leaving.physical_name)}
        drop constraint if exists ${sql.id(constraintName("fk", leaving.physical_name, column.physical_name))}`.execute(
        trx,
      );
    }
  }
  await trx
    .updateTable("data_table")
    .set({
      status: "retired",
      retired_at: new Date(),
      resource_id: null,
      managed_in: resource.ownership ?? "code",
    })
    .where("workspace_id", "=", resource.workspaceId)
    .where("name", "=", resource.path)
    .where("status", "=", "active")
    .execute();
}

const ambiguous = (what: string, name: string, table: string) =>
  conflict(
    `More than one retired ${what} has the name "${name}"${what === "column" ? ` in "${table}"` : ""}. Say which one, by its ID.`,
  );

/**
 * Drops retired data for good: one retired column, or a whole retired table.
 * This is the only place the platform destroys tenant data, and only on request.
 */
export async function purgeRetired(
  trx: Trx,
  workspaceId: string,
  request: {
    table: string;
    column?: string | undefined;
    /** Which retired column or table, when more than one has the name. */
    columnId?: string | undefined;
    tableId?: string | undefined;
  },
) {
  const schema = workspaceSchema(workspaceId);
  if (request.column !== undefined || request.columnId !== undefined) {
    let found = trx
      .selectFrom("data_column")
      .innerJoin("data_table", "data_table.id", "data_column.table_id")
      .select([
        "data_column.id",
        "data_column.physical_name",
        "data_table.physical_name as table_physical",
      ])
      .where("data_table.workspace_id", "=", workspaceId)
      .where("data_table.name", "=", request.table)
      .where("data_column.status", "=", "retired");
    if (request.column !== undefined) found = found.where("data_column.name", "=", request.column);
    if (request.columnId !== undefined)
      found = found.where("data_column.id", "=", request.columnId);
    // Two retired columns may have had one name: a name alone drops neither, and says which.
    const matches = await found.limit(2).execute();
    const column = matches[0];
    if (!column) throw notFound(`A retired column "${request.column}" in "${request.table}"`);
    if (matches.length > 1) throw ambiguous("column", request.column ?? "", request.table);
    await sql`alter table ${sql.id(schema, column.table_physical)} drop column ${sql.id(column.physical_name)}`.execute(
      trx,
    );
    await trx.deleteFrom("data_column").where("id", "=", column.id).execute();
    return { dropped: "column" as const };
  }
  let wanted = trx
    .selectFrom("data_table")
    .select(["id", "physical_name"])
    .where("workspace_id", "=", workspaceId)
    .where("name", "=", request.table)
    .where("status", "=", "retired");
  if (request.tableId !== undefined) wanted = wanted.where("id", "=", request.tableId);
  const tables = await wanted.limit(2).execute();
  const table = tables[0];
  if (!table) throw notFound(`A retired table "${request.table}"`);
  if (tables.length > 1) throw ambiguous("table", request.table, request.table);
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
