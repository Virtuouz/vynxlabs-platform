import type { DocEntry } from "./page.js";
import type { DocSet } from "./set.js";

/**
 * A site's changelog is made of pages: nothing else lists it. A page is an entry when a folder in
 * its path is named `changelog`, or when it carries the subject `changelog`. A folder's own index
 * is the folder's landing page, never an entry.
 */
export const CHANGELOG_NAME = "changelog";

/** Where an entry's date was read from. */
export type DateSource = "frontmatter" | "name" | "updated";

export interface ChangelogEntry {
  /** The page, by its path under the docs root. */
  path: string;
  title: string;
  /** `YYYY-MM-DD`. Undefined when nothing says: the page has no `date:`, none in its name, and no last update. */
  date?: string;
  source?: DateSource;
  page: DocEntry;
}

export interface ChangelogOptions {
  /** Only the entries under this folder, by its path under the docs root (`changelog/product`). */
  folder?: string;
  /** Only the entries that name this subject. */
  subject?: string;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether a text is a real calendar day written `YYYY-MM-DD`. */
export function isDay(text: string): boolean {
  const found = DAY.exec(text);
  if (!found) return false;
  const [, year, month, day] = found.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** A date that begins or ends a file's name: `2026-11-24-new-intake`, `new-intake-2026-11-24`. */
export function dayInName(path: string): string | undefined {
  const name = path.split("/").at(-1) ?? "";
  const first = /^(\d{4}-\d{2}-\d{2})(?:[-_.]|$)/.exec(name)?.[1];
  if (first && isDay(first)) return first;
  const last = /(?:^|[-_.])(\d{4}-\d{2}-\d{2})$/.exec(name)?.[1];
  return last && isDay(last) ? last : undefined;
}

/** Whether a page is an entry of the changelog. */
export function isChangelogEntry(path: string, entry: Pick<DocEntry, "frontmatter">): boolean {
  if (path === "index" || path.endsWith("/index")) return false;
  const folders = path.split("/").slice(0, -1);
  return (
    folders.includes(CHANGELOG_NAME) || (entry.frontmatter.subjects ?? []).includes(CHANGELOG_NAME)
  );
}

/** An entry's day, and where it came from: its `date:`, else its file name, else its last update. */
export function changelogDate(
  path: string,
  entry: Pick<DocEntry, "frontmatter" | "updated">,
): { date: string; source: DateSource } | undefined {
  const said = entry.frontmatter.date;
  if (said && isDay(said)) return { date: said, source: "frontmatter" };
  const named = dayInName(path);
  if (named) return { date: named, source: "name" };
  if (entry.updated) {
    const when = new Date(entry.updated);
    if (!Number.isNaN(when.getTime())) {
      return { date: when.toISOString().slice(0, 10), source: "updated" };
    }
  }
  return undefined;
}

/**
 * The entries of a set, newest first. An entry nothing dates has not been released: it comes
 * first, and entries with the same day come in the reverse order of their paths, so that
 * `…-2` follows `…-1` upwards.
 */
export function changelogOf(
  set: Pick<DocSet, "pages">,
  options: ChangelogOptions = {},
): ChangelogEntry[] {
  const folder = options.folder?.replace(/^\/+|\/+$/g, "");
  const out: ChangelogEntry[] = [];
  for (const [path, page] of set.pages) {
    if (!isChangelogEntry(path, page)) continue;
    if (folder && !path.startsWith(`${folder}/`)) continue;
    if (options.subject && !(page.frontmatter.subjects ?? []).includes(options.subject)) continue;
    const dated = changelogDate(path, page);
    out.push({
      path,
      title: page.frontmatter.title,
      ...(dated ? { date: dated.date, source: dated.source } : {}),
      page,
    });
  }
  return out.sort(newestFirst);
}

/**
 * The order of a changelog wherever it is listed: the list, the navigation, a page's Previous and
 * Next. Undated first, then the latest day, then the later path.
 */
export function newestFirst(
  a: { path: string; date?: string | undefined },
  b: { path: string; date?: string | undefined },
): number {
  if (a.date !== b.date) {
    if (a.date === undefined) return -1;
    if (b.date === undefined) return 1;
    return b.date.localeCompare(a.date);
  }
  return b.path.localeCompare(a.path);
}
