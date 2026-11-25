/**
 * The dot on an inspector tab says one thing: something in this tab needs fixing. It is not "there
 * is something set here" (that read as a notification, to someone looking at a tab they had just
 * filled in). A tab with nothing to fix has no dot.
 *
 * The problems are the ones the "N to fix" pill and the publish check name, each put on the tab
 * it is fixed in:
 *
 * - Data: a table or a saved query that is gone, a column that is not in its table, a summary that
 *   works out fewer values than the widget needs;
 * - Display: a widget that would show nothing (a list with nothing placed, a pivot with no grid, a
 *   detail with no record), a button with no label;
 * - Actions: an action with no steps, or that names a page, a table, a flow or a script that is
 *   gone;
 * - Rules: a group that is gone, named in who may see or run it;
 * - and what the server refused when the draft was saved, by the place it names.
 *
 * Pure, so a dashboard's inspector and an app's read the same rule.
 */
import {
  type Action,
  groupName,
  type InterfaceBody,
  missingGroups,
  type Page,
  type PageWidget,
  parseGroupPath,
  type VisualQuery,
} from "@volvel/manifest";
import type { Tab, WidgetDefinition } from "@volvel/widgets";
import {
  actionProblem,
  actionsOf,
  inputsNeededOf,
  type Known,
  nameAlong,
  problemWords,
  showsNothing,
} from "../../screens/builder/publishCheck.ts";
import type { Catalog, FlowChoice, ScriptChoice } from "./model.ts";

/** One thing to fix, and the tab it is fixed in. */
export interface TabProblem {
  tab: Tab;
  /** What is wrong, in words that name the field or the section: "Table: invoices no longer exists". */
  text: string;
}

/** What the server refused about this widget: the place inside it, and the words. */
export interface WidgetRefusal {
  /** The path below the widget: `config/columns/0`, `on/click`. */
  rest: readonly string[];
  text: string;
}

export interface TabProblemInput {
  widget: PageWidget;
  definition: WidgetDefinition;
  catalog: Catalog;
  pages?: readonly Page[] | undefined;
  flows?: readonly FlowChoice[] | undefined;
  scripts?: readonly ScriptChoice[] | undefined;
  /** The paths of the groups the tenant has; `undefined` while they are not known. */
  groups?: readonly string[] | undefined;
  refusals?: readonly WidgetRefusal[] | undefined;
  /** The widget's page, for a form's record and what an action may open. */
  page?: Page | undefined;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The refusals of a saved draft that are about one widget, by the page and widget they name. */
export function refusalsFor(
  problems: readonly { path: string; message: string }[],
  pages: readonly Page[],
  pageId: string,
  widgetId: string,
): WidgetRefusal[] {
  const body = { pages } as unknown as InterfaceBody;
  const pageAt = pages.findIndex((page) => page.id === pageId);
  const widgetAt = pages[pageAt]?.widgets.findIndex((widget) => widget.id === widgetId) ?? -1;
  if (pageAt < 0 || widgetAt < 0) return [];
  const prefix = `/body/pages/${pageAt}/widgets/${widgetAt}`;
  const widget = pages[pageAt]?.widgets[widgetAt];
  const named = `${widget?.title || widget?.id} on ${pages[pageAt]?.title}: `;
  return problems.flatMap((problem) => {
    if (problem.path !== prefix && !problem.path.startsWith(`${prefix}/`)) return [];
    return [
      {
        rest: problem.path.slice(prefix.length).split("/").filter(Boolean),
        // Said in the widget's own drawer, where it need not be named.
        text: capital(`${problemWords(problem, body)}.`.replace(/\.\.$/, ".").replace(named, "")),
      },
    ];
  });
}

/** What is wrong with one action, in words, or nothing when it is complete: the Actions tab's rule, for one button. */
export function actionFix(
  action: Action,
  world: Pick<TabProblemInput, "catalog" | "pages" | "flows" | "scripts">,
): string | undefined {
  const known = world.catalog.tables.length > 0;
  const why = actionProblem(
    action,
    { pages: [...(world.pages ?? [])] } as unknown as InterfaceBody,
    {
      tables: known
        ? new Map(world.catalog.tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]))
        : undefined,
      queries: undefined,
      flows: new Set((world.flows ?? []).map((one) => one.path)),
      scripts: new Set((world.scripts ?? []).map((one) => one.path)),
      inputsNeeded: inputsNeededOf(world.flows, world.scripts),
      groups: undefined,
    },
    (world.pages ?? []).length > 0,
  );
  return why ? `This button ${why.replace(/^it /, "")}.` : undefined;
}

