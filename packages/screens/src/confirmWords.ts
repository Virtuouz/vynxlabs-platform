import { formatDay } from "@volvel/widgets";

type Row = Readonly<Record<string, unknown>>;

/** What the builder writes for a new confirmation: the words are made from the action and the record until a person writes their own. */
export const DEFAULT_CONFIRM_TITLE = "Are you sure?";

/** Whether the title is the one nobody wrote: left as the builder made it, or empty. */
export const isDefaultTitle = (title: string | undefined): boolean =>
  title === undefined || title.trim() === "" || title === DEFAULT_CONFIRM_TITLE;

/** The columns that say what a row is, most telling first. */
const NAMING = ["name", "title", "number", "code", "reference", "ref", "label", "subject"];
/** The columns that say when, most telling first. */
const WHEN = ["starts_at", "date", "due_on", "due_at", "scheduled_at", "scheduled_for", "on"];

const CODE = /^[A-Z][A-Z0-9]{0,5}-[A-Z0-9][A-Z0-9-]*$/;

/** A table's name for one of its rows: `appointments` as "appointment". */
export function nounOf(table: string | undefined): string {
  const base = (table?.split("/").pop() ?? "").replace(/_/g, " ").trim();
  if (base === "") return "record";
  if (base.endsWith("ies")) return `${base.slice(0, -3)}y`;
  if (base.endsWith("ses") || base.endsWith("xes")) return base.slice(0, -2);
  return base.endsWith("s") && !base.endsWith("ss") ? base.slice(0, -1) : base;
}

/** A table's name for several of its rows: `appointments` as "appointments", `category` as "categories". */
export function nounsOf(table: string | undefined): string {
  const base = (table?.split("/").pop() ?? "").replace(/_/g, " ").trim();
  if (base === "") return "records";
  if (base.endsWith("s") && !base.endsWith("ss")) return base;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return /(s|x|ch|sh)$/.test(base) ? `${base}es` : `${base}s`;
}

export interface ConfirmFacts {
  /** What the widget read, for a column's type and the name a reference points at. */
  columns?: readonly { name: string; type: string }[] | undefined;
  names?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
}

export interface ConfirmInput {
  /** What the action's button says: "Cancel", "Mark paid". */
  label?: string | undefined;
  /** The author's own words, where they wrote any. */
  confirm?:
    | { title?: string | undefined; text?: string | undefined; button?: string | undefined }
    | undefined;
  /** The table of the record, for what to call it. */
  table?: string | undefined;
  row?: Row | undefined;
  facts?: ConfirmFacts | undefined;
  /** How many records the action runs on, when several: none of them stands for the rest. */
  count?: number | undefined;
}

/** How the record is told apart, in words: its code, who it is for, and when. */
function recordWords(input: ConfirmInput): string {
  if (input.count !== undefined && input.count > 1) return `${input.count} ${nounsOf(input.table)}`;
  const noun = nounOf(input.table);
  const row = input.row;
  if (!row) return `this ${noun}`;
  const types = new Map((input.facts?.columns ?? []).map((one) => [one.name, one.type]));
  const filled = (value: unknown): value is string | number =>
    (typeof value === "string" && value !== "") || typeof value === "number";
  let code: string | undefined;
  let who: string | undefined;
  for (const name of NAMING) {
    const value = row[name];
    if (!filled(value)) continue;
    if (typeof value === "string" && CODE.test(value) && /\d/.test(value)) code ??= value;
    else who ??= String(value);
  }
  // A reference says who or what the record is about, by the name it points at.
  for (const [name, type] of types) {
    if (who !== undefined) break;
    if (type !== "reference" || !filled(row[name])) continue;
    who = input.facts?.names?.[name]?.[String(row[name])];
  }
  let day: string | undefined;
  const dated = (name: string) => {
    const value = row[name];
    const kind = types.get(name);
    return typeof value === "string" &&
      (kind === undefined || kind === "date" || kind === "timestamp")
      ? formatDay(value)
      : undefined;
  };
  for (const name of WHEN) {
    day = dated(name);
    if (day) break;
  }
  if (!day) {
    for (const [name, type] of types) {
      if ((type === "date" || type === "timestamp") && !/^(created|updated)_at$/.test(name)) {
        day = dated(name);
        if (day) break;
      }
    }
  }
  return `the ${noun}${code ? ` ${code}` : ""}${who ? ` of ${who}` : ""}${day ? ` on ${day}` : ""}`;
}

/**
 * The words of a confirmation: what the author wrote, else words made from the action and the
 * record ("Cancel the appointment C-1001 of Pepper on Nov 20?"). The button that goes ahead says
 * the action's own label, and the other says "Go back" when that label is Cancel, so that
 * "Cancel" never names both. The builder's preview and the served app use this one.
 */
export function confirmWords(input: ConfirmInput): {
  title: string;
  text: string | undefined;
  button: string;
  dismiss: string;
} {
  const label = input.label?.trim();
  const made = isDefaultTitle(input.confirm?.title);
  const title = made
    ? label
      ? // "Cancel the appointment …?", and for a label of several words "Mark paid for the invoice …?".
        `${label} ${/\s/.test(label) ? "for " : ""}${recordWords(input)}?`
      : DEFAULT_CONFIRM_TITLE
    : (input.confirm?.title as string);
  const button = input.confirm?.button?.trim() || label || "Confirm";
  return {
    title,
    text: input.confirm?.text || undefined,
    button,
    dismiss: /^cancel\b/i.test(button) || /^cancel\b/i.test(label ?? "") ? "Go back" : "Cancel",
  };
}
