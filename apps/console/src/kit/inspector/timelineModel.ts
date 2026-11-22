/**
 * Words and shapes for the step timeline and the Rules tab (boards 4 and 9), with no React in
 * them: a step in one line, a confirmation's `{column}` tokens, the groups an action or a widget
 * names, the tests a column offers, and the rules summary.
 */
import { type PageWidget, parseGroupPath } from "@volvel/manifest";
import {
  type Action,
  type ActionContext,
  type ActionValue,
  type Condition,
  conditionSentence,
  refWords,
  type Step,
  singular,
} from "./actionModel.ts";
import { heading } from "./model.ts";

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** A step in one line, for when its card is collapsed: "Update this invoice: Status, Paid on". */
export function stepSummary(
  step: Step,
  ctx: ActionContext,
  pages: readonly { id: string; title: string }[] = [],
): string {
  switch (step.do) {
    case "update": {
      const fields = Object.keys(step.set).map(heading);
      return `Update ${refWords(ctx, step.record)}${fields.length ? `: ${fields.join(", ")}` : ""}`;
    }
    case "create": {
      const noun = singular(step.table);
      return step.table ? `Make ${article(noun)} ${noun}` : "Make a record";
    }
    case "delete":
      return `Remove ${refWords(ctx, step.record)}`;
    case "flow":
      return step.path ? `Run the workflow ${step.path}` : "Run a workflow";
    case "script":
      return step.path ? `Run the script ${step.path}` : "Run a script";
    case "open": {
      const page = pages.find((one) => one.id === step.page);
      return `Open ${page?.title ?? (step.page || "a page")}`;
    }
    case "close":
      return "Close";
    case "message":
      return `Show “${step.text}”`;
    case "narrow":
      return step.filter
        ? `Set ${heading(step.filter)} to the clicked ${step.from ? heading(step.from).toLowerCase() : "value"}`
        : "Filter the page";
    case "rows":
      return "Show the rows behind";
  }
}

/** A column named between braces, as a confirmation writes it: `Mark {number} as paid?`. */
export type TokenPart = { text: string } | { field: string };

const TOKEN = /\{([a-z][a-z0-9_]*)\}/g;

