import { deparse, parse } from "pgsql-parser";
import { ALLOWED_FUNCTIONS, ALLOWED_TYPES } from "./allowed.js";

/**
 * Reads SQL that someone typed and says whether it may run (Decision 0003,
 * guards 1 and 2). The text is parsed by Postgres's own parser, the tree is
 * walked, and the SQL that runs is written again from the tree: only what was
 * found and allowed reaches the database, never the text as typed.
 *
 * What is allowed is listed, and anything else is refused: one `SELECT`, over
 * this workspace's tables and the names the query defines itself, calling
 * functions on the list. A kind of node this file does not know is refused.
 */

/** Why a query may not run, and where in its text. */
export class QueryRefused extends Error {
  /** Counted from 1. Absent when the reason is about the query as a whole. */
  readonly line?: number;
  readonly column?: number;
  constructor(message: string, at?: { line: number; column: number }) {
    super(message);
    this.name = "QueryRefused";
    if (at) {
      this.line = at.line;
      this.column = at.column;
    }
  }
}

export interface CheckedQuery {
  /** The query written again from its tree, reading the workspace's views. */
  sql: string;
  /** The paths of the tables it reads, each of which the caller must be allowed to read. */
  tables: string[];
  /** How many parameters it takes: the highest `$n` it uses. */
  parameters: number;
}

export interface QueryScope {
  /** The schema that holds the workspace's views, one for each table. */
  schema: string;
  /** The paths of the workspace's tables. */
  tables: ReadonlySet<string>;
  /**
   * Take any name for a table, as when a query is checked before the tables it
   * names are in place. What is written again is then for reading, not running.
   */
  anyTable?: boolean;
}

type Node = Record<string, unknown>;
const isObject = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A node as the parser writes one: an object whose only key is the node's kind. */
function kindOf(value: Node): string | undefined {
  const keys = Object.keys(value);
  return keys.length === 1 && /^[A-Z]/.test(keys[0] as string) ? keys[0] : undefined;
}

/**
 * The kinds of node a query may be made of. Statements other than `SELECT`,
 * locking, sampling, XML, the SQL/JSON constructors and anything newer than
 * this list are not on it.
 */
const ALLOWED_NODES = new Set([
  "SelectStmt",
  "ResTarget",
  "ColumnRef",
  "A_Star",
  "A_Const",
  "A_Expr",
  "A_ArrayExpr",
  "A_Indirection",
  "A_Indices",
  "BoolExpr",
  "NullTest",
  "BooleanTest",
  "CaseExpr",
  "CaseWhen",
  "CoalesceExpr",
  "MinMaxExpr",
  "NullIfExpr",
  "RowExpr",
  "SubLink",
  "TypeCast",
  "TypeName",
  "FuncCall",
  "NamedArgExpr",
  "WindowDef",
  "SortBy",
  "GroupingSet",
  "RangeVar",
  "RangeSubselect",
  "RangeFunction",
  "JoinExpr",
  "Alias",
  "WithClause",
  "CommonTableExpr",
  "ParamRef",
  "SQLValueFunction",
  "CollateClause",
  "List",
  "String",
  "Integer",
  "Float",
  "Boolean",
  "BitString",
]);

/** Fields that hold a node written without its kind around it, and the kind it is. */
const BARE: Record<string, string> = {
  larg: "SelectStmt",
  rarg: "SelectStmt",
  withClause: "WithClause",
  typeName: "TypeName",
  over: "WindowDef",
  alias: "Alias",
  join_using_alias: "Alias",
};

/** Fields whose presence alone refuses the query, with what to say. */
const REFUSED_FIELDS: Record<string, string> = {
  intoClause: "SELECT … INTO makes a table. A query only reads.",
  lockingClause: "FOR UPDATE and FOR SHARE lock rows. A query only reads.",
  coldeflist: "A function that returns a record with a column list is not supported.",
  search_clause: "SEARCH is not supported in a WITH query.",
  cycle_clause: "CYCLE is not supported in a WITH query.",
};

const SYSTEM_COLUMNS = new Set(["ctid", "xmin", "xmax", "cmin", "cmax", "tableoid"]);

/** The date and time keywords that are functions with no brackets. The rest name roles and schemas. */
const ALLOWED_VALUE_FUNCTIONS =
  /^SVFOP_(CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP|LOCALTIME|LOCALTIMESTAMP)(_N)?$/;

