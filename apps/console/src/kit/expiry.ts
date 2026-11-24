import type { FormField } from "../ListScreen.tsx";

/**
 * How long a new credential lasts: one field for every list that makes keys or tokens, so the
 * lengths and the words are the same wherever a person asks for one.
 */
export const expiryField = (noun: "key" | "token"): FormField => ({
  name: "expires",
  label: "Expires",
  options: [
    { value: "never", label: "Never" },
    { value: "30", label: "In 30 days" },
    { value: "90", label: "In 90 days" },
    { value: "365", label: "In a year" },
  ],
  hint: `After this the ${noun} stops working, and you make a new one.`,
});

/** The days the field chose, or undefined for a credential that does not expire. */
export function daysChosen(values: Record<string, string>): number | undefined {
  const days = Number(values.expires);
  return Number.isFinite(days) && days > 0 ? days : undefined;
}
