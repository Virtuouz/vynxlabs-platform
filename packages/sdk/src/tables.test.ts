import { describe, expect, expectTypeOf, test } from "vitest";
import { column, defineTable } from "./index.js";

/**
 * The row types a table's definition gives scripts and apps. These are checked
 * when the package is compiled: a wrong type fails the build, not a run.
 */
describe("a table's row types", () => {
  const visits = defineTable({
    path: "visits",
    columns: {
      number: column.text({ required: true, unique: true }),
      status: column.text({ required: true, default: "booked" }),
      pet: column.reference("pets", { required: true }),
      notes: column.text(),
      minutes: column.integer({ default: 20 }),
    },
  });
  type Row = NonNullable<typeof visits.__row>;
  type Insert = NonNullable<typeof visits.__insert>;

  test("a required column is never null when read, and an optional one may be", () => {
    expectTypeOf<Row["number"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["status"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["pet"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["notes"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["minutes"]>().toEqualTypeOf<number | null>();
  });

  test("a row is written without the columns that have a default, but never without a required one", () => {
    const minimal: Insert = { number: "A-1", pet: "p" };
    const full: Insert = { number: "A-1", pet: "p", status: "done", notes: null, minutes: 30 };
    // @ts-expect-error a required column cannot be left out
    const missing: Insert = { pet: "p" };
    // @ts-expect-error a required column with a default is still never null
    const cleared: Insert = { number: "A-1", pet: "p", status: null };
    expect([minimal, full, missing, cleared]).toHaveLength(4);
  });

  test("the manifest is what was declared", () => {
    expect(visits.toManifest("visits").body).toMatchObject({
      columns: {
        number: { type: "text", required: true, unique: true },
        status: { type: "text", required: true, default: "booked" },
        pet: { type: "reference", references: "pets", required: true },
        notes: { type: "text" },
      },
    });
  });
});

describe("enum columns, and references that say what a delete does", () => {
  test("a row's type is narrowed to the values, one or several, and the definition carries them as written", () => {
    const loans = defineTable({
      path: "loans",
      display: "title",
      columns: {
        title: column.text({ required: true }),
        status: column.enum(
          ["new", { value: "on_loan", label: "On loan", color: "blue" }, "returned"],
          { required: true, default: "new" },
        ),
        extras: column.enumList(["charger", "case"]),
        device: column.reference("devices", { onDelete: "set_null" }),
      },
    });
    type Row = NonNullable<typeof loans.__row>;
    type Insert = NonNullable<typeof loans.__insert>;
    expectTypeOf<Row["status"]>().toEqualTypeOf<"new" | "on_loan" | "returned">();
    expectTypeOf<Row["extras"]>().toEqualTypeOf<("charger" | "case")[] | null>();
    // Required with a default: a row may be written without it.
    expectTypeOf<Insert>().toMatchTypeOf<{ title: string }>();
    expectTypeOf<{ title: string }>().toMatchTypeOf<Insert>();
    expect(loans.toManifest("loans").body).toMatchObject({
      display: "title",
      columns: {
        status: {
          type: "enum",
          values: ["new", { value: "on_loan", label: "On loan", color: "blue" }, "returned"],
          required: true,
          default: "new",
        },
        extras: { type: "enum_list", values: ["charger", "case"] },
        device: { type: "reference", references: "devices", onDelete: "set_null" },
      },
    });
  });
});
