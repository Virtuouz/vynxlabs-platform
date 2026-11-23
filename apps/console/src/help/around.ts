import {
  type DocType,
  type Folder,
  folderItems,
  glossaryOf,
  type Manifest,
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

function* foldersOf(folders: readonly Folder[]): Generator<Folder> {
  for (const folder of folders) {
    yield folder;
    yield* foldersOf(folder.items.filter((item): item is Folder => item.type === "folder"));
  }
}

/** The step either side of a page, among what its folder lists, in the order of that folder's `pages:`. */
function neighbours(manifest: Manifest, path: string): Pick<PageSetting, "before" | "after"> {
  const folders = [...foldersOf(manifest.nav.collections)];
  // A page is in the folder that lists it; a folder's own page is the step its parent gives the folder.
  let found: { folder: Folder; at: number } | undefined;
  for (const folder of folders) {
    const at = folder.items.findIndex((item) => item.type === "page" && item.path === path);
    if (at >= 0) {
      found = { folder, at };
      break;
    }
  }
  if (!found) {
    for (const folder of folders) {
      const at = folder.items.findIndex(
        (item) => item.type === "folder" && item.index?.path === path,
      );
      if (at >= 0) {
        found = { folder, at };
        break;
      }
    }
  }
  if (!found) return {};
  const step = (at: number) => {
    const item = found.folder.items[at];
    const to = item && targetOf(item);
    return to ? { path: to.path, title: to.title } : undefined;
  };
  const before = step(found.at - 1);
  const after = step(found.at + 1);
  return { ...(before ? { before } : {}), ...(after ? { after } : {}) };
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
    ...(path === "index" ? {} : neighbours(manifest, path)),
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
