import {
  type ColumnType,
  type EnumValue,
  enumValues,
  isEnumType,
  type OnDelete,
  type TableBody,
  type TableColumn,
  type TablePolicy,
} from "@volvel/manifest";

/** One value of an enum column as the catalog keeps it: without where it was renamed from. */
export type KeptValue = Omit<EnumValue, "renamedFrom">;

export interface CatalogColumn {
  id: string;
  name: string;
  physicalName: string;
  type: string;
  required: boolean;
  unique: boolean;
  default: unknown;
  referenceTable: string | null;
  /** For a reference: what happens to the row when the one it points to is deleted. */
  onDelete?: OnDelete | null;
  /** For an enum: the values it has, and those it had and still allows in rows. */
  options?: { values?: KeptValue[]; retired?: string[] } | null;
  /** Names the column has had before its current one. */
  previousNames: string[];
  status: "active" | "retired";
}

export interface CatalogTable {
  id: string;
  /** The resource that declares it. None for a retired table. */
  resourceId?: string | null;
  name: string;
  physicalName: string;
  status: "active" | "retired";
  policy: TablePolicy;
  /** Paths the table has had before its current one. */
  previousNames: string[];
  /** The column that stands for a row where another table refers to it. */
  display?: string | null;
  columns: CatalogColumn[];
}

export interface NewColumn {
  name: string;
  physicalName: string;
  type: ColumnType;
  required: boolean;
  unique: boolean;
  default: unknown;
  referenceTable: string | null;
  onDelete: OnDelete | null;
  /** For an enum: its values. */
  values: KeptValue[] | null;
}

/** One change to make. The steps of a plan are applied in order, in one transaction. */
export type Step =
  | { op: "create_table"; name: string; physicalName: string; columns: NewColumn[] }
  | { op: "rename_table"; tableId: string; from: string; to: string }
  | { op: "restore_table"; tableId: string; name: string }
  | { op: "add_column"; table: string; column: NewColumn }
  | { op: "rename_column"; table: string; columnId: string; from: string; to: string }
  | { op: "restore_column"; table: string; columnId: string; name: string }
  | { op: "retire_column"; table: string; columnId: string; name: string }
  | { op: "widen_column"; table: string; columnId: string; name: string; to: ColumnType }
  | {
      op: "set_required";
      table: string;
      columnId: string;
      name: string;
      required: boolean;
      /**
       * The column is coming back from retirement. Rows written while it was
       * away have no value for it, and that must not stop it coming back.
       */
      restored?: true;
    }
  | { op: "set_unique"; table: string; columnId: string; name: string; unique: boolean }
  | { op: "set_default"; table: string; columnId: string; name: string; default: unknown }
  | { op: "set_reference"; table: string; columnId: string; name: string; referenceTable: string }
  | { op: "set_on_delete"; table: string; columnId: string; name: string; onDelete: OnDelete }
  | {
      op: "set_values";
      table: string;
      columnId: string;
      name: string;
      values: KeptValue[];
      /** Values spelled anew. Rows that hold the old spelling are rewritten. */
      renames: { from: string; to: string }[];
    }
  | {
      /** A text column becomes an enum, which it may when every row already holds one of the values. */
      op: "to_enum";
      table: string;
      columnId: string;
      name: string;
      values: KeptValue[];
    }
  | { op: "set_display"; table: string; display: string | null }
  | { op: "set_policy"; table: string; policy: TablePolicy };

export interface Plan {
  steps: Step[];
  /** Why the definition cannot be applied. When this is not empty, nothing is. */
  issues: { path: string; message: string }[];
}

/** Type changes that cannot lose anything. */
const WIDENINGS: Record<string, ColumnType[]> = {
  integer: ["number", "text"],
  number: ["text"],
  boolean: ["text"],
  uuid: ["text"],
  date: ["text"],
  timestamp: ["text"],
  // An enum is text that is held to a list, so letting go of the list loses nothing.
  enum: ["text"],
};

/** A name for a table inside the workspace's schema. */
export function physicalTableName(path: string, taken: Set<string>): string {
  const base = `t_${path.replaceAll("/", "__").replaceAll("-", "_")}`.slice(0, 54);
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  return name;
}

