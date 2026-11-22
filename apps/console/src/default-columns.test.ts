import { DEFAULT_COLUMNS, defaultColumns } from "@volvel/widgets-core/views";
import { describe, expect, it } from "vitest";

const col = (name: string, type = "text") => ({ name, type });

describe("the columns a widget draws when it names none", () => {
  it("leaves out the system and JSON columns and puts the one that names a row first", () => {
    const columns = [
      col("id", "uuid"),
      col("created_at", "timestamp"),
      col("appointment"),
      col("clinic"),
      col("lines", "json"),
      col("number"),
      col("status"),
      col("total", "integer"),
    ];
    expect(defaultColumns(columns).map((one) => one.name)).toEqual([
      "number",
      "status",
      "appointment",
      "clinic",
      "total",
    ]);
  });

  it("keeps the table's own order when no column names a row", () => {
    expect(defaultColumns([col("b"), col("a")]).map((one) => one.name)).toEqual(["b", "a"]);
  });

  it("is capped for a table of many columns", () => {
    expect(DEFAULT_COLUMNS).toBe(8);
  });
});
