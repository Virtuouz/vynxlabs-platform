import type { TableBody } from "@vynxlabs/manifest";
import { describe, expect, test } from "vitest";
import { type CatalogTable, type Plan, planTable, type Step } from "./plan.js";

/** Applies a plan to a catalog the way the database would, so plans can be chained. */
function apply(catalog: CatalogTable[], plan: Plan): CatalogTable[] {
  const next: CatalogTable[] = structuredClone(catalog);
  const table = (name: string) =>
    next.find((t) => t.name === name && t.status === "active") as CatalogTable;
  let ids = next.flatMap((t) => t.columns).length + next.length;
  const id = () => `id-${++ids}`;
  for (const step of plan.steps) {
    switch (step.op) {
      case "create_table":
        next.push({
          id: id(),
          name: step.name,
          physicalName: step.physicalName,
          status: "active",
          policy: { type: "open" },
          previousNames: [],
          columns: step.columns.map((c) => ({
            id: id(),
            ...c,
            previousNames: [],
            status: "active" as const,
          })),
        });
        break;
      case "rename_table": {
        const renamed = next.find((t) => t.id === step.tableId) as CatalogTable;
        renamed.previousNames = [...renamed.previousNames.filter((n) => n !== step.to), step.from];
        renamed.name = step.to;
        break;
      }
      case "restore_table":
        (next.find((t) => t.id === step.tableId) as CatalogTable).status = "active";
        break;
      case "add_column":
        table(step.table).columns.push({
          id: id(),
          ...step.column,
          previousNames: [],
          status: "active",
        });
        break;
      case "set_policy":
        table(step.table).policy = step.policy;
        break;
      default: {
        const column = table(step.table).columns.find((c) => c.id === step.columnId);
        if (!column) throw new Error("no such column");
        if (step.op === "rename_column") {
          column.previousNames = [...column.previousNames.filter((n) => n !== step.to), step.from];
          column.name = step.to;
        }
        if (step.op === "restore_column") column.status = "active";
        if (step.op === "retire_column")
          Object.assign(column, { status: "retired", required: false, unique: false });
        if (step.op === "widen_column") column.type = step.to;
        if (step.op === "set_required") column.required = step.required;
        if (step.op === "set_unique") column.unique = step.unique;
        if (step.op === "set_default") column.default = step.default;
        if (step.op === "set_reference") column.referenceTable = step.referenceTable;
      }
    }
  }
  return next;
}
const ops = (plan: Plan) => plan.steps.map((step: Step) => step.op);
const retire = (catalog: CatalogTable[], name: string) =>
  catalog.map((t) => (t.name === name ? { ...t, status: "retired" as const } : t));

const v1: TableBody = {
  columns: {
    number: { type: "text", required: true, unique: true },
    total: { type: "integer" },
    customer: { type: "text" },
  },
};
const start = () => apply([], planTable([], "orders", v1));

