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

import {
  type Action,
  CONDITION_TESTS,
  type Condition,
  type ConditionTest,
  RECORD_REFS,
  type RecordRef,
  SERVER_STEPS,
  type Step,
} from "@volvel/widgets/action";

export * from "@volvel/widgets/action";

// ---------------------------------------------------------------------------
// Schemas

const NAME = "^[a-z][a-z0-9_]{0,62}$";
const PATH = "^[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$";
const SLUG = "^[a-z][a-z0-9_-]{0,39}$";

const recordRef = { enum: [...RECORD_REFS] } as const;

export const actionValueSchema = {
  description:
    "A value a step sets or passes. It is never an expression: it is one of these kinds.",
  oneOf: [
    {
      type: "object",
      description: "A constant.",
      properties: { value: { description: "The value itself: text, a number, true or false." } },
      required: ["value"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "The date the step runs, in UTC.",
      properties: { today: { const: true, description: "Always `true`." } },
      required: ["today"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "The moment the step runs, in UTC.",
      properties: { now: { const: true, description: "Always `true`." } },
      required: ["now"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "Who is acting.",
      properties: {
        user: { enum: ["id", "email", "name"], description: "Which of the person's details." },
      },
      required: ["user"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "A column of a record.",
      properties: {
        record: { type: "string", pattern: NAME, description: "The column's name." },
        of: {
          ...recordRef,
          description:
            "Which record: `this`, the one the page was opened on, or `event`, the one the event gave. Left out, `this`.",
        },
      },
      required: ["record"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "What the person typed in the confirmation.",
      properties: {
        asked: {
          type: "string",
          pattern: NAME,
          description: "The `name` of the field the confirmation asked for.",
        },
      },
      required: ["asked"],
      additionalProperties: false,
    },
  ],
} as const;

const values = (description: string) =>
  ({
    type: "object",
    description,
    maxProperties: 30,
    propertyNames: { pattern: NAME },
    additionalProperties: actionValueSchema,
  }) as const;

const step = (
  kind: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({
  type: "object",
  description,
  properties: { do: { const: kind, description: `Always \`${kind}\`.` }, ...properties },
  required: ["do", ...required],
  additionalProperties: false,
});

const flowOrScriptPath = (what: string) => ({
  type: "string",
  pattern: PATH,
  maxLength: 255,
  description: `The path of the ${what}.`,
});
const recordOf = (what: string) => ({
  ...recordRef,
  description: `${what} \`this\` is the record the page was opened on, and \`event\` is the one the event gave: the row clicked, or the row whose action was pressed.`,
});

export const stepSchema = {
  description: "One thing an action does.",
  oneOf: [
    step(
      "update",
      "Sets fields of a record to named values. The fields named are all it may change.",
      {
        record: recordOf("The record to change."),
        set: values("What to set, by column name."),
      },
      ["record", "set"],
    ),
    step(
      "create",
      "Adds a row to a table, with the fields named.",
      {
        table: { type: "string", pattern: PATH, maxLength: 255, description: "The table's path." },
        set: values("The row's fields, by column name."),
      },
      ["table", "set"],
    ),
    step("delete", "Removes a record.", { record: recordOf("The record to remove.") }, ["record"]),
    step(
      "flow",
      "Starts a flow that has a manual start.",
      {
        path: flowOrScriptPath("flow"),
        input: values("What the flow is given, by the name of each input."),
      },
      ["path"],
    ),
    step(
      "script",
      "Starts a script.",
      {
        path: flowOrScriptPath("script"),
        input: values("What the script is given, by the name of each input."),
      },
      ["path"],
    ),
    step(
      "open",
      "Opens a page of this interface. A record page, a side sheet or a modal is opened on a record.",
      {
        page: { type: "string", pattern: SLUG, description: "The page's name." },
        record: recordOf("The record the page is opened on."),
      },
      ["page"],
    ),
    step("close", "Closes the side sheet or modal this page is open in.", {}),
    step(
      "message",
      "Says something in a notice.",
      {
        text: {
          type: "string",
          minLength: 1,
          maxLength: 300,
          description: "What is said.",
        },
        tone: { enum: ["success", "info"], description: "How the notice looks." },
      },
      ["text"],
    ),
    step(
      "narrow",
      "Sets a page filter to what the event gave: the group of a point clicked narrows the page to it.",
      {
        filter: { type: "string", pattern: NAME, description: "The name of the page filter." },
        from: {
          type: "string",
          maxLength: 130,
          description: "The part of what the event gave that the filter is set to.",
        },
      },
      ["filter", "from"],
    ),
    step("rows", "Shows the rows behind what was clicked, in a side sheet. It only reads.", {}),
  ],
} as const;

export const conditionSchema = {
  description: "A sentence that is true or not, about a record or about who is looking.",
  oneOf: [
    {
      type: "object",
      description: "A column of a record, tested.",
      properties: {
        field: { type: "string", pattern: NAME, description: "The column's name." },
        of: {
          ...recordRef,
          description:
            "Which record: `this`, the one the page was opened on, or `event`, the one the event gave. Left out, `this`.",
        },
        test: { enum: [...CONDITION_TESTS], description: "What is tested." },
        value: {
          description:
            "What the column is tested against. Not given for `is_empty` or `is_not_empty`.",
        },
      },
      required: ["field", "test"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "Who is acting.",
      properties: {
        user: { const: "in", description: "Always `in`." },
        group: {
          type: "string",
          minLength: 1,
          maxLength: 100,
          description: "The group the current user must be in, by its path.",
        },
      },
      required: ["user", "group"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "Whether a record is there.",
      properties: {
        record: { enum: ["exists", "missing"], description: "Whether a record must be chosen." },
        of: {
          ...recordRef,
          description:
            "Which record: `this`, the one the page was opened on, or `event`, the one the event gave. Left out, `this`.",
        },
      },
      required: ["record"],
      additionalProperties: false,
    },
  ],
} as const;

const conditions = (description: string) =>
  ({ type: "array", description, maxItems: 10, items: conditionSchema }) as const;

export const actionSchema = {
  type: "object",
  description: "What happens when someone acts on a widget.",
  properties: {
    confirm: {
      type: "object",
      description: "Asked before anything runs.",
      properties: {
        title: {
          type: "string",
          minLength: 1,
          maxLength: 120,
          description: "The question the confirmation asks.",
        },
        text: {
          type: "string",
          maxLength: 500,
          description: "More under the question. It may name a column of the record as `{column}`.",
        },
        button: {
          type: "string",
          minLength: 1,
          maxLength: 40,
          description: "What the button that goes on says.",
        },
        ask: {
          type: "array",
          maxItems: 6,
          description: "Fields the confirmation asks for before the steps run, such as a reason.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                pattern: NAME,
                description: "What the answer is called, for a step to use as `{ asked: name }`.",
              },
              label: {
                type: "string",
                minLength: 1,
                maxLength: 80,
                description: "What the field says.",
              },
              type: {
                enum: ["text", "long_text", "number", "date", "choice"],
                description: "What kind of answer it takes.",
              },
              required: { type: "boolean", description: "Whether the action waits for an answer." },
              choices: {
                type: "array",
                maxItems: 50,
                description: "For `choice`: what may be chosen.",
                items: { type: "string", maxLength: 100 },
              },
            },
            required: ["name", "label", "type"],
            additionalProperties: false,
          },
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    steps: {
      type: "array",
      description:
        "What it does, in order. Steps that change data or start work run on the server first, and the ones that move the reader run in the browser after.",
      minItems: 1,
      maxItems: 8,
      items: stepSchema,
    },
    when: conditions(
      "When it may be pressed: all must hold, for the record it acts on. They are checked again on the server.",
    ),
    done: {
      type: "string",
      maxLength: 300,
      description: "What is said when it worked, if the steps say nothing themselves.",
    },
    runBy: {
      type: "object",
      description:
        "Who may run it. Left out, whoever may open the app may. With groups named, only their members may, which the server checks, and a call to the API too.",
      properties: {
        groups: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          description: "The groups, each by its path: an end-user group or a member group.",
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
  description: "When a widget is drawn. Only what is drawn: never what someone may read or do.",
  properties: {
    showWhen: conditions("The widget is shown only while all of these hold."),
    seenBy: {
      type: "object",
      description:
        "Shown only to members of these groups. Drawing only: hiding a widget is not security.",
      properties: {
        groups: {
          type: "array",
          minItems: 1,
          maxItems: 10,
          description: "The groups, each by its path.",
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
  /** What each group the page's rules name is called now, by the path they name it by. */
  groupNames?: Readonly<Record<string, string>>;
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
