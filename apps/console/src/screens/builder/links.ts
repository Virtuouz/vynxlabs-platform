import type { InterfacePage, PageWidget, WidgetLink } from "@vynxlabs/manifest";
import { heading, type TableInfo } from "@vynxlabs/screens";

export interface LinkChoice {
  value: string;
  label: string;
  link: WidgetLink;
}

/** Every way this widget could follow another on the page, each said as a sentence. */
export function linkChoices(
  widget: PageWidget,
  page: InterfacePage,
  tables: Record<string, TableInfo>,
): LinkChoice[] {
  const choices: LinkChoice[] = [];
  const mine = widget.table ? tables[widget.table] : undefined;
  for (const source of page.widgets) {
    if (source.id === widget.id || !source.table) continue;
    if (["form", "text", "chart"].includes(source.type)) continue;
    // Following a widget that follows this one would go round in a circle.
    let walk: PageWidget | undefined = source;
    const seen = new Set<string>();
    let circle = false;
    while (walk?.link && !seen.has(walk.id)) {
      seen.add(walk.id);
      if (walk.link.from === widget.id) circle = true;
      const next: string = walk.link.from;
      walk = page.widgets.find((candidate) => candidate.id === next);
    }
    if (circle) continue;
    const name = source.title || heading(source.id);
    const add = (link: WidgetLink, label: string) =>
      choices.push({ value: JSON.stringify(link), label, link });
    if (source.summary) {
      if (source.table === widget.table && !widget.summary && widget.type !== "form") {
        add({ from: source.id, type: "group" }, `The rows behind the line chosen in ${name}`);
      }
      continue;
    }
    if (source.table === widget.table && !widget.summary && widget.type !== "form") {
      add({ from: source.id, type: "same" }, `The row chosen in ${name}`);
    }
    for (const column of mine?.columns ?? []) {
      if (column.references === source.table) {
        add(
          { from: source.id, type: "refersTo", via: column.name },
          widget.type === "form"
            ? `New rows get the row chosen in ${name} as their ${heading(column.name).toLowerCase()}`
            : `Rows whose ${heading(column.name).toLowerCase()} is the row chosen in ${name}`,
        );
      }
    }
    if (widget.type !== "form" && !widget.summary) {
      for (const column of tables[source.table]?.columns ?? []) {
        if (column.references === widget.table) {
          add(
            { from: source.id, type: "referredBy", via: column.name },
            `The ${heading(column.name).toLowerCase()} of the row chosen in ${name}`,
          );
        }
      }
    }
  }
  return choices;
}

// ----- The settings of one widget -----
