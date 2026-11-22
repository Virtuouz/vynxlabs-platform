import {
  conditionProblem,
  groupName,
  type LastValue,
  VISUAL_BUCKETS,
  VISUAL_FUNCTIONS,
  type VisualCondition,
  type VisualQuery,
} from "@volvel/manifest";
import { dayAfter, lastRange } from "./filters.js";

/**
 * Writes the SQL of a query built from menus. What it writes is one SELECT
 * over the workspace's tables by their paths, with every value a parameter,
 * and is then read and run as SQL someone typed is: `checkQuery` and
 * `runQuery` hold it to the same rules. Nothing here is trusted for being
 * written here.
 *
 * Every name in a visual query is looked up before it is written: a table or a
 * column the workspace does not have is refused, saying where.
 */

export class VisualRefused extends Error {
  /** A JSON pointer into the query. */
  readonly path: string;
  constructor(path: string, message: string) {
    super(message);
    this.name = "VisualRefused";
    this.path = path;
  }
}

/**
 * What a search adds: a row is kept when each word is found in at least one of the columns,
 * whatever case it is in. The words are the text typed, split at spaces.
 */
export interface SearchCondition {
  search: string;
  columns: string[];
}

/** A condition a page's filters add to a visual query. */
export type ExtraCondition = VisualCondition | SearchCondition;

const MAX_SEARCH_COLUMNS = 12;

export interface VisualTable {
  /** The table's columns by name, with what each holds and, for a reference, the table it points to. */
  columns: Map<string, { type: string; references: string | null }>;
}
/** The workspace's tables by path, as far as the caller may read them. */
export type VisualCatalog = Map<string, VisualTable>;

export interface CompiledVisual {
  sql: string;
  parameters: unknown[];
  /** The names of the result's columns, in order. */
  columns: string[];
}

const SYSTEM: [string, { type: string; references: string | null }][] = [
  ["id", { type: "uuid", references: null }],
  ["created_at", { type: "timestamp", references: null }],
  ["updated_at", { type: "timestamp", references: null }],
];

const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;
/** What a joined table goes by in the query: the reference column it was reached through. */
const joined = (via: string) => quoted(`j_${via}`);
const NUMERIC = new Set(["integer", "number"]);
const ORDERED = new Set(["integer", "number", "timestamp", "date", "text", "enum"]);
const TEMPORAL = new Set(["timestamp", "date"]);

