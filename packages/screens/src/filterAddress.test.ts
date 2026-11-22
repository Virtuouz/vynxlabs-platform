import { describe, expect, test } from "vitest";
import { filtersFromSearch, searchWithFilters } from "./filterAddress.ts";

describe("a page's filters in its address", () => {
  test("each filter is one parameter, its value as JSON", () => {
    const search = searchWithFilters("", {
      q: "ada lovelace",
      clinic: "Hill & Top",
      min: 5,
      range: { from: "2026-01-01", to: "2026-01-31" },
      any: null,
    });
    expect(filtersFromSearch(search)).toEqual({
      q: "ada lovelace",
      clinic: "Hill & Top",
      min: 5,
      range: { from: "2026-01-01", to: "2026-01-31" },
      any: null,
    });
    expect(new URLSearchParams(search).get("f.q")).toBe('"ada lovelace"');
  });

  test("what is not set is not in the address, and other parameters stay as they are", () => {
    expect(searchWithFilters("?sheet=detail&record=a&f.old=1", { q: "x", gone: undefined })).toBe(
      "?sheet=detail&record=a&f.q=%22x%22",
    );
    expect(searchWithFilters("?f.q=%22x%22", {})).toBe("");
  });

  test("only the page's own filters are read, and what is not JSON is left out", () => {
    const search = "?f.q=%22x%22&f.other=1&f.bad=%7Bnot&f.=1&sheet=a";
    expect(filtersFromSearch(search)).toEqual({ q: "x", other: 1 });
    expect(filtersFromSearch(search, ["q", "bad"])).toEqual({ q: "x" });
  });

  test("a value written is the value read back", () => {
    const values = { a: [1, 2], b: "with space/and?marks=&", c: false };
    expect(filtersFromSearch(searchWithFilters("", values))).toEqual(values);
  });
});
