import {
  conditionProblem,
  type DataInput,
  displayGuess,
  enumColor,
  groupName,
  type LastValue,
  type PageFilter,
  type PageWidget,
  type VisualBucket,
  type VisualCondition,
  type VisualQuery,
  widgetRegistry,
} from "@volvel/manifest";
import type { ColumnInfo, DataInputDeclaration } from "@volvel/widgets";
import { badRequest, forbiddenBecause, HttpError, notFound } from "../../errors.js";
import type { RequestContext } from "../../http.js";
import type { Kernel } from "../../kernel.js";
import { type ApprovalsWire, readApprovals } from "../../pages/approvals.js";
import { principalEmail } from "../../pages/who.js";
import {
  describeTable,
  type Filter,
  findRows,
  type RowTarget,
  scopeFor,
  withData,
} from "../rows.js";
import { openSource, sourceTable } from "../sources.js";
import {
  dayAfter,
  type FilterValues,
  isDay,
  lastRange,
  previousRange,
  rangeOf,
  wordsOf,
} from "./filters.js";
import { QueryRefused } from "./parse.js";
import { checkFor, QUERY_ROWS, type QueryResult, refusal, runQuery } from "./run.js";
import { type RowsGroup, rowsGroupKey } from "./visual.js";
import {
  asRows,
  conditionsFor,
  inputQuery,
  type WidgetQuery,
  type WorkspaceCatalog,
  workspaceCatalog,
} from "./widget.js";

/**
 * Reads the data of one widget of a page, on the server, from the page as it is stored: what
 * each data input asks, compiled by `inputQuery`, run for whoever is looking under each table's
 * row policy, and shaped as the widget's definition declares (rows, a summary or a record).
 * The browser names a widget and the filters, and never a query.
 */

