import { imageKind, linkKind, type Node, TERM_RESOURCES, topicOf, walk } from "@volvel/markup";
import {
  type DocType,
  diataxisIssues,
  effectiveType,
  folderType,
  MAX_SUBJECTS,
} from "./diataxis.js";
import { type DocEntry, type DocIssue, titleOf } from "./page.js";
import { ABOUT_KINDS, type AboutKind, type TermDefinition } from "./schema.js";

/**
 * A set of pages, and everything worked out across them. All of a set's
 * structure comes from its pages' paths and from what a folder's own page
 * says of the order of what is in it:
 *
 *   index                 the home page
 *   <page>                a page of the "Uncategorized" collection
 *   <folder>/index        what a folder is called, its icon, and the order of what is in it (`pages:`)
 *   <folder>/<page>
 *   <folder>/<folder>/…   folders inside folders, to any depth
 *
 * A folder of the set's own folder is a collection.
 */

export interface PageRef {
  type: "page";
  path: string;
  /** The page's address under the set's own: the path, without a last `index`. */
  url: string;
  title: string;
  description?: string;
  /** The page's type, when it has one: never for a folder's index. */
  docType?: DocType;
}

export interface Folder {
  type: "folder";
  /** The folder's name, the last part of its path. Empty for the pages that are in no folder. */
  id: string;
  /** The folder's path under the set's own. Empty for the pages that are in no folder. */
  path: string;
  title: string;
  icon?: string;
  description?: string;
  /** The folder's own page, when it has one. */
  index?: PageRef;
  items: (PageRef | Folder)[];
}

/** A folder of the set's own folder. */
export type Collection = Folder;

export interface Nav {
  home?: PageRef;
  collections: Folder[];
}

/** A glossary term, and the page that defines it. */
export interface Term extends TermDefinition {
  path: string;
}

export interface DocSet {
  pages: ReadonlyMap<string, DocEntry>;
  nav: Nav;
  /** Topic to the path of the page that has it. */
  topics: Record<string, string>;
  terms: Record<string, Term>;
  /** A resource, as `<kind>:<path>`, to the paths of the pages that say they document it. */
  attachments: Record<string, string[]>;
  /** A topic of the product's help to the paths of the pages that add notes to it. */
  extensions: Record<string, string[]>;
  /** A typed page's path to its type: its own, or its folder's. Empty when the site has no types. */
  types: Record<string, DocType>;
  /** A subject to the paths of the pages that name it. */
  subjects: Record<string, string[]>;
  /** A path a page used to have, to the path it has now. */
  redirects: Record<string, string>;
}

/** Every new term and topic of the product's own help starts with this, so none of a tenant's can collide with it. */
export const PRODUCT_PREFIX = "volvel-";

export const UNCATEGORIZED = "Uncategorized";

export interface BuildOptions {
  /** Term ids that belong to the product. A page may not define one of them. */
  reservedTerms?: Iterable<string>;
  /** Topics that belong to the product. A page may not take one of them, and may extend one. */
  reservedTopics?: Iterable<string>;
  /**
   * Names that begin with this are the product's too, whether or not this version of it has one:
   * the product starts every new term and topic with it, so a tenant's can never collide.
   */
  reservedPrefix?: string;
  /** Terms defined somewhere else that a page here may use: another layer's. */
  knownTerms?: Iterable<string>;
  /** Whether a file beside the pages is there, by its path under the docs root. Left out, pictures are not checked. */
  asset?: (path: string) => boolean;
  /**
   * Whether a resource is there. Left out, resources are not checked: a set
   * built where nobody knows the workspace cannot say.
   */
  resource?: (kind: AboutKind, path: string, column?: string) => boolean;
}

/** A page's address under its set's: `guides/index` is `guides`, and `index` is the set's own. */
export function urlOf(path: string): string {
  if (path === "index") return "";
  return path.endsWith("/index") ? path.slice(0, -"/index".length) : path;
}

