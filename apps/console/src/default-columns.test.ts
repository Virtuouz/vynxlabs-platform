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

  it("draws what a row is about (pet_name) with the columns that name it, not cut away by the cap", () => {
    const columns = [
      col("checked_in_at", "timestamp"),
      col("client_code"),
      col("clinic"),
      col("minutes", "integer"),
      col("notes"),
      col("number"),
      col("pet", "reference"),
      col("pet_name"),
      col("reason"),
      col("species"),
      col("starts_at", "timestamp"),
      col("status"),
      col("vet"),
    ];
    expect(
      defaultColumns(columns)
        .slice(0, DEFAULT_COLUMNS)
        .map((one) => one.name),
    ).toEqual([
      "number",
      "pet_name",
      "status",
      "starts_at",
      "checked_in_at",
      "client_code",
      "clinic",
      "minutes",
    ]);
  });

  it("keeps the table's own order when no column names a row", () => {
    expect(defaultColumns([col("b"), col("a")]).map((one) => one.name)).toEqual(["b", "a"]);
  });

  it("is capped for a table of many columns", () => {
    expect(DEFAULT_COLUMNS).toBe(8);
  });
});
