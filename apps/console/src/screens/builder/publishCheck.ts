import {
  type Action,
  flowsWithoutApprovals,
  type InterfaceBody,
  missingGroups,
  type Page,
  type PageWidget,
  parseGroupPath,
  type WidgetSource,
  widgetQueries,
  widgetTables,
} from "@volvel/manifest";
import { hiddenOnPhone } from "@volvel/screens";
import type { WidgetDefinition } from "@volvel/widgets";

/** ✓ it holds, ⚠ it holds but something is worth knowing, ✗ publishing should wait. */
export type CheckState = "ok" | "warn" | "fail";

export interface CheckItem {
  id: string;
  state: CheckState;
  text: string;
  /** A line under it: what, and where. */
  detail?: string;
  /** The widget it is about, so the check can take the builder there. */
  at?: { page: string; widget: string };
}

/** Something the server refused, in the page's words, and the widget it is about when that is known. */
export interface Refused {
  text: string;
  at?: { page: string; widget: string } | undefined;
}

/** What the check is made against: the workspace as it is now. */
export interface Known {
  /** `undefined` while it is still being read: that check is left out rather than guessed. */
  tables: ReadonlyMap<string, ReadonlySet<string>> | undefined;
  queries: ReadonlySet<string> | undefined;
  flows: ReadonlySet<string>;
  scripts: ReadonlySet<string>;
  /** The keys of the tenant's groups, members' and end users'. */
  groups: readonly string[] | undefined;
  /** Each flow, with whether it asks for an approval: `undefined` while it is read. */
  approvalFlows?: ReadonlyMap<string, { title: string | null; asks: boolean }> | undefined;
  /** Where apps are served: at their own address (decisions are made in the console), or on the console's. */
  appsAddress?: "separate" | "console" | "none" | undefined;
}

const nameOf = (widget: PageWidget, definition: WidgetDefinition | undefined) =>
  widget.title || definition?.title || widget.id;

/** Every action a widget carries, with where: `on/<event>`, and any inside its configuration. */
export function actionsOf(widget: PageWidget): { at: string; action: Action }[] {
  const found: { at: string; action: Action }[] = [];
  const walk = (value: unknown, at: string) => {
    if (Array.isArray(value)) {
      value.forEach((one, index) => {
        walk(one, `${at}/${index}`);
      });
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.steps)) {
      found.push({ at, action: object as unknown as Action });
      return;
    }
    for (const [name, inner] of Object.entries(object)) walk(inner, `${at}/${name}`);
  };
  for (const [event, action] of Object.entries(widget.on ?? {})) walk(action, `on/${event}`);
  walk(widget.config ?? {}, "config");
  return found;
}

const NO_STEPS = "has no steps yet";

/** What is wrong with an action, in words; nothing when it is complete. */
function actionProblem(action: Action, body: InterfaceBody, known: Known): string | undefined {
  if (action.steps.length === 0) return NO_STEPS;
  for (const step of action.steps) {
    if (step.do === "open" && !body.pages.some((page) => page.id === step.page))
      return "it opens a page that is gone";
    if (step.do === "create" && known.tables && !known.tables.has(step.table))
      return `it adds to ${step.table}, which does not exist`;
    if (step.do === "flow" && known.flows.size > 0 && !known.flows.has(step.path))
      return `it starts ${step.path}, which can't be started by hand`;
    if (step.do === "script" && known.scripts.size > 0 && !known.scripts.has(step.path))
      return `it runs ${step.path}, which does not exist`;
  }
  return undefined;
}

/**
 * The table a form writes to: the one it reads, or the one of the record its page is opened on
 * (an edit form on a record page, a side sheet or a modal), or the table of the row it follows.
 */
