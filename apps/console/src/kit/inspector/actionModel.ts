/**
 * What the action editor does with an action, with no React in it. An action is
 * a few steps whose values are one of a few named kinds, never code (decision
 * 0004): this file makes a step, says in words what a value or a step is, and
 * says what an action grants.
 *
 * The action types are read off `PageWidget`, because `@volvel/manifest` does not
 * export them by name yet.
 */
import { listWords, type PageWidget } from "@volvel/manifest";
import {
  type CatalogColumn,
  choiceWords,
  heading,
  isChoiceLike,
  withSystemColumns,
} from "./model.ts";

export type Action = NonNullable<PageWidget["on"]>[string];
export type Step = Action["steps"][number];
export type StepKind = Step["do"];
export type Condition = NonNullable<Action["when"]>[number];
export type RecordRef = "this" | "event";
export type ActionValue = Extract<Step, { do: "update" }>["set"][string];
export type AskedField = NonNullable<NonNullable<Action["confirm"]>["ask"]>[number];

/** Where an action is, and what it may reach: the tables of the two records it can work on. */
export interface ActionContext {
  surface: "app" | "dashboard";
  /** The table of the record the page is open on (a record page, a sheet, a modal). */
  thisTable?: string | undefined;
  /** The table of the record the event gives: the row clicked, the row whose action is pressed. */
  eventTable?: string | undefined;
  /** The record an action works on unless told otherwise. */
  defaultRef: RecordRef;
  /** Whether the widget raises an event that gives a group (a point, a cell). */
  groupEvent: boolean;
  /** Whether the event can show the rows behind it: a click on a point or a cell, and a click on a number. */
  rowsEvent: boolean;
  /** What the page is when it is open as: a side sheet, a dialog, or a page. */
  openAs: "page" | "sheet" | "modal";
  columnsOf: (table: string | undefined) => CatalogColumn[];
}

export const tableOfRef = (ctx: ActionContext, ref: RecordRef) =>
  ref === "this" ? ctx.thisTable : ctx.eventTable;

/** The records an action may name here. */
export const refsOf = (ctx: ActionContext): RecordRef[] =>
  (["this", "event"] as const).filter((ref) => tableOfRef(ctx, ref) !== undefined);

/** A table's name for one of them: `invoices` as "invoice". */
export function singular(table: string | undefined): string {
  const base = (table?.split("/").pop() ?? "record").replace(/_/g, " ");
  if (base.endsWith("ies")) return `${base.slice(0, -3)}y`;
  if (base.endsWith("ses") || base.endsWith("xes")) return base.slice(0, -2);
  return base.endsWith("s") && !base.endsWith("ss") ? base.slice(0, -1) : base;
}
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** "this invoice" or "the clicked invoice". */
export function refWords(ctx: ActionContext, ref: RecordRef): string {
  const noun = singular(tableOfRef(ctx, ref));
  return ref === "this" ? `this ${noun}` : `the clicked ${noun}`;
}

// ---------------------------------------------------------------------------
// Steps

/** The kinds of step offered, with what each is called in "Add a step". */
export const STEP_WORDS: Record<StepKind, { title: string; help: string }> = {
  update: { title: "Update the record", help: "Set fields of a record" },
  create: { title: "Make a record", help: "Add a row to a table" },
  delete: { title: "Remove the record", help: "Remove a record for good" },
  flow: { title: "Run a workflow", help: "Start a flow that can be run by hand" },
  script: { title: "Run a script", help: "Start a script of the workspace" },
  open: { title: "Open a page", help: "Go to a page, a side sheet or a dialog" },
  close: { title: "Close", help: "Close this sheet or dialog" },
  message: { title: "Show a message", help: "Say something in a notice" },
  narrow: { title: "Filter the page", help: "Set a page filter to what was clicked" },
  rows: { title: "Show the rows behind", help: "Open the rows behind what was clicked" },
};

/**
 * The steps that may be added. A dashboard reads and shows and never changes data, so it
 * offers narrow, message and rows only; narrowing and showing rows need an event that gives a group.
 */
