import type { FilterValues } from "./types.ts";

/**
 * A served page's filters, kept in its address (POLISH-006) so that a reload and a shared
 * link show what was typed and chosen: one search parameter for each, `f.<name>=<value as
 * JSON>`. Pure, so it is tested without a browser; the app's address does the rest.
 */
export const FILTER_PARAM = "f.";

/**
 * The filters an address sets. Only the names in `only` are read, when it is given: a
 * parameter for a filter the page does not have is not a value of the page. A value that
 * is not JSON is left out.
 */
export function filtersFromSearch(search: string, only?: Iterable<string>): FilterValues {
  const allowed = only ? new Set(only) : undefined;
  const found: FilterValues = {};
  for (const [key, text] of new URLSearchParams(search)) {
    if (!key.startsWith(FILTER_PARAM)) continue;
    const name = key.slice(FILTER_PARAM.length);
    if (name === "" || (allowed && !allowed.has(name))) continue;
    try {
      const value: unknown = JSON.parse(text);
      if (value !== undefined) found[name] = value;
    } catch {
      // Not something this app wrote: it narrows nothing.
    }
  }
  return found;
}

/**
 * The query string (with its `?`, or nothing) of `search` with its filters replaced by
 * `values`. Every other parameter stays as it was, in its place; a filter that is not set
 * (`undefined`) is not in the address.
 */
export function searchWithFilters(search: string, values: FilterValues): string {
  const query = new URLSearchParams(search);
  for (const key of [...query.keys()]) if (key.startsWith(FILTER_PARAM)) query.delete(key);
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) query.set(`${FILTER_PARAM}${name}`, JSON.stringify(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}