function physicalColumnName(name: string, taken: Set<string>): string {
  let physical = name;
  for (let n = 2; taken.has(physical); n++) physical = `${name}__${n}`;
  return physical;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function wanted(name: string, column: TableColumn, physicalName: string): NewColumn {
  return {
    name,
    physicalName,
    type: column.type,
    required: column.required ?? false,
    unique: column.unique ?? false,
    default: column.default ?? null,
    referenceTable: column.references ?? null,
    onDelete: column.type === "reference" ? (column.onDelete ?? "restrict") : null,
    values: isEnumType(column.type) ? kept(column.values) : null,
  };
}

const kept = (values: TableColumn["values"]): KeptValue[] =>
  enumValues(values).map(({ renamedFrom: _from, ...rest }) => rest);

/**
 * Works out what to change so that a workspace's table matches its
 * definition. It reads nothing and changes nothing: given the same catalog
 * and definition it always gives the same plan, and a definition that is
 * already in place gives an empty one.
 *
 * Nothing is ever dropped. What the definition no longer has is retired.
 */
export function planTable(
  catalog: CatalogTable[],
  name: string,
  body: TableBody,
  /** The resource that declares the table. Its table is its own, whatever its name is now. */
  resourceId?: string,
): Plan {
  const steps: Step[] = [];
  const issues: Plan["issues"] = [];
  const policy: TablePolicy = body.policy ?? { type: "open" };

  let table = catalog.find((candidate) => candidate.name === name && candidate.status === "active");
  if (!table && resourceId !== undefined) {
    // The resource was renamed: its table follows it, with its rows, and nothing need say so.
    const own = catalog.find(
      (candidate) => candidate.resourceId === resourceId && candidate.status === "active",
    );
    if (own) {
      steps.push({ op: "rename_table", tableId: own.id, from: own.name, to: name });
      table = own;
    }
  }
  if (!table && body.renamedFrom !== undefined) {
    // A table that was removed and then renamed in the same deploy is retired by now.
    const source = catalog.find((candidate) => candidate.name === body.renamedFrom);
    if (source) {
      steps.push({ op: "rename_table", tableId: source.id, from: source.name, to: name });
      if (source.status === "retired")
        steps.push({ op: "restore_table", tableId: source.id, name });
      table = source;
    }
  }
  if (!table) {
    // Going back to an older definition: a table that used to have this path gets it back.
    const former = catalog.find(
      (candidate) =>
        candidate.previousNames.includes(name) && !catalog.some((other) => other.name === name),
    );
    if (former) {
      steps.push({ op: "rename_table", tableId: former.id, from: former.name, to: name });
      if (former.status === "retired")
        steps.push({ op: "restore_table", tableId: former.id, name });
      table = former;
    }
  }
  if (!table) {
    const retired = catalog.find(
      (candidate) => candidate.name === name && candidate.status === "retired",
    );
    if (retired) {
      steps.push({ op: "restore_table", tableId: retired.id, name });
      table = retired;
    }
  }
  if (!table) {
    const physicalName = physicalTableName(
      name,
      new Set(catalog.map((candidate) => candidate.physicalName)),
    );
    const taken = new Set<string>(["id", "created_at", "updated_at"]);
    const columns = Object.entries(body.columns).map(([columnName, column]) => {
      const physical = physicalColumnName(columnName, taken);
      taken.add(physical);
      return wanted(columnName, column, physical);
    });
    steps.push({ op: "create_table", name, physicalName, columns });
    steps.push({ op: "set_policy", table: name, policy });
    if (body.display) steps.push({ op: "set_display", table: name, display: body.display });
    return { steps, issues };
  }

  const taken = new Set<string>([
    "id",
    "created_at",
    "updated_at",
    ...table.columns.map((column) => column.physicalName),
  ]);
  const kept = new Set<string>();
  const active = (columnName: string) =>
    table.columns.find((column) => column.name === columnName && column.status === "active");

  for (const [columnName, column] of Object.entries(body.columns)) {
    const at = `/body/columns/${columnName}`;
    const want = wanted(columnName, column, columnName);
    let current = active(columnName);

    if (!current && column.renamedFrom !== undefined) {
      const source = table.columns.find(
        (candidate) => candidate.name === column.renamedFrom && !kept.has(candidate.id),
      );
      if (source) {
        steps.push({
          op: "rename_column",
          table: name,
          columnId: source.id,
          from: source.name,
          to: columnName,
        });
        if (source.status === "retired") {
          steps.push({ op: "restore_column", table: name, columnId: source.id, name: columnName });
        }
        current = source;
      }
    }
    if (!current && !table.columns.some((candidate) => candidate.name === columnName)) {
      // Going back to an older definition: a column that used to have this name gets it back,
      // unless the definition still declares it under its newer name.
      const former = table.columns.find(
        (candidate) =>
          candidate.previousNames.includes(columnName) &&
          !kept.has(candidate.id) &&
          !(candidate.name in body.columns) &&
          candidate.type === column.type,
      );
      if (former) {
        steps.push({
          op: "rename_column",
          table: name,
          columnId: former.id,
          from: former.name,
          to: columnName,
        });
        if (former.status === "retired") {
          steps.push({ op: "restore_column", table: name, columnId: former.id, name: columnName });
        }
        current = former;
      }
    }
    if (!current) {
      // A retired column comes back with its data only if it is the same kind of thing.
      const retired = table.columns.find(
        (candidate) =>
          candidate.name === columnName &&
          candidate.status === "retired" &&
          candidate.type === column.type,
      );
      if (retired) {
        steps.push({ op: "restore_column", table: name, columnId: retired.id, name: columnName });
        current = retired;
      }
    }
    if (!current) {
      const physical = physicalColumnName(columnName, taken);
      taken.add(physical);
      steps.push({ op: "add_column", table: name, column: { ...want, physicalName: physical } });
      continue;
    }

    kept.add(current.id);
    const target = { table: name, columnId: current.id, name: columnName };
    if (current.type === "text" && want.type === "enum" && want.values) {
      // Allowed when the rows already hold nothing else, which only the rows can say.
      steps.push({ op: "to_enum", ...target, values: want.values });
    } else if (current.type !== want.type) {
      if (WIDENINGS[current.type]?.includes(want.type)) {
        steps.push({ op: "widen_column", ...target, to: want.type });
      } else {
        issues.push({
          path: `${at}/type`,
          message: `a ${current.type} column cannot become a ${want.type} column without risking its data. Add a new column and copy the values across in a script`,
        });
        continue;
      }
    }
    if (current.type === want.type && want.values && !same(current.options?.values, want.values)) {
      const known = new Set([
        ...(current.options?.values ?? []).map((one) => one.value),
        ...(current.options?.retired ?? []),
      ]);
      const now = new Set(want.values.map((one) => one.value));
      steps.push({
        op: "set_values",
        ...target,
        values: want.values,
        // A value the column had, spelled anew: not one it never had, and not one already renamed.
        renames: enumValues(column.values).flatMap((one) =>
          one.renamedFrom !== undefined && known.has(one.renamedFrom) && !now.has(one.renamedFrom)
            ? [{ from: one.renamedFrom, to: one.value }]
            : [],
        ),
      });
    }
    // A column that was retired lost its rules, so they are stated again when it comes back.
    const restored = current.status === "retired";
    if (!same(current.default, want.default))
      steps.push({ op: "set_default", ...target, default: want.default });
    if (current.required !== want.required || (restored && want.required)) {
      steps.push({
        op: "set_required",
        ...target,
        required: want.required,
        ...(restored ? { restored: true as const } : {}),
      });
    }
    if (current.unique !== want.unique || (restored && want.unique)) {
      steps.push({ op: "set_unique", ...target, unique: want.unique });
    }
    if (
      want.referenceTable !== null &&
      (current.referenceTable !== want.referenceTable || restored)
    ) {
      steps.push({ op: "set_reference", ...target, referenceTable: want.referenceTable });
    }
    if (want.onDelete !== null && (current.onDelete ?? "restrict") !== want.onDelete) {
      steps.push({ op: "set_on_delete", ...target, onDelete: want.onDelete });
    }
  }

  for (const column of table.columns) {
    if (column.status === "active" && !kept.has(column.id)) {
      steps.push({ op: "retire_column", table: name, columnId: column.id, name: column.name });
    }
  }
  if ((table.display ?? null) !== (body.display ?? null)) {
    steps.push({ op: "set_display", table: name, display: body.display ?? null });
  }
  // A table that comes back from retirement is given its policy again: while it was away
  // its policy may have been taken off, when it named a column that had gone.
  const restored = steps.some((step) => step.op === "restore_table");
  if (!same(table.policy, policy) || restored) {
    steps.push({ op: "set_policy", table: name, policy });
  }
  return { steps, issues };
}

/**
 * What a deploy did to a workspace's data, in words for the person who
 * deployed: the catalog before set against the catalog after.
 */
export function describeChanges(before: CatalogTable[], after: CatalogTable[]): string[] {
  const lines: string[] = [];
  const was = new Map(before.map((table) => [table.id, table]));
  for (const table of after) {
    const old = was.get(table.id);
    if (!old) {
      if (table.status === "active") lines.push(`Table ${table.name} created.`);
      continue;
    }
    if (old.name !== table.name) lines.push(`Table ${old.name} renamed to ${table.name}.`);
    if (old.status === "active" && table.status === "retired") {
      lines.push(`Table ${table.name} retired. Its rows are kept.`);
      continue;
    }
    if (old.status === "retired" && table.status === "active") {
      lines.push(`Table ${table.name} brought back, with its rows.`);
    }
    const columns = new Map(old.columns.map((column) => [column.id, column]));
    for (const column of table.columns) {
      const previous = columns.get(column.id);
      const at = `Table ${table.name}: column`;
      if (!previous) {
        if (column.status === "active") lines.push(`${at} ${column.name} added.`);
        continue;
      }
      if (previous.name !== column.name) {
        lines.push(`${at} ${previous.name} renamed to ${column.name}. Its values are kept.`);
      }
      if (previous.status === "active" && column.status === "retired") {
        lines.push(`${at} ${column.name} retired. Its values are kept.`);
      } else if (previous.status === "retired" && column.status === "active") {
        lines.push(`${at} ${column.name} brought back, with its values.`);
      }
      if (previous.type !== column.type) {
        lines.push(`${at} ${column.name} changed from ${previous.type} to ${column.type}.`);
      }
    }
  }
  return lines;
}