function ref(entry: DocEntry, docType?: DocType): PageRef {
  const made: PageRef = {
    type: "page",
    path: entry.path,
    url: urlOf(entry.path),
    title: entry.frontmatter.title,
  };
  if (entry.frontmatter.description) made.description = entry.frontmatter.description;
  if (docType) made.docType = docType;
  return made;
}

/** The name an item is listed by in its folder's `pages:`: a page's file name, or a folder's own. */
export function nameOf(item: PageRef | Folder): string {
  return item.type === "folder" ? item.id : (item.path.split("/").at(-1) as string);
}

/**
 * Puts a folder's items in order: those its own page lists, as listed, and
 * then the rest by title.
 */
export function ordered<Item extends PageRef | Folder>(
  items: readonly Item[],
  listed: readonly string[] | undefined,
): Item[] {
  const at = new Map((listed ?? []).map((name, place) => [name, place] as const));
  const place = (item: Item) => at.get(nameOf(item)) ?? Number.POSITIVE_INFINITY;
  return [...items].sort(
    (a, b) => place(a) - place(b) || a.title.localeCompare(b.title, "en", { sensitivity: "base" }),
  );
}

/** Where a link written on one page leads, within a set. */
export type Target =
  | { path: string; anchor?: string }
  | { missing: "page" | "topic" | "outside"; wanted: string };

