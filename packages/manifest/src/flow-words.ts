/**
 * What a flow is made of, in words: its steps, its starts, the names and functions an
 * expression may use. Declared once. The checks read the names (`EXPRESSION_ROOTS`), the
 * evaluator's tests run every example, and the reference's pages are drawn from these lists,
 * so a step or a start that has no words here does not compile.
 */
import type { FlowNode, FlowTrigger } from "./flow.js";

/** A step of a flow: what the canvas calls it and what it does. */
export interface FlowStepWords {
  /** What the canvas calls it. */
  label: string;
  /** What it does, and when the flow goes on from it. */
  description: string;
  /** Where its output is read: `steps.<name>.output`, and what that holds. */
  output: string;
}

/** Every kind of step, by its `type`. A new kind of step is a compile error until it is described. */
export const FLOW_STEPS: Record<FlowNode["type"], FlowStepWords> = {
  trigger: {
    label: "Trigger",
    description:
      "Where a flow starts. A flow may have several, and a run begins at the one that fired. What starts it is its `trigger`, one of the starts listed on the starts page.",
    output: "What the start was given: for a webhook the request, for an event its payload.",
  },
  script: {
    label: "Script",
    description:
      "Runs a script of the workspace, or a node, on a worker, with the input the step works out. The flow goes on when the script ends, and takes the error path when it fails.",
    output: "What the script returned.",
  },
  set: {
    label: "Set values",
    description:
      "Works out values from expressions and names them, so that later steps read them in one place.",
    output: "An object with each value under the name given.",
  },
  branch: {
    label: "Branch",
    description:
      "Goes one way. The cases are tried in order, and the flow leaves by the first whose `when` is true, or by `otherwise` when none is.",
    output: "Nothing: its edges are what it decides.",
  },
  foreach: {
    label: "For each",
    description:
      "Runs a script or a flow once for each item of a list, of at most 1000 items, with a limit on how many run at once. The flow goes on when every item has ended.",
    output: "A list with what each item gave, in order.",
  },
  join: {
    label: "Join",
    description: "Waits for every path that leads into it before the flow goes on.",
    output: "Nothing.",
  },
  delay: {
    label: "Wait",
    description: "Pauses the flow for a number of seconds. No worker is held while it waits.",
    output: "Nothing.",
  },
  approval: {
    label: "Approval",
    description:
      "Pauses the flow until a person with permission decides. It goes on when the decision is to approve, and takes the error path, with the reason given, when it is to reject.",
    output: "`approved`, true or false, and the `comment` given with the decision.",
  },
  subflow: {
    label: "Run a flow",
    description:
      "Starts another flow of the workspace, from its manual start, and waits for it to end.",
    output: "What the other flow ended with.",
  },
  respond: {
    label: "Answer the request",
    description:
      "Answers the request of a webhook whose flow holds it open. Only a flow whose webhook says `respond: flow` may have one.",
    output: "`status`, and `answered`, true when this was the first answer given.",
  },
  fail: {
    label: "Fail",
    description: "Ends the flow as failed, with a message.",
    output: "Nothing.",
  },
};

/** A way to start a flow: what the canvas calls it and when it fires. */
export interface FlowStartWords {
  label: string;
  description: string;
  /** What `trigger` holds in an expression of the flow. */
  gives: string;
}

/** Every kind of start, by its `type`. */
export const FLOW_STARTS: Record<FlowTrigger["type"], FlowStartWords> = {
  manual: {
    label: "By hand",
    description:
      "Started from the console, the API, the command line, an agent or another flow. Its `input` is a JSON Schema the input must match.",
    gives: "The input the flow was started with.",
  },
  schedule: {
    label: "On a schedule",
    description:
      "Starts at times given as a cron line, in a time zone. While the last run from it is still going, `overlap` says whether a time is passed over or starts another run.",
    gives: "An empty object. The run keeps the time it was due.",
  },
  webhook: {
    label: "On a webhook",
    description:
      "Starts when its address is called. It may check a signature, answer at once or hold the request open for an Answer step.",
    gives: "The body of the request, or with `input: request` the whole request, headers included.",
  },
  event: {
    label: "On an event",
    description:
      "Starts when an event of the workspace, or one Volvel publishes, is published, and the optional `filter` gives true.",
    gives:
      "The event's payload. The `filter` reads the whole event as `event`, with its `name` and its `payload`.",
  },
  form: {
    label: "On a form",
    description:
      "Starts when someone fills in a page Volvel serves from the fields the start lists.",
    gives: "An object with one value for each field of the form.",
  },
};