describe("planning a table", () => {
  test("a new table is created with its columns and its policy", () => {
    const plan = planTable([], "crm/orders", {
      ...v1,
      policy: { type: "owner", column: "customer" },
    });
    expect(plan.issues).toEqual([]);
    expect(plan.steps).toEqual([
      {
        op: "create_table",
        name: "crm/orders",
        physicalName: "t_crm__orders",
        columns: [
          {
            name: "number",
            physicalName: "number",
            type: "text",
            required: true,
            unique: true,
            default: null,
            referenceTable: null,
          },
          {
            name: "total",
            physicalName: "total",
            type: "integer",
            required: false,
            unique: false,
            default: null,
            referenceTable: null,
          },
          {
            name: "customer",
            physicalName: "customer",
            type: "text",
            required: false,
            unique: false,
            default: null,
            referenceTable: null,
          },
        ],
      },
      { op: "set_policy", table: "crm/orders", policy: { type: "owner", column: "customer" } },
    ]);
  });

  test("a definition that is already in place needs nothing", () => {
    expect(planTable(start(), "orders", v1)).toEqual({ steps: [], issues: [] });
  });

  test("two tables whose paths would collide get different names in the database", () => {
    const first = apply([], planTable([], "a-b", v1));
    const second = planTable(first, "a_b", v1);
    expect(first[0]?.physicalName).toBe("t_a_b");
    expect(second.steps[0]).toMatchObject({ op: "create_table", physicalName: "t_a_b_2" });
  });

  test("a new column is added, and one no longer declared is retired, never dropped", () => {
    const plan = planTable(start(), "orders", {
      columns: {
        number: v1.columns.number as never,
        total: { type: "integer" },
        currency: { type: "text", default: "USD" },
      },
    });
    expect(plan.steps).toEqual([
      {
        op: "add_column",
        table: "orders",
        column: {
          name: "currency",
          physicalName: "currency",
          type: "text",
          required: false,
          unique: false,
          default: "USD",
          referenceTable: null,
        },
      },
      { op: "retire_column", table: "orders", columnId: expect.any(String), name: "customer" },
    ]);
  });

  test("a rename is a rename, not a drop and an add", () => {
    const renamed: TableBody = {
      columns: {
        number: v1.columns.number as never,
        amount: { type: "integer", renamedFrom: "total" },
        customer: { type: "text" },
      },
    };
    const plan = planTable(start(), "orders", renamed);
    expect(plan.steps).toEqual([
      {
        op: "rename_column",
        table: "orders",
        columnId: expect.any(String),
        from: "total",
        to: "amount",
      },
    ]);
    // Once applied, the same definition asks for nothing more, even though it still says renamedFrom.
    expect(planTable(apply(start(), plan), "orders", renamed).steps).toEqual([]);
  });

  test("going back to the older definition renames the column back, so its values are where they were", () => {
    const renamed: TableBody = {
      columns: {
        number: v1.columns.number as never,
        amount: { type: "integer", renamedFrom: "total" },
        customer: { type: "text" },
      },
    };
    const forward = apply(start(), planTable(start(), "orders", renamed));
    const back = planTable(forward, "orders", v1);
    expect(back.steps).toEqual([
      {
        op: "rename_column",
        table: "orders",
        columnId: expect.any(String),
        from: "amount",
        to: "total",
      },
    ]);
    const rolledBack = apply(forward, back);
    expect(planTable(rolledBack, "orders", v1).steps).toEqual([]);
    // And forward again is a rename again.
    expect(ops(planTable(rolledBack, "orders", renamed))).toEqual(["rename_column"]);
  });

  test("without renamedFrom, a new name is a new column and the old one is retired", () => {
    const plan = planTable(start(), "orders", {
      columns: {
        number: v1.columns.number as never,
        amount: { type: "integer" },
        customer: { type: "text" },
      },
    });
    expect(ops(plan)).toEqual(["add_column", "retire_column"]);
  });

  test("a retired column comes back with its data when it is declared again with the same type", () => {
    const without: TableBody = {
      columns: { number: v1.columns.number as never, total: { type: "integer" } },
    };
    const retired = apply(start(), planTable(start(), "orders", without));
    const back = planTable(retired, "orders", v1);
    expect(back.steps).toEqual([
      { op: "restore_column", table: "orders", columnId: expect.any(String), name: "customer" },
    ]);
    expect(planTable(apply(retired, back), "orders", v1).steps).toEqual([]);
  });

  test("a retired column declared again with another type is a new column beside the old one", () => {
    const without: TableBody = {
      columns: { number: v1.columns.number as never, total: { type: "integer" } },
    };
    const retired = apply(start(), planTable(start(), "orders", without));
    const plan = planTable(retired, "orders", {
      columns: { ...without.columns, customer: { type: "uuid" } },
    });
    expect(plan.steps).toEqual([
      {
        op: "add_column",
        table: "orders",
        column: expect.objectContaining({
          name: "customer",
          physicalName: "customer__2",
          type: "uuid",
        }),
      },
    ]);
  });

  test("a required, unique column that was retired gets its rules back when restored", () => {
    const without: TableBody = {
      columns: { total: { type: "integer" }, customer: { type: "text" } },
    };
    const retired = apply(start(), planTable(start(), "orders", without));
    expect(ops(planTable(retired, "orders", v1))).toEqual([
      "restore_column",
      "set_required",
      "set_unique",
    ]);
    // The step says the column is coming back, so that rows written meanwhile do not stop it.
    expect(
      planTable(retired, "orders", v1).steps.find((step) => step.op === "set_required"),
    ).toMatchObject({ required: true, restored: true });
    const optional = apply(
      start(),
      planTable(start(), "orders", {
        columns: { ...v1.columns, total: { type: "integer" } },
      }),
    );
    expect(
      planTable(optional, "orders", {
        columns: { ...v1.columns, total: { type: "integer", required: true } },
      }).steps,
    ).toEqual([expect.not.objectContaining({ restored: true })]);
  });

  test("a type is widened in place when nothing can be lost, and refused otherwise", () => {
    const widened = planTable(start(), "orders", {
      columns: { ...v1.columns, total: { type: "number" } },
    });
    expect(widened.steps).toEqual([
      {
        op: "widen_column",
        table: "orders",
        columnId: expect.any(String),
        name: "total",
        to: "number",
      },
    ]);
    expect(
      ops(planTable(start(), "orders", { columns: { ...v1.columns, total: { type: "text" } } })),
    ).toEqual(["widen_column"]);

    const narrowed = planTable(start(), "orders", {
      columns: { ...v1.columns, customer: { type: "integer" } },
    });
    expect(narrowed.steps).toEqual([]);
    expect(narrowed.issues).toEqual([
      {
        path: "/body/columns/customer/type",
        message:
          "a text column cannot become a integer column without risking its data. Add a new column and copy the values across in a script",
      },
    ]);
  });

  test("changes to required, unique, default, reference and policy are each their own step", () => {
    const plan = planTable(start(), "orders", {
      columns: {
        number: { type: "text" },
        total: { type: "integer", required: true, default: 0 },
        customer: { type: "text", unique: true },
      },
      policy: { type: "owner", column: "customer" },
    });
    expect(plan.steps.map((step) => [step.op, "name" in step ? step.name : ""])).toEqual([
      ["set_required", "number"],
      ["set_unique", "number"],
      ["set_default", "total"],
      ["set_required", "total"],
      ["set_unique", "customer"],
      ["set_policy", ""],
    ]);
    const withReference = planTable(start(), "orders", {
      columns: { ...v1.columns, parent: { type: "reference", references: "orders" } },
    });
    expect(withReference.steps[0]).toMatchObject({
      op: "add_column",
      column: { type: "reference", referenceTable: "orders" },
    });
  });
});

