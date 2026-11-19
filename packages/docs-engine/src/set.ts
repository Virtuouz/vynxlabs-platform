import { imageKind, linkKind, type Node, TERM_RESOURCES, topicOf, walk } from "@volvel/markup";
import { type DocEntry, type DocIssue, titleOf } from "./page.js";
import { ABOUT_KINDS, type AboutKind, type TermDefinition } from "./schema.js";

/**
 * A set of pages, and everything worked out across them. All of a set's
 * structure comes from its pages' paths: there is no file that lists them.
 *
 *   index                 the home page
 *   <page>                a page of the "Uncategorized" collection
 *   <collection>/index    what a collection is called, its icon and its order
 *   <collection>/<page>
 *   <collection>/<group>/index
 *   <collection>/<group>/<page>
 *
 * Nothing goes deeper than that.
 */

export interface PageRef {
  type: "page";
  path: string;
  /** The page's address under the set's own: the path, without a last `index`. */
  url: string;
  title: string;
  description?: string;
}

export interface Group {
  type: "group";
  id: string;
  title: string;
  /** The group's own page, when it has one. */
  index?: PageRef;
  pages: PageRef[];
}

export interface Collection {
  /** The folder's name. Empty for the pages that are in no folder. */
  id: string;
  title: string;
  icon?: string;
  index?: PageRef;
  items: (PageRef | Group)[];
}

export interface Nav {
  home?: PageRef;
  collections: Collection[];
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
}

export const UNCATEGORIZED = "Uncategorized";

export interface BuildOptions {
  /** Term ids that belong to the product. A page may not define one of them. */
  reservedTerms?: Iterable<string>;
  /** Topics that belong to the product. A page may not take one of them, and may extend one. */
  reservedTopics?: Iterable<string>;
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

function ref(entry: DocEntry): PageRef {
  const made: PageRef = {
    type: "page",
    path: entry.path,
    url: urlOf(entry.path),
    title: entry.frontmatter.title,
  };
  if (entry.frontmatter.description) made.description = entry.frontmatter.description;
  return made;
}

function inOrder(a: DocEntry | undefined, b: DocEntry | undefined, aTitle: string, bTitle: string) {
  const first = a?.frontmatter.order ?? Number.POSITIVE_INFINITY;
  const second = b?.frontmatter.order ?? Number.POSITIVE_INFINITY;
  return first - second || aTitle.localeCompare(bTitle, "en", { sensitivity: "base" });
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

  const pages = new Map<string, DocEntry>();
  for (const entry of entries) pages.set(entry.path, entry);

  // Structure.
  const folders = new Set<string>();
  for (const path of pages.keys()) {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth++) folders.add(parts.slice(0, depth).join("/"));
  }
  const home = pages.get("index");
  const collections = new Map<string, { loose: DocEntry[]; groups: Map<string, DocEntry[]> }>();
  const collection = (id: string) => {
    let found = collections.get(id);
    if (!found) {
      found = { loose: [], groups: new Map() };
      collections.set(id, found);
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
    if (parts.length > 3) {
      error(
        entry.path,
        "too_deep",
        `This page is ${parts.length - 1} folders down. A page is in a collection, or in a group inside a collection, and no deeper.`,
      );
      continue;
    }
    if (entry.path === "index") continue;
    if (parts.length === 1) collection("").loose.push(entry);
    else if (parts.length === 2) {
      if (name !== "index") collection(parts[0] as string).loose.push(entry);
      else collection(parts[0] as string);
    } else {
      const groups = collection(parts[0] as string).groups;
      const group = parts[1] as string;
      if (!groups.has(group)) groups.set(group, []);
      if (name !== "index") groups.get(group)?.push(entry);
    }
  }

  const nav: Nav = { collections: [] };
  if (home) nav.home = ref(home);
  const sorted = [...collections.entries()].sort(([a], [b]) => {
    // Pages in no folder come last, whatever their order.
    if (a === "" || b === "") return a === "" ? 1 : -1;
    const first = pages.get(`${a}/index`);
    const second = pages.get(`${b}/index`);
    return inOrder(
      first,
      second,
      first?.frontmatter.title ?? titleOf(a),
      second?.frontmatter.title ?? titleOf(b),
    );
  });
  for (const [id, held] of sorted) {
    const index = id === "" ? undefined : pages.get(`${id}/index`);
    const items: { entry: DocEntry | undefined; title: string; item: PageRef | Group }[] = [];
    for (const entry of held.loose) {
      items.push({ entry, title: entry.frontmatter.title, item: ref(entry) });
    }
    for (const [group, groupPages] of held.groups) {
      const groupIndex = pages.get(`${id}/${group}/index`);
      const made: Group = {
        type: "group",
        id: group,
        title: groupIndex?.frontmatter.title ?? titleOf(group),
        pages: [...groupPages]
          .sort((a, b) => inOrder(a, b, a.frontmatter.title, b.frontmatter.title))
          .map(ref),
      };
      if (groupIndex) made.index = ref(groupIndex);
      items.push({ entry: groupIndex, title: made.title, item: made });
    }
    items.sort((a, b) => inOrder(a.entry, b.entry, a.title, b.title));
    if (id === "" && items.length === 0) continue;
    const made: Collection = {
      id,
      title: id === "" ? UNCATEGORIZED : (index?.frontmatter.title ?? titleOf(id)),
      items: items.map((one) => one.item),
    };
    if (index?.frontmatter.icon) made.icon = index.frontmatter.icon;
    if (index) made.index = ref(index);
    nav.collections.push(made);
  }

  // Topics, terms, attachments and extensions.
  const reservedTerms = new Set(options.reservedTerms ?? []);
  const reservedTopics = new Set(options.reservedTopics ?? []);
  const topics: Record<string, string> = {};
  const terms: Record<string, Term> = {};
  const attachments: Record<string, string[]> = {};
  const extensions: Record<string, string[]> = {};
  const byPath = [...pages.values()].sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of byPath) {
    const { topic } = entry.frontmatter;
    if (topic !== undefined) {
      if (reservedTopics.has(topic)) {
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
      if (reservedTerms.has(term.id)) {
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

  // Links, pictures and terms, now that every page and topic is known.
  const set: DocSet = { pages, nav, topics, terms, attachments, extensions };
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
  if (nav.home) out.push(nav.home);
  for (const collection of nav.collections) {
    if (collection.index) out.push(collection.index);
    for (const item of collection.items) {
      if (item.type === "page") out.push(item);
      else {
        if (item.index) out.push(item.index);
        out.push(...item.pages);
      }
    }
  }
  return out;
}