/** What the widget is given for one data input, as it is sent. */
export type WireData =
  | {
      shape: "rows";
      columns: ColumnInfo[];
      rows: Record<string, unknown>[];
      /** Asks for the next page: send it back as `cursor`. */
      next?: string;
      /** With a next page: how many rows there are in all, as the filters leave them. Sent with the first page. */
      total?: number;
      /** Rows grouped by a column, with a next page: how many rows each group has in all. Sent with the first page. */
      groups?: { key: unknown; count: number }[];
      /** For a reference column: the name of the row each id points to. */
      names?: Record<string, Record<string, string>>;
      followed?: { names: string; now: string };
    }
  | {
      shape: "summary";
      columns: ColumnInfo[];
      breakdowns: string[];
      values: string[];
      rows: Record<string, unknown>[];
      /** The same values for the period before, when the widget compares. */
      previous?: Record<string, unknown>[];
      /** A figure's number over the time it covers, oldest first. */
      trend?: { at: string; value: number }[];
      followed?: { names: string; now: string };
    }
  | ApprovalsWire
  | {
      shape: "record";
      columns: ColumnInfo[];
      record: Record<string, unknown> | null;
      /** For reference columns: the name of the row each id points to. */
      names?: Record<string, Record<string, string>>;
      followed?: { names: string; now: string };
      /** Why there is no record, in words: "Choose a row in Invoices". */
      empty?: string;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many rows a page of a rows input holds when the widget does not say. */
export const ROWS_PAGE = 100;

/** How many rows a page of this widget's rows holds: a table's "Rows at a time", else `ROWS_PAGE`. */
export function pageOf(widget: PageWidget, asked?: number): number {
  if (asked !== undefined) return Math.min(Math.max(Math.trunc(asked), 1), 1000);
  const size =
    widget.type === "core/table"
      ? (widget.config?.pageSize ?? widgetRegistry().get(widget.type)?.defaults?.pageSize)
      : undefined;
  return typeof size === "number" && Number.isInteger(size)
    ? Math.min(Math.max(size, 1), 200)
    : ROWS_PAGE;
}

export interface ReadRequest {
  tenantId: string;
  workspaceId: string;
  ctx: RequestContext;
  /** Where the page is shown: an app's SQL is refused, as it is when the page is saved. */
  surface: "app" | "dashboard";
  widget: PageWidget;
  filters: readonly PageFilter[];
  /** The filters' values as `resolveFilters` read them. */
  values: FilterValues;
  /** Only this input, and the page of it after `cursor`. */
  only?: { input: string; cursor?: string | undefined };
  /** The deployed page, whose recorded keys a saved query falls back on, and the page of the widget on an interface. */
  follow?: { pageId: string; page?: string };
  /** For a record page, a sheet or a modal: the table of its record. */
  recordTable?: string;
  /** The record the page is open on, by its ID. */
  record?: string;
  /** With `only`: how many rows a page holds, in place of the widget's own (a download reads big pages). */
  size?: number;
  /** A table's rows in the order of this column (`-name` for descending): the whole table's, not the page's. */
  sort?: string;
  /** Where whoever looks is, as an IANA time zone: what a time's day is, for rows grouped by day. */
  zone?: string;
  /** With `only`: read the rows behind one group of that summary, by the groups' names. */
  behind?: Record<string, unknown>;
  /** The page's widgets, for a `{ selected }` source to find the table it was chosen in. */
  widgets?: readonly PageWidget[];
  /** The row chosen in each table or list of the page, by the widget's ID: a record id. */
  chosen?: Record<string, string>;
  /** The page is read as a draft, by someone who may edit it. */
  draft?: boolean;
  /** Where the request arrived takes no decisions: the approvals say they are decided in the console. */
  elsewhere?: boolean;
}

/**
 * What a list or a table's rows are grouped by, as its widget is set: a column of the table it
 * reads. Rows that are totals already, or of something other than a table, are not grouped.
 */
export function groupRowsOf(
  widget: PageWidget,
  visual: VisualQuery,
): { column: string; by?: "day" | "week" | "month"; descending?: boolean } | undefined {
  const given = widget.config?.groupRows as
    | { column?: unknown; by?: unknown; descending?: unknown }
    | undefined;
  if (typeof given?.column !== "string" || given.column === "") return undefined;
  if ((visual.groupBy?.length ?? 0) > 0 || (visual.measures?.length ?? 0) > 0) return undefined;
  return {
    column: given.column,
    ...(given.by === "day" || given.by === "week" || given.by === "month" ? { by: given.by } : {}),
    ...(given.descending === true ? { descending: true } : {}),
  };
}

/** A condition no row meets: no row has an empty `id`. */
const NOTHING: VisualCondition = { column: "id", op: "is_null" };

/** The first day after the period that begins on `day`. */
export function periodEnd(day: string, bucket: VisualBucket): string {
  const next = new Date(`${day}T00:00:00Z`);
  switch (bucket) {
    case "day":
      return dayAfter(day);
    case "week":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "month":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "quarter":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "year":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
    default: {
      const unreachable: never = bucket;
      throw new Error(`Unknown bucket ${String(unreachable)}`);
    }
  }
  return next.toISOString().slice(0, 10);
}

const refused = (name: string, message: string) =>
  badRequest("The rows behind a group are not valid.", [{ path: `/behind/${name}`, message }]);

/**
 * What a group is, as conditions on its source column: its value, or for a period the days it
 * covers. A value the group cannot have is refused.
 */
function groupConditions(visual: VisualQuery, behind: Record<string, unknown>): VisualCondition[] {
  const groups = new Map((visual.groupBy ?? []).map((group) => [groupName(group), group]));
  const out: VisualCondition[] = [];
  for (const [name, value] of Object.entries(behind)) {
    const group = groups.get(name);
    if (!group) throw refused(name, "this is not a group of the summary");
    if (value === null) {
      out.push({ column: group.column, op: "is_null" });
    } else if (group.bucket) {
      const day = typeof value === "string" ? value.slice(0, 10) : "";
      if (!isDay(day)) throw refused(name, "is a day as YYYY-MM-DD");
      out.push({ column: group.column, op: "gte", value: day });
      out.push({ column: group.column, op: "lt", value: periodEnd(day, group.bucket) });
    } else if (typeof value === "object") {
      throw refused(name, "is one value");
    } else {
      out.push({ column: group.column, op: "eq", value });
    }
  }
  return out;
}

const isRef = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  ("record" in value || "user" in value);

/**
 * A condition's `{ record: column }` and `{ user: "id" }` as the values they stand for. What
 * is not there (no record, a record the caller may not read, an empty column, no signed-in
 * person) narrows to no rows rather than to every row.
 */
function resolveRefs(
  conditions: readonly VisualCondition[],
  record: Record<string, unknown> | null,
  user: string | null,
): VisualCondition[] {
  return conditions.map((one) => {
    const value = one.value;
    if (!isRef(value)) return one;
    const ref = value as { record?: unknown; user?: unknown };
    const found =
      typeof ref.record === "string" ? record?.[ref.record] : ref.user === "id" ? user : undefined;
    if (found === null || found === undefined || typeof found === "object") return NOTHING;
    return { ...one, value: found };
  });
}

/** The column that stands for a row of a table where another table points to it. */
export const displayColumn = (described: RowTarget): string | undefined =>
  described.display && described.columns.some((one) => one.name === described.display)
    ? described.display
    : displayGuess(described.columns);

export const humanize = (name: string) => {
  const text = name.replace(/[._]+/g, " ").trim();
  return text === "" ? name : text[0]?.toUpperCase() + text.slice(1);
};

/** What a value in a result is, as a column type is said. */
const RESULT_TYPES: Record<string, string> = {
  number: "number",
  text: "text",
  boolean: "boolean",
  timestamp: "timestamp",
  date: "date",
  list: "json",
  json: "json",
  unknown: "text",
};

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const text = Buffer.from(cursor, "base64url").toString("utf8");
  const offset = /^\d{1,9}$/.test(text) ? Number(text) : -1;
  if (!Number.isSafeInteger(offset) || offset < 0) throw badRequest("The cursor is not valid.");
  return offset;
}
const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString("base64url");

