import type { Manifest, PageFile, PageHit } from "@volvel/docs-engine";

/** Where the instance serves the same documentation to read and search. */
const DOCS = "/docs";

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

/** Where pages that moved or were removed went, from what was deployed. A build without the file moved nothing. */
export const loadRedirects = () =>
  load<Record<string, string>>("redirects.json").catch(() => ({}) as Record<string, string>);

/** What each field of each kind is, by `<kind>.<path>`, from the kinds' own schemas. */
export const loadFields = () => load<Record<string, string>>("fields.json");

/** What `/docs/_search.json` answers: pages by their address, with the places on each. */
interface ServerAnswer {
  pages: { url: string; title: PageHit["title"]; places: PageHit["places"] }[];
}

/**
 * Asks the instance's own `/docs` to search, which holds the index so that this does not have to
 * be downloaded. Anything but an answer (offline, refused, too many asked, an older instance
 * with no `/docs`) is undefined, and the help's own index is used instead.
 */
async function searchOnInstance(query: string): Promise<PageHit[] | undefined> {
  try {
    const response = await fetch(`${DOCS}/_search.json?q=${encodeURIComponent(query)}`);
    if (!response.ok) return undefined;
    const answer = (await response.json()) as ServerAnswer;
    if (!Array.isArray(answer?.pages)) return undefined;
    const manifest = await loadManifest();
    const byUrl = new Map(manifest.pages.map((page) => [page.url, page] as const));
    return answer.pages.flatMap((hit) => {
      const page = byUrl.get(hit.url);
      // A page this build of the help does not have cannot be opened here.
      if (!page) return [];
      return [
        {
          path: page.path,
          url: page.url,
          title: hit.title,
          description: page.description ?? "",
          collection: page.path.split("/")[0] ?? "",
          ...(page.docType ? { docType: page.docType } : {}),
          places: hit.places ?? [],
        },
      ];
    });
  } catch {
    return undefined;
  }
}

let searching:
  | Promise<{ grouped(query: string, options?: { limit?: number }): PageHit[] }>
  | undefined;

/**
 * Searches the help: pages, best first, each with the headings and passages on it that matched.
 * The instance answers when it can. Otherwise the index and the code that reads it are fetched,
 * the first time, from the files the help is built into.
 */
export async function searchHelp(query: string): Promise<PageHit[]> {
  const asked = await searchOnInstance(query);
  if (asked) return asked.slice(0, 12);
  searching ??= Promise.all([
    load<string>("search.json", "text"),
    import("@volvel/docs-engine"),
  ]).then(([index, engine]) => engine.loadSearchIndex(index));
  searching.catch(() => {
    searching = undefined;
  });
  return (await searching).grouped(query, { limit: 12 });
}

/** For tests: forget what was fetched. */
export function forgetHelp() {
  cache.clear();
  searching = undefined;
}
