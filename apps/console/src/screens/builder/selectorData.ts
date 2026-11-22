import type { CatalogTable } from "../../kit/inspector/model.ts";
import { manyOf, oneOf } from "./records.ts";

/** How a widget is drawn in the selector's preview. */
export type Drawing =
  | "table"
  | "list"
  | "detail"
  | "form"
  | "stat"
  | "chart"
  | "pivot"
  | "goal"
  | "button"
  | "actions"
  | "approvals"
  | "section"
  | "tabs"
  | "filter"
  | "text"
  | "generic";

/** What the preview says of a widget, and the words a search can find it by (decision 5: words, no AI). */
export interface Preview {
  drawing: Drawing;
  /** What it is, in a paragraph. */
  about: string;
  /** Other words for what it does: "take payments" finds Button. */
  words: string;
  /** Whether it starts on a table of the workspace. */
  reads: boolean;
  /** Three examples of what it is good for, composed from the page's table when there is one. */
  goodFor: (table: TableFacts | undefined) => string[];
}

/** What the page's table offers examples: its name and the kinds of columns it has. */
export interface TableFacts {
  name: string;
  date: string | undefined;
  group: string | undefined;
  group2: string | undefined;
  number: string | undefined;
  /** What the page already calls its measure (a number it shows: "Invoiced"), so the examples use its words. */
  measure?: string | undefined;
}

const label = (name: string) => name.replace(/_(at|on|id)$/, "").replace(/_/g, " ");

/** The columns a table's examples are made of: a date, two to group by, a number. */
export function factsOf(table: CatalogTable | undefined): TableFacts | undefined {
  if (!table) return undefined;
  const user = table.columns.filter(
    (one) => !["id", "created_at", "updated_at"].includes(one.name),
  );
  const date = user.find((one) => one.type === "date" || one.type === "timestamp")?.name;
  const groups = user.filter((one) => one.type === "enum" || one.references);
  const number = user.find((one) => ["integer", "number", "money"].includes(one.type))?.name;
  return { name: table.name, date, group: groups[0]?.name, group2: groups[1]?.name, number };
}

const many = (t: TableFacts | undefined) => (t ? manyOf(t.name) : "Records");
const one = (t: TableFacts | undefined) => (t ? oneOf(t.name).toLowerCase() : "record");
const by = (t: TableFacts | undefined, which: "group" | "group2") =>
  t?.[which] ? ` by ${label(t[which] as string)}` : "";

/** The examples made from the table first, then the generic ones, three in all. */
const pad = (made: string[], more: string[]): string[] => [...made, ...more].slice(0, 3);