export function parseTokens(text: string): TokenPart[] {
  const parts: TokenPart[] = [];
  let last = 0;
  for (const found of text.matchAll(TOKEN)) {
    const at = found.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ field: found[1] as string });
    last = at + found[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** The words with each `{column}` replaced by that column of the sample record. */
export function fillTokens(
  text: string,
  record: Readonly<Record<string, unknown>> | undefined,
): string {
  return text.replace(TOKEN, (_all, name: string) => {
    const value = record?.[name];
    return value === undefined || value === null ? heading(name) : String(value);
  });
}

/** A value as a chip says it: "Paid", "Today", "Current user", "Status of this invoice". */
export function valueChipWords(value: ActionValue, ctx: ActionContext): string {
  if ("value" in value) return String(value.value ?? "") || "(empty)";
  if ("today" in value) return "Today";
  if ("now" in value) return "Now";
  if ("user" in value) return value.user === "id" ? "Current user" : `User ${value.user}`;
  if ("record" in value) return `${heading(value.record)} of ${refWords(ctx, value.of ?? "this")}`;
  return heading(value.asked);
}

// ---------------------------------------------------------------------------
// Groups

/** A group the tenant has: its path (what `runBy` and `seenBy` hold) and what it is called. */
export interface GroupChoice {
  path: string;
  name: string;
  kind: "member" | "end_user";
}

/** A group path's key: what a condition "the current user is in" names. */
export function groupKey(path: string): string {
  return parseGroupPath(path).key;
}

/** A group's name for its path, or its key when the tenant no longer has it. */
export function groupName(path: string, choices: readonly GroupChoice[]): string {
  const found = choices.find((one) => one.path === path);
  return found ? found.name : path.slice(path.indexOf("/") + 1);
}

// ---------------------------------------------------------------------------
// Conditions by the kind of column

export interface Operator {
  test: string;
  label: string;
  input?: "text" | "number" | "date" | "none";
}

const EMPTY_TESTS: Operator[] = [
  { test: "is_empty", label: "is empty", input: "none" },
  { test: "is_not_empty", label: "is not empty", input: "none" },
];

/** The tests a column of this type offers, worded as that kind of column's own. */
export function operatorsFor(type: string): Operator[] {
  switch (type) {
    case "number":
    case "integer":
    case "decimal":
    case "money":
      return [
        { test: "is", label: "is", input: "number" },
        { test: "is_not", label: "is not", input: "number" },
        { test: "gt", label: "is more than", input: "number" },
        { test: "gte", label: "is at least", input: "number" },
        { test: "lt", label: "is less than", input: "number" },
        { test: "lte", label: "is at most", input: "number" },
        ...EMPTY_TESTS,
      ];
    case "date":
    case "timestamp":
      return [
        { test: "is", label: "is on", input: "date" },
        { test: "lt", label: "is before", input: "date" },
        { test: "gt", label: "is after", input: "date" },
        ...EMPTY_TESTS,
      ];
    case "enum":
    case "choice":
    case "boolean":
      return [{ test: "is", label: "is" }, { test: "is_not", label: "is not" }, ...EMPTY_TESTS];
    default:
      return [
        { test: "is", label: "is" },
        { test: "is_not", label: "is not" },
        { test: "contains", label: "contains" },
        ...EMPTY_TESTS,
      ];
  }
}

/** "A", "A and B", "A, B and C". */
export function andWords(list: readonly string[]): string {
  return list.length < 3
    ? list.join(" and ")
    : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

/** "Status is Unpaid and Total is more than 50": sentences joined with "and". */
export function conditionsWords(list: readonly Condition[] | undefined): string {
  return (list ?? []).map((one) => conditionSentence(one)).join(" and ");
}

/**
 * The rules summary card of the Actions tab (board 4): "Shown when Status is Unpaid. Managers and
 * Billing can run it."
 */
export function rulesSummary(input: {
  showWhen?: readonly Condition[] | undefined;
  seenBy?: readonly string[] | undefined;
  pressedWhen?: readonly Condition[] | undefined;
  runBy?: readonly string[] | undefined;
  noun: string;
}): string {
  const out: string[] = [];
  if (input.showWhen?.length) out.push(`Shown when ${conditionsWords(input.showWhen)}.`);
  if (input.seenBy?.length) out.push(`Seen by ${andWords(input.seenBy)}.`);
  if (input.pressedWhen?.length) {
    out.push(`Can be pressed when ${conditionsWords(input.pressedWhen)}.`);
  }
  if (input.runBy?.length) {
    out.push(`${andWords(input.runBy)} can run it.`);
  }
  return out.length > 0
    ? out.join(" ")
    : `Always shown. Anyone who can open the ${input.noun} can run it.`;
}

// ---------------------------------------------------------------------------
// Where a widget's actions are held

/** Where one action of a widget lives: an event, a setting that holds one, or one of a list. */
export type SlotAt =
  | { kind: "event"; name: string }
  | { kind: "config"; name: string }
  | { kind: "list"; name: string; id: string };

export interface ActionSlot {
  /** For ids and keys. */
  key: string;
  /** What it is called: "When clicked", "When it is set", "Mark paid". */
  label: string;
  at: SlotAt;
  action: Action | undefined;
}

/** The widget with the action at `at` replaced (or taken away, with `undefined`). */
export function withSlot(
  widget: PageWidget,
  at: SlotAt,
  next: Action | undefined,
  config: Record<string, unknown> = widget.config ?? {},
): PageWidget {
  if (at.kind === "event") {
    const on = { ...(widget.on ?? {}) };
    if (next) on[at.name] = next as never;
    else delete on[at.name];
    const { on: _before, ...rest } = widget;
    return Object.keys(on).length > 0 ? { ...rest, on } : rest;
  }
  if (at.kind === "config") {
    const own = { ...(widget.config ?? {}) };
    if (next) own[at.name] = next;
    else delete own[at.name];
    const { config: _before, ...rest } = widget;
    return Object.keys(own).length > 0 ? { ...rest, config: own } : rest;
  }
  const list = Array.isArray(config[at.name]) ? (config[at.name] as { id: string }[]) : [];
  const put = list.map((one) =>
    one.id === at.id ? { ...one, action: next ?? { steps: [] } } : one,
  );
  return { ...widget, config: { ...(widget.config ?? {}), [at.name]: put } };
}