export function stepKindsFor(ctx: ActionContext): StepKind[] {
  if (ctx.surface === "dashboard")
    return [
      ...(ctx.groupEvent ? (["narrow"] as const) : []),
      "message",
      ...(ctx.rowsEvent ? (["rows"] as const) : []),
    ];
  const kinds: StepKind[] = [];
  if (refsOf(ctx).length > 0) kinds.push("update");
  kinds.push("create");
  if (refsOf(ctx).length > 0) kinds.push("delete");
  kinds.push("flow", "script", "open");
  if (ctx.openAs !== "page") kinds.push("close");
  kinds.push("message");
  if (ctx.groupEvent) kinds.push("narrow");
  if (ctx.rowsEvent) kinds.push("rows");
  return kinds;
}

/** A step as it starts, before anything is changed. */
export function newStep(kind: StepKind, ctx: ActionContext, firstPage?: string): Step {
  switch (kind) {
    case "update":
      return { do: "update", record: ctx.defaultRef, set: {} };
    case "create":
      return { do: "create", table: ctx.thisTable ?? ctx.eventTable ?? "", set: {} };
    case "delete":
      return { do: "delete", record: ctx.defaultRef };
    case "flow":
      return { do: "flow", path: "" };
    case "script":
      return { do: "script", path: "" };
    case "open":
      return { do: "open", page: firstPage ?? "" };
    case "close":
      return { do: "close" };
    case "message":
      return { do: "message", text: "Done", tone: "success" };
    case "narrow":
      return { do: "narrow", filter: "", from: "" };
    case "rows":
      return { do: "rows" };
  }
}

/** An action with a step set, added or removed; the confirmation and conditions are kept. */
export function withSteps(action: Action, steps: Step[]): Action {
  return { ...action, steps };
}

// ---------------------------------------------------------------------------
// Values

/** What a value is, as one word the menu can hold: `today`, `user:name`, `this:status`, `asked:reason`, `value`. */
export function valueKey(value: ActionValue | undefined): string {
  if (!value) return "";
  if ("value" in value) return "value";
  if ("today" in value) return "today";
  if ("now" in value) return "now";
  if ("user" in value) return `user:${value.user}`;
  if ("record" in value) return `${value.of ?? "this"}:${value.record}`;
  return `asked:${value.asked}`;
}

/** The value a menu choice makes. `value` keeps what was typed. */
export function valueFromKey(key: string, before?: ActionValue): ActionValue {
  if (key === "today") return { today: true };
  if (key === "now") return { now: true };
  if (key.startsWith("user:")) return { user: key.slice(5) as "id" | "email" | "name" };
  if (key.startsWith("asked:")) return { asked: key.slice(6) };
  if (key.startsWith("this:")) return { record: key.slice(5) };
  if (key.startsWith("event:")) return { record: key.slice(6), of: "event" };
  return before && "value" in before ? before : { value: "" };
}

/**
 * A typed value as it is stored. By the column's type when it is known: text stays text ("007"),
 * a number is a number, yes and no are booleans, a several-choice column is a list. With no type
 * (a flow's or a script's input) it is read as it looks: a number, true and false, else text.
 */
export function typedConstant(text: string, type?: string): unknown {
  const trimmed = text.trim();
  const number = /^-?\d+(\.\d+)?$/.test(trimmed);
  if (type === undefined) {
    if (number) return Number(trimmed);
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    return text;
  }
  if (type === "number" || type === "integer") return number ? Number(trimmed) : text;
  if (type === "boolean") return trimmed === "true" ? true : trimmed === "false" ? false : text;
  if (type === "enum_list")
    return trimmed === ""
      ? []
      : trimmed
          .split(",")
          .map((one) => one.trim())
          .filter(Boolean);
  return text;
}

const USER_WORDS = {
  id: "the current user",
  email: "the current user's email",
  name: "the current user's name",
};

/** A value in the reader's words: "Today", "the current user's name", "Status of this invoice", "“Paid”". */
export function valueWords(value: ActionValue, ctx: ActionContext): string {
  if ("value" in value) return `“${String(value.value ?? "")}”`;
  if ("today" in value) return "today";
  if ("now" in value) return "now";
  if ("user" in value) return USER_WORDS[value.user];
  if ("record" in value) return `${heading(value.record)} of ${refWords(ctx, value.of ?? "this")}`;
  return `what was asked (${heading(value.asked)})`;
}

