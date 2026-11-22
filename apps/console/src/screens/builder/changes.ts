import type { InterfaceBody, Page, PageWidget } from "@volvel/manifest";
import { definitionOf } from "./registry.ts";

/** What a widget with no title of its own is called: its kind, as "Add to page" names it. */
const kindOf = (type: string) => definitionOf(type)?.title;
const nameOfWidget = (widget: PageWidget) => widget.title || kindOf(widget.type) || widget.id;
/** "Button", as a word in a sentence: "button". */
const kindWord = (widget: PageWidget) => (kindOf(widget.type) ?? "widget").toLowerCase();

/** How the draft differs from what people see now, widget by widget. */
export function widgetChanges(published: InterfaceBody | undefined, draft: InterfaceBody) {
  const out: {
    page: string;
    widget: string;
    kind: string;
    change: "added" | "changed" | "removed";
  }[] = [];
  const pagesBefore = new Map((published?.pages ?? []).map((page) => [page.id, page]));
  const entry = (page: Page, widget: PageWidget, change: "added" | "changed" | "removed") =>
    out.push({ page: page.title, widget: nameOfWidget(widget), kind: kindWord(widget), change });
  for (const page of draft.pages) {
    const before = new Map((pagesBefore.get(page.id)?.widgets ?? []).map((one) => [one.id, one]));
    for (const widget of page.widgets) {
      const was = before.get(widget.id);
      if (!was) entry(page, widget, "added");
      else if (JSON.stringify(was) !== JSON.stringify(widget)) entry(page, widget, "changed");
      before.delete(widget.id);
    }
    for (const gone of before.values()) entry(page, gone, "removed");
    pagesBefore.delete(page.id);
  }
  for (const page of pagesBefore.values())
    for (const gone of page.widgets) entry(page, gone, "removed");
  return out;
}

/** A page's own settings, without its widgets. */
const settings = (page: Page) => {
  const { widgets: _widgets, ...rest } = page;
  return JSON.stringify(rest);
};

/**
 * What publishing changes, in words, one line each: "Added page Invoice detail", "Added button
 * Mark paid", "Changed form New invoice on Money". With nothing deployed yet, everything is new.
 */
export function draftChanges(deployed: InterfaceBody | undefined, draft: InterfaceBody): string[] {
  const lines: string[] = [];
  if (deployed && deployed.title !== draft.title) lines.push(`Renamed the app to ${draft.title}`);
  const before = new Map((deployed?.pages ?? []).map((page) => [page.id, page]));
  for (const page of draft.pages) {
    const was = before.get(page.id);
    if (!was) lines.push(`Added page ${page.title}`);
    else if (settings(page) !== settings(was)) lines.push(`Changed the settings of ${page.title}`);
    before.delete(page.id);
  }
  for (const page of before.values()) lines.push(`Removed page ${page.title}`);
  // Pages in another order change the app's menu.
  if (deployed) {
    const kept = draft.pages.filter((page) => deployed.pages.some((one) => one.id === page.id));
    const was = deployed.pages.filter((page) => draft.pages.some((one) => one.id === page.id));
    if (kept.map((page) => page.id).join() !== was.map((page) => page.id).join())
      lines.push("Changed the order of the pages");
  }
  const verb = { added: "Added", changed: "Changed", removed: "Removed" } as const;
  for (const one of widgetChanges(deployed, draft)) {
    // A widget named for its kind ("Text", "Button") is not said twice: "Changed text on Money".
    const named = one.widget.toLowerCase() === one.kind ? one.kind : `${one.kind} ${one.widget}`;
    lines.push(`${verb[one.change]} ${named}${one.change === "added" ? "" : ` on ${one.page}`}`);
  }
  return lines;
}

/**
 * How many things the draft changes against what is deployed: the app's name, each page added,
 * removed or set differently, and each widget added, removed or changed. With nothing deployed
 * yet, everything is new.
 */
export function draftChangeCount(
  deployed: InterfaceBody | undefined,
  draft: InterfaceBody,
): number {
  return draftChanges(deployed, draft).length;
}
