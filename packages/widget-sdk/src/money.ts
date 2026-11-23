import type { ValueFormat } from "./index.js";
import { usableLocale } from "./locale.js";

/** What a column says of itself: enough to know whether it holds money. */
export interface MoneyColumn {
  type?: string | undefined;
  description?: string | undefined;
}

/**
 * How a number column is money, as its table says it: what its definition holds ("What is owed,
 * in cents.", "The price in euros"). Cents (or minor units) are kept as whole cents; the other
 * words are money kept in whole units. `undefined` for a column that does not say so, and for
 * one that is not a number. The one rule the table, list, detail, form and the builder share.
 */
export function moneyFormatOf(column: MoneyColumn | undefined): ValueFormat | undefined {
  if (!column || (column.type !== "integer" && column.type !== "number")) return undefined;
  const words = column.description ?? "";
  const found = /\b(cents|minor units?|money|currency|dollars|euros|pounds)\b/i.exec(words);
  if (!found) return undefined;
  const named = (found[1] as string).toLowerCase();
  const currency = named === "euros" ? "EUR" : named === "pounds" ? "GBP" : "USD";
  return {
    style: "currency",
    currency,
    minorUnits: /\b(cents|minor units?)\b/i.test(words),
  };
}

/** The format a column is drawn in: the widget's own, else what its table says it holds. */
export const formatOfColumn = (
  own: ValueFormat | undefined,
  column: MoneyColumn | undefined,
): ValueFormat | undefined => own ?? moneyFormatOf(column);

/** The marks a locale writes numbers with: its decimal mark and its grouping mark. */
function marks(locale: string | undefined): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(usableLocale(locale)).formatToParts(1234567.5);
  return {
    decimal: parts.find((one) => one.type === "decimal")?.value ?? ".",
    group: parts.find((one) => one.type === "group")?.value ?? ",",
  };
}

/** How an amount is read: whether it is kept in cents, the currency its problems are worded in, and the reader's locale. */
export interface MoneyOptions {
  /** The column keeps cents (the default for money): 12345 is 123.45. `false`: whole units. */
  minorUnits?: boolean | undefined;
  /** An ISO 4217 code, for the words of a problem. */
  currency?: string | undefined;
  /** The person's locale; the browser's when left out. */
  locale?: string | undefined;
}

const CURRENCY_WORDS: Record<string, string> = {
  USD: "dollars and cents",
  EUR: "euros and cents",
  GBP: "pounds and pence",
  CAD: "dollars and cents",
  AUD: "dollars and cents",
};

const escaped = (mark: string) => mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exampleOf = (options: MoneyOptions) => `123${marks(options.locale).decimal}45`;
const notAnAmount = (options: MoneyOptions): { ok: false; message: string } => ({
  ok: false,
  message: `Enter an amount like ${exampleOf(options)}.`,
});

/**
 * An amount a person typed, read as the column keeps it, with no float error: "123.45" or, where
 * a comma is written, "123,45", is 12345 cents. Empty is no amount. More than two decimals, or
 * text that is not an amount, is a problem in words, not a guess.
 */
export function parseMoney(
  text: string,
  options: MoneyOptions = {},
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  const { decimal, group } = marks(options.locale);
  // A symbol or code typed with the amount ("$", "USD") is not part of it.
  const bare = text
    .replace(/[\s  ]/g, "")
    .replace(/^([-+]?)[^\d.,\-+]+/, "$1")
    .replace(/[^\d.,\-+]+$/, "");
  if (text.trim() === "") return { ok: true, value: undefined };
  const shape = new RegExp(
    `^([-+]?)((?:\\d{1,3}(?:${escaped(group)}\\d{3})+|\\d*)(?:${escaped(decimal)}\\d*)?)$`,
  );
  const found = shape.exec(bare);
  if (!found || !/\d/.test(found[2] as string)) return notAnAmount(options);
  const sign = found[1] === "-" ? -1 : 1;
  const [whole = "", fraction = ""] = (found[2] as string)
    .replace(new RegExp(escaped(group), "g"), "")
    .split(decimal);
  if (fraction.length > 2) {
    const words = CURRENCY_WORDS[options.currency ?? "USD"] ?? "two decimal places";
    return {
      ok: false,
      message: `Write at most two decimal places (${words}), like ${exampleOf(options)}.`,
    };
  }
  const minor = Number(`${whole === "" ? "0" : whole}${fraction.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(minor)) return notAnAmount(options);
  const value = sign * (options.minorUnits === false ? minor / 100 : minor);
  return { ok: true, value: value === 0 ? 0 : value };
}

/** A stored amount as it is typed: 12345 cents is "123.45" ("123,45" where a comma is written). */
export function moneyText(value: number, options: MoneyOptions = {}): string {
  const minor = options.minorUnits === false ? Math.round(value * 100) : Math.round(value);
  const abs = Math.abs(minor);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${minor < 0 ? "-" : ""}${Math.trunc(abs / 100)}${marks(options.locale).decimal}${fraction}`;
}