/** The choices a value menu holds, in order, with the words of each. */
export function valueOptions(
  ctx: ActionContext,
  asked: readonly AskedField[],
): { value: string; label: string }[] {
  const out = [
    { value: "value", label: "A value" },
    { value: "today", label: "Today" },
    { value: "now", label: "Now" },
    { value: "user:id", label: "The current user" },
    { value: "user:name", label: "The current user's name" },
    { value: "user:email", label: "The current user's email" },
  ];
  for (const ref of refsOf(ctx)) {
    const columns = ctx.columnsOf(tableOfRef(ctx, ref));
    for (const column of columns) {
      out.push({
        value: `${ref}:${column.name}`,
        label: `${heading(column.name)} of ${refWords(ctx, ref)}`,
      });
    }
  }
  for (const field of asked)
    out.push({ value: `asked:${field.name}`, label: `What was asked: ${field.label}` });
  return out;
}

/** The record's columns a step may set: not the ones the platform keeps. */
export function settableColumns(columns: readonly CatalogColumn[]): CatalogColumn[] {
  return withSystemColumns([...columns]).filter(
    (column) => !["id", "created_at", "updated_at"].includes(column.name),
  );
}

// ---------------------------------------------------------------------------
// What an action grants

/** "Changes Status and Paid on of an invoice." and the sentence that says who may do it, where it acts. */
export function grantWords(
  action: Action,
  ctx: ActionContext,
  /** What each group the action names is called now, by its path. */
  groupNames: Readonly<Record<string, string>> = {},
): string {
  const parts: string[] = [];
  const list = (names: string[]) => {
    const words = names.map(heading);
    return words.length < 2
      ? (words[0] ?? "")
      : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  };
  for (const step of action.steps) {
    if (step.do === "update") {
      const noun = singular(tableOfRef(ctx, step.record));
      const fields = Object.keys(step.set);
      parts.push(
        fields.length === 0
          ? `Changes nothing of ${article(noun)} ${noun} yet`
          : `Changes ${list(fields)} of ${article(noun)} ${noun}`,
      );
    } else if (step.do === "create") {
      const noun = singular(step.table);
      parts.push(`Adds ${article(noun)} ${noun}`);
    } else if (step.do === "delete") {
      const noun = singular(tableOfRef(ctx, step.record));
      parts.push(`Deletes ${article(noun)} ${noun}`);
    } else if (step.do === "flow" && step.path) parts.push(`Starts the flow ${step.path}`);
    else if (step.do === "script" && step.path) parts.push(`Starts the script ${step.path}`);
  }
  const noun = ctx.surface === "dashboard" ? "dashboard" : "app";
  if (parts.length === 0) return "Changes no data.";
  const tables = [
    ...new Set(
      action.steps.flatMap((step) =>
        step.do === "update" || step.do === "delete"
          ? [tableOfRef(ctx, step.record)]
          : step.do === "create"
            ? [step.table]
            : [],
      ),
    ),
  ].filter((table): table is string => Boolean(table));
  const seen = tables.length
    ? `, on ${tables.map((table) => (table.split("/").pop() ?? table).replace(/_/g, " ")).join(" and ")} they can see`
    : "";
  const groups = action.runBy?.groups ?? [];
  const who =
    groups.length > 0
      ? `Only ${list(groups.map((path) => groupNames[path] ?? path.split("/").pop() ?? path))} can do this`
      : `People who can open the ${noun} can do this`;
  return `${parts.join(". ")}. ${who}${seen}.`;
}

/** What an input of a flow or script is given, in a line: "Gets this invoice as its input". */
export function inputWords(
  input: Record<string, ActionValue> | undefined,
  ctx: ActionContext,
): string {
  const entries = Object.entries(input ?? {});
  if (entries.length === 0) return "Gets nothing as its input";
  const idOnly =
    entries.length === 1 &&
    entries[0]?.[1] &&
    "record" in entries[0][1] &&
    entries[0][1].record === "id";
  if (idOnly) {
    const value = entries[0]?.[1] as { of?: RecordRef };
    return `Gets ${refWords(ctx, value.of ?? "this")} as its input`;
  }
  return `Gets ${entries.map(([name, value]) => `${heading(name)} as ${valueWords(value, ctx)}`).join(", ")}`;
}

