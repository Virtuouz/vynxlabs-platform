/**
 * What a page does when someone acts on it (S9, decision 0004): an action is a
 * short list of steps, written in the page's body and run from the deployed
 * page. Steps that change data or start work run on the server; steps that
 * move the reader (open a page, show a message, narrow the page) run in the
 * browser, in the order written, after the server's are done.
 *
 * A deployed action is its own grant (phase 26, owner decision 1): whoever may
 * open the app may run it. It changes only the fields it names, to the values
 * it names, on rows the person may read, and its conditions are checked again
 * on the server. Nothing here is an expression: every value is one of a few
 * named kinds.
 */

/** Which record a step works on. */
export const RECORD_REFS = ["this", "event"] as const;
/**
 * - `this`: the record the page was opened on (a record page, a side sheet or a modal);
 * - `event`: the record the event gave: the row clicked, the row whose action was pressed.
 */
export type RecordRef = (typeof RECORD_REFS)[number];

/**
 * A value a step sets or passes. Never an expression.
 * - `{ value }`: a constant;
 * - `{ today: true }` / `{ now: true }`: the date or the moment the step runs (UTC);
 * - `{ user: "id" | "email" | "name" }`: who is acting;
 * - `{ record: column, of?: RecordRef }`: a column of a record (default `this`);
 * - `{ asked: name }`: what the person typed in the confirmation, by the field's name.
 */
export type ActionValue =
  | { value: unknown }
  | { today: true }
  | { now: true }
  | { user: "id" | "email" | "name" }
  | { record: string; of?: RecordRef }
  | { asked: string };

/** A field the confirmation asks for before the steps run, such as a reason. */
export interface AskedField {
  name: string;
  label: string;
  type: "text" | "long_text" | "number" | "date" | "choice";
  required?: boolean;
  choices?: string[];
}

