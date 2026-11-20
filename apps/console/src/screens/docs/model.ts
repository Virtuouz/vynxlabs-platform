import { type Manifest, type PageIndex, resolveLink } from "@volvel/docs-engine";
import type { TreeNode } from "@volvel/ui";
import type { Described } from "../../help/glossary.tsx";

/** A page, as the workspace's list of documentation gives it. */
export interface DocPage {
  path: string;
  title: string;
  description: string | null;
  order: number | null;
  topic: string | null;
  /** The docs app that serves it, by the app's path. */
  app: string | null;
  url: string | null;
  state: "deployed" | "changed" | "new" | "removed";
  /** For a page kept in a folder of the repository's own: its file. */
  file: string | null;
  headings: string[];
  terms: { id: string; term: string; aliases: string[]; short: string }[];
}

export interface DocsApp {
  path: string;
  title: string;
  /** The folder of pages it serves. */
  docs: string;
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

const byOrder = (a: DocPage, b: DocPage) =>
  (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) ||
  a.title.localeCompare(b.title);

const titled = (folder: string) => {
  const words = folder.replace(/[-_]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * The pages as their folders: each docs app, its collections, their groups,
 * and the pages in each. A folder is named by its index page's title when it
 * has one. Pages no app serves come last, under their own heading.
 */
export function treeOf(list: DocsList): TreeNode[] {
  const nodes: TreeNode[] = [];
  const folder = (pages: DocPage[], prefix: string): TreeNode[] => {
    const here: DocPage[] = [];
    const inside = new Map<string, DocPage[]>();
    for (const page of pages) {
      const rest = page.path.slice(prefix.length);
      const cut = rest.indexOf("/");
      if (cut === -1) here.push(page);
      else {
        const name = rest.slice(0, cut);
        inside.set(name, [...(inside.get(name) ?? []), page]);
      }
    }
    const index = here.find((page) => page.path === `${prefix}index`);
    const out: TreeNode[] = [];
    if (index) out.push({ id: index.path, label: index.title });
    const entries: { order: DocPage | undefined; title: string; node: TreeNode }[] = [];
    for (const page of here) {
      if (page !== index)
        entries.push({
          order: page,
          title: page.title,
          node: { id: page.path, label: page.title },
        });
    }
    for (const [name, held] of inside) {
      const own = held.find((page) => page.path === `${prefix}${name}/index`);
      const title = own?.title ?? titled(name);
      entries.push({
        order: own,
        title,
        node: {
          id: `dir:${prefix}${name}`,
          label: title,
          children: folder(held, `${prefix}${name}/`),
        },
      });
    }
    entries.sort(
      (a, b) =>
        (a.order?.order ?? Number.POSITIVE_INFINITY) -
          (b.order?.order ?? Number.POSITIVE_INFINITY) || a.title.localeCompare(b.title),
    );
    return [...out, ...entries.map((entry) => entry.node)];
  };
  const taken = new Set<string>();
  for (const app of list.apps) {
    const pages = list.pages.filter((page) => page.path.startsWith(`${app.docs}/`)).sort(byOrder);
    for (const page of pages) taken.add(page.path);
    nodes.push({
      id: `app:${app.path}`,
      label: app.title,
      children: folder(pages, `${app.docs}/`),
    });
  }
  const loose = list.pages.filter((page) => !taken.has(page.path)).sort(byOrder);
  if (loose.length > 0) {
    nodes.push({
      id: "app:",
      label: "Served by no app",
      children: loose.map((page) => ({ id: page.path, label: page.title })),
    });
  }
  return nodes;
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
