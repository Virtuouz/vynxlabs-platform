/**
 * What a page does when someone acts on it, as it is written in a page's body: types, and the
 * names they are made of. The schemas, the checks and what runs are `@volvel/manifest`'s.
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

/** Every kind of step an action may have. */
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
/** One of `STEP_KINDS`. */
export type StepKind = (typeof STEP_KINDS)[number];

/** Steps the server runs: they change data, or start work. */
export const SERVER_STEPS: readonly StepKind[] = ["update", "create", "delete", "flow", "script"];

/**
 * What each kind of step does to the world, in one place: a step that "writes" changes data or
 * starts work; one that "moves" only moves the reader (opens a page, narrows it, says something).
 * A tenant widget's frame can emit an event with no click, so an action wired to one asks the
 * person first when any of its steps writes (decision 0005, amendment of 2026-11-24). The record
 * is typed by every kind, so a new kind does not compile until it is classified.
 */
export const STEP_EFFECT: Readonly<Record<StepKind, "write" | "moves">> = {
  update: "write",
  create: "write",
  delete: "write",
  flow: "write",
  script: "write",
  open: "moves",
  close: "moves",
  message: "moves",
  narrow: "moves",
  rows: "moves",
};

/** Whether running the action changes anything: any one step writes. */
export const changesAnything = (action: { steps: readonly { do: StepKind }[] }): boolean =>
  action.steps.some((one) => STEP_EFFECT[one.do] === "write");

/** One thing an action does. Each kind of step is written with `do` and takes its own fields. */
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

/** What happens when someone acts on a widget: an optional confirmation, a list of steps and when it may be pressed. */
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
/** One of the tests a condition may make of a field. */
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