export const STEP_KINDS = [
  "update",
  "create",
  "delete",
  "flow",
  "script",
  "open",
  "close",
  "message",
  "narrow",
  "rows",
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** Steps the server runs: they change data, or start work. */
export const SERVER_STEPS: readonly StepKind[] = ["update", "create", "delete", "flow", "script"];

export type Step =
  /** Set fields of a record to named values. The fields named are all it may change. */
  | { do: "update"; record: RecordRef; set: Record<string, ActionValue> }
  /** Add a row to a table, with the fields named. */
  | { do: "create"; table: string; set: Record<string, ActionValue> }
  /** Remove a record. */
  | { do: "delete"; record: RecordRef }
  /** Start a flow with a manual trigger, given these inputs. */
  | { do: "flow"; path: string; input?: Record<string, ActionValue> }
  /** Start a script, given these inputs. */
  | { do: "script"; path: string; input?: Record<string, ActionValue> }
  /** Open a page of this interface: a record page, side sheet or modal is opened on a record. */
  | { do: "open"; page: string; record?: RecordRef }
  /** Close the side sheet or modal this page is open in. */
  | { do: "close" }
  /** Say something in a notice. */
  | { do: "message"; text: string; tone?: "success" | "info" }
  /** Set a page filter to what the event gave: the group of a clicked point narrows the page to it. */
  | { do: "narrow"; filter: string; from: string }
  /** Show the rows behind what was clicked, in a side sheet. Reads only. */
  | { do: "rows" };

export interface Action {
  /** Asked before anything runs. `text` may name a column of the record as `{column}`. */
  confirm?: { title: string; text?: string; button?: string; ask?: AskedField[] };
  steps: Step[];
  /** When it may be pressed: all must hold, for the record it acts on. Checked again on the server. */
  when?: Condition[];
  /** What is said when it worked, if the steps say nothing themselves. */
  done?: string;
  /**
   * Who may run it (phase 28, decision 2). Left out, whoever may open the app may (decision
   * 0004). With groups named, only their members may: checked on the server, a call to the API
   * too. Each is a group's path, of an end-user group or a member group. It only narrows.
   */
  runBy?: { groups: string[] };
}

/** Who may see a widget: drawing only, never security (the tables' row rules are). */
export interface SeenBy {
  groups: string[];
}

/** The tests a condition may make. */
export const CONDITION_TESTS = [
  "is",
  "is_not",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "is_empty",
  "is_not_empty",
] as const;
export type ConditionTest = (typeof CONDITION_TESTS)[number];

/**
 * A sentence: "Status is Unpaid", "Total is more than 5000", "the current user
 * is in Managers", "a record is chosen". Never an expression.
 */
export type Condition =
  | { field: string; of?: RecordRef; test: ConditionTest; value?: unknown }
  | { user: "in"; group: string }
  | { record: "exists" | "missing"; of?: RecordRef };

/** When a widget is shown. Only what is drawn: never what someone may read or do (S9). */
export interface WidgetRules {
  showWhen?: Condition[];
  /** Shown only to members of these groups (by path). Drawing only: hiding is not security. */
  seenBy?: SeenBy;
}

// ---------------------------------------------------------------------------
// Schemas

const NAME = "^[a-z][a-z0-9_]{0,62}$";
const PATH = "^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$";
const SLUG = "^[a-z][a-z0-9_-]{0,39}$";

const recordRef = { enum: [...RECORD_REFS] } as const;

export const actionValueSchema = {
  oneOf: [
    { type: "object", properties: { value: {} }, required: ["value"], additionalProperties: false },
    {
      type: "object",
      properties: { today: { const: true } },
      required: ["today"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { now: { const: true } },
      required: ["now"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { user: { enum: ["id", "email", "name"] } },
      required: ["user"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { record: { type: "string", pattern: NAME }, of: recordRef },
      required: ["record"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { asked: { type: "string", pattern: NAME } },
      required: ["asked"],
      additionalProperties: false,
    },
  ],
} as const;

const values = {
  type: "object",
  maxProperties: 30,
  propertyNames: { pattern: NAME },
  additionalProperties: actionValueSchema,
} as const;

const step = (kind: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties: { do: { const: kind }, ...properties },
  required: ["do", ...required],
  additionalProperties: false,
});

export const stepSchema = {
  oneOf: [
    step("update", { record: recordRef, set: values }, ["record", "set"]),
    step("create", { table: { type: "string", pattern: PATH, maxLength: 255 }, set: values }, [
      "table",
      "set",
    ]),
    step("delete", { record: recordRef }, ["record"]),
    step("flow", { path: { type: "string", pattern: PATH, maxLength: 255 }, input: values }, [
      "path",
    ]),
    step("script", { path: { type: "string", pattern: PATH, maxLength: 255 }, input: values }, [
      "path",
    ]),
    step("open", { page: { type: "string", pattern: SLUG }, record: recordRef }, ["page"]),
    step("close", {}),
    step(
      "message",
      {
        text: { type: "string", minLength: 1, maxLength: 300 },
        tone: { enum: ["success", "info"] },
      },
      ["text"],
    ),
    step(
      "narrow",
      { filter: { type: "string", pattern: NAME }, from: { type: "string", maxLength: 130 } },
      ["filter", "from"],
    ),
    step("rows", {}),
  ],
} as const;

export const conditionSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        field: { type: "string", pattern: NAME },
        of: recordRef,
        test: { enum: [...CONDITION_TESTS] },
        value: {},
      },
      required: ["field", "test"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        user: { const: "in" },
        group: { type: "string", minLength: 1, maxLength: 100 },
      },
      required: ["user", "group"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: { record: { enum: ["exists", "missing"] }, of: recordRef },
      required: ["record"],
      additionalProperties: false,
    },
  ],
} as const;

const conditions = { type: "array", maxItems: 10, items: conditionSchema } as const;

export const actionSchema = {
  type: "object",
  properties: {
    confirm: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 120 },
        text: { type: "string", maxLength: 500 },
        button: { type: "string", minLength: 1, maxLength: 40 },
        ask: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              name: { type: "string", pattern: NAME },
              label: { type: "string", minLength: 1, maxLength: 80 },
              type: { enum: ["text", "long_text", "number", "date", "choice"] },
              required: { type: "boolean" },
              choices: { type: "array", maxItems: 50, items: { type: "string", maxLength: 100 } },
            },
            required: ["name", "label", "type"],
            additionalProperties: false,
          },
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    steps: { type: "array", minItems: 1, maxItems: 8, items: stepSchema },
    when: conditions,
    done: { type: "string", maxLength: 300 },
    runBy: {
      type: "object",
      properties: {
        groups: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: { type: "string", pattern: PATH, maxLength: 255 },
        },
      },
      required: ["groups"],
      additionalProperties: false,
    },
  },
  required: ["steps"],
  additionalProperties: false,
} as const;

