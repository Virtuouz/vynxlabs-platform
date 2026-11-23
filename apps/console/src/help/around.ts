import {
  type DocType,
  type Folder,
  folderItems,
  glossaryOf,
  type Manifest,
  neighboursOf,
  type PageRef,
  pagesInOrder,
  relatedTo,
  setFromManifest,
  trailOf,
} from "@volvel/docs-engine";
import type { FolderItem, GlossaryItem } from "@volvel/markup";

/** One step of the way to a page: a name, and the page it leads to when the step has one. */
export interface Crumb {
  title: string;
  path?: string;
}

/** What a page of the help sits among: where it is, what comes either side, what is about the same. */
export interface PageSetting {
  /** Collection, folders, then the page itself, which has no path of its own here: it is where the reader is. */
  trail: Crumb[];
  before?: { path: string; title: string };
  after?: { path: string; title: string };
  /** Pages of the other types about the same things, in the order a reader thinks of them. */
  related: { type: DocType; label: string; pages: { path: string; title: string }[] }[];
  /** For `::pages`: what is in the folder the page is in. */
  folder: () => FolderItem[];
  /** For `::glossary`. */
  glossary: (scope: "collection" | "site") => GlossaryItem[];
}

const LABELS: Record<DocType, string> = {
  tutorial: "Tutorials",
  "how-to": "How-to guides",
  reference: "Reference",
  explanation: "Explanations",
};
const ORDER: DocType[] = ["tutorial", "how-to", "reference", "explanation"];

const firstOf = (folder: Folder): PageRef | undefined =>
  folder.index ?? pagesInOrder({ collections: [folder] })[0];

const targetOf = (item: PageRef | Folder): PageRef | undefined =>
  item.type === "page" ? item : firstOf(item);

/** The step either side of a page: the whole navigation's order, as the served site's pager has it. */
function steps(nav: Manifest["nav"], path: string): Pick<PageSetting, "before" | "after"> {
  const { before, after } = neighboursOf(nav, path);
  return {
    ...(before ? { before: { path: before.path, title: before.title } } : {}),
    ...(after ? { after: { path: after.path, title: after.title } } : {}),
  };
}

/**
 * Where a page is among the others, from the manifest alone: no page is fetched. `href` says where
 * a page's address leads, for the lists the page itself draws. What is "related" is known only by
 * `subjects`: a page's `about` is not in the manifest.
 */
export function around(
  manifest: Manifest,
  path: string,
  href: (path: string) => string,
): PageSetting {
  const set = setFromManifest(manifest);
  const entry = manifest.pages.find((one) => one.path === path);
  const title = entry?.title ?? path;

  const folders = trailOf(manifest.nav, path).filter((folder) => folder.id !== "");
  const trail: Crumb[] = folders.map((folder) => ({
    title: folder.title,
    ...(folder.index && folder.index.path !== path ? { path: folder.index.path } : {}),
  }));
  if (folders.at(-1)?.index?.path !== path) trail.push({ title });

  const related = relatedTo(set, path);
  const items = (path: string) => folderItems(manifest.nav, path);
  return {
    trail,
    ...(path === "index" ? {} : steps(manifest.nav, path)),
    related: ORDER.flatMap((type) => {
      const pages = related[type];
      return pages?.length
        ? [
            {
              type,
              label: LABELS[type],
              pages: pages.map((one) => ({ path: one.path, title: one.title })),
            },
          ]
        : [];
    }),
    folder: () =>
      items(path).flatMap((item) => {
        const to = targetOf(item);
        if (!to) return [];
        return [
          {
            title: item.title,
            href: href(to.path),
            ...(item.description ? { description: item.description } : {}),
            ...(item.type === "folder" ? { folder: true } : {}),
          },
        ];
      }),
    glossary: (scope) =>
      glossaryOf(set, path, scope).map((term) => ({
        id: term.id,
        term: term.term,
        short: term.short,
        ...(term.aliases ? { aliases: term.aliases } : {}),
        href: href(term.path),
        page: set.pages.get(term.path)?.frontmatter.title ?? term.path,
      })),
  };
}