/** A table's columns, the way a widget is told about them. */
function columnInfoOf(
  catalog: WorkspaceCatalog,
  table: string | undefined,
  name: string,
  fallbackType: string,
): ColumnInfo {
  const info = (
    path: string | undefined,
    column: string,
    label: string,
  ): ColumnInfo | undefined => {
    const found = path ? catalog.tables.get(path) : undefined;
    if (!found) return undefined;
    if (column === "id") return { name, label, type: "uuid" };
    if (column === "created_at" || column === "updated_at")
      return { name, label, type: "timestamp" };
    const one = found.columns.find(
      (candidate) => candidate.name === column && candidate.status === "active",
    );
    if (!one) return undefined;
    const values = one.options?.values;
    const description = catalog.described.get(path as string)?.get(column);
    return {
      name,
      label,
      type: one.referenceTable ? "reference" : one.type,
      required: one.required,
      // What a new row gets when it gives none: a form starts with it, and does not ask for it.
      ...(one.default !== null && one.default !== undefined ? { default: one.default } : {}),
      ...(one.referenceTable ? { references: one.referenceTable } : {}),
      ...(description ? { description } : {}),
      ...(values && values.length > 0
        ? {
            values: values.map((value) => {
              const color = enumColor(value.color);
              return {
                value: value.value,
                ...(value.label ? { label: value.label } : {}),
                ...(color ? { color } : {}),
              };
            }),
          }
        : {}),
    };
  };
  return info(table, name, humanize(name)) ?? { name, label: humanize(name), type: fallbackType };
}

/** The columns of a result built from menus, with what each is: a column of a table, a period, or a value worked out. */
function visualColumns(
  visual: VisualQuery,
  catalog: WorkspaceCatalog,
  names: string[],
): ColumnInfo[] {
  const base = catalog.tables.get(visual.table);
  /** A column as the query names it: `device.name` is read from the table `device` points to. */
  const source = (column: string): ColumnInfo | undefined => {
    const [first, second] = column.split(".") as [string, string | undefined];
    const name = column.replace(".", "_");
    if (second === undefined) return columnInfoOf(catalog, visual.table, first, "text");
    const via = base?.columns.find((one) => one.name === first)?.referenceTable;
    const info = columnInfoOf(catalog, via ?? undefined, second, "text");
    return { ...info, name, label: humanize(name) };
  };
  const byName = new Map<string, ColumnInfo>();
  for (const group of visual.groupBy ?? []) {
    const info = source(group.column);
    const name = groupName(group);
    if (info)
      byName.set(name, {
        ...info,
        name,
        label: humanize(group.column.replace(".", "_")),
        type: group.bucket ? "date" : info.type,
      });
  }
  for (const measure of visual.measures ?? []) {
    const info = measure.column ? source(measure.column) : undefined;
    const type =
      measure.fn === "count" || measure.fn === "count_distinct"
        ? "integer"
        : measure.fn === "min" || measure.fn === "max"
          ? (info?.type ?? "number")
          : "number";
    byName.set(measure.as, { name: measure.as, label: humanize(measure.as), type });
  }
  for (const column of names) {
    if (byName.has(column)) continue;
    const original =
      (visual.columns ?? []).find((one) => one.replace(".", "_") === column) ?? column;
    const info = source(original);
    byName.set(
      column,
      info ? { ...info, name: column } : { name: column, label: humanize(column), type: "text" },
    );
  }
  return names.map((name) => byName.get(name) as ColumnInfo);
}

/** The columns of the result of SQL: what they are is read from the rows. */
function resultColumns(result: QueryResult): ColumnInfo[] {
  return result.columns.map((column) => ({
    name: column.name,
    label: humanize(column.name),
    type: RESULT_TYPES[column.type] ?? "text",
  }));
}

/** A result as rows by column name. */
function asRecords(result: QueryResult, names?: string[]): Record<string, unknown>[] {
  const columns =
    result.columns.length > 0 ? result.columns.map((column) => column.name) : (names ?? []);
  return result.rows.map((row) =>
    Object.fromEntries(columns.map((name, at) => [name, row[at] ?? null])),
  );
}

const NUMERIC = new Set(["number", "integer"]);