function tableOfSource(source: WidgetSource | undefined, page: Page): string | undefined {
  if (!source) return undefined;
  if ("visual" in source) return source.visual.table;
  if ("record" in source) return page.record?.table;
  if ("own" in source) return source.own.table;
  if ("selected" in source) {
    for (const one of page.widgets) {
      for (const input of Object.values(one.data ?? {})) {
        if (one.id === source.selected && "visual" in input.source)
          return input.source.visual.table;
      }
    }
  }
  return undefined;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

function sentence(items: readonly string[], most = 3): string {
  const shown = items.slice(0, most).join("; ");
  return items.length > most ? `${shown}; and ${items.length - most} more` : shown;
}

/** Why a widget as it is configured draws nothing useful, when it does not: what to choose to fix it. */
export function showsNothing(widget: PageWidget): string | undefined {
  const config = widget.config ?? {};
  if (widget.type === "core/list") {
    const placed = ["title", "subtitle", "right", "badge", "picture"].some(
      (place) => typeof config[place] === "string" && config[place] !== "",
    );
    return placed
      ? undefined
      : "Nothing is placed: choose what the title, the line under it and the badge show.";
  }
  if (widget.type === "core/pivot") {
    const source = widget.data?.rows?.source;
    const by = source && "visual" in source ? (source.visual.groupBy?.length ?? 0) : 2;
    return by >= 2 ? undefined : "Choose the rows and the columns of the grid.";
  }
  if (widget.type === "core/detail") {
    const source = widget.data?.record?.source;
    return source && ("record" in source || "selected" in source || "own" in source)
      ? undefined
      : "Choose where the record comes from.";
  }
  return undefined;
}

/**
 * The readiness check of board 6, as items: what a publish would find wrong, or worth knowing,
 * said before it is done. Pure: the panel reads the workspace and hands it in.
 */
export function checksFor(input: {
  body: InterfaceBody;
  known: Known;
  definitionOf: (type: string) => WidgetDefinition | undefined;
  /** What saving the draft refused, as the server words it, and where. */
  problems: readonly Refused[];
  /** What deploying would refuse, and what it would warn of. */
  refusal: readonly Refused[];
  warnings: readonly string[];
}): CheckItem[] {
  const { body, known, definitionOf } = input;
  const items: CheckItem[] = [];
  const every = body.pages.flatMap((page) => page.widgets.map((widget) => ({ page, widget })));

  // Data: every table and query the pages read exists.
  if (known.tables && known.queries) {
    const gone = [
      ...widgetTables(every.map((one) => one.widget)).filter((table) => !known.tables?.has(table)),
      ...widgetQueries(every.map((one) => one.widget)).filter(
        (query) => !known.queries?.has(query),
      ),
    ];
    items.push(
      gone.length === 0
        ? { id: "data", state: "ok", text: "All data sources found" }
        : {
            id: "data",
            state: "fail",
            text: `${plural(gone.length, "data source")} not found`,
            detail: gone.join(", "),
          },
    );
  }

  // Actions: each has steps, and what they name exists.
  const actions = every.flatMap(({ page, widget }) =>
    actionsOf(widget).map((one) => ({ page, widget, ...one })),
  );
  if (actions.length > 0) {
    const broken = actions.flatMap((one) => {
      const why = actionProblem(one.action, body, known);
      if (!why) return [];
      // A button of a group, or a row action, is named by what it says: "Do it on Money has no steps yet".
      const own = nameAlong(one.widget, one.at.split("/").slice(1));
      const name = own ?? nameOf(one.widget, definitionOf(one.widget.type));
      return [
        {
          text:
            why === NO_STEPS
              ? `${name} on ${one.page.title} ${why}`
              : `${name} on ${one.page.title}: ${why}`,
          at: { page: one.page.id, widget: one.widget.id },
        },
      ];
    });
    items.push(
      broken.length === 0
        ? {
            id: "actions",
            state: "ok",
            text: `${plural(actions.length, "action")} ${actions.length === 1 ? "is" : "are"} complete`,
          }
        : {
            id: "actions",
            state: "fail",
            text: `${broken.length} of ${plural(actions.length, "action")} ${broken.length === 1 ? "is" : "are"} not complete`,
            detail: sentence(broken.map((one) => one.text)),
            at: broken[0]?.at as { page: string; widget: string },
          },
    );
  }

  // Forms: each has a table, and asks for columns it has.
  for (const { page, widget } of every.filter((one) => one.widget.type === "core/form")) {
    // "New invoice form": named by what it is on, the page, when it has no title of its own.
    const name = (widget.title || page.title).replace(/\s+form$/i, "");
    const source = Object.values(widget.data ?? {})[0]?.source;
    const table = tableOfSource(source, page);
    const columns = table ? known.tables?.get(table) : undefined;
    const fields = Array.isArray(widget.config?.fields)
      ? (widget.config.fields as { column?: string }[])
      : [];
    const unknown = columns ? fields.filter((one) => one.column && !columns.has(one.column)) : [];
    const why = !table
      ? "no table chosen"
      : known.tables && !columns
        ? `${table} does not exist`
        : unknown.length > 0
          ? `${unknown.map((one) => one.column).join(", ")} ${unknown.length === 1 ? "is" : "are"} not in ${table}`
          : undefined;
    items.push(
      why
        ? {
            id: `form:${widget.id}`,
            state: "fail",
            text: `${name} form can't save`,
            detail: why,
            at: { page: page.id, widget: widget.id },
          }
        : { id: `form:${widget.id}`, state: "ok", text: `${name} form is valid` },
    );
  }

  // What shows nothing yet: a List with nothing placed, a Pivot with no grid, a detail with no record.
  for (const { page, widget } of every) {
    const why = showsNothing(widget);
    if (!why) continue;
    items.push({
      id: `empty:${page.id}:${widget.id}`,
      state: "warn",
      text: `${nameOf(widget, definitionOf(widget.type))} on ${page.title} shows nothing yet`,
      detail: why,
      at: { page: page.id, widget: widget.id },
    });
  }

  // Approvals: the flows it lists ask for an approval, and where it is decided.
  const asking = every.filter((one) => one.widget.type === "core/approvals");
  if (asking.length > 0) {
    const flows = known.approvalFlows;
    if (flows) {
      for (const path of flowsWithoutApprovals(
        asking.map((one) => one.widget),
        (name) => {
          const found = flows.get(name);
          return found ? { nodes: found.asks ? [{ type: "approval" }] : [] } : undefined;
        },
      )) {
        const title = flows.get(path)?.title || (path.split("/").at(-1) ?? path);
        items.push({
          id: `approvals:${path}`,
          state: "warn",
          text: `Approvals lists ${title}, which asks for no approval`,
          detail: "Nothing will wait there until the workflow has an approval step.",
        });
      }
    }
    if (known.appsAddress && known.appsAddress !== "none") {
      items.push({
        id: "approvals:console",
        state: "warn",
        text: "Approvals are decided in the console, not in this app",
        detail:
          "Apps written as code run at the address this app is served at, so the app shows the requests and sends people to the console to decide them.",
      });
    }
  }

  // The phone: widgets it hides.
  const hidden = every.filter((one) => hiddenOnPhone(one.widget, definitionOf(one.widget.type)));
  if (hidden.length > 0) {
    items.push({
      id: "phone",
      state: "warn",
      text: `Phone layout hides ${plural(hidden.length, "widget")}`,
      detail: sentence(
        hidden.map(
          (one) => `${nameOf(one.widget, definitionOf(one.widget.type))}, on ${one.page.title}`,
        ),
      ),
    });
  }

  // Groups the rules name that are gone: the action runs for nobody.
  if (known.groups) {
    const lost = missingGroups(body, known.groups);
    if (lost.length > 0) {
      const names = [...new Set(lost.map((one) => parseGroupPath(one.group).key))];
      items.push({
        id: "groups",
        state: "warn",
        text: `${plural(names.length, "group")} named in the rules no longer ${names.length === 1 ? "exists" : "exist"}`,
        detail: `${names.join(", ")}. An action that names only such groups can be run by nobody.`,
      });
    }
  }

  // What saving and deploying refuse, in the server's words. The same refusal said by both, or by
  // the same place twice, is listed once.
  const said = new Set<string>();
  for (const one of [...input.problems, ...input.refusal]) {
    const key = `${one.at?.widget ?? ""}|${one.text}`;
    if (said.has(key)) continue;
    said.add(key);
    items.push({
      id: `refused:${key}`,
      state: "fail",
      text: one.text,
      ...(one.at ? { at: one.at } : {}),
    });
  }
  for (const message of input.warnings) {
    items.push({ id: `warned:${message}`, state: "warn", text: message });
  }
  return items;
}

/** The group the rules touch most, among those that exist: the one to "Try as … first". */
export function mostAffectedGroup(
  body: InterfaceBody,
  known: readonly string[],
): string | undefined {
  const counts = new Map<string, number>();
  const count = (path: string) => {
    const { key } = parseGroupPath(path);
    if (known.includes(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const page of body.pages) {
    for (const widget of page.widgets) {
      for (const group of widget.rules?.seenBy?.groups ?? []) count(group);
      for (const { action } of actionsOf(widget))
        for (const group of action.runBy?.groups ?? []) count(group);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const singularOf = (word: string): string =>
  word.endsWith("ies") ? `${word.slice(0, -3)}y` : word.endsWith("s") ? word.slice(0, -1) : word;

/** A name in a path as words: `rowActions` as "row actions". */
const wordsOfKey = (key: string): string =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .toLowerCase();

/** The things a list of this name holds, for "needs at least 2 buttons". */
const THINGS: Record<string, string> = { actions: "button", rowActions: "row action" };
const thing = (key: string, count: number): string => {
  const one = THINGS[key] ?? singularOf(wordsOfKey(key));
  return count === 1 ? one : one.endsWith("y") ? `${one.slice(0, -1)}ies` : `${one}s`;
};

/**
 * The nearest thing with a name on the way down a path into a widget: the button or the column
 * a problem is in, "Do it" in `config/actions/0/action/steps`.
 */
function nameAlong(widget: PageWidget, rest: readonly string[]): string | undefined {
  let at: unknown = widget;
  let found: string | undefined;
  for (const key of rest) {
    if (typeof at !== "object" || at === null) break;
    at = (at as Record<string, unknown>)[key];
    const named = (at as { label?: unknown } | null)?.label;
    if (typeof named === "string" && named.trim()) found = named;
  }
  return found;
}

/**
 * What the server refused, said in the page's words. The server names a place ("/body/pages/0/
 * widgets/9/config/actions/1/action/steps") and says it in the schema's ("must NOT have fewer
 * than 1 items"); the builder says which button of which widget on which page, and what it needs.
 */
export function problemWords(problem: { path: string; message: string }, body: InterfaceBody) {
  const found = /^\/body\/pages\/(\d+)(?:\/widgets\/(\d+)(\/\S*)?)?/.exec(problem.path);
  if (!found) return plainly(problem.message, body);
  const page = body.pages[Number(found[1])];
  const widget = found[2] !== undefined ? page?.widgets[Number(found[2])] : undefined;
  const rest = (found[3] ?? "").split("/").filter(Boolean);
  const last = rest.at(-1) ?? "";
  const place = [widget ? widget.title || widget.id : undefined, page?.title]
    .filter(Boolean)
    .join(" on ");
  const own = widget ? nameAlong(widget, rest) : undefined;
  const inside = own ? [own, page?.title].filter(Boolean).join(" on ") : place;
  const fewer = /^must NOT have fewer than (\d+) items?$/.exec(problem.message);
  const more = /^must NOT have more than (\d+) items?$/.exec(problem.message);
  const required = /^must have required property '(.+)'$/.exec(problem.message);
  let what: string;
  if (fewer) {
    const count = Number(fewer[1]);
    what =
      last === "steps" && count === 1
        ? "has no steps yet"
        : `needs at least ${count} ${thing(last || "item", count)}`;
    return last === "steps" ? `${inside} ${what}` : place ? `${place}: ${what}` : what;
  }
  if (more) what = `has more than ${more[1]} ${thing(last || "item", 2)}; ${more[1]} is the most`;
  else if (required) what = `needs ${wordsOfKey(required[1] ?? "")}`;
  else if (/^must NOT have additional properties$/.test(problem.message))
    what = "has a setting it does not take";
  else if (/^must be equal to one of the allowed values$/.test(problem.message))
    what = `has ${last ? wordsOfKey(last) : "a value"} that is not one of the choices`;
  else what = problem.message;
  return place ? `${place}: ${what}` : what;
}

/** `problemWords` for a message that carries its place: "/body/pages/0/widgets/9/config/x must NOT …". */
export function plainly(message: string, body: InterfaceBody): string {
  const found = /^(\/body\/pages\/\d+\S*)\s+(.*)$/.exec(message);
  return found ? problemWords({ path: found[1] ?? "", message: found[2] ?? "" }, body) : message;
}

/** The page and widget a refusal is about, from the place the server names. */
export function problemAt(
  problem: { path: string },
  body: InterfaceBody,
): { page: string; widget: string } | undefined {
  const found = /^\/body\/pages\/(\d+)\/widgets\/(\d+)/.exec(problem.path);
  if (!found) return undefined;
  const page = body.pages[Number(found[1])];
  const widget = page?.widgets[Number(found[2])];
  return page && widget ? { page: page.id, widget: widget.id } : undefined;
}
