import { describe, expect, test } from "vitest";
import { resolveFilters } from "./data/query/filters.js";
import { dayIn, startOfDayIn, todayIn } from "./zones.js";

// 19:30 on 21 November in Los Angeles; the 22nd in UTC.
const evening = new Date("2026-11-22T03:30:00Z");

describe("the reader's day (D21)", () => {
  test("is their own day in the evening, and UTC's without a zone", () => {
    expect(dayIn("America/Los_Angeles", evening)).toBe("2026-11-21");
    expect(dayIn(undefined, evening)).toBe("2026-11-22");
    expect(dayIn("Not/AZone", evening)).toBe("2026-11-22");
    expect(todayIn("America/Los_Angeles", evening).toISOString()).toBe("2026-11-21T00:00:00.000Z");
  });

  test("a page's ranges by name are counted from the reader's day", () => {
    const filters = [{ name: "when", type: "date_range" as const }];
    const read = (zone?: string) =>
      resolveFilters(filters, { when: "last_7_days" }, todayIn(zone, evening)).when;
    expect(read("America/Los_Angeles")).toEqual({ from: "2026-11-15", to: "2026-11-21" });
    expect(read()).toEqual({ from: "2026-11-16", to: "2026-11-22" });
  });

  test("a day begins at its own midnight in a zone, as the clocks stood then", () => {
    expect(startOfDayIn("2026-11-21", "America/Los_Angeles")).toBe("2026-11-21T08:00:00.000Z");
    expect(startOfDayIn("2026-07-21", "America/Los_Angeles")).toBe("2026-07-21T07:00:00.000Z");
    // The day the clocks went back: midnight was still daylight time.
    expect(startOfDayIn("2026-11-01", "America/Los_Angeles")).toBe("2026-11-01T07:00:00.000Z");
    expect(startOfDayIn("2026-11-21", undefined)).toBe("2026-11-21T00:00:00.000Z");
  });
});
