import {
  childrenOf,
  type Manifest,
  orderOf,
  type PageIndex,
  type PageSource,
  resolveLink,
} from "@volvel/docs-engine";
import type { Described } from "../../help/glossary.tsx";

/** A page, as the workspace's list of documentation gives it. */
export interface DocPage {
  path: string;
  title: string;
  description: string | null;
  /** For a folder's own page: the order of what is in the folder, by name. */
  pages: string[] | null;
  topic: string | null;
  /** The docs app that serves it, by the app's path. */
  app: string | null;
  url: string | null;
  state: "deployed" | "changed" | "new" | "removed";
  /** For a page kept in a folder of the repository's own: its file. */
  file: string | null;
  headings: string[];
  terms: { id: string; term: string; aliases: string[]; short: string }[];
  /** The page's whole file, as it is being written. */
  source: string;
  /** The draft's revision, to send back with a save. Null while there is no draft. */
  revision: number | null;
}

export interface DocsApp {
  path: string;
  title: string;
  /** The folder of pages it serves. */
  docs: string;
  /** The table its readers' answers to whether a page helped are kept in, when it asks. */
  feedback?: string | null;
  deployed: boolean;
  /** Where the app is served, once it is deployed. */
  url?: string;
  /** Where the app is shown with the workspace's drafts, to its writers alone. */
  preview?: string;
}

export interface DocsList {
  apps: DocsApp[];
  pages: DocPage[];
}

/** The app whose folder holds a page's path, deployed or not. */
export const appFor = (apps: readonly DocsApp[], path: string) =>
  apps.find((app) => path.startsWith(`${app.docs}/`));

/** A page's path under its app's folder: what its links are written from. */
export const inApp = (app: DocsApp | undefined, path: string) =>
  app ? path.slice(app.docs.length + 1) : path;

/** What a page's links, topics and terms are checked against: the other pages of its app. */
export function indexOf(list: DocsList, app: DocsApp | undefined): PageIndex[] {
  if (!app) return [];
  return list.pages
    .filter((page) => page.state !== "removed" && page.path.startsWith(`${app.docs}/`))
    .map((page) => ({
      path: inApp(app, page.path),
      topic: page.topic,
      terms: page.terms.map((term) => term.id),
      headings: page.headings,
    }));
}

/** Every term the workspace's pages define, whichever app they are in. */
export const termsOf = (list: DocsList) =>
  list.pages
    .filter((page) => page.state !== "removed")
    .flatMap((page) => page.terms.map((term) => ({ ...term, page })));

/** Whether a page can be moved or renamed from here: one written here, that is not on its way out. */
export const movable = (page: DocPage | undefined): page is DocPage =>
  page !== undefined && page.file === null && page.state !== "removed";

/** The pages as a tree's changes are planned over: every page that is not on its way out. */
export function sourcesOf(list: DocsList): PageSource[] {
  return list.pages
    .filter((page) => page.state !== "removed")
    .map((page) => ({ path: page.path, source: page.source }));
}

/** A row of the tree of pages: a folder, or a page. */
export interface DocRow {
  /** A page's path, or `dir:` and a folder's path. */
  id: string;
  kind: "page" | "folder";
  path: string;
  name: string;
  title: string;
  /** For a page: itself. For a folder: its own page, when it has one. */
  page: DocPage | undefined;
  /** For a folder: the docs app that publishes it as a site, when it is a top-level one. */
  site: DocsApp | undefined;
  /** For a folder: what is in it, in order. */
  children?: DocRow[];
}

export const folderId = (path: string) => `dir:${path}`;
export const isFolderId = (id: string) => id.startsWith("dir:");
export const pathOfId = (id: string) => (isFolderId(id) ? id.slice("dir:".length) : id);

/**
 * The pages as their folders, from the top: each top-level folder, and in
 * each folder what its own page lists first, then the rest by title. A
 * folder is named by its own page's title when it has one, and from its name
 * when it has none.
 */
export function rowsOf(list: DocsList): DocRow[] {
  const sources = sourcesOf(list);
  const byPath = new Map(list.pages.map((page) => [page.path, page]));
  const removed = list.pages.filter((page) => page.state === "removed");
  const join = (folder: string, name: string) => (folder === "" ? name : `${folder}/${name}`);
  const folder = (path: string): DocRow[] => {
    const held = new Map(childrenOf(sources, path).map((one) => [one.name, one]));
    const rows = orderOf(sources, path).map((name): DocRow => {
      const one = held.get(name) as { name: string; title: string; folder: boolean };
      const at = join(path, name);
      if (!one.folder) {
        return {
          id: at,
          kind: "page",
          path: at,
          name,
          title: one.title,
          page: byPath.get(at),
          site: undefined,
        };
      }
      return {
        id: folderId(at),
        kind: "folder",
        path: at,
        name,
        title: one.title,
        page: byPath.get(`${at}/index`),
        site: path === "" ? list.apps.find((app) => app.docs === at) : undefined,
        children: folder(at),
      };
    });
    // What a draft removes is still shown, at the end of its folder, until it is deployed.
    for (const page of removed) {
      const parent = page.path.split("/").slice(0, -1).join("/");
      const name = page.path.split("/").at(-1) as string;
      if (parent === path && name !== "index") {
        rows.push({
          id: page.path,
          kind: "page",
          path: page.path,
          name,
          title: page.title,
          page,
          site: undefined,
        });
      }
    }
    return rows;
  };
  return folder("");
}

