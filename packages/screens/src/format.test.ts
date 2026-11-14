import { expect, test } from "vitest";
import { axisFormat, formatValue } from "./format.ts";

test("numbers are written as their format says, in US English", () => {
  expect(formatValue(123456, { style: "currency", minorUnits: true })).toBe("$1,234.56");
  expect(formatValue("99.5", { style: "currency" })).toBe("$99.50");
  expect(formatValue(1500, { style: "currency", currency: "EUR", minorUnits: true })).toBe(
    "€15.00",
  );
  expect(formatValue(0.125, { style: "percent" })).toBe("12.5%");
  expect(formatValue(1234.5678, { style: "number" })).toBe("1,234.57");
  expect(formatValue(1234.5, { style: "number", decimals: 0 })).toBe("1,235");
  // Not a number: shown as it is.
  expect(formatValue("open", { style: "number" })).toBeUndefined();
  expect(formatValue(5, undefined)).toBeUndefined();
});

test("a chart's axis is written in the same format", () => {
  expect(axisFormat({ style: "currency", minorUnits: true })).toEqual({
    format: "$,~f",
    divide: 100,
  });
  expect(axisFormat({ style: "currency", currency: "EUR", decimals: 2 })).toEqual({
    format: ",.2f",
    divide: 1,
    note: "EUR",
  });
  expect(axisFormat({ style: "percent" })).toEqual({ format: ".0%", divide: 1 });
});
