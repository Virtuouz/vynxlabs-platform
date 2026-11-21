import type { Manifest, PageFile, SearchHit } from "@volvel/docs-engine";

/**
 * The product's documentation, as the console's own files. They are built
 * into the console and served from its address, so help is the help of the
 * version that is running and works with no network beyond the instance.
 * The manifest is fetched once, and a page when it is first opened.
 */
const BASE = "/help";

const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string, as: "json" | "text" = "json"): Promise<T> {
  let found = cache.get(file) as Promise<T> | undefined;
  if (!found) {
    found = fetch(`${BASE}/${file}`).then((response) => {
      if (!response.ok)
        throw new Error(`The help file ${file} could not be loaded (${response.status}).`);
      return as === "json" ? response.json() : response.text();
    }) as Promise<T>;
    // A failure is not kept: the next try asks again.
    found.catch(() => cache.delete(file));
    cache.set(file, found);
  }
  return found;
}

export const loadManifest = () => load<Manifest>("manifest.json");

export const loadPage = (path: string) => load<PageFile>(`pages/${path}.json`);

/** What each field of each kind is, by `<kind>.<path>`, from the kinds' own schemas. */
export const loadFields = () => load<Record<string, string>>("fields.json");

let searching: Promise<{ search(query: string, limit?: number): SearchHit[] }> | undefined;

/** Searches the help. The index and the code that reads it are fetched the first time something is searched for. */
export async function searchHelp(query: string): Promise<SearchHit[]> {
  searching ??= Promise.all([
    load<string>("search.json", "text"),
    import("@volvel/docs-engine"),
  ]).then(([index, engine]) => engine.loadSearchIndex(index));
  searching.catch(() => {
    searching = undefined;
  });
  return (await searching).search(query, 12);
}

/** For tests: forget what was fetched. */
export function forgetHelp() {
  cache.clear();
  searching = undefined;
}
