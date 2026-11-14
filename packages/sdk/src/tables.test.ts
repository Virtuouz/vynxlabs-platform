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
