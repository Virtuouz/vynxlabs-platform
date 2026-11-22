import { describe, expect, it } from "vitest";
import { formatOfColumn, moneyFormatOf, moneyText, parseMoney } from "./index.js";

describe("moneyFormatOf", () => {
  it("knows a number held in cents from its definition", () => {
    expect(moneyFormatOf({ type: "integer", description: "What is owed, in cents." })).toEqual({
      style: "currency",
      currency: "USD",
      minorUnits: true,
    });
  });
  it("knows money in whole units and its currency", () => {
    expect(moneyFormatOf({ type: "number", description: "The price in euros" })).toEqual({
      style: "currency",
      currency: "EUR",
      minorUnits: false,
    });
  });
  it("says nothing for text, or a number that does not say it is money", () => {
    expect(moneyFormatOf({ type: "text", description: "in cents" })).toBeUndefined();
    expect(moneyFormatOf({ type: "integer", description: "How many visits" })).toBeUndefined();
    expect(moneyFormatOf({ type: "integer" })).toBeUndefined();
  });
  it("lets the widget's own format win", () => {
    const own = { style: "number" } as const;
    expect(formatOfColumn(own, { type: "integer", description: "in cents" })).toBe(own);
    expect(formatOfColumn(undefined, { type: "integer", description: "in cents" })?.style).toBe(
      "currency",
    );
  });
});

describe("parseMoney", () => {
  const us = { locale: "en-US" };
  it("reads 123.45 as 12345 cents, exactly", () => {
    expect(parseMoney("123.45", us)).toEqual({ ok: true, value: 12345 });
    // A float gives 114.99999999999999 for 1.15 * 100.
    expect(parseMoney("1.15", us)).toEqual({ ok: true, value: 115 });
    expect(parseMoney("19.99", us)).toEqual({ ok: true, value: 1999 });
    expect(parseMoney("0.07", us)).toEqual({ ok: true, value: 7 });
  });
  it("reads whole amounts, one decimal, grouping, symbols and a sign", () => {
    expect(parseMoney("65", us)).toEqual({ ok: true, value: 6500 });
    expect(parseMoney("65.5", us)).toEqual({ ok: true, value: 6550 });
    expect(parseMoney(".5", us)).toEqual({ ok: true, value: 50 });
    expect(parseMoney("1,234.50", us)).toEqual({ ok: true, value: 123450 });
    expect(parseMoney("$ 12.00", us)).toEqual({ ok: true, value: 1200 });
    expect(parseMoney("12.00 USD", us)).toEqual({ ok: true, value: 1200 });
    expect(parseMoney("-3.20", us)).toEqual({ ok: true, value: -320 });
  });
  it("is empty for nothing", () => {
    expect(parseMoney("  ", us)).toEqual({ ok: true, value: undefined });
  });
  it("is locale aware", () => {
    expect(parseMoney("123,45", { locale: "de-DE" })).toEqual({ ok: true, value: 12345 });
    expect(parseMoney("1.234,50", { locale: "de-DE" })).toEqual({ ok: true, value: 123450 });
  });
  it("refuses more than two decimals, in words", () => {
    const refused = parseMoney("12.345", { ...us, currency: "USD" });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.message).toMatch(
      /two decimal places \(dollars and cents\)/,
    );
  });
  it("refuses what is not an amount, and does not guess a comma", () => {
    expect(parseMoney("abc", us).ok).toBe(false);
    expect(parseMoney("12,5", us).ok).toBe(false);
    expect(parseMoney("1.2.3", us).ok).toBe(false);
    expect(parseMoney("-", us).ok).toBe(false);
  });
  it("keeps whole units when the column does", () => {
    expect(parseMoney("12.5", { ...us, minorUnits: false })).toEqual({ ok: true, value: 12.5 });
  });
});

describe("moneyText", () => {
  it("writes cents as they are typed", () => {
    expect(moneyText(12345, { locale: "en-US" })).toBe("123.45");
    expect(moneyText(6500, { locale: "en-US" })).toBe("65.00");
    expect(moneyText(-5, { locale: "en-US" })).toBe("-0.05");
    expect(moneyText(12345, { locale: "de-DE" })).toBe("123,45");
    expect(moneyText(12.5, { locale: "en-US", minorUnits: false })).toBe("12.50");
  });
  it("round trips", () => {
    for (const cents of [0, 1, 99, 100, 123456789]) {
      expect(parseMoney(moneyText(cents, { locale: "fr-FR" }), { locale: "fr-FR" })).toEqual({
        ok: true,
        value: cents,
      });
    }
  });
});
