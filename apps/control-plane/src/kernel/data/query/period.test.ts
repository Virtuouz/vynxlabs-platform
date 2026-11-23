import { VISUAL_BUCKETS } from "@volvel/manifest";
import { describe, expect, test } from "vitest";
import { periodEnd } from "./inputs.js";

describe("the days a group of rows behind a summary covers", () => {
  const ends: Record<(typeof VISUAL_BUCKETS)[number], [string, string]> = {
    day: ["2026-01-31", "2026-02-01"],
    week: ["2026-01-26", "2026-02-02"],
    month: ["2026-01-01", "2026-02-01"],
    quarter: ["2026-01-01", "2026-04-01"],
    year: ["2026-01-01", "2027-01-01"],
  };

  test.each(VISUAL_BUCKETS)("a %s ends where the next begins", (bucket) => {
    const [from, to] = ends[bucket];
    expect(periodEnd(from, bucket)).toBe(to);
  });

  test("a quarter that starts in the last months of a year", () => {
    expect(periodEnd("2026-10-01", "quarter")).toBe("2027-01-01");
  });
});