/** Every folder of the tree, by path, outermost first: where something can be moved to. */
export function foldersOf(rows: readonly DocRow[]): DocRow[] {
  return rows.flatMap((row) =>
    row.kind === "folder" ? [row, ...foldersOf(row.children ?? [])] : [],
  );
}

/** The row with an id, wherever it is in the tree. */
export function findRow(rows: readonly DocRow[], id: string): DocRow | undefined {
  for (const row of rows) {
    if (row.id === id) return row;
    const found = row.children ? findRow(row.children, id) : undefined;
    if (found) return found;
  }
  return undefined;
}

/** The rows whose title or name has what is typed, with the folders they are in. */
export function filterRows(rows: readonly DocRow[], typed: string): DocRow[] {
  const wanted = typed.trim().toLowerCase();
  if (wanted === "") return [...rows];
  return rows.flatMap((row) => {
    const own = `${row.title} ${row.name}`.toLowerCase().includes(wanted);
    if (row.kind === "page") return own ? [row] : [];
    const inside = filterRows(row.children ?? [], wanted);
    return own || inside.length > 0
      ? [{ ...row, children: own ? (row.children ?? []) : inside }]
      : [];
  });
}

/** What a page of the workspace is drawn with: where its links lead, and what its terms mean. */
export function resolvers(options: {
  list: DocsList;
  page: Pick<DocPage, "path">;
  /** The console's address of a page of documentation, by the page's path in the workspace. */
  address: (path: string) => string;
  /** The product's own help, for its terms. */
  product: Manifest | undefined;
  /** What the workspace's resources are for, as far as the reader may know. */
  described: readonly Described[];
}) {
  const { list, page, address, product, described } = options;
  const app = appFor(list.apps, page.path);
  const index = indexOf(list, app);
  const set = {
    pages: new Set(index.map((one) => one.path)),
    topics: Object.fromEntries(index.flatMap((one) => (one.topic ? [[one.topic, one.path]] : []))),
  };
  const terms = termsOf(list);
  return {
    link: (href: string) => {
      if (/^(https?:|mailto:)/i.test(href)) return href;
      if (!app) return null;
      const target = resolveLink(set, inApp(app, page.path), href);
      if ("missing" in target) return null;
      return `${address(`${app.docs}/${target.path}`)}${target.anchor ? `#${target.anchor}` : ""}`;
    },
    term: (props: Record<string, string>) => {
      if (props.id) {
        const own = terms.find((term) => term.id === props.id);
        if (own) {
          return own.page.path === page.path
            ? { short: own.short }
            : { short: own.short, href: address(own.page.path) };
        }
        const theirs = product?.terms[props.id];
        return theirs ? { short: theirs.short } : null;
      }
      // A resource: what it is for, when the reader may know.
      const kind = ["table", "script", "flow", "app", "connection", "query"].find(
        (one) => props[one],
      );
      const found = kind
        ? described.find((one) => one.kind === kind && one.path === props[kind])
        : undefined;
      if (!found) return null;
      const short = props.column
        ? found.columns?.find((column) => column.name === props.column)?.description
        : found.description;
      return short ? { short } : null;
    },
  };
}

/**
 * The terms `::glossary` lists on a page in the console: those defined by the
 * pages of the page's collection, in its site, or by every page of the site.
 */
export function glossaryFor(
  list: DocsList,
  page: Pick<DocPage, "path">,
  scope: "collection" | "site",
  address: (path: string) => string,
) {
  const app = appFor(list.apps, page.path);
  const root = app ? `${app.docs}/` : `${page.path.split("/")[0]}/`;
  const inside = page.path.startsWith(root) ? page.path.slice(root.length) : page.path;
  const collection = inside.includes("/") ? `${root}${inside.split("/")[0]}/` : undefined;
  return termsOf(list)
    .filter((term) => term.page.path.startsWith(root))
    .filter(
      (term) =>
        scope === "site" || collection === undefined || term.page.path.startsWith(collection),
    )
    .map((term) => ({
      id: term.id,
      term: term.term,
      short: term.short,
      ...(term.aliases.length > 0 ? { aliases: term.aliases } : {}),
      href: address(term.page.path),
      page: term.page.title,
    }));
}
