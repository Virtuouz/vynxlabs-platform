import { describe, expect, it, vi } from "vitest";
import { formatValue, moneyText, parseMoney } from "./index.js";

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

describe("the reader's locale (EXT-18, D38)", () => {
  const german = (run: () => void) => {
    vi.stubGlobal("navigator", { languages: ["de-DE"], language: "de-DE" });
    try {
      run();
    } finally {
      vi.unstubAllGlobals();
    }
  };

  it("writes numbers as the reader's browser does, and reads back what it wrote", () => {
    german(() => {
      const written = formatValue(1234.5, { style: "number" }) as string;
      expect(written).toBe("1.234,5");
      expect(formatValue(1234.5, { style: "currency", currency: "EUR" })).toMatch(/1\.234,50\s€/);
      // Typed as the locale writes it, read back as the same cents.
      const typed = moneyText(123450, { minorUnits: true });
      expect(typed).toBe("1234,50");
      expect(parseMoney("1.234,50", { minorUnits: true })).toEqual({ ok: true, value: 123450 });
    });
  });

  it("takes a locale as an argument, and keeps US English where there is none", () => {
    expect(formatValue(1234.5, { style: "number" }, "de-DE")).toBe("1.234,5");
    expect(formatValue(1234.5, { style: "number" }, "not a locale!")).toBe("1,234.5");
    expect(formatValue(43120, { style: "currency", currency: "USD", notation: "compact" })).toBe(
      "$43.1k",
    );
  });
});