/** The tab a setting of a widget is changed in. */
function tabOfConfig(definition: WidgetDefinition, name: string): Tab | undefined {
  const hint = definition.config.properties[name]?.["x-volvel"];
  return hint?.tab;
}

/** The tab a server refusal is fixed in, from the place it names. */
function tabOfRefusal(definition: WidgetDefinition, rest: readonly string[]): Tab {
  const [first, second] = rest;
  if (first === "data") return "data";
  if (first === "on") return "actions";
  if (first === "rules") return "rules";
  if (first === "config" && second) {
    // A button's or a row action's own steps and words are the Actions tab's.
    if (rest.includes("steps") || rest.includes("action")) return "actions";
    return tabOfConfig(definition, second) ?? "display";
  }
  return "display";
}

/** The columns a visual query names, with where each is named (for the words). */
function columnsOf(visual: VisualQuery): { column: string; where: string }[] {
  return [
    ...(visual.columns ?? []).map((column) => ({ column, where: "Columns" })),
    ...(visual.groupBy ?? []).map((one) => ({ column: one.column, where: "Breakdown" })),
    ...(visual.measures ?? []).flatMap((one) =>
      one.column ? [{ column: one.column, where: "Values" }] : [],
    ),
    ...(visual.filters ?? []).map((one) => ({ column: one.column, where: "Only include" })),
    ...(visual.sort ?? []).flatMap((one) =>
      // A sort may name a group or a measure by its name: only a plain column name is checked
      // against the table when it is not one of those.
      (visual.measures ?? []).some((measure) => measure.as === one.by) ||
      (visual.groupBy ?? []).some((group) => group.column === one.by || groupName(group) === one.by)
        ? []
        : [{ column: one.by, where: "Sorted by" }],
    ),
  ];
}

