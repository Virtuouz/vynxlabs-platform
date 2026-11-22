import { sql } from "@volvel/db";
import { badRequest } from "../errors.js";
import type { Kernel } from "../kernel.js";
import { type ColumnMeta, type DataScope, type RowTarget, withData } from "./rows.js";

/**
 * What a column holds, counted for the editor that offers a choice of it: the values with how
 * many rows have each, and how many different there are. Read as the caller reads the table,
 * so a row the policy hides is not counted. Cheap by design: at most `sampleRows` rows are
 * looked at, under a short statement timeout, and the answer says when the table had more.
 */
export const COLUMN_LIMITS = {
  /** The most rows looked at; the answer says `sampled` when the table had more. */
  sampleRows: 50_000,
  /** The most values listed. */
  listed: 50,
  /** Past this many different values, `distinct` stops counting and says there are more. */
  distinct: 1000,
  timeoutMs: 5000,
};

/** Columns that hold no single value a person would pick or count. */
const NOT_LISTED = new Set(["json", "file", "enum_list"]);
export const isListable = (column: ColumnMeta) => !NOT_LISTED.has(column.type);

export interface ColumnValues {
  values: { value: string; count: number }[];
  /** How many different values (not counting empty ones), up to the cap. */
  distinct: number;
  /** There are more different values than the cap. */
  more?: true;
  /** How many rows were looked at. */
  rows: number;
  /** How many of them have no value. */
  empty: number;
  /** The table had more rows than were looked at. */
  sampled?: true;
}

const cell = (column: ColumnMeta) => sql`${sql.ref(column.physicalName)}::text`;
const from = (target: RowTarget) => sql.id(target.schema, target.table);

export function refuseColumn(target: RowTarget, name: string): ColumnMeta {
  const column = target.columns.find((one) => one.name === name);
  if (!column) {
    throw badRequest("The table has no such column.", [
      { path: "/column", message: `there is no column "${name}" in ${target.name}` },
    ]);
  }
  if (!isListable(column)) {
    throw badRequest(`The values of a ${column.type} column are not listed.`, [
      { path: "/column", message: `a ${column.type} column holds no values to pick from` },
    ]);
  }
  return column;
}

export async function columnValues(
  kernel: Kernel,
  tenantId: string,
  scope: DataScope,
  target: RowTarget,
  column: ColumnMeta,
): Promise<ColumnValues> {
  const { sampleRows, listed, distinct: cap, timeoutMs } = COLUMN_LIMITS;
  const enumValues = column.type === "enum" ? column.values : undefined;
  const result = await withData(
    kernel,
    tenantId,
    scope,
    (data) =>
      sql<{ top: { v: string; c: number }[] | null; d: number; r: number; e: number }>`
        with s0 as materialized (select ${cell(column)} as v from ${from(target)} limit ${sampleRows + 1}),
        s as (select v from s0 limit ${sampleRows}),
        g as (select v, count(*)::int as c from s where v is not null group by v),
        top as (
          select v, c from g
          order by c desc, v asc
          ${enumValues ? sql`` : sql`limit ${listed}`}
        )
        select
          (select json_agg(json_build_object('v', v, 'c', c) order by c desc, v asc) from top) as top,
          (select count(*)::int from (select 1 from g limit ${cap + 1}) as d) as d,
          (select count(*)::int from s0) as r,
          (select count(*)::int from s where v is null) as e
      `.execute(data),
    { timeoutMs },
  );
  const row = result.rows[0];
  const seen = row?.r ?? 0;
  const counts = new Map((row?.top ?? []).map((one) => [one.v, one.c]));
  const sampled = seen > sampleRows;
  const base = { rows: Math.min(seen, sampleRows), empty: row?.e ?? 0 };
  if (enumValues) {
    // Its own values, in its own order, the ones no row has too.
    return {
      values: enumValues.map((value) => ({ value, count: counts.get(value) ?? 0 })),
      distinct: enumValues.length,
      ...base,
      ...(sampled ? { sampled: true as const } : {}),
    };
  }
  const distinct = row?.d ?? 0;
  return {
    values: (row?.top ?? []).map((one) => ({ value: one.v, count: one.c })),
    distinct: Math.min(distinct, cap),
    ...(distinct > cap ? { more: true as const } : {}),
    ...base,
    ...(sampled ? { sampled: true as const } : {}),
  };
}

export interface ColumnCounts {
  rows: number;
  /** By column: how many different values, up to the cap; null where they are not counted. */
  columns: Record<string, number | null>;
  /** The columns that have more different values than the cap. */
  more?: string[];
  sampled?: true;
}

/** How many different values each plain column has, in one statement over the same sample. */
export async function columnCounts(
  kernel: Kernel,
  tenantId: string,
  scope: DataScope,
  target: RowTarget,
): Promise<ColumnCounts> {
  const { sampleRows, distinct: cap, timeoutMs } = COLUMN_LIMITS;
  const counted = target.columns.filter(isListable);
  const result = await withData(
    kernel,
    tenantId,
    scope,
    (data) => {
      const picked = counted.map(
        (column, index) => sql`${sql.ref(column.physicalName)}::text as ${sql.ref(`c${index}`)}`,
      );
      const parts = counted.map(
        (_, index) => sql`(select count(*)::int from (
          select 1 from s where ${sql.ref(`c${index}`)} is not null
          group by ${sql.ref(`c${index}`)} limit ${cap + 1}) as x) as ${sql.ref(`n${index}`)}`,
      );
      return sql<Record<string, number>>`
        with s0 as materialized (select ${picked.length > 0 ? sql.join(picked) : sql`1 as c`} from ${from(target)} limit ${sampleRows + 1}),
        s as (select * from s0 limit ${sampleRows})
        select (select count(*)::int from s0) as r${parts.length > 0 ? sql`, ${sql.join(parts)}` : sql``}
      `.execute(data);
    },
    { timeoutMs },
  );
  const row = result.rows[0] ?? {};
  const seen = row.r ?? 0;
  const columns: Record<string, number | null> = {};
  const more: string[] = [];
  for (const column of target.columns) columns[column.name] = null;
  counted.forEach((column, index) => {
    const n = row[`n${index}`] ?? 0;
    columns[column.name] = Math.min(n, cap);
    if (n > cap) more.push(column.name);
  });
  return {
    rows: Math.min(seen, sampleRows),
    columns,
    ...(more.length > 0 ? { more } : {}),
    ...(seen > sampleRows ? { sampled: true as const } : {}),
  };
}