const text = (value: unknown): string | undefined =>
  isObject(value) && isObject(value.String) && typeof value.String.sval === "string"
    ? value.String.sval
    : undefined;

class Walk {
  readonly tables = new Set<string>();
  parameters = 0;
  readonly #source: string;
  readonly #scope: QueryScope;

  constructor(source: string, scope: QueryScope) {
    this.#source = source;
    this.#scope = scope;
  }

  refuse(message: string, node?: Node): never {
    const offset = typeof node?.location === "number" ? node.location : undefined;
    if (offset === undefined || offset < 0) throw new QueryRefused(message);
    // The parser counts bytes; the text is counted the same way before it is cut.
    const before = Buffer.from(this.#source, "utf8").subarray(0, offset).toString("utf8");
    const lines = before.split("\n");
    throw new QueryRefused(message, {
      line: lines.length,
      column: (lines.at(-1)?.length ?? 0) + 1,
    });
  }

  /** A value somewhere in the tree: a node, a list of them, a bare node under a known field, or plain data. */
  value(value: unknown, defined: ReadonlySet<string>, field?: string): void {
    if (Array.isArray(value)) {
      for (const one of value) this.value(one, defined);
      return;
    }
    if (!isObject(value)) return;
    // The parser writes "nothing here" as an object with nothing in it.
    if (Object.keys(value).length === 0) return;
    const kind = kindOf(value);
    if (kind) {
      this.node(kind, value[kind] as Node, defined);
      return;
    }
    const bare = field ? BARE[field] : undefined;
    if (!bare) {
      this.refuse(`This is not supported in a query${field ? ` (${field})` : ""}.`, value);
    }
    this.node(bare, value, defined);
  }

  node(kind: string, body: Node, defined: ReadonlySet<string>): void {
    if (!ALLOWED_NODES.has(kind)) {
      if (kind.endsWith("Stmt")) {
        this.refuse("Only SELECT is allowed. A query reads, and changes nothing.", body);
      }
      if (kind === "RangeTableSample") this.refuse("TABLESAMPLE is not supported.", body);
      this.refuse(`${kind.replace(/([a-z])([A-Z])/g, "$1 $2")} is not supported in a query.`, body);
    }
    for (const [field, why] of Object.entries(REFUSED_FIELDS)) {
      const held = body[field];
      if (held !== undefined && !(Array.isArray(held) && held.length === 0)) {
        this.refuse(why, body);
      }
    }
    switch (kind) {
      case "SelectStmt":
        this.select(body, defined);
        return;
      case "RangeVar":
        this.relation(body, defined);
        break;
      case "FuncCall":
        this.call(body);
        break;
      case "TypeName":
        this.type(body);
        break;
      case "ColumnRef": {
        const fields = Array.isArray(body.fields) ? body.fields : [];
        const last = text(fields.at(-1));
        if (last && SYSTEM_COLUMNS.has(last.toLowerCase())) {
          this.refuse(`"${last}" is a system column, which a query may not read.`, body);
        }
        break;
      }
      case "A_Expr": {
        // An operator named with a schema, as OPERATOR(pg_catalog.+), is Postgres's own or nothing.
        const names = (Array.isArray(body.name) ? body.name : []).map(text);
        if (names.length > 1 && names[0] !== "pg_catalog") {
          this.refuse("An operator may not be named with a schema.", body);
        }
        break;
      }
      case "SQLValueFunction":
        if (!ALLOWED_VALUE_FUNCTIONS.test(String(body.op))) {
          this.refuse(
            "Only the date and time keywords are allowed here, such as CURRENT_DATE. Who is asking is not something a query reads.",
            body,
          );
        }
        break;
      case "ParamRef": {
        const number = typeof body.number === "number" ? body.number : 0;
        if (number < 1) this.refuse("A parameter is written $1, $2 and so on.", body);
        this.parameters = Math.max(this.parameters, number);
        break;
      }
      case "A_Const":
        // A constant holds its value as plain data, which is nothing to walk.
        return;
      default:
        break;
    }
    for (const [field, held] of Object.entries(body)) this.value(held, defined, field);
  }

  /** A SELECT, with the names its WITH defines visible where SQL makes them visible. */
  select(body: Node, outer: ReadonlySet<string>): void {
    let defined = outer;
    const withClause = body.withClause;
    if (isObject(withClause)) {
      const recursive = withClause.recursive === true;
      const seen = new Set(outer);
      for (const one of Array.isArray(withClause.ctes) ? withClause.ctes : []) {
        const cte =
          isObject(one) && isObject(one.CommonTableExpr) ? one.CommonTableExpr : undefined;
        if (!cte) this.refuse("This WITH query is not supported.", withClause);
        const name = String(cte.ctename ?? "");
        // A query sees the ones before it, and itself only when the WITH is RECURSIVE. Anywhere
        // else its name would be a table's, so it must not be taken for one the query defined.
        const inside = new Set(seen);
        if (recursive) inside.add(name);
        this.node("CommonTableExpr", cte, inside);
        seen.add(name);
      }
      defined = seen;
    }
    for (const [field, held] of Object.entries(body)) {
      if (field === "withClause") continue;
      this.value(held, defined, field);
    }
  }

  /** A name in FROM: one the query defined, or a table of this workspace, which is then read through its view. */
  relation(body: Node, defined: ReadonlySet<string>): void {
    const name = String(body.relname ?? "");
    if (body.catalogname || body.schemaname) {
      this.refuse(
        `A table is named by its path alone, such as "${name}". A schema may not be named.`,
        body,
      );
    }
    if (defined.has(name)) return;
    if (!this.#scope.tables.has(name) && !this.#scope.anyTable) {
      this.refuse(
        `There is no table "${name}" in this workspace. A table is named by its path, in double quotes when it has a "/" or a "-".`,
        body,
      );
    }
    this.tables.add(name);
    // The view has the table's name, so the rest of the query calls it what it wrote.
    body.schemaname = this.#scope.schema;
  }

  call(body: Node): void {
    const names = (Array.isArray(body.funcname) ? body.funcname : []).map(text);
    const name = names.at(-1)?.toLowerCase();
    if (!name || names.length > 2 || (names.length === 2 && names[0] !== "pg_catalog")) {
      this.refuse("A function may not be named with a schema.", body);
    }
    if (!ALLOWED_FUNCTIONS.has(name)) {
      this.refuse(
        `The function ${name}() is not one a query may call. Aggregates, window functions and the functions for numbers, text, dates, arrays and JSON are.`,
        body,
      );
    }
  }

  type(body: Node): void {
    const names = (Array.isArray(body.names) ? body.names : []).map(text);
    const name = names.at(-1)?.toLowerCase();
    if (!name || names.length > 2 || (names.length === 2 && names[0] !== "pg_catalog")) {
      this.refuse("A type may not be named with a schema.", body);
    }
    if (!ALLOWED_TYPES.has(name)) {
      this.refuse(`A value may not be cast to ${name}.`, body);
    }
  }
}

/** Checks a query and writes it again to read the workspace's views. Throws `QueryRefused`. */
export async function checkQuery(source: string, scope: QueryScope): Promise<CheckedQuery> {
  if (source.trim() === "") throw new QueryRefused("There is no query.");
  let tree: { stmts?: { stmt?: Node }[] };
  try {
    tree = (await parse(source)) as { stmts?: { stmt?: Node }[] };
  } catch (error) {
    const position = (error as { sqlDetails?: { cursorPosition?: number } }).sqlDetails
      ?.cursorPosition;
    // The parser's position counts from 1, in characters.
    return new Walk(source, scope).refuse(
      (error as Error).message,
      typeof position === "number" && position > 0
        ? { location: Buffer.byteLength(source.slice(0, position - 1), "utf8") }
        : undefined,
    );
  }
  const statements = tree.stmts ?? [];
  if (statements.length !== 1) {
    throw new QueryRefused(
      statements.length === 0 ? "There is no query." : "One query at a time: this holds several.",
    );
  }
  const statement = statements[0]?.stmt;
  const walk = new Walk(source, scope);
  if (!isObject(statement) || kindOf(statement) !== "SelectStmt") {
    walk.refuse("Only SELECT is allowed. A query reads, and changes nothing.");
  }
  walk.value(statement, new Set());
  return {
    sql: await deparse(tree as Parameters<typeof deparse>[0]),
    tables: [...walk.tables].sort(),
    parameters: walk.parameters,
  };
}