export function tabProblems(input: TabProblemInput): TabProblem[] {
  const { widget, definition, catalog } = input;
  const found: TabProblem[] = [];
  const add = (tab: Tab, text: string) => {
    if (!found.some((one) => one.tab === tab && one.text === text)) found.push({ tab, text });
  };

  // Data. Until the workspace's tables are read (an empty catalog) nothing can be said to be gone.
  const known = catalog.tables.length > 0;
  const tables = new Map(
    catalog.tables.map((table) => [table.name, new Set(table.columns.map((c) => c.name))]),
  );
  for (const [name, data] of Object.entries(widget.data ?? {})) {
    const label = definition.data?.[name]?.label ?? "Source";
    const source = data.source;
    if ("visual" in source) {
      const visual = source.visual;
      const columns = known ? tables.get(visual.table) : undefined;
      if (known && !columns && !visual.table.includes("/")) {
        add("data", `${label}: the table ${visual.table} no longer exists.`);
      } else if (columns) {
        const system = new Set(["id", "created_at", "updated_at"]);
        for (const one of columnsOf(visual)) {
          // A column through a reference (`customer.name`) is followed by its own table: left alone.
          if (one.column.includes(".") || one.column.includes("/")) continue;
          if (!columns.has(one.column) && !system.has(one.column)) {
            add("data", `${one.where}: ${one.column} is not in ${visual.table} any more.`);
          }
        }
      }
      const declared = definition.data?.[name];
      if (declared?.shape === "summary") {
        const need = declared.values?.min ?? 1;
        const have = visual.measures?.length ?? 0;
        if (have < need) {
          add(
            "data",
            `${label}: needs ${need === 1 ? "a value" : `at least ${need} values`} worked out, and has ${have === 0 ? "none" : have}.`,
          );
        }
      }
    } else if ("query" in source && catalog.queries.length > 0) {
      if (!catalog.queries.some((query) => query.path === source.query)) {
        add("data", `${label}: the saved query ${source.query} no longer exists.`);
      }
    } else if ("own" in source && known && !tables.has(source.own.table)) {
      add("data", `${label}: the table ${source.own.table} no longer exists.`);
    }
  }

  // Display.
  const empty = showsNothing(widget);
  // What a list places is its Display; where a detail's record or a pivot's grid comes from is Data.
  if (empty) add(widget.type === "core/list" ? "display" : "data", empty);
  const grouped = (widget.config?.groupRows as { column?: unknown } | undefined)?.column;
  const read = widget.data?.rows?.source;
  if (typeof grouped === "string" && grouped !== "" && read) {
    if ("visual" in read) {
      const columns = known ? tables.get(read.visual.table) : undefined;
      if (columns && !columns.has(grouped) && !["created_at", "updated_at"].includes(grouped)) {
        add("display", `Group rows by: ${grouped} is not in ${read.visual.table} any more.`);
      }
    } else if ("query" in read || "sql" in read) {
      add("display", "Group rows by: only rows read from a table can be grouped. Choose Nothing.");
    }
  }
  for (const key of ["rowActions", "buttons"] as const) {
    const list = widget.config?.[key];
    if (!Array.isArray(list)) continue;
    for (const [at, one] of (list as { label?: unknown; icon?: unknown }[]).entries()) {
      if ((typeof one.label !== "string" || one.label.trim() === "") && !one.icon) {
        add(
          "actions",
          `${key === "rowActions" ? "Row action" : "Button"} ${at + 1} has no label: write what it says, or choose an icon.`,
        );
      }
    }
  }

  // Actions.
  const body = { pages: [...(input.pages ?? [])] } as unknown as InterfaceBody;
  const world: Known = {
    tables: known ? tables : undefined,
    queries: undefined,
    flows: new Set((input.flows ?? []).map((one) => one.path)),
    scripts: new Set((input.scripts ?? []).map((one) => one.path)),
    inputsNeeded: inputsNeededOf(input.flows, input.scripts),
    groups: undefined,
  };
  for (const one of actionsOf(widget)) {
    // On a dashboard there are no pages to open: that part of the check is left out.
    const why = actionProblem(one.action, body, world, (input.pages ?? []).length > 0);
    if (!why) continue;
    const own = nameAlong(widget, one.at.split("/").slice(1));
    const event = one.at.startsWith("on/") ? one.at.slice(3) : undefined;
    const name =
      own ?? (event ? (definition.events?.[event]?.label ?? `When ${event}`) : "An action");
    add("actions", why === "has no steps yet" ? `${name} has no steps yet.` : `${name}: ${why}.`);
  }

  // Rules: a group that is gone.
  if (input.groups && input.groups.length > 0) {
    const lost = missingGroups({ widgets: [widget] }, input.groups);
    const names = [...new Set(lost.map((one) => parseGroupPath(one.group).key))];
    if (names.length > 0) {
      add(
        "rules",
        `${names.join(", ")} ${names.length === 1 ? "is a group that no longer exists" : "are groups that no longer exist"}. What names only such groups is for nobody.`,
      );
    }
  }

  // What the server refused when the draft was saved.
  // One that names a thing already said on its tab ("no_such_table") is that problem again.
  const said = [...found];
  for (const one of input.refusals ?? []) {
    const tab = tabOfRefusal(definition, one.rest);
    const named = [...one.text.matchAll(/["“`]([^"”`]+)["”`]/g)].map((match) => match[1] as string);
    const again = said.some(
      (other) => other.tab === tab && named.some((name) => other.text.includes(name)),
    );
    if (!again) add(tab, one.text);
  }
  return found;
}

/** The problems of one tab. */
export const inTab = (problems: readonly TabProblem[], tab: Tab): string[] =>
  problems.filter((one) => one.tab === tab).map((one) => one.text);
