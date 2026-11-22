import type { InterfaceBody, PageWidget } from "./page.js";

/**
 * A group named in an action's `runBy` or a widget's `seenBy`: a group's path. It is the group's
 * key, which never changes; written `groups/<key>` or `end-user-groups/<key>` it names only a
 * group of members, or only a group of end users.
 */
export function parseGroupPath(path: string): { key: string; kind?: "member" | "end_user" } {
  if (path.startsWith("groups/")) return { key: path.slice("groups/".length), kind: "member" };
  if (path.startsWith("end-user-groups/")) {
    return { key: path.slice("end-user-groups/".length), kind: "end_user" };
  }
  return { key: path };
}

/** Whether a group path is among those that are known (by the same key rules as the server). */
export function groupKnown(path: string, known: ReadonlySet<string> | readonly string[]): boolean {
  const set: ReadonlySet<string> = Array.isArray(known)
    ? new Set(known as string[])
    : (known as ReadonlySet<string>);
  if (set.has(path)) return true;
  const { key } = parseGroupPath(path);
  return set.has(key) || set.has(`groups/${key}`) || set.has(`end-user-groups/${key}`);
}

export interface MissingGroup {
  /** The page, for an interface; none for a dashboard. */
  page?: string;
  widget: string;
  /** Where the group is named: `config/<property>...`, `on/<event>`, or `rules/seenBy`. */
  at: string;
  group: string;
}

/** Every `runBy` found in a widget's configuration, with where. */
function runBys(value: unknown, at: string, found: { at: string; groups: string[] }[]): void {
  if (Array.isArray(value)) {
    value.forEach((one, index) => {
      runBys(one, `${at}/${index}`, found);
    });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const object = value as Record<string, unknown>;
  const by = object.runBy as { groups?: unknown } | undefined;
  if (Array.isArray(object.steps) && by && Array.isArray(by.groups)) {
    found.push({ at, groups: by.groups.filter((one) => typeof one === "string") as string[] });
  }
  for (const [name, inner] of Object.entries(object)) {
    if (name === "runBy") continue;
    runBys(inner, name === "action" ? at : `${at}/${name}`, found);
  }
}

/** The groups a widget names, and where. */
function widgetGroups(widget: PageWidget): { at: string; group: string }[] {
  const out: { at: string; group: string }[] = [];
  const found: { at: string; groups: string[] }[] = [];
  for (const [event, action] of Object.entries(widget.on ?? {})) {
    runBys(action, `on/${event}`, found);
  }
  runBys(widget.config ?? {}, "config", found);
  for (const one of found) for (const group of one.groups) out.push({ at: one.at, group });
  for (const group of widget.rules?.seenBy?.groups ?? []) out.push({ at: "rules/seenBy", group });
  return out;
}

/**
 * The groups that actions (`runBy`) and widgets (`seenBy`) name which are not among `known`
 * (the paths or keys of the groups the tenant has). Pure, for the publish check: a group that is
 * gone matches nobody, so an action naming only such groups can be run by no one.
 */
export function missingGroups(
  body: Pick<InterfaceBody, "pages"> | { widgets: readonly PageWidget[] },
  known: ReadonlySet<string> | readonly string[],
): MissingGroup[] {
  const out: MissingGroup[] = [];
  const scan = (widgets: readonly PageWidget[], page?: string) => {
    for (const widget of widgets) {
      for (const one of widgetGroups(widget)) {
        if (groupKnown(one.group, known)) continue;
        out.push({ ...(page !== undefined ? { page } : {}), widget: widget.id, ...one });
      }
    }
  };
  if ("pages" in body) for (const page of body.pages) scan(page.widgets, page.id);
  else scan(body.widgets);
  return out;
}