/** A name an expression of a flow may read. */
export interface ExpressionName {
  name: string;
  description: string;
  /** Where it is there. */
  where: string;
}

export const EXPRESSION_NAMES: readonly ExpressionName[] = [
  {
    name: "trigger",
    description: "What started the flow: the output of the start that fired.",
    where: "Every expression.",
  },
  {
    name: "steps",
    description:
      "What the steps that have ended gave: `steps.<name>.output` for one that succeeded, `steps.<name>.error.message` for one that failed and whose error path was taken.",
    where: "Every expression.",
  },
  {
    name: "now",
    description: "The moment the expression is worked out, as a timestamp.",
    where: "Every expression.",
  },
  {
    name: "item",
    description: "The item of the list a For each is on.",
    where: "Inside a For each step.",
  },
  {
    name: "index",
    description: "The place of that item in the list, from 0.",
    where: "Inside a For each step.",
  },
  {
    name: "event",
    description: "The event an event start was given, with its `name` and its `payload`.",
    where: "The `filter` of an event start.",
  },
];

/** A function or macro an expression may call, with an example that is run. */
export interface ExpressionFunction {
  name: string;
  group: "Macros" | "Text" | "Conversions" | "Lists and maps" | "Time";
  /** As it is written. */
  signature: string;
  description: string;
  /** An expression worked out where `trigger` is `{ "name": "Ada", "n": 3, "tags": ["a", "b"] }`. */
  example: string;
  /** What the example gives, as JSON. */
  gives: unknown;
}

/** What an example is worked out against, and the moment `now` is. */
export const EXPRESSION_EXAMPLE_DATA = {
  trigger: { name: "Ada", n: 3, tags: ["a", "b"] },
  now: "2026-03-05T10:30:00Z",
} as const;