/** A path with `.` and `..` worked out, or nothing when it climbs out of the root. */
function normalize(from: string[], to: string): string[] | undefined {
  const parts = to.startsWith("/") ? [] : [...from];
  for (const part of to.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts;
}

/**
 * Works out which page a link goes to. A link is written from where its file
 * is: on `guides/refunds`, `returns` is `guides/returns` and `../index` is the
 * home page. `.md` on the end is allowed, and a folder means its index.
 */
export function resolveLink(
  set: { pages: { has(path: string): boolean }; topics: Record<string, string> },
  from: string,
  href: string,
): Target {
  const topic = topicOf(href);
  if (topic) {
    const path = set.topics[topic.topic];
    if (path === undefined) return { missing: "topic", wanted: topic.topic };
    return topic.anchor ? { path, anchor: topic.anchor } : { path };
  }
  const [beforeHash = "", ...hash] = href.trim().split("#");
  const anchor = hash.join("#");
  const written = decodeURI(beforeHash.split("?")[0] ?? "");
  let path = from;
  if (written !== "") {
    const parts = normalize(from.split("/").slice(0, -1), written.replace(/\.md$/, ""));
    if (!parts) return { missing: "outside", wanted: written };
    const plain = parts.join("/");
    const found = [plain, plain === "" ? "index" : `${plain}/index`].find((one) =>
      set.pages.has(one),
    );
    if (found === undefined) return { missing: "page", wanted: plain };
    path = found;
  }
  return anchor === "" ? { path } : { path, anchor };
}

/** Where a picture written on one page is, as a path under the docs root. */
export function resolveAsset(from: string, src: string): string | undefined {
  const parts = normalize(
    from.split("/").slice(0, -1),
    decodeURI(src.trim().split(/[?#]/)[0] ?? ""),
  );
  return parts && parts.length > 0 ? parts.join("/") : undefined;
}

function headings(tree: Node): Set<string> {
  const ids = new Set<string>();
  for (const { node } of walk(tree)) if (node.type === "heading") ids.add(node.id);
  return ids;
}

/** A resource as an attachment names it. */
export function resourceKey(kind: string, path: string): string {
  return `${kind}:${path}`;
}

/** What a page's links, pictures and terms are checked against: the pages around it. */
export interface Around {
  /** The pages there are, by path. Only whether a path is there is asked. */
  pages: { has(path: string): boolean };
  topics: Record<string, string>;
  /** What each page's headings are addressed by. */
  headingsOf: (path: string) => ReadonlySet<string>;
  knownTerms: ReadonlySet<string>;
  asset?: (path: string) => boolean;
  resource?: (kind: AboutKind, path: string, column?: string) => boolean;
}

/** What is wrong with one page's links, pictures and terms, beside the pages around it. */
export function crossIssues(entry: DocEntry, around: Around): DocIssue[] {
  const issues: DocIssue[] = [];
  const error = (code: string, message: string, line: number) => {
    issues.push({ path: entry.path, line, column: 1, code, message, severity: "error" });
  };
  for (const { node } of walk(entry.tree)) {
    const line = node.line ?? 1;
    if (node.type === "link" && linkKind(node.href) === "relative") {
      const target = resolveLink(around, entry.path, node.href);
      if ("missing" in target) {
        error(
          target.missing === "topic" ? "topic_unknown" : "link_broken",
          target.missing === "topic"
            ? `The link to the topic "${target.wanted}" leads nowhere: no page has that topic.`
            : target.missing === "outside"
              ? `The link to "${node.href}" leads out of the documentation.`
              : `The link to "${node.href}" leads nowhere: there is no page at ${target.wanted || "the home page"}.`,
          line,
        );
      } else if (
        target.anchor !== undefined &&
        !around.headingsOf(target.path).has(target.anchor)
      ) {
        error(
          "anchor_missing",
          `The link to "${node.href}" names a heading that ${target.path === entry.path ? "this page" : target.path} does not have: #${target.anchor}.`,
          line,
        );
      }
    }
    if (node.type === "image" && around.asset && imageKind(node.src) === "relative") {
      const asset = resolveAsset(entry.path, node.src);
      if (asset === undefined || !around.asset(asset)) {
        error(
          "image_missing",
          `The picture "${node.src}" is not there${asset ? `: no file at ${asset}` : ""}.`,
          line,
        );
      }
    }
    if (node.type === "component" && node.name === "term") {
      const { id } = node.props;
      if (id !== undefined && !around.knownTerms.has(id)) {
        error(
          "term_unknown",
          `There is no term "${id}". A term is defined in the terms: of a page's frontmatter.`,
          line,
        );
      }
      const kind = TERM_RESOURCES.find((one) => node.props[one] !== undefined);
      if (kind && around.resource) {
        const path = node.props[kind] as string;
        if (!around.resource(kind, path, node.props.column)) {
          error(
            "term_unknown",
            node.props.column
              ? `There is no column ${node.props.column} on the ${kind} ${path}.`
              : `There is no ${kind} ${path}.`,
            line,
          );
        }
      }
    }
  }
  return issues;
}

/** Builds a set from pages already read, and says what is wrong across them. */
export function buildDocSet(
  entries: readonly DocEntry[],
  options: BuildOptions = {},
): { set: DocSet; issues: DocIssue[] } {
  const issues: DocIssue[] = [];
  const error = (path: string, code: string, message: string, line = 1, column = 1) => {
    issues.push({ path, line, column, code, message, severity: "error" });
  };
  const warn = (path: string, code: string, message: string) => {
    issues.push({ path, line: 1, column: 1, code, message, severity: "warning" });
  };

  const pages = new Map<string, DocEntry>();
  for (const entry of entries) pages.set(entry.path, entry);

  // Types: a page's own, else its folder's. An index is a landing page and has none.
  const types: Record<string, DocType> = {};
  const own = (path: string) => pages.get(path)?.frontmatter.type;
  for (const path of [...pages.keys()].sort()) {
    const found = effectiveType(path, own);
    if (found) types[path] = found;
  }
  const refOf = (entry: DocEntry) => ref(entry, types[entry.path]);

  // Structure.
  const folders = new Set<string>();
  for (const path of pages.keys()) {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth++) folders.add(parts.slice(0, depth).join("/"));
  }
  const inFolder = new Map<string, { pages: DocEntry[]; folders: Set<string> }>();
  const held = (folder: string) => {
    let found = inFolder.get(folder);
    if (!found) {
      found = { pages: [], folders: new Set() };
      inFolder.set(folder, found);
    }
    return found;
  };
  for (const entry of pages.values()) {
    const parts = entry.path.split("/");
    const name = parts.at(-1) as string;
    if (name !== "index" && folders.has(entry.path)) {
      error(
        entry.path,
        "file_and_folder",
        `${entry.path}.md sits beside a folder named ${name}. A folder's own page is the index.md inside it: move this file to ${entry.path}/index.md.`,
      );
    }
    if (name !== "index") held(parts.slice(0, -1).join("/")).pages.push(entry);
  }
  for (const folder of folders) {
    const parts = folder.split("/");
    held(parts.slice(0, -1).join("/")).folders.add(parts.at(-1) as string);
  }

  const indexOf = (folder: string) => pages.get(folder === "" ? "index" : `${folder}/index`);
  const itemsOf = (folder: string): (PageRef | Folder)[] => {
    const here = inFolder.get(folder);
    if (!here) return [];
    const prefix = folder === "" ? "" : `${folder}/`;
    const items: (PageRef | Folder)[] = [
      ...here.pages.map(refOf),
      ...[...here.folders].map((name) => folderAt(`${prefix}${name}`)),
    ];
    const index = indexOf(folder);
    const listed = index?.frontmatter.pages;
    if (index && listed) {
      const names = new Set(items.map(nameOf));
      for (const name of listed) {
        if (name !== "index" && !names.has(name)) {
          warn(
            index.path,
            "pages_unknown",
            `pages: lists "${name}", and there is no page or folder of that name in ${folder === "" ? "this folder" : folder}.`,
          );
        }
      }
    }
    return ordered(items, listed);
  };
  const folderAt = (path: string): Folder => {
    const name = path.split("/").at(-1) as string;
    const index = indexOf(path);
    const made: Folder = {
      type: "folder",
      id: name,
      path,
      title: index?.frontmatter.title ?? titleOf(name),
      items: itemsOf(path),
    };
    if (index?.frontmatter.icon) made.icon = index.frontmatter.icon;
    if (index?.frontmatter.description) made.description = index.frontmatter.description;
    if (index) made.index = refOf(index);
    return made;
  };

  const nav: Nav = { collections: [] };
  const home = pages.get("index");
  if (home) nav.home = refOf(home);
  const top = itemsOf("");
  for (const item of top) if (item.type === "folder") nav.collections.push(item);
  const loose = top.filter((item): item is PageRef => item.type === "page");
  // Pages in no folder come last, as a collection of their own.
  if (loose.length > 0) {
    nav.collections.push({ type: "folder", id: "", path: "", title: UNCATEGORIZED, items: loose });
  }

  // Topics, terms, attachments and extensions.
  const reservedTerms = new Set(options.reservedTerms ?? []);
  const reservedTopics = new Set(options.reservedTopics ?? []);
  const prefixed = (name: string) =>
    options.reservedPrefix !== undefined && name.startsWith(options.reservedPrefix);
  const topics: Record<string, string> = {};
  const terms: Record<string, Term> = {};
  const attachments: Record<string, string[]> = {};
  const extensions: Record<string, string[]> = {};
  const byPath = [...pages.values()].sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of byPath) {
    const { topic } = entry.frontmatter;
    if (topic !== undefined) {
      if (reservedTopics.has(topic) || prefixed(topic)) {
        error(
          entry.path,
          "topic_reserved",
          `The topic "${topic}" is one of the product's own. A page can add notes to it with extends: [${topic}], and cannot take its name.`,
        );
      } else if (topics[topic] !== undefined) {
        error(
          entry.path,
          "topic_duplicate",
          `The topic "${topic}" is also the topic of ${topics[topic]}. A topic belongs to one page.`,
        );
      } else topics[topic] = entry.path;
    }
    for (const term of entry.frontmatter.terms ?? []) {
      if (reservedTerms.has(term.id) || prefixed(term.id)) {
        error(
          entry.path,
          "term_reserved",
          `The term "${term.id}" is one of the product's own, and cannot be defined again. Give yours another id.`,
        );
      } else if (terms[term.id] !== undefined) {
        error(
          entry.path,
          "term_duplicate",
          `The term "${term.id}" is also defined on ${terms[term.id]?.path}. A term is defined once.`,
        );
      } else terms[term.id] = { ...term, path: entry.path };
    }
    for (const about of entry.frontmatter.about ?? []) {
      for (const kind of ABOUT_KINDS) {
        const path = about[kind];
        if (path === undefined) continue;
        if (options.resource && !options.resource(kind, path)) {
          error(
            entry.path,
            "about_unknown",
            `This page is about the ${kind} ${path}, and there is no such ${kind}.`,
          );
          continue;
        }
        const key = resourceKey(kind, path);
        attachments[key] = [...(attachments[key] ?? []), entry.path];
      }
    }
    for (const extended of entry.frontmatter.extends ?? []) {
      if (options.reservedTopics !== undefined && !reservedTopics.has(extended)) {
        error(
          entry.path,
          "extends_unknown",
          `This page extends "${extended}", and the product's help has no such topic.`,
        );
        continue;
      }
      extensions[extended] = [...(extensions[extended] ?? []), entry.path];
    }
  }

  // Subjects, and where moved pages used to be.
  const subjects: Record<string, string[]> = {};
  const redirects: Record<string, string> = {};
  for (const entry of byPath) {
    for (const subject of (entry.frontmatter.subjects ?? []).slice(0, MAX_SUBJECTS)) {
      subjects[subject] = [...(subjects[subject] ?? []), entry.path];
    }
    for (const old of entry.frontmatter.moved_from ?? []) {
      if (old === entry.path) {
        error(
          entry.path,
          "moved_from_self",
          `moved_from lists "${old}", which is this page's own path.`,
        );
      } else if (pages.has(old)) {
        error(
          entry.path,
          "moved_from_exists",
          `moved_from lists "${old}", and there is a page at that path. A path that is still a page cannot lead somewhere else: take it out of moved_from, or move that page.`,
        );
      } else if (redirects[old] !== undefined) {
        error(
          entry.path,
          "moved_from_duplicate",
          `moved_from lists "${old}", which ${redirects[old]} also lists. An old path leads to one page.`,
        );
      } else redirects[old] = entry.path;
    }
  }

  // Types and subjects, said for what they are: warnings.
  for (const entry of byPath) {
    issues.push(
      ...diataxisIssues(entry, {
        type: types[entry.path],
        folderTyped: folderType(entry.path, own) !== undefined,
        subjectUses: (subject) => subjects[subject]?.length ?? 0,
      }),
    );
  }

  // Links, pictures and terms, now that every page and topic is known.
  const set: DocSet = {
    pages,
    nav,
    topics,
    terms,
    attachments,
    extensions,
    types,
    subjects,
    redirects,
  };
  const knownTerms = new Set([
    ...reservedTerms,
    ...(options.knownTerms ?? []),
    ...Object.keys(terms),
  ]);
  const anchors = new Map<string, Set<string>>();
  const around: Around = {
    pages,
    topics,
    knownTerms,
    headingsOf: (path) => {
      let found = anchors.get(path);
      if (!found) {
        found = headings((pages.get(path) as DocEntry).tree);
        anchors.set(path, found);
      }
      return found;
    },
    ...(options.asset ? { asset: options.asset } : {}),
    ...(options.resource ? { resource: options.resource } : {}),
  };
  for (const entry of byPath) issues.push(...crossIssues(entry, around));

  issues.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column);
  return { set, issues };
}

/** Every page of a navigation, in the order a reader meets them. */
export function pagesInOrder(nav: Nav): PageRef[] {
  const out: PageRef[] = [];
  const visit = (item: PageRef | Folder) => {
    if (item.type === "page") out.push(item);
    else {
      if (item.index) out.push(item.index);
      for (const inner of item.items) visit(inner);
    }
  };
  if (nav.home) out.push(nav.home);
  for (const collection of nav.collections) visit(collection);
  return out;
}

/** The folders from a collection down to a page, outermost first. Empty when the page is in none. */
export function trailOf(nav: Nav, path: string): Folder[] {
  const find = (folder: Folder, trail: Folder[]): Folder[] | undefined => {
    const here = [...trail, folder];
    if (folder.index?.path === path) return here;
    for (const item of folder.items) {
      if (item.type === "page" && item.path === path) return here;
      if (item.type === "folder") {
        const found = find(item, here);
        if (found) return found;
      }
    }
    return undefined;
  };
  for (const collection of nav.collections) {
    const found = find(collection, []);
    if (found) return found;
  }
  return [];
}

/**
 * What a page's folder holds, for `::pages`: for a folder's own page, that
 * folder; for any other page, the folder it is in. For the home page, the
 * collections and the pages in no folder.
 */
export function folderItems(nav: Nav, path: string): (PageRef | Folder)[] {
  if (path === "index")
    return nav.collections.flatMap((one) => (one.id === "" ? one.items : [one]));
  return trailOf(nav, path).at(-1)?.items ?? [];
}

/**
 * The terms `::glossary` lists on a page: those defined by the pages of the
 * page's collection, or by every page of the set. A page in no collection, and
 * the home page, list the set's.
 */
export function glossaryOf(set: DocSet, path: string, scope: "collection" | "site"): Term[] {
  const collection = path.includes("/") ? (path.split("/")[0] as string) : undefined;
  return Object.values(set.terms).filter(
    (term) =>
      scope === "site" || collection === undefined || term.path.startsWith(`${collection}/`),
  );
}

/** The most related pages shown of one type. */
export const RELATED_PER_TYPE = 4;

/**
 * The pages of other types that are about the same things as a page: those
 * that share its `subjects`, or the resources it is `about`. For each type,
 * the pages with the most in common first, then those in the page's own
 * collection, then in the order of the navigation. An untyped page, and a
 * folder's index, have none.
 */
export function relatedTo(
  set: Pick<DocSet, "pages" | "nav" | "types">,
  path: string,
): Partial<Record<DocType, PageRef[]>> {
  const mine = set.types[path];
  const entry = set.pages.get(path);
  if (!mine || !entry) return {};
  const keys = (page: DocEntry): Set<string> => {
    const out = new Set<string>();
    for (const subject of (page.frontmatter.subjects ?? []).slice(0, MAX_SUBJECTS)) {
      out.add(`subject:${subject}`);
    }
    for (const about of page.frontmatter.about ?? []) {
      for (const kind of ABOUT_KINDS) {
        const target = about[kind];
        if (target !== undefined) out.add(resourceKey(kind, target));
      }
    }
    return out;
  };
  const wanted = keys(entry);
  if (wanted.size === 0) return {};
  const order = pagesInOrder(set.nav);
  const place = new Map(order.map((one, at) => [one.path, at] as const));
  const collection = (at: string) => (at.includes("/") ? (at.split("/")[0] as string) : "");
  const found: { page: PageRef; shared: number; same: boolean; at: number }[] = [];
  for (const other of order) {
    const type = set.types[other.path];
    if (!type || type === mine || other.path === path) continue;
    const page = set.pages.get(other.path);
    if (!page) continue;
    let shared = 0;
    for (const key of keys(page)) if (wanted.has(key)) shared++;
    if (shared === 0) continue;
    found.push({
      page: other,
      shared,
      same: collection(other.path) === collection(path),
      at: place.get(other.path) ?? 0,
    });
  }
  found.sort((a, b) => b.shared - a.shared || Number(b.same) - Number(a.same) || a.at - b.at);
  const out: Partial<Record<DocType, PageRef[]>> = {};
  for (const { page } of found) {
    const type = set.types[page.path] as DocType;
    const list = out[type] ?? [];
    if (list.length < RELATED_PER_TYPE) out[type] = [...list, page];
  }
  return out;
}
