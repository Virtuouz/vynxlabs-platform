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

export type TablePolicy = { type: "open" } | { type: "owner"; column: string };

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
  (body.indexes ?? []).forEach((columns, index) => {
    for (const column of columns) {
      if (!names.includes(column) && !(SYSTEM_COLUMNS as readonly string[]).includes(column)) {
        issues.push({ path: `/body/indexes/${index}`, message: `there is no column "${column}"` });
      }
    }
  });
  return issues;
}
