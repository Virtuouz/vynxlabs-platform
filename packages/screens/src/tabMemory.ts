/**
 * The last tab a person had open in a Tabs widget with `remember`, kept on this device in
 * `localStorage`: a convenience, so every read and write is allowed to fail. The page's address
 * is asked first and always wins; this is only what is used when the address says nothing.
 */
const key = (person: string | undefined, widget: string) =>
  `volvel.tab.${person ?? "anyone"}.${widget}`;

export function recallTab(person: string | undefined, widget: string): string | undefined {
  try {
    return localStorage.getItem(key(person, widget)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberTab(person: string | undefined, widget: string, tab: string): void {
  try {
    localStorage.setItem(key(person, widget), tab);
  } catch {
    // Private window, blocked or full storage: nothing is remembered.
  }
}
