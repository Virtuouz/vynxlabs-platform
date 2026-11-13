import { type ColumnType, SYSTEM_COLUMNS } from "./kinds.js";
import type { ManifestIssue } from "./registry.js";

export interface TableColumn {
  type: ColumnType;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
  references?: string;
  renamedFrom?: string;
}

/** When a row rule applies to a person, judged from one of the row's columns. */
export type RowCondition =
  /** Every row, for anyone who may use the table at all. */
  | { everyone: true }
  /** The column holds the person's own ID. */
  | { column: string; is: "principal" }
  /** The column names a group the person is in: its ID in a uuid column, its name in a text column. */
  | { column: string; in: "groups" }
  /** The column equals one of the person's attributes, such as the customer they belong to. */
  | { column: string; equals: { attribute: string } };

export interface RowRule {
  /** `read` lets a person see the row. `write` and `all` also let them add, change and delete it. */
  allow: "read" | "write" | "all";
  when: RowCondition;
}

/** The most rules one table may have. Each is a clause in every query on the table. */
export const MAX_ROW_RULES = 20;

export type TablePolicy =
  | { type: "open" }
  | { type: "owner"; column: string }
  | { type: "rules"; rules: RowRule[] };

/** The column a condition looks at, or nothing for `everyone`. */
export const conditionColumn = (when: RowCondition): string | undefined =>
  "column" in when ? when.column : undefined;

/** The body of a `table` manifest, version 1. */
export interface TableBody {
  description?: string;
  columns: Record<string, TableColumn>;
  policy?: TablePolicy;
  indexes?: string[][];
  renamedFrom?: string;
}

/** Whether a default can be stored in a column of this type. */
function defaultFits(type: ColumnType, value: unknown): boolean {
  switch (type) {
    case "text":
    case "uuid":
    case "timestamp":
    case "date":
      return typeof value === "string";
    case "integer":
      return Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "json":
      return true;
    default:
      return false;
  }
}

/** Checks a table's definition beyond what its JSON Schema can say. */
export function checkTable(body: TableBody): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const names = Object.keys(body.columns);
  for (const [name, column] of Object.entries(body.columns)) {
    const at = `/body/columns/${name}`;
    if ((SYSTEM_COLUMNS as readonly string[]).includes(name)) {
      issues.push({ path: at, message: `every table already has a column called "${name}"` });
    }
    if (column.type === "reference" && !column.references) {
      issues.push({
        path: `${at}/references`,
        message: "a reference must say which table it points to",
      });
    }
    if (column.type !== "reference" && column.references) {
      issues.push({
        path: `${at}/references`,
        message: `only a reference column points to a table, and this is a ${column.type}`,
      });
    }
    if (column.default !== undefined && !defaultFits(column.type, column.default)) {
      issues.push({
        path: `${at}/default`,
        message: `the default does not fit a ${column.type} column`,
      });
    }
    if (column.renamedFrom !== undefined) {
      if (column.renamedFrom === name) {
        issues.push({
          path: `${at}/renamedFrom`,
          message: "a column cannot be renamed from its own name",
        });
      } else if (names.includes(column.renamedFrom)) {
        issues.push({
          path: `${at}/renamedFrom`,
          message: `"${column.renamedFrom}" is still declared as a column, so it cannot also be this column's old name`,
        });
      }
    }
  }
  if (body.policy?.type === "owner") {
    const owner = body.columns[body.policy.column];
    if (!owner) {
      issues.push({
        path: "/body/policy/column",
        message: `there is no column "${body.policy.column}"`,
      });
    } else if (owner.type !== "uuid" && owner.type !== "text") {
      issues.push({
        path: "/body/policy/column",
        message: `the owner column must be a uuid or text column, and "${body.policy.column}" is a ${owner.type}`,
      });
    }
  }
  if (body.policy?.type === "rules") {
    body.policy.rules.forEach((rule, index) => {
      const name = conditionColumn(rule.when);
      if (name === undefined) return;
      const at = `/body/policy/rules/${index}/when/column`;
      const column = body.columns[name];
      if (!column) {
        issues.push({ path: at, message: `there is no column "${name}"` });
        return;
      }
      // Each is compared as text: a person's ID, a group's ID or name, an attribute's value.
      const fits =
        "equals" in rule.when
          ? ["text", "uuid", "integer"].includes(column.type)
          : ["text", "uuid"].includes(column.type);
      if (!fits) {
        issues.push({
          path: at,
          message: `a rule cannot compare the ${column.type} column "${name}": use a text or uuid column${"equals" in rule.when ? ", or an integer one" : ""}`,
        });
      }
    });
  }
  (body.indexes ?? []).forEach((columns, index) => {
    for (const column of columns) {
      if (!names.includes(column) && !(SYSTEM_COLUMNS as readonly string[]).includes(column)) {
        issues.push({ path: `/body/indexes/${index}`, message: `there is no column "${column}"` });
      }
    }
  });
  return issues;
}