export const widgetRulesSchema = {
  type: "object",
  properties: {
    showWhen: conditions,
    seenBy: {
      type: "object",
      properties: {
        groups: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          items: { type: "string", pattern: PATH, maxLength: 255 },
        },
      },
      required: ["groups"],
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Reading

/** Whether a step runs on the server. */
export const runsOnServer = (step: Step): boolean => SERVER_STEPS.includes(step.do);

/** The fields an action may change, by table: what it grants (decision 0004). */
export function grantedFields(action: Action, tableOf: (ref: RecordRef) => string | undefined) {
  const out: { table: string; fields: string[]; how: "update" | "create" | "delete" }[] = [];
  for (const one of action.steps) {
    if (one.do === "update") {
      const table = tableOf(one.record);
      if (table) out.push({ table, fields: Object.keys(one.set), how: "update" });
    } else if (one.do === "create") {
      out.push({ table: one.table, fields: Object.keys(one.set), how: "create" });
    } else if (one.do === "delete") {
      const table = tableOf(one.record);
      if (table) out.push({ table, fields: [], how: "delete" });
    }
  }
  return out;
}

/** Everything a condition reads, to be checked against the record's table. */
export function conditionFields(
  conditions: readonly Condition[] | undefined,
): { field: string; of: RecordRef }[] {
  return (conditions ?? []).flatMap((one) =>
    "field" in one ? [{ field: one.field, of: one.of ?? "this" }] : [],
  );
}

/**
 * `is` and `is not` take one value, or several as an array, read as "any of" and "none of".
 * An empty list matches nothing.
 */
function isAmong(value: unknown, wanted: unknown): boolean {
  const text = String(value);
  return Array.isArray(wanted)
    ? wanted.some((one) => String(one) === text)
    : text === String(wanted);
}

export interface ActingUser {
  id: string;
  email?: string;
  name?: string;
  /** The names of the groups the person is in. */
  groups: readonly string[];
}

/**
 * Whether conditions hold, for the records an action or a widget sees. Shared by
 * the browser (to draw) and the server (to refuse): the server's answer is the one
 * that counts.
 */
export function conditionsHold(
  conditions: readonly Condition[] | undefined,
  records: {
    this?: Readonly<Record<string, unknown>> | null;
    event?: Readonly<Record<string, unknown>> | null;
  },
  user: ActingUser | undefined,
): boolean {
  return (conditions ?? []).every((one) => {
    if ("user" in one) return user?.groups.includes(one.group) ?? false;
    if ("record" in one) {
      const present = records[one.of ?? "this"] != null;
      return one.record === "exists" ? present : !present;
    }
    const record = records[one.of ?? "this"];
    const value = record?.[one.field];
    const empty = value === null || value === undefined || value === "";
    switch (one.test) {
      case "is_empty":
        return empty;
      case "is_not_empty":
        return !empty;
      case "is":
        return !empty && isAmong(value, one.value);
      case "is_not":
        return empty || !isAmong(value, one.value);
      case "contains":
        return (
          !empty &&
          String(value)
            .toLowerCase()
            .includes(String(one.value ?? "").toLowerCase())
        );
      default: {
        if (empty) return false;
        const a = typeof value === "number" ? value : Number(value);
        const b = Number(one.value);
        const comparable = Number.isFinite(a) && Number.isFinite(b);
        const [x, y] = comparable ? [a, b] : [String(value), String(one.value)];
        if (one.test === "gt") return x > y;
        if (one.test === "gte") return x >= y;
        if (one.test === "lt") return x < y;
        return x <= y;
      }
    }
  });
}

/** "A", "A or B", "A, B or C". */
export function listWords(list: readonly string[]): string {
  return list.length < 3 ? list.join(" or ") : `${list.slice(0, -1).join(", ")} or ${list.at(-1)}`;
}

/** What a sentence says, in the reader's words: "Status is Unpaid". For a label, not a check. */
export function conditionWords(
  one: Condition,
  label: (field: string) => string = (field) => field,
): string {
  if ("user" in one) return `the current user is in ${one.group}`;
  if ("record" in one)
    return one.record === "exists" ? "a record is chosen" : "no record is chosen";
  const words: Record<ConditionTest, string> = {
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
  const said = `${label(one.field)} ${words[one.test]}`;
  if (one.test === "is_empty" || one.test === "is_not_empty") return said;
  if (Array.isArray(one.value)) return `${said} ${listWords(one.value.map(String))}`;
  return `${said} ${String(one.value ?? "")}`;
}