export const EXPRESSION_FUNCTIONS: readonly ExpressionFunction[] = [
  {
    name: "has",
    group: "Macros",
    signature: "has(field)",
    description: "True when the field is there, so that reading it is safe.",
    example: "has(trigger.name)",
    gives: true,
  },
  {
    name: "all",
    group: "Macros",
    signature: "list.all(item, test)",
    description: "True when the test is true for every item.",
    example: "[1, 2, 3].all(i, i > 0)",
    gives: true,
  },
  {
    name: "exists",
    group: "Macros",
    signature: "list.exists(item, test)",
    description: "True when the test is true for at least one item.",
    example: "[1, 2, 3].exists(i, i > 2)",
    gives: true,
  },
  {
    name: "exists_one",
    group: "Macros",
    signature: "list.exists_one(item, test)",
    description: "True when the test is true for exactly one item.",
    example: "[1, 2, 3].exists_one(i, i > 2)",
    gives: true,
  },
  {
    name: "map",
    group: "Macros",
    signature: "list.map(item, expression)",
    description: "A list with the expression worked out for each item.",
    example: "[1, 2, 3].map(i, i * 2)",
    gives: [2, 4, 6],
  },
  {
    name: "filter",
    group: "Macros",
    signature: "list.filter(item, test)",
    description: "The items for which the test is true.",
    example: "[1, 2, 3].filter(i, i > 1)",
    gives: [2, 3],
  },
  {
    name: "cel.bind",
    group: "Macros",
    signature: "cel.bind(name, value, expression)",
    description: "Works the value out once and names it, for use in the expression.",
    example: "cel.bind(a, 2, a + a)",
    gives: 4,
  },
  {
    name: "size",
    group: "Lists and maps",
    signature: "size(value)",
    description: "How many characters a text has, items a list has or entries a map has.",
    example: "size(trigger.tags)",
    gives: 2,
  },
  {
    name: "join",
    group: "Lists and maps",
    signature: "list.join(separator)",
    description: "A list of text joined into one text.",
    example: "['a', 'b'].join('-')",
    gives: "a-b",
  },
  {
    name: "startsWith",
    group: "Text",
    signature: "text.startsWith(prefix)",
    description: "True when the text begins with the prefix.",
    example: "trigger.name.startsWith('A')",
    gives: true,
  },
  {
    name: "endsWith",
    group: "Text",
    signature: "text.endsWith(suffix)",
    description: "True when the text ends with the suffix.",
    example: "trigger.name.endsWith('a')",
    gives: true,
  },
  {
    name: "contains",
    group: "Text",
    signature: "text.contains(part)",
    description: "True when the part is somewhere in the text.",
    example: "trigger.name.contains('d')",
    gives: true,
  },
  {
    name: "matches",
    group: "Text",
    signature: "text.matches(pattern)",
    description:
      "True when the text matches the regular expression. It runs on RE2, which has no back references or look-around.",
    example: "'a1'.matches('[a-z][0-9]')",
    gives: true,
  },
  {
    name: "lowerAscii",
    group: "Text",
    signature: "text.lowerAscii()",
    description: "The text in small letters. Only the letters of ASCII change.",
    example: "trigger.name.lowerAscii()",
    gives: "ada",
  },
  {
    name: "upperAscii",
    group: "Text",
    signature: "text.upperAscii()",
    description: "The text in capital letters. Only the letters of ASCII change.",
    example: "trigger.name.upperAscii()",
    gives: "ADA",
  },
  {
    name: "trim",
    group: "Text",
    signature: "text.trim()",
    description: "The text without the spaces at its two ends.",
    example: "' x '.trim()",
    gives: "x",
  },
  {
    name: "indexOf",
    group: "Text",
    signature: "text.indexOf(part)",
    description: "Where the part first is, from 0, or -1.",
    example: "'abcabc'.indexOf('c')",
    gives: 2,
  },
  {
    name: "lastIndexOf",
    group: "Text",
    signature: "text.lastIndexOf(part)",
    description: "Where the part last is, from 0, or -1.",
    example: "'abcabc'.lastIndexOf('c')",
    gives: 5,
  },
  {
    name: "substring",
    group: "Text",
    signature: "text.substring(from, to)",
    description: "The part of the text from one place up to, not including, another.",
    example: "'abcdef'.substring(1, 3)",
    gives: "bc",
  },
  {
    name: "split",
    group: "Text",
    signature: "text.split(separator)",
    description: "A list of the parts of the text between the separator.",
    example: "'a,b,c'.split(',')",
    gives: ["a", "b", "c"],
  },
  {
    name: "int",
    group: "Conversions",
    signature: "int(value)",
    description:
      "A whole number, from text or a number. Numbers that come from steps are decimals, so convert with this before adding a whole number.",
    example: "int('42')",
    gives: 42,
  },
  {
    name: "double",
    group: "Conversions",
    signature: "double(value)",
    description: "A decimal number, from text or a whole number.",
    example: "double(3)",
    gives: 3,
  },
  {
    name: "string",
    group: "Conversions",
    signature: "string(value)",
    description:
      "Text. A timestamp becomes ISO 8601 in UTC, so `string(now).substring(0, 10)` is today's date.",
    example: "string(now).substring(0, 10)",
    gives: "2026-03-05",
  },
  {
    name: "bool",
    group: "Conversions",
    signature: "bool(value)",
    description: "True or false, from text.",
    example: "bool('true')",
    gives: true,
  },
  {
    name: "dyn",
    group: "Conversions",
    signature: "dyn(value)",
    description: "The value, with its type left open, for a test that mixes types.",
    example: "dyn(1)",
    gives: 1,
  },
  {
    name: "timestamp",
    group: "Time",
    signature: "timestamp(text)",
    description: "A moment, from text written as ISO 8601.",
    example: "timestamp('2026-03-05T10:30:00Z')",
    gives: "2026-03-05T10:30:00.000Z",
  },
  {
    name: "duration",
    group: "Time",
    signature: "duration(text)",
    description:
      "A length of time, written with `h`, `m`, `s`, `ms`, `us` or `ns`, such as `90m`. There is no day: write `24h`.",
    example: "now + duration('24h')",
    gives: "2026-03-06T10:30:00.000Z",
  },
  {
    name: "getFullYear",
    group: "Time",
    signature: "moment.getFullYear(zone?)",
    description: "The year.",
    example: "timestamp('2026-03-05T10:30:00Z').getFullYear()",
    gives: 2026,
  },
  {
    name: "getMonth",
    group: "Time",
    signature: "moment.getMonth(zone?)",
    description: "The month, from 0 for January.",
    example: "timestamp('2026-03-05T10:30:00Z').getMonth()",
    gives: 2,
  },
  {
    name: "getDate",
    group: "Time",
    signature: "moment.getDate(zone?)",
    description: "The day of the month, from 1.",
    example: "timestamp('2026-03-05T10:30:00Z').getDate()",
    gives: 5,
  },
  {
    name: "getDayOfMonth",
    group: "Time",
    signature: "moment.getDayOfMonth(zone?)",
    description: "The day of the month, from 0.",
    example: "timestamp('2026-03-05T10:30:00Z').getDayOfMonth()",
    gives: 4,
  },
  {
    name: "getDayOfWeek",
    group: "Time",
    signature: "moment.getDayOfWeek(zone?)",
    description: "The day of the week, from 0 for Sunday.",
    example: "timestamp('2026-03-05T10:30:00Z').getDayOfWeek()",
    gives: 4,
  },
  {
    name: "getDayOfYear",
    group: "Time",
    signature: "moment.getDayOfYear(zone?)",
    description: "The day of the year, from 0.",
    example: "timestamp('2026-03-05T10:30:00Z').getDayOfYear()",
    gives: 63,
  },
  {
    name: "getHours",
    group: "Time",
    signature: "moment.getHours(zone?)",
    description:
      "The hour, from 0. Give a time zone to read it there: `getHours('America/New_York')`.",
    example: "timestamp('2026-03-05T10:30:00Z').getHours('America/New_York')",
    gives: 5,
  },
  {
    name: "getMinutes",
    group: "Time",
    signature: "moment.getMinutes(zone?)",
    description: "The minute.",
    example: "timestamp('2026-03-05T10:30:00Z').getMinutes()",
    gives: 30,
  },
  {
    name: "getSeconds",
    group: "Time",
    signature: "moment.getSeconds(zone?)",
    description: "The second.",
    example: "timestamp('2026-03-05T10:30:00Z').getSeconds()",
    gives: 0,
  },
  {
    name: "getMilliseconds",
    group: "Time",
    signature: "moment.getMilliseconds(zone?)",
    description: "The millisecond.",
    example: "timestamp('2026-03-05T10:30:00Z').getMilliseconds()",
    gives: 0,
  },
];

/** What the evaluator holds an expression to. */
export const EXPRESSION_LIMITS = [
  { limit: "Time to work out", value: "250 milliseconds" },
  { limit: "Memory", value: "64 megabytes" },
  { limit: "Nodes in the expression", value: "2000" },
  { limit: "Depth of nesting", value: "64" },
  { limit: "Entries in a list or map written out", value: "200" },
  { limit: "Arguments to a call", value: "16" },
  { limit: "Characters in an expression of a manifest", value: "2000" },
] as const;

/** The operators every expression has, as they are written. */
export const EXPRESSION_OPERATORS = [
  {
    operator: "+ - * / %",
    description:
      "Arithmetic. A whole number and a decimal are not mixed: write `1.0`, or convert with `int(...)`. `+` also joins text and lists.",
  },
  { operator: "== != < <= > >=", description: "Comparison." },
  { operator: "&& || !", description: "And, or, not." },
  { operator: "a ? b : c", description: "B when a is true, otherwise c." },
  { operator: "in", description: "True when the value is in a list, or the key is in a map." },
  {
    operator: "a[i]  a.b  a['b']",
    description: "An item of a list by its place, a field of a map by its name.",
  },
] as const;