// ---------------------------------------------------------------------------
// Conditions

export const TEST_LABELS: Record<string, string> = {
  is: "is",
  is_not: "is not",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};
export const TESTS = Object.keys(TEST_LABELS);
export const NO_VALUE_TESTS = new Set(["is_empty", "is_not_empty"]);

/** What a condition's first choice is, as one word: `field:this:status`, `user`, `record`. */
export function conditionKey(one: Condition): string {
  if ("user" in one) return "user";
  if ("record" in one) return one.record === "exists" ? "record:exists" : "record:missing";
  return `field:${one.of ?? "this"}:${one.field}`;
}

/** A condition as the first choice makes it, keeping what still applies. */
export function conditionFromKey(
  key: string,
  before: Condition | undefined,
  groups: readonly string[],
): Condition {
  if (key === "user") return { user: "in", group: groups[0] ?? "" };
  if (key === "record:exists") return { record: "exists" };
  if (key === "record:missing") return { record: "missing" };
  const [, of, ...rest] = key.split(":");
  const field = rest.join(":");
  const test = before && "field" in before ? before.test : "is";
  const value = before && "field" in before ? before.value : undefined;
  return {
    field,
    ...(of === "event" ? { of: "event" as const } : {}),
    test: test as Extract<Condition, { field: string }>["test"],
    ...(value !== undefined && !NO_VALUE_TESTS.has(test) ? { value } : {}),
  };
}

/** The column a condition is about, where the action's context knows the table. */
export function conditionColumn(
  one: Extract<Condition, { field: string }>,
  ctx: ActionContext | undefined,
): CatalogColumn | undefined {
  if (!ctx) return undefined;
  const order: RecordRef[] = one.of === "event" ? ["event", "this"] : ["this", "event"];
  for (const ref of order) {
    const found = ctx.columnsOf(tableOfRef(ctx, ref)).find((column) => column.name === one.field);
    if (found) return found;
  }
  return undefined;
}

/** What a condition compares with, as people say it: a choice by its words ("Unpaid"), the rest as written. */
export function conditionValueWords(
  one: Extract<Condition, { field: string }>,
  ctx?: ActionContext,
): string {
  const column = conditionColumn(one, ctx);
  const say = (value: unknown) =>
    isChoiceLike(column) ? choiceWords(column, String(value)) : String(value ?? "");
  return Array.isArray(one.value) ? listWords(one.value.map(say)) : say(one.value);
}

/** "Status is Unpaid" and the other sentences, in the reader's words. */
export function conditionSentence(one: Condition, ctx?: ActionContext): string {
  if ("user" in one) return `the current user is in ${one.group || "a group"}`;
  if ("record" in one)
    return one.record === "exists" ? "a record is chosen" : "no record is chosen";
  // "of the clicked record" only where the action can reach two records and it matters which.
  const of = ctx && one.of === "event" && refsOf(ctx).length > 1 ? " of the clicked record" : "";
  const said = `${heading(one.field)}${of} ${TEST_LABELS[one.test] ?? one.test}`;
  if (NO_VALUE_TESTS.has(one.test)) return said;
  return `${said} ${conditionValueWords(one, ctx)}`.trim();
}

// ---------------------------------------------------------------------------
// A list put in a new order

/** The list with the item at `from` put where `to` is. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || from >= next.length) return next;
  const [taken] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, taken as T);
  return next;
}

/** The sentence a new rule starts as: a field of the record the page is open on, else the user's group. */
export function firstCondition(ctx: ActionContext, groups: readonly string[]): Condition {
  const columns = ctx.columnsOf(tableOfRef(ctx, "this"));
  const column = columns[1] ?? columns[0];
  if (column) return { field: column.name, test: "is_not_empty" };
  if (groups[0]) return { user: "in", group: groups[0] };
  return { record: "exists" };
}