export function compileVisual(
  query: VisualQuery,
  catalog: VisualCatalog,
  /** Conditions added by the dashboard's filters. */
  extra: ExtraCondition[] = [],
  /** What "today" is for a `last` condition; days are counted in UTC, as a page's relative ranges are. */
  today: Date = new Date(),
): CompiledVisual {
  const base = catalog.get(query.table);
  if (!base) {
    throw new VisualRefused("/table", `there is no table "${query.table}" you may read here`);
  }
  const columnsOf = (table: VisualTable) => new Map([...SYSTEM, ...table.columns]);
  const own = columnsOf(base);

  const joins = new Map<string, { table: string; columns: ReturnType<typeof columnsOf> }>();
  (query.joins ?? []).forEach((via, index) => {
    const column = own.get(via);
    if (!column?.references) {
      throw new VisualRefused(
        `/joins/${index}`,
        `"${via}" is not a column of ${query.table} that points to another table`,
      );
    }
    const target = catalog.get(column.references);
    if (!target) {
      throw new VisualRefused(
        `/joins/${index}`,
        `"${via}" points to ${column.references}, which you may not read here`,
      );
    }
    joins.set(via, { table: column.references, columns: columnsOf(target) });
  });

  /** A column as SQL, with what it holds: of the table itself, or of one it joins. */
  const column = (name: string, path: string) => {
    const [first, second] = name.split(".") as [string, string | undefined];
    if (second === undefined) {
      const found = own.get(first);
      if (!found) throw new VisualRefused(path, `${query.table} has no column "${first}"`);
      return { sql: `t.${quoted(first)}`, type: found.type };
    }
    const through = joins.get(first);
    if (!through) {
      throw new VisualRefused(
        path,
        `"${name}" needs the query to follow "${first}", which is not among its joins`,
      );
    }
    const found = through.columns.get(second);
    if (!found) throw new VisualRefused(path, `${through.table} has no column "${second}"`);
    return { sql: `${joined(first)}.${quoted(second)}`, type: found.type };
  };

  const parameters: unknown[] = [];
  const bind = (value: unknown) => {
    parameters.push(value);
    return `$${parameters.length}`;
  };

  const condition = (one: VisualCondition, path: string): string => {
    const at = column(one.column, `${path}/column`);
    if (one.op === "is_null") return `${at.sql} is null`;
    if (one.op === "not_null") return `${at.sql} is not null`;
    if (one.value === undefined || one.value === null) {
      throw new VisualRefused(`${path}/value`, `"${one.op}" needs a value to compare with`);
    }
    if (one.op === "in") {
      if (!Array.isArray(one.value) || one.value.length === 0 || one.value.length > 200) {
        throw new VisualRefused(`${path}/value`, `"in" needs a list of 1 to 200 values`);
      }
      // Compared as text, so one list serves a column of any kind.
      return `${at.sql}::text = any (${bind(one.value.map(String))}::text[])`;
    }
    if (one.op === "contains") {
      if (typeof one.value !== "string") {
        throw new VisualRefused(`${path}/value`, `"contains" needs text to look for`);
      }
      return `${at.sql}::text ilike ${bind(`%${one.value.replace(/[\\%_]/g, "\\$&")}%`)}`;
    }
    if (one.op === "last" || one.op === "between") {
      const problem = conditionProblem(one, at.type);
      if (problem) throw new VisualRefused(`${path}/value`, problem);
      if (one.op === "last") {
        const { count, unit } = one.value as LastValue;
        const range = lastRange(count, unit, today);
        return `(${at.sql} >= ${bind(range.from)}::date and ${at.sql} < ${bind(dayAfter(range.to))}::date)`;
      }
      const [from, to] = one.value as [string | number, string | number];
      if (typeof from === "number")
        return `(${at.sql} >= ${bind(from)} and ${at.sql} <= ${bind(to)})`;
      return `(${at.sql} >= ${bind(from)}::date and ${at.sql} < ${bind(dayAfter(to as string))}::date)`;
    }
    if (at.type === "json" || at.type === "file" || at.type === "enum_list") {
      throw new VisualRefused(
        `${path}/op`,
        `a ${at.type} column can only be tested for being empty or not`,
      );
    }
    const operator = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[one.op];
    if (!operator) throw new VisualRefused(`${path}/op`, `there is no operator "${one.op}"`);
    if (operator !== "=" && operator !== "<>" && !ORDERED.has(at.type)) {
      throw new VisualRefused(`${path}/op`, `a ${at.type} column has no order to compare by`);
    }
    if (typeof one.value === "object") {
      throw new VisualRefused(`${path}/value`, "needs one value: text, a number, or true or false");
    }
    return `${at.sql} ${operator} ${bind(one.value)}`;
  };

  /** A search: every word is found in one of the columns, compared as text. */
  const search = (one: SearchCondition, path: string): string[] => {
    const words = one.search.split(/\s+/).filter((word) => word !== "");
    if (words.length === 0) return [];
    if (one.columns.length === 0 || one.columns.length > MAX_SEARCH_COLUMNS) {
      throw new VisualRefused(
        `${path}/columns`,
        `a search looks in 1 to ${MAX_SEARCH_COLUMNS} columns`,
      );
    }
    const looked = one.columns.map((name, index) => column(name, `${path}/columns/${index}`));
    return words.map((word) => {
      const bound = bind(`%${word.replace(/[\\%_]/g, "\\$&")}%`);
      return `(${looked.map((at) => `${at.sql}::text ilike ${bound}`).join(" or ")})`;
    });
  };

  const where = [
    ...(query.filters ?? []).map((one, index) => condition(one, `/filters/${index}`)),
    ...extra.flatMap((one, index) =>
      "search" in one
        ? search(one, `/dashboardFilters/${index}`)
        : [condition(one, `/dashboardFilters/${index}`)],
    ),
  ];

  const selected: { sql: string; name: string }[] = [];
  const groups: string[] = [];
  (query.groupBy ?? []).forEach((group, index) => {
    const at = column(group.column, `/groupBy/${index}/column`);
    if (at.type === "json" || at.type === "file" || at.type === "enum_list") {
      throw new VisualRefused(
        `/groupBy/${index}/column`,
        `rows cannot be gathered by a ${at.type}`,
      );
    }
    let expression = at.sql;
    if (group.bucket !== undefined) {
      if (!(VISUAL_BUCKETS as readonly string[]).includes(group.bucket)) {
        throw new VisualRefused(`/groupBy/${index}/bucket`, `there is no period "${group.bucket}"`);
      }
      if (!TEMPORAL.has(at.type)) {
        throw new VisualRefused(
          `/groupBy/${index}/bucket`,
          `only a date or a time is gathered into periods, and "${group.column}" is a ${at.type}`,
        );
      }
      // A day at the least, as a date: a period has no time of day.
      expression = `date_trunc('${group.bucket}', ${at.sql})::date`;
    }
    groups.push(expression);
    selected.push({ sql: expression, name: groupName(group) });
  });

  const measures = query.measures ?? [];
  measures.forEach((measure, index) => {
    const path = `/measures/${index}`;
    if (!(VISUAL_FUNCTIONS as readonly string[]).includes(measure.fn)) {
      throw new VisualRefused(`${path}/fn`, `there is no "${measure.fn}"`);
    }
    if (measure.column === undefined) {
      if (measure.fn !== "count") throw new VisualRefused(path, `${measure.fn} is of a column`);
      selected.push({ sql: "count(*)", name: measure.as });
      return;
    }
    const at = column(measure.column, `${path}/column`);
    if ((measure.fn === "sum" || measure.fn === "avg") && !NUMERIC.has(at.type)) {
      throw new VisualRefused(
        `${path}/column`,
        `${measure.fn} is of a number, and "${measure.column}" is a ${at.type}`,
      );
    }
    if ((measure.fn === "min" || measure.fn === "max") && !ORDERED.has(at.type)) {
      throw new VisualRefused(`${path}/column`, `a ${at.type} column has no least or most`);
    }
    const call =
      measure.fn === "count_distinct"
        ? `count(distinct ${at.sql})`
        : // An average of whole numbers is a number with a fraction, and no more digits than can be read.
          measure.fn === "avg"
          ? `round(avg(${at.sql})::numeric, 4)`
          : `${measure.fn}(${at.sql})`;
    selected.push({ sql: call, name: measure.as });
  });

  if (selected.length === 0) {
    const shown =
      query.columns && query.columns.length > 0
        ? query.columns
        : ["id", ...[...base.columns.keys()]];
    shown.forEach((name, index) => {
      const at = column(name, `/columns/${index}`);
      selected.push({ sql: at.sql, name: name.replace(".", "_") });
    });
  }

  const names = selected.map((one) => one.name);
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice)
    throw new VisualRefused("/measures", `two columns of the result are called "${twice}"`);

  const order = (query.sort ?? []).map((one, index) => {
    // By a name of the result, or by a column written as the query writes its groups.
    const name = names.includes(one.by) ? one.by : one.by.replace(".", "_");
    const direction = `${one.descending ? "desc" : "asc"} nulls last`;
    if (names.includes(name)) return `${quoted(name)} ${direction}`;
    // Rows, not totals, may be put in the order of any column of their table, shown or not:
    // the newest first is by when each was made.
    const rows = (query.groupBy?.length ?? 0) === 0 && (query.measures?.length ?? 0) === 0;
    if (rows) return `${column(one.by, `/sort/${index}/by`).sql} ${direction}`;
    throw new VisualRefused(`/sort/${index}/by`, `the result has no column "${one.by}"`);
  });
  // Groups with no order asked for come in their own order, so a chart reads left to right.
  if (order.length === 0 && groups.length > 0) {
    order.push(...groups.map((_, index) => `${index + 1} asc nulls last`));
  }

  const from = [
    `${quoted(query.table)} as t`,
    ...[...joins.entries()].map(
      ([via, target]) =>
        `left join ${quoted(target.table)} as ${joined(via)} on ${joined(via)}.id = t.${quoted(via)}`,
    ),
  ].join(" ");
  const sql = [
    `select ${selected.map((one) => `${one.sql} as ${quoted(one.name)}`).join(", ")}`,
    `from ${from}`,
    where.length > 0 ? `where ${where.join(" and ")}` : "",
    groups.length > 0 ? `group by ${groups.join(", ")}` : "",
    order.length > 0 ? `order by ${order.join(", ")}` : "",
    query.limit ? `limit ${Math.min(Math.max(Math.trunc(query.limit), 1), 10_000)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { sql, parameters, columns: names };
}