describe("planning across tables", () => {
  test("a table is renamed with its data, whether or not the deploy retired the old path first", () => {
    const renamed: TableBody = { ...v1, renamedFrom: "orders" };
    expect(planTable(start(), "sales/orders", renamed).steps).toEqual([
      { op: "rename_table", tableId: expect.any(String), from: "orders", to: "sales/orders" },
    ]);
    const plan = planTable(retire(start(), "orders"), "sales/orders", renamed);
    expect(ops(plan)).toEqual(["rename_table", "restore_table"]);
    expect(
      planTable(apply(retire(start(), "orders"), plan), "sales/orders", renamed).steps,
    ).toEqual([]);
  });

  test("going back to the older definition gives a renamed table its old path back", () => {
    const forward = apply(
      start(),
      planTable(start(), "sales/orders", { ...v1, renamedFrom: "orders" }),
    );
    // The rollback deploy removes the new path first, which retires the table, then applies the old one.
    const back = planTable(retire(forward, "sales/orders"), "orders", v1);
    expect(ops(back)).toEqual(["rename_table", "restore_table"]);
  });

  test("a retired table comes back, and its columns are compared as usual", () => {
    const plan = planTable(retire(start(), "orders"), "orders", {
      columns: { ...v1.columns, note: { type: "text" } },
    });
    expect(ops(plan)).toEqual(["restore_table", "add_column"]);
  });
});
