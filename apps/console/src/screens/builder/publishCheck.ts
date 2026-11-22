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

/** What is wrong with an action, in words; nothing when it is complete. */
function actionProblem(action: Action, body: InterfaceBody, known: Known): string | undefined {
  if (action.steps.length === 0) return "it has no steps";
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

/**
 * The readiness check of board 6, as items: what a publish would find wrong, or worth knowing,
 * said before it is done. Pure: the panel reads the workspace and hands it in.
 */
export function checksFor(input: {
  body: InterfaceBody;
  known: Known;
  definitionOf: (type: string) => WidgetDefinition | undefined;
  /** What saving the draft refused, as the server words it. */
  problems: readonly string[];
  /** What deploying would refuse, and what it would warn of. */
  refusal: readonly string[];
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
      return why
        ? [`${nameOf(one.widget, definitionOf(one.widget.type))} on ${one.page.title}: ${why}`]
        : [];
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
            detail: sentence(broken),
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
        ? { id: `form:${widget.id}`, state: "fail", text: `${name} form can't save`, detail: why }
        : { id: `form:${widget.id}`, state: "ok", text: `${name} form is valid` },
    );
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

  // What saving and deploying refuse, in the server's words.
  for (const message of [...input.problems, ...input.refusal]) {
    items.push({ id: `refused:${message}`, state: "fail", text: message });
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

/**
 * What the server refused, said in the page's words: "/body/pages/0/widgets/9/config/... must NOT
 * have fewer than 1 items" becomes "Invoices on Money: needs at least 1".
 */
export function plainly(message: string, body: InterfaceBody): string {
  const found = /^\/body\/pages\/(\d+)(?:\/widgets\/(\d+))?\S*\s+(.*)$/.exec(message);
  if (!found) return message;
  const page = body.pages[Number(found[1])];
  const widget = found[2] !== undefined ? page?.widgets[Number(found[2])] : undefined;
  const what = (found[3] ?? "").replace(
    /must NOT have fewer than (\d+) items?/,
    "needs at least $1",
  );
  const where = [widget ? widget.title || widget.id : undefined, page?.title]
    .filter(Boolean)
    .join(" on ");
  return where ? `${where}: ${what}` : what;
}
