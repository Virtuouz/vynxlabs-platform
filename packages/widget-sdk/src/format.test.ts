import { describe, expect, it } from "vitest";
import { formatValue } from "./index.js";

describe("formatValue", () => {
  it("writes the drawer picker's six choices", () => {
    const usd = { style: "currency", currency: "USD" } as const;
    expect(formatValue(43120, usd)).toBe("$43,120.00");
    expect(formatValue(43120, { ...usd, decimals: 0 })).toBe("$43,120");
    expect(formatValue(43120, { ...usd, notation: "compact" })).toBe("$43.1k");
    expect(formatValue(43120, { style: "number" })).toBe("43,120");
    expect(formatValue(0.125, { style: "percent" })).toBe("12.5%");
    expect(formatValue(43120, { style: "number", grouping: false })).toBe("43120");
  });

  it("reads cents with minorUnits", () => {
    expect(formatValue(4312000, { style: "currency", minorUnits: true })).toBe("$43,120.00");
  });
});
