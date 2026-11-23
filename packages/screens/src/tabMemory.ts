/**
 * The last tab a person had open in a Tabs widget with `remember`, kept on this device in
 * `localStorage`: a convenience, so every read and write is allowed to fail. The page's address
 * is asked first and always wins; this is only what is used when the address says nothing.
 * `where` is the app and page (or dashboard) the widget is on, as the fold memory names it: two
 * pages may each have a Tabs of the same id and do not share what was open.
 */
const key = (person: string | undefined, widget: string, where?: string) =>
  `volvel.tab.${person ?? "anyone"}.${where ? `${where}.` : ""}${widget}`;

export function recallTab(
  person: string | undefined,
  widget: string,
  where?: string,
): string | undefined {
  try {
    return localStorage.getItem(key(person, widget, where)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberTab(
  person: string | undefined,
  widget: string,
  tab: string,
  where?: string,
): void {
  try {
    localStorage.setItem(key(person, widget, where), tab);
  } catch {
    // Private window, blocked or full storage: nothing is remembered.
  }
}
