import {
  type DataInput,
  displayGuess,
  enumColor,
  groupName,
  type PageFilter,
  type PageWidget,
  type VisualQuery,
  widgetRegistry,
} from "@volvel/manifest";
import type { ColumnInfo, DataInputDeclaration } from "@volvel/widgets";
import { badRequest, forbidden, HttpError, notFound } from "../../errors.js";
import type { RequestContext } from "../../http.js";
import type { Kernel } from "../../kernel.js";
import { describeTable, findRows, type RowTarget, scopeFor, withData } from "../rows.js";
import { openSource, sourceTable } from "../sources.js";
import { type FilterValues, previousRange, rangeOf } from "./filters.js";
import { QueryRefused } from "./parse.js";
import { checkFor, QUERY_ROWS, type QueryResult, refusal, runQuery } from "./run.js";
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
  | {
      shape: "record";
      columns: ColumnInfo[];
      record: Record<string, unknown> | null;
      followed?: { names: string; now: string };
    };

/** How many rows a page of a rows input holds. */
export const ROWS_PAGE = 100;

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
}

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
  const offset = Number(Buffer.from(cursor, "base64url").toString("utf8"));
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
    return {
      name,
      label,
      type: one.referenceTable ? "reference" : one.type,
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
      const display =
        described.display && described.columns.some((one) => one.name === described.display)
          ? described.display
          : displayGuess(described.columns);
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
      throw forbidden("the data:read permission");
    }
    if ((visual.groupBy?.length ?? 0) > 0 || (visual.measures?.length ?? 0) > 0) {
      throw badRequest("Rows of a data source's table can be listed, not totalled.");
    }
    const source = await openSource(kernel, kernel.db, tenantId, workspaceId, sourcePath);
    const target: RowTarget = await sourceTable(source.db, source.schema, sourcePath, table);
    const extra = conditionsFor(input, filters, request.values);
    const conditions = [...(visual.filters ?? []), ...extra].map((one) =>
      one.op === "not_null"
        ? { column: one.column, op: "is_null", value: false }
        : {
            column: one.column,
            op: one.op,
            ...(one.value !== undefined ? { value: one.value } : {}),
          },
    );
    const sort = (visual.sort ?? []).map((one) => `${one.descending ? "-" : ""}${one.by}`);
    const page = await findRows(source.db, target, {
      ...(conditions.length > 0 ? { filter: { and: conditions } } : {}),
      sort,
      limit: Math.min(ROWS_PAGE, visual.limit ?? ROWS_PAGE),
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

  const out: Record<string, WireData> = {};
  for (const name of wanted) {
    const input = (widget.data as Record<string, DataInput>)[name] as DataInput;
    const declared: DataInputDeclaration | undefined = definition.data[name];
    if (!declared) throw badRequest(`${definition.title} takes no data called "${name}".`);
    if ("sql" in input.source && request.surface === "app") {
      throw badRequest("SQL is written on dashboards, not on an app's page.");
    }
    const place = `${request.follow?.page ? `${request.follow.page}/` : ""}${widget.id}/${name}`;
    const page = {
      filters: request.filters,
      values: request.values,
      catalog: catalog.visual,
      ...(request.follow ? { follow: { pageId: request.follow.pageId, place } } : {}),
    };
    const offset = decodeCursor(request.only?.input === name ? request.only.cursor : undefined);
    const visual = "visual" in input.source ? input.source.visual : undefined;

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
    const asked = await inputQuery(kernel, at, input, page, { shape: declared.shape });
    const size = declared.shape === "record" ? 1 : ROWS_PAGE;
    const result = await run(asked, { limit: size, offset });
    const rows = asRecords(result, asked.columns);
    const columns = visual
      ? visualColumns(visual, catalog, asked.columns ?? result.columns.map((one) => one.name))
      : resultColumns(result);
    if (declared.shape === "record") {
      out[name] = {
        shape: "record",
        columns,
        record: rows[0] ?? null,
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
      ...(Object.keys(pointed).length > 0 ? { names: pointed } : {}),
      ...(asked.followed ? { followed: asked.followed } : {}),
    };
  }
  return out;
}