export async function readWidget(
  kernel: Kernel,
  request: ReadRequest,
): Promise<Record<string, WireData>> {
  const { tenantId, workspaceId, ctx, widget } = request;
  const at = { tenantId, workspaceId };
  const definition = widgetRegistry().get(widget.type);
  if (!definition) throw badRequest(`There is no widget called "${widget.type}".`);
  const names = Object.keys(widget.data ?? {});
  if (request.only && !names.includes(request.only.input)) {
    throw notFound(`The data "${request.only.input}" of the widget`);
  }
  const wanted = request.only ? [request.only.input] : names;
  const filters = new Map(request.filters.map((filter) => [filter.name, filter]));

  const catalog = await workspaceCatalog(kernel, tenantId, workspaceId);
  const scope = await scopeFor(
    kernel,
    tenantId,
    ctx.principal,
    await ctx.allowed("data_all:read", at),
  );
  const mayRead = async (table: { name: string; resourceId: string | null }) => {
    const allowed = await ctx.allowed("data:read", {
      ...at,
      resourceId: table.resourceId ?? undefined,
    });
    if (!allowed) {
      throw new HttpError(
        403,
        "forbidden",
        `This reads the table "${table.name}", which needs the data:read permission there.`,
      );
    }
  };

  /** Runs what an input asked as SQL, with the parameters nothing fills left empty. */
  const run = async (asked: WidgetQuery, paging?: { limit: number; offset: number }) => {
    // A parameter nothing fills is empty, so that the query can say what an empty one means.
    const needs = await checkFor(kernel, tenantId, workspaceId, asked.text).catch((error) => {
      throw error instanceof QueryRefused ? refusal(error) : error;
    });
    const parameters = Array.from(
      { length: needs.parameters },
      (_, index) => asked.parameters[index] ?? null,
    );
    return runQuery(kernel, {
      ...at,
      scope,
      text: asked.text,
      parameters,
      limit: paging?.limit ?? QUERY_ROWS.default,
      ...(paging ? { offset: paging.offset } : {}),
      mayRead,
    });
  };

  /** How many rows a query finds in all. */
  const totalOf = async (asked: WidgetQuery): Promise<{ total?: number }> => {
    try {
      const counted = await run({
        ...asked,
        text: `select count(*) as n from (${asked.text}) as vx_c`,
      });
      const n = Number(counted.rows[0]?.[0]);
      return Number.isFinite(n) ? { total: n } : {};
    } catch {
      return {};
    }
  };

  /** How many rows each group has, of those a query finds. */
  const groupsOf = async (
    asked: WidgetQuery,
    lead: RowsGroup,
    type: string,
  ): Promise<{ groups?: { key: unknown; count: number }[] }> => {
    const parameters = [...asked.parameters];
    const key = rowsGroupKey(lead, type, `vx_c."${lead.column}"`, (value) => {
      parameters.push(value);
      return `$${parameters.length}`;
    });
    try {
      const counted = await run(
        {
          ...asked,
          text: `select ${key} as k, count(*) as n from (${asked.text}) as vx_c group by 1`,
          parameters,
        },
        { limit: QUERY_ROWS.most, offset: 0 },
      );
      return { groups: counted.rows.map(([k, n]) => ({ key: k ?? null, count: Number(n) })) };
    } catch {
      return {};
    }
  };

  /** The name of each row a reference column of a result points to, as the caller may read that table. */
  const namesOf = async (
    visual: VisualQuery,
    rows: Record<string, unknown>[],
    columns: ColumnInfo[],
  ): Promise<Record<string, Record<string, string>>> => {
    const found: Record<string, Record<string, string>> = {};
    const base = catalog.tables.get(visual.table);
    const owner = (await kernel.data.forTenant(tenantId)).owner;
    for (const column of columns) {
      if (column.type !== "reference") continue;
      const target = base?.columns.find((one) => one.name === column.name)?.referenceTable;
      if (!target) continue;
      const ids = [
        ...new Set(
          rows.map((row) => row[column.name]).filter((id): id is string => typeof id === "string"),
        ),
      ].slice(0, 200);
      if (ids.length === 0) continue;
      const pointed = catalog.tables.get(target);
      const where = { ...at, resourceId: pointed?.resourceId ?? undefined };
      // What stands for a row is read as the caller reads that table: with their permission there, and through its policy.
      if (!pointed || !(await ctx.allowed("data:read", where))) continue;
      const described = await describeTable(owner, workspaceId, target);
      const display = displayColumn(described);
      if (!display) continue;
      const pointedScope = await scopeFor(
        kernel,
        tenantId,
        ctx.principal,
        await ctx.allowed("data_all:read", where),
      );
      const read = await withData(kernel, tenantId, pointedScope, (data) =>
        findRows(data, described, { filter: { column: "id", op: "in", value: ids }, limit: 200 }),
      );
      found[column.name] = {};
      for (const row of read.items) {
        const name = row[display];
        if (name !== null && name !== undefined)
          (found[column.name] as Record<string, string>)[String(row.id)] = String(name);
      }
    }
    return found;
  };

  /** Rows of a table in a bound data source, which SQL views cannot read. */
  const external = async (input: DataInput, offset: number) => {
    if (!("visual" in input.source)) return undefined;
    const visual = input.source.visual;
    if (catalog.tables.has(visual.table)) return undefined;
    const slash = visual.table.lastIndexOf("/");
    if (slash <= 0) return undefined;
    const sourcePath = visual.table.slice(0, slash);
    const table = visual.table.slice(slash + 1);
    const bound = await kernel.db
      .selectFrom("data_source_binding")
      .select("id")
      .where("workspace_id", "=", workspaceId)
      .where("path", "=", sourcePath)
      .executeTakeFirst();
    if (!bound) return undefined;
    if (!(await ctx.allowed("data:read", at))) {
      throw forbiddenBecause("This needs the data:read permission.");
    }
    if ((visual.groupBy?.length ?? 0) > 0 || (visual.measures?.length ?? 0) > 0) {
      throw badRequest("Rows of a data source's table can be listed, not totalled.");
    }
    const source = await openSource(kernel, kernel.db, tenantId, workspaceId, sourcePath);
    const target: RowTarget = await sourceTable(source.db, source.schema, sourcePath, table);
    const extra = conditionsFor(input, filters, request.values);
    const conditions: Filter[] = [
      ...(visual.filters ?? []),
      ...extra.filter((one): one is VisualCondition => !("search" in one)),
    ].flatMap((one, index): Filter[] => {
      if (one.op === "not_null") return [{ column: one.column, op: "is_null", value: false }];
      if (one.op === "last" || one.op === "between") {
        // Written as the two ends it stands for; the end day is whole, as a page's date range reads it.
        const type = target.columns.find((column) => column.name === one.column)?.type;
        if (!type) throw badRequest(`${target.name} has no column "${one.column}".`);
        const problem = conditionProblem(one, type);
        if (problem)
          throw badRequest("The condition is not valid.", [
            { path: `/filters/${index}/value`, message: problem },
          ]);
        if (one.op === "between" && typeof (one.value as unknown[])[0] === "number") {
          const [from, to] = one.value as number[];
          return [
            { column: one.column, op: "gte", value: from },
            { column: one.column, op: "lte", value: to },
          ];
        }
        const range =
          one.op === "last"
            ? lastRange((one.value as LastValue).count, (one.value as LastValue).unit)
            : {
                from: (one.value as string[])[0] as string,
                to: (one.value as string[])[1] as string,
              };
        return [
          { column: one.column, op: "gte", value: range.from },
          { column: one.column, op: "lt", value: dayAfter(range.to) },
        ];
      }
      return [
        {
          column: one.column,
          op: one.op,
          ...(one.value !== undefined ? { value: one.value } : {}),
        },
      ];
    });
    // A search is each word found in one of its columns: an "or" of "contains" for each word.
    for (const one of extra) {
      if (!("search" in one)) continue;
      for (const word of wordsOf(one.search)) {
        conditions.push({
          or: one.columns.map((column) => ({ column, op: "contains", value: word })),
        });
      }
    }
    const sort = (visual.sort ?? []).map((one) => `${one.descending ? "-" : ""}${one.by}`);
    const page = await findRows(source.db, target, {
      ...(conditions.length > 0 ? { filter: { and: conditions } } : {}),
      sort,
      limit: Math.min(pageOf(widget, request.size), visual.limit ?? pageOf(widget, request.size)),
      offset,
    });
    const shown =
      visual.columns && visual.columns.length > 0
        ? visual.columns
        : target.columns.map((one) => one.name);
    const columns = shown.flatMap((name) => {
      const one = target.columns.find((candidate) => candidate.name === name);
      return one ? [{ name, label: humanize(name), type: one.type }] : [];
    });
    const rows = page.items.map((row) => ({
      ...(target.key ? { id: row[target.key] } : {}),
      ...Object.fromEntries(columns.map((column) => [column.name, row[column.name] ?? null])),
    }));
    return { columns, rows, nextOffset: page.nextOffset };
  };

  /** The caller, as `{ user: "id" }` names them. */
  const me = ctx.principal.id ?? null;
  const recordTable = request.recordTable;
  /** The page's record, as the caller may read it: null when it is not there or they may not read it. */
  let recordRead: Promise<Record<string, unknown> | null> | undefined;
  const pageRecord = (): Promise<Record<string, unknown> | null> => {
    recordRead ??= (async () => {
      if (!recordTable || request.record === undefined) return null;
      const visual: VisualQuery = {
        table: recordTable,
        filters: [{ column: "id", op: "eq", value: request.record }],
        limit: 1,
      };
      const asked = await inputQuery(
        kernel,
        at,
        { source: { visual } },
        { filters: request.filters, values: request.values, catalog: catalog.visual },
        { shape: "rows" },
      );
      try {
        const result = await run(asked, { limit: 1, offset: 0 });
        return asRecords(result, asked.columns)[0] ?? null;
      } catch (error) {
        if (error instanceof HttpError && error.statusCode === 403) return null;
        throw error;
      }
    })();
    return recordRead;
  };

  const out: Record<string, WireData> = {};
  for (const name of wanted) {
    let input = (widget.data as Record<string, DataInput>)[name] as DataInput;
    const declared: DataInputDeclaration | undefined = definition.data[name];
    if (!declared) throw badRequest(`${definition.title} takes no data called "${name}".`);
    if ("sql" in input.source && request.surface === "app") {
      throw badRequest("SQL is written on dashboards, not on an app's page.");
    }
    // The approvals of the workspace's flows: not a table. Read for a member, by their own standing.
    if ("approvals" in input.source) {
      if (declared.shape !== "approvals") {
        throw badRequest(`${definition.title} takes no approvals as "${name}".`);
      }
      if (request.surface !== "app") throw badRequest("Approvals are decided in an app.");
      out[name] = await readApprovals(kernel, ctx, {
        at,
        widget,
        draft: request.draft === true,
        elsewhere: request.elsewhere === true,
      });
      continue;
    }
    // The record the page is open on, as a table to read.
    const ofThisRecord = "record" in input.source;
    let recordId = request.record;
    /** Why a record that is chosen or the user's own is not there, said in words. */
    let whyEmpty: string | undefined;
    let ofChosen = false;
    let ofOwn = false;
    if ("record" in input.source) {
      if (!recordTable) throw badRequest("This page is not open on a record.");
      input = { ...input, source: { visual: { table: recordTable } } };
    } else if ("selected" in input.source) {
      // The row chosen in a table or list of this page, read as the caller reads that table.
      const selected = input.source.selected;
      const from = request.widgets?.find((one) => one.id === selected);
      const fromTable = Object.values(from?.data ?? {})
        .map((one) => ("visual" in one.source ? one.source.visual.table : undefined))
        .find((one) => one !== undefined);
      if (!from || !fromTable)
        throw badRequest("The row is chosen in a table or list of the page.");
      ofChosen = true;
      const one = request.chosen?.[from.id];
      recordId = typeof one === "string" && UUID.test(one) ? one : undefined;
      whyEmpty = `Choose a row in ${humanize(fromTable)}`;
      input = { ...input, source: { visual: { table: fromTable } } };
    } else if ("own" in input.source) {
      // The user's own row: the one whose column holds their email.
      const own = input.source.own;
      ofChosen = true;
      ofOwn = true;
      const email = await principalEmail(kernel, tenantId, ctx.principal);
      const noun = humanize(own.table)
        .toLowerCase()
        .replace(/(?<!s)s$/, "");
      whyEmpty = `There is no ${noun} for you yet`;
      input = {
        ...input,
        source: {
          visual: {
            table: own.table,
            filters: [
              email !== undefined
                ? ({ column: own.by, op: "ieq", value: email } as unknown as VisualCondition)
                : NOTHING,
            ],
          },
        },
      };
      recordId = undefined;
    }
    // What a condition names of the record or of the caller is filled in.
    if (
      "visual" in input.source &&
      (input.source.visual.filters ?? []).some((one) => isRef(one.value))
    ) {
      const needsRecord = (input.source.visual.filters ?? []).some(
        (one) => typeof one.value === "object" && one.value !== null && "record" in one.value,
      );
      input = {
        ...input,
        source: {
          visual: {
            ...input.source.visual,
            filters: resolveRefs(
              input.source.visual.filters ?? [],
              needsRecord ? await pageRecord() : null,
              me,
            ),
          },
        },
      };
    }
    const place = `${request.follow?.page ? `${request.follow.page}/` : ""}${widget.id}/${name}`;
    const page = {
      filters: request.filters,
      values: request.values,
      catalog: catalog.visual,
      ...(request.follow ? { follow: { pageId: request.follow.pageId, place } } : {}),
    };
    const offset = decodeCursor(request.only?.input === name ? request.only.cursor : undefined);
    let visual = "visual" in input.source ? input.source.visual : undefined;

    // The rows behind one group of a summary: the table, filters and page filters, and that group.
    if (request.behind && request.only?.input === name) {
      // A number that isn't broken down (a stat) has every row of its input behind it.
      if (!visual) {
        throw badRequest("Only figures read from a table have rows behind them.");
      }
      const base: VisualQuery = {
        table: visual.table,
        ...(visual.joins ? { joins: visual.joins } : {}),
        filters: [...(visual.filters ?? []), ...groupConditions(visual, request.behind)],
      };
      const asked = await inputQuery(kernel, at, { ...input, source: { visual: base } }, page, {
        shape: "rows",
      });
      const result = await run(asked, { limit: ROWS_PAGE, offset });
      const rows = asRecords(result, asked.columns);
      const columns = visualColumns(
        base,
        catalog,
        asked.columns ?? result.columns.map((one) => one.name),
      );
      const pointed = await namesOf(asRows(base), rows, columns);
      out[name] = {
        shape: "rows",
        columns,
        rows,
        ...(result.truncated ? { next: encodeCursor(offset + rows.length) } : {}),
        ...(Object.keys(pointed).length > 0 ? { names: pointed } : {}),
      };
      continue;
    }

    // The record the page is open on: its row, or for a form that makes one, only its columns.
    let mustFind = false;
    if (visual && (ofThisRecord || ofChosen || declared.shape === "record")) {
      const here = ofThisRecord || (ofChosen ? !ofOwn : visual.table === recordTable);
      if (declared.shape === "record" && !ofOwn && !(here && recordId !== undefined)) {
        const table = catalog.tables.get(visual.table);
        if (!table) throw notFound(`The table ${visual.table}`);
        await mayRead({ name: table.name, resourceId: table.resourceId ?? null });
        const asked = await inputQuery(kernel, at, input, page, { shape: "rows" });
        out[name] = {
          shape: "record",
          columns: visualColumns(visual, catalog, asked.columns ?? []),
          record: null,
          ...(whyEmpty ? { empty: whyEmpty } : {}),
        };
        continue;
      }
      if (here) {
        visual = {
          ...visual,
          filters: [
            ...(visual.filters ?? []),
            recordId !== undefined ? { column: "id", op: "eq", value: recordId } : NOTHING,
          ],
        };
        input = { ...input, source: { visual } };
        mustFind = declared.shape === "record" && !ofChosen;
      }
    }

    if (declared.shape === "summary") {
      if (offset > 0) throw badRequest("A summary has one page.");
      const asked = await inputQuery(kernel, at, input, page, { shape: "summary" });
      const result = await run(asked);
      const rows = asRecords(result, asked.columns);
      let columns: ColumnInfo[];
      let breakdowns: string[];
      let values: string[];
      if (visual) {
        columns = visualColumns(
          visual,
          catalog,
          asked.columns ?? result.columns.map((one) => one.name),
        );
        breakdowns = (visual.groupBy ?? []).map(groupName);
        values = (visual.measures ?? []).map((measure) => measure.as);
      } else {
        columns = resultColumns(result);
        // Leading text and dates are what it is broken down by, and the numbers after them its values.
        const most = declared.breakdowns?.max ?? 1;
        const fewest = declared.breakdowns?.min ?? 0;
        let split = 0;
        while (
          split < columns.length &&
          split < most &&
          !NUMERIC.has((columns[split] as ColumnInfo).type)
        )
          split++;
        split = Math.max(split, Math.min(fewest, Math.max(columns.length - 1, 0)));
        breakdowns = columns.slice(0, split).map((one) => one.name);
        values = columns.slice(split, split + (declared.values?.max ?? 1)).map((one) => one.name);
      }
      const wire: Extract<WireData, { shape: "summary" }> = {
        shape: "summary",
        columns,
        breakdowns,
        values,
        rows,
      };
      if (asked.followed) wire.followed = asked.followed;

      // The same figures for the period before, when the widget compares and this input follows that range.
      const compared =
        typeof widget.config?.compareTo === "string" ? widget.config.compareTo : undefined;
      const range = compared ? rangeOf(request.values[compared]) : undefined;
      if (
        compared &&
        range?.from &&
        range.to &&
        (input.filters ?? []).some((one) => one.filter === compared)
      ) {
        const before = await inputQuery(
          kernel,
          at,
          input,
          {
            ...page,
            values: {
              ...request.values,
              [compared]: previousRange({ from: range.from, to: range.to }),
            },
          },
          { shape: "summary" },
        );
        wire.previous = asRecords(await run(before), before.columns);
      }

      // A figure's number over the time it covers.
      const trendBy =
        typeof widget.config?.trendBy === "string" ? widget.config.trendBy : undefined;
      if (trendBy && visual && (visual.measures?.length ?? 0) > 0 && !asked.followed) {
        const trended = await inputQuery(kernel, at, input, page, {
          shape: "summary",
          trend: { by: trendBy },
        });
        const [byColumn, measureColumn] = trended.columns ?? [];
        if (byColumn && measureColumn) {
          wire.trend = asRecords(await run(trended), trended.columns).map((row) => ({
            at: String(row[byColumn]),
            value: Number(row[measureColumn] ?? 0),
          }));
        }
      }
      out[name] = wire;
      continue;
    }

    // Rows and a record. A table in a data source goes by the rows path, which can read it.
    if (declared.shape === "rows" && request.sort && "visual" in input.source) {
      const descending = request.sort.startsWith("-");
      const by = request.sort.replace(/^-/, "");
      // Only by what the widget reads: the order of a column it does not send would tell of it.
      const read = input.source.visual.columns;
      if (read && !read.includes(by)) {
        throw badRequest("The table can't be sorted by that.", [
          { path: "/sort", message: `the widget does not read "${by}"` },
        ]);
      }
      input = {
        ...input,
        source: {
          visual: {
            ...input.source.visual,
            sort: [{ by, ...(descending ? { descending } : {}) }],
          },
        },
      };
    }
    // Rows kept together by a column: it leads their order, and within a group they are as asked.
    let lead: RowsGroup | undefined;
    let leadType = "text";
    const grouped =
      declared.shape === "rows" && "visual" in input.source
        ? groupRowsOf(widget, input.source.visual)
        : undefined;
    if (grouped && "visual" in input.source) {
      const source = input.source.visual;
      const held = catalog.tables.get(source.table);
      const of = held?.columns.find(
        (one) => one.name === grouped.column && one.status === "active",
      );
      leadType =
        grouped.column === "created_at" || grouped.column === "updated_at"
          ? "timestamp"
          : (of?.type ?? "text");
      const ordered = { by: grouped.column, ...(grouped.descending ? { descending: true } : {}) };
      const inDays = leadType === "date" || leadType === "timestamp";
      const sort = source.sort ?? [];
      input = {
        ...input,
        source: {
          visual: {
            ...source,
            // The view groups by what a row holds, so every row holds it.
            ...(source.columns && !source.columns.includes(grouped.column)
              ? { columns: [...source.columns, grouped.column] }
              : {}),
            // With no order of their own, the rows of a day are by its time.
            sort: held
              ? sort.length === 0 && inDays
                ? [ordered]
                : sort
              : [ordered, ...sort.filter((one) => one.by !== grouped.column)],
          },
        },
      };
      // A table of a data source is put in order by the column alone.
      if (held) {
        lead = {
          ...grouped,
          zone: request.zone ?? "UTC",
          ...(of?.options?.values ? { values: of.options.values.map((one) => one.value) } : {}),
        };
      }
    }
    const outside = await external(input, offset);
    if (outside) {
      if (declared.shape === "record") {
        out[name] = { shape: "record", columns: outside.columns, record: outside.rows[0] ?? null };
      } else {
        out[name] = {
          shape: "rows",
          columns: outside.columns,
          rows: outside.rows,
          ...(outside.nextOffset !== null && outside.nextOffset !== undefined
            ? { next: encodeCursor(outside.nextOffset) }
            : {}),
        };
      }
      continue;
    }
    if (declared.shape === "approvals")
      throw badRequest("An approvals input has no table to read.");
    const asked = await inputQuery(kernel, at, input, page, {
      shape: declared.shape,
      ...(lead ? { lead } : {}),
    });
    const size = declared.shape === "record" ? 1 : pageOf(widget, request.size);
    const result = await run(asked, { limit: size, offset }).catch((error) => {
      // A chosen or own row the caller may not read is told as one that is not there.
      if (ofChosen && error instanceof HttpError && error.statusCode === 403) return null;
      // A record the caller may not read is told as one that is not there.
      if (mustFind && error instanceof HttpError && error.statusCode === 403)
        throw notFound("The record");
      throw error;
    });
    if (result === null) {
      out[name] = {
        shape: "record",
        columns: visual ? visualColumns(visual, catalog, asked.columns ?? []) : [],
        record: null,
        ...(whyEmpty ? { empty: whyEmpty } : {}),
      };
      continue;
    }
    const rows = asRecords(result, asked.columns);
    if (mustFind && rows.length === 0) throw notFound("The record");
    const columns = visual
      ? visualColumns(visual, catalog, asked.columns ?? result.columns.map((one) => one.name))
      : resultColumns(result);
    if (declared.shape === "record") {
      const pointedAt =
        visual && rows[0] ? await namesOf(asRows(visual), rows.slice(0, 1), columns) : {};
      out[name] = {
        shape: "record",
        columns,
        record: rows[0] ?? null,
        ...(!rows[0] && whyEmpty ? { empty: whyEmpty } : {}),
        ...(Object.keys(pointedAt).length > 0 ? { names: pointedAt } : {}),
        ...(asked.followed ? { followed: asked.followed } : {}),
      };
      continue;
    }
    const pointed = visual ? await namesOf(asRows(visual), rows, columns) : {};
    out[name] = {
      shape: "rows",
      columns,
      rows,
      ...(result.truncated ? { next: encodeCursor(offset + rows.length) } : {}),
      ...(result.truncated && offset === 0 ? await totalOf(asked) : {}),
      ...(lead && result.truncated && offset === 0 ? await groupsOf(asked, lead, leadType) : {}),
      ...(Object.keys(pointed).length > 0 ? { names: pointed } : {}),
      ...(asked.followed ? { followed: asked.followed } : {}),
    };
  }
  return out;
}