export const PREVIEWS: Record<string, Preview> = {
  "core/table": {
    drawing: "table",
    about:
      "Many records at once, dense and sortable. Pick the columns, sort and filter them, and let a click on a row open its record or run an action.",
    words: "rows records spreadsheet grid browse sort search all",
    reads: true,
    goodFor: (t) =>
      pad(
        [`All ${many(t).toLowerCase()}`, ...(t?.group ? [`${many(t)}${by(t, "group")}`] : [])],
        ["Everything to review today", "Recent activity"],
      ),
  },
  "core/list": {
    drawing: "list",
    about:
      "Records as rows of cards, each with a title, a line under it and a badge. Reads well on a phone.",
    words: "cards feed mobile phone browse",
    reads: true,
    goodFor: (t) =>
      pad([`Today's ${many(t).toLowerCase()}`], ["What is waiting on me", "The latest changes"]),
  },
  "core/detail": {
    drawing: "detail",
    about:
      "One record in full: its fields, grouped, with the actions that apply to it. Opens when a row is clicked.",
    words: "record open view single item sheet details edit",
    reads: true,
    goodFor: (t) =>
      pad(
        [`One ${one(t)} with its fields`],
        ["A customer card", "What was agreed, and what is next"],
      ),
  },
  "core/form": {
    drawing: "form",
    about:
      "Create or edit a record. The right control for each field is picked from its column, and the table's checks apply.",
    words: "create add new enter data input submit edit sign request collect",
    reads: true,
    goodFor: (t) => pad([`New ${one(t)}`], ["Request something", "Log a visit"]),
  },
  "core/stat": {
    drawing: "stat",
    about: "One number: a total, a count or an average, with a comparison to the period before.",
    words: "total count average sum kpi metric number revenue",
    reads: true,
    goodFor: (t) =>
      pad(
        [t?.number ? `Total ${label(t.number)}` : `${many(t)} counted`],
        ["Unpaid, right now", "Average per visit"],
      ),
  },
  "core/chart": {
    drawing: "chart",
    about:
      "A trend over time, or a comparison between groups. Pick what to measure and what to break it down by; the chart type is suggested for you.",
    words: "graph trend plot compare bars line pie over time report analytics",
    reads: true,
    goodFor: (t) =>
      pad(
        [
          `${t?.measure ?? many(t)} ${t?.date ? "by week" : "over time"}`,
          ...(t?.group ? [`${t.measure ?? many(t)}${by(t, "group")}`] : []),
        ],
        ["Visits by vet, by month", "Revenue by clinic"],
      ),
  },
  "core/pivot": {
    drawing: "pivot",
    about: "A value across two breakdowns, shaded by size: rows and columns with their totals.",
    words: "cross tab matrix grid summary breakdown heatmap",
    reads: true,
    goodFor: (t) =>
      pad(t?.group && t.group2 ? [`${many(t)} by ${label(t.group)} and ${label(t.group2)}`] : [], [
        "Visits by vet and month",
        "Stock by shelf and supplier",
      ]),
  },
  "labs/goal": {
    drawing: "goal",
    about: "How far a number is toward a target, with the share reached.",
    words: "target progress quota objective kpi budget",
    reads: true,
    goodFor: () => ["Revenue toward the month's target", "Visits toward the quota", "Budget used"],
  },
  "core/button": {
    drawing: "button",
    about:
      "One action people press: mark something paid, send a message, run a workflow. It can ask to confirm first.",
    words: "action press click run pay payment charge send approve confirm mark paid workflow",
    reads: false,
    goodFor: () => ["Mark paid", "Send the invoice", "Approve the request"],
  },
  "core/actions": {
    drawing: "actions",
    about:
      "Several buttons as a toolbar, lined up left, right or spread, with the rest behind a menu.",
    words: "buttons toolbar menu group actions bar",
    reads: false,
    goodFor: () => ["Mark paid, Send, Edit", "Approve or reject", "A toolbar over a table"],
  },
  "core/approvals": {
    drawing: "approvals",
    about:
      "Requests waiting for a decision. Pick one, read its details, approve or reject, and the next one is there. Who may decide is set on the workflow's step.",
    words:
      "sign off approve approval approvals requests review decide reject queue inbox pending waiting workflow manager",
    reads: false,
    goodFor: () => [
      "Stock orders waiting for a manager",
      "Time off to sign off",
      "Refunds to review",
    ],
  },
  "core/section": {
    drawing: "section",
    about: "A heading over widgets that belong together, plain or as a card, which can fold away.",
    words: "group heading card container fold collapse title",
    reads: false,
    goodFor: () => [
      "The numbers, under one heading",
      "A card of related charts",
      "Details that fold",
    ],
  },
  "core/tabs": {
    drawing: "tabs",
    about: "Views in one place: each tab holds its own widgets, and one opens first.",
    words: "views switch sections container",
    reads: false,
    goodFor: () => ["Overview, Activity, Notes", "This month and last", "A table and its chart"],
  },
  "core/filter": {
    drawing: "filter",
    about:
      "Narrow the page: a search box and filters that the page's widgets follow, in a row or behind a button.",
    words: "search narrow find look up filter date range status",
    reads: false,
    goodFor: () => ["Search by number or name", "Status", "Issued in the last 30 days"],
  },
  "core/text": {
    drawing: "text",
    about:
      "Notes and help in your own words: plain, a note, a warning or a tip. Written on the page.",
    words: "notes help explain instructions heading label markdown write words callout",
    reads: false,
    goodFor: () => ["How this page works", "A warning before a risky step", "A link to the policy"],
  },
};

const flowWords = (path: string, title: string | null) => {
  if (title) return title;
  const last = path.split("/").at(-1) ?? path;
  return last.replace(/[_-]+/g, " ");
};

/**
 * The card offered when the workspace has a workflow with an approval step and the page has no
 * Approvals widget to decide it: what waits for a decision is worth a place where people work.
 */
export function approvalsSuggestion(
  flows: readonly { path: string; title: string | null }[],
  widgets: readonly { type: string }[],
): { key: "approvals"; label: string; hint: string } | undefined {
  if (flows.length === 0 || widgets.some((one) => one.type === "core/approvals")) return undefined;
  const [first] = flows;
  return {
    key: "approvals",
    label: "Approvals",
    hint:
      flows.length === 1 && first
        ? `${flowWords(first.path, first.title)} waits for a decision`
        : `${flows.length} workflows wait for a decision`,
  };
}

export const GENERIC: Preview = {
  drawing: "generic",
  about: "A widget from a pack added to this workspace.",
  words: "",
  reads: false,
  goodFor: () => [],
};

export const previewOf = (type: string): Preview => PREVIEWS[type] ?? GENERIC;

/** Words a suggestion is found by, besides its label and line: what it does for the person asking. */
export const SUGGESTION_WORDS: Record<string, string> = {
  search: "find look up search narrow",
  detail: "open view record click details",
  form: "create add new enter data submit",
  mark: "pay payment paid settle approve complete",
  filter: "narrow status filter",
  group: "toolbar buttons group",
  section: "heading numbers card",
  approvals: "sign off approve requests review waiting decision workflow",
};

const FILLER = new Set(
  "a an the to of and or for in on at it is be people person users user should can could do does want wants need needs let lets make take show add find something describe my our their them so that this with i we when how what".split(
    " ",
  ),
);

/** The words of a phrase that say something: lowercase, without filler, a plural as its singular. */
export function wordsOf(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "" && !FILLER.has(word))
    .map((word) => (word.length > 3 ? word.replace(/s$/, "") : word));
}

/** Whether every word of the search is in the text. */
export const matchesWords = (needle: readonly string[], text: string): boolean => {
  const hay = text.toLowerCase();
  return needle.every((word) => hay.includes(word));
};
