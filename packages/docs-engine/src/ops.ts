import { linkKind, parse, topicOf, walk } from "@volvel/markup";
import { DOC_TEMPLATES, type DocType, folderType } from "./diataxis.js";
import { frontmatterOf, setFrontmatter, splitFrontmatter, titleOf } from "./page.js";
import { resolveLink } from "./set.js";

/**
 * What a change to the tree of pages writes. A tree is changed by a person in
 * the console: a page or a folder renamed, moved, put before another, made,
 * copied or removed. Each of those is worked out here, from the pages there
 * are, into the drafts that make it so, so that it can be shown, saved as one,
 * and undone. Nothing here saves anything.
 *
 * Paths are the workspace's: `handbook/support/refunds`. A folder is the
 * pages under it, and its own page is `<folder>/index`.
 */

/** A page as it is now, drafts included. */
export interface PageSource {
  path: string;
  source: string;
}

/** One page's draft. */
export interface Change {
  /** The page's path now, or the path of a page that is new. */
  path: string;
  /** Where it goes, when it moves. */
  to?: string;
  /** Its whole source, as it is to be. Given for every page that is not removed. */
  source?: string;
  deleted?: true;
  /** A page that was not there. */
  created?: true;
}

export type Plan = { changes: Change[] } | { problem: string };

/** Where something is put among the items of a folder. */
export type Place =
  | { folder: string }
  | { folder: string; before: string }
  | { folder: string; after: string };

export const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** A name made from a title, as a file would be named: `Customer Support!` is `customer-support`. */
export function slugOf(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 80);
}

/** What is wrong with a name, or nothing. */
export function nameProblem(name: string): string | undefined {
  if (name === "") return "A name is needed.";
  if (!NAME_PATTERN.test(name)) {
    const fixed = slugOf(name);
    return `Use lowercase letters, numbers, - and _.${fixed ? ` Use ${fixed}` : ""}`;
  }
  return undefined;
}

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
const lastOf = (path: string) => path.split("/").at(-1) as string;
const join = (folder: string, name: string) => (folder === "" ? name : `${folder}/${name}`);
const indexOf = (folder: string) => join(folder, "index");

/** A page's title, as its frontmatter says it or as its path makes it. */
function titleIn(path: string, source: string): string {
  const said = frontmatterOf(source)?.title;
  return typeof said === "string" && said !== "" ? said : titleOf(path);
}

/** What a folder holds: its pages and its folders, each by name. Its own page is not among them. */
export function childrenOf(
  pages: readonly PageSource[],
  folder: string,
): { name: string; title: string; folder: boolean }[] {
  const prefix = folder === "" ? "" : `${folder}/`;
  const byName = new Map<string, { name: string; title: string; folder: boolean }>();
  const sourceOf = new Map(pages.map((page) => [page.path, page.source]));
  for (const page of pages) {
    if (!page.path.startsWith(prefix)) continue;
    const rest = page.path.slice(prefix.length).split("/");
    const name = rest[0] as string;
    if (rest.length === 1) {
      if (name !== "index")
        byName.set(name, { name, title: titleIn(page.path, page.source), folder: false });
    } else if (!byName.get(name)?.folder) {
      const own = sourceOf.get(join(join(folder, name), "index"));
      byName.set(name, {
        name,
        title: own === undefined ? titleOf(name) : titleIn(join(folder, name), own),
        folder: true,
      });
    }
  }
  return [...byName.values()];
}

/** The names of what a folder holds, in the order a reader meets them. */
export function orderOf(pages: readonly PageSource[], folder: string): string[] {
  const own = pages.find((page) => page.path === indexOf(folder));
  const listed = own ? (frontmatterOf(own.source)?.pages as string[] | undefined) : undefined;
  const at = new Map((listed ?? []).map((name, place) => [name, place] as const));
  const place = (name: string) => at.get(name) ?? Number.POSITIVE_INFINITY;
  return childrenOf(pages, folder)
    .sort(
      (a, b) =>
        place(a.name) - place(b.name) ||
        a.title.localeCompare(b.title, "en", { sensitivity: "base" }),
    )
    .map((one) => one.name);
}

/**
 * A new page's source: its title, and nothing written under it. Given a type,
 * the page starts from that type's template, with `type:` on it only when the
 * folder does not already say it (`inherited`).
 */
export function newPageSource(title: string, type?: DocType, inherited?: DocType): string {
  const top = setFrontmatter("", {
    title,
    ...(type && type !== inherited ? { type } : {}),
  });
  const head = top ?? `---\ntitle: ${JSON.stringify(title)}\n---\n`;
  return type ? `${head}\n${DOC_TEMPLATES[type]}` : head;
}

/**
 * Collects changes by page, so that a page moved, re-listed and with links
 * rewritten is one draft.
 */
class Draft {
  readonly sources: Map<string, string>;
  private readonly moves = new Map<string, string>();
  private readonly created = new Set<string>();
  private readonly removed = new Set<string>();

  constructor(pages: readonly PageSource[]) {
    this.sources = new Map(pages.map((page) => [page.path, page.source]));
  }

  /** The pages as they are with what is planned so far, by where they will be. */
  now(): PageSource[] {
    const out: PageSource[] = [];
    for (const [path, source] of this.sources) {
      if (this.removed.has(path)) continue;
      out.push({ path: this.moves.get(path) ?? path, source });
    }
    return out;
  }

  /** The page's path now, from where it will be. */
  private from(at: string): string | undefined {
    for (const [from, to] of this.moves) if (to === at) return from;
    if (this.sources.has(at) && !this.moves.has(at) && !this.removed.has(at)) return at;
    return undefined;
  }

  has(at: string): boolean {
    return this.from(at) !== undefined;
  }

  read(at: string): string | undefined {
    const from = this.from(at);
    return from === undefined ? undefined : this.sources.get(from);
  }

  write(at: string, source: string): void {
    const from = this.from(at);
    if (from === undefined) {
      this.sources.set(at, source);
      this.created.add(at);
    } else this.sources.set(from, source);
  }

  move(from: string, to: string): void {
    if (this.created.has(from)) {
      const source = this.sources.get(from) as string;
      this.sources.delete(from);
      this.created.delete(from);
      this.sources.set(to, source);
      this.created.add(to);
      return;
    }
    this.moves.set(from, to);
  }

  remove(at: string): void {
    const from = this.from(at);
    if (from === undefined) return;
    if (this.created.has(from)) {
      this.sources.delete(from);
      this.created.delete(from);
    } else this.removed.add(from);
  }

  changes(before: ReadonlyMap<string, string>): Change[] {
    const out: Change[] = [];
    for (const [path, source] of this.sources) {
      if (this.removed.has(path)) {
        out.push({ path, deleted: true });
        continue;
      }
      const to = this.moves.get(path);
      if (this.created.has(path)) {
        out.push({ path, source, created: true });
      } else if (to !== undefined && to !== path) {
        out.push({ path, to, source });
      } else if (before.get(path) !== source) {
        out.push({ path, source });
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
}

/** Changes a folder's list of what it holds, giving the folder its own page when it has none. */
function setListing(draft: Draft, folder: string, names: string[]): void {
  const own = indexOf(folder);
  const source = draft.read(own) ?? newPageSource(titleOf(folder === "" ? "index" : folder));
  const next = setFrontmatter(source, { pages: names });
  if (next !== undefined) draft.write(own, next);
}

/** Takes a name out of its folder's list, when the folder lists it. */
function unlist(draft: Draft, folder: string, name: string): void {
  const own = draft.read(indexOf(folder));
  if (own === undefined) return;
  const listed = frontmatterOf(own)?.pages as string[] | undefined;
  if (!listed?.includes(name)) return;
  setListing(
    draft,
    folder,
    listed.filter((one) => one !== name),
  );
}

/** Renames a name in its folder's list, when the folder lists it. */
function relist(draft: Draft, folder: string, from: string, to: string): void {
  const own = draft.read(indexOf(folder));
  if (own === undefined) return;
  const listed = frontmatterOf(own)?.pages as string[] | undefined;
  if (!listed?.includes(from)) return;
  setListing(
    draft,
    folder,
    listed.map((one) => (one === from ? to : one)),
  );
}

/** A relative link from one page to another, as a person would write it. */
export function relativeHref(from: string, to: string): string {
  const fromDir = from.split("/").slice(0, -1);
  const target = to === "index" ? "" : to.endsWith("/index") ? to.slice(0, -"/index".length) : to;
  const parts = target === "" ? [] : target.split("/");
  let same = 0;
  while (same < fromDir.length && same < parts.length && fromDir[same] === parts[same]) same++;
  const written = [...Array(fromDir.length - same).fill(".."), ...parts.slice(same)];
  return written.length === 0 ? "." : written.join("/");
}

/**
 * Rewrites the relative links of every page, so that each still leads where
 * it led once the moves are made. A moved page's own links are rewritten from
 * where it now is. A link written from the root (`/…`) and a topic are left.
 */
function rewriteLinks(
  draft: Draft,
  before: readonly PageSource[],
  moved: ReadonlyMap<string, string>,
): void {
  if (moved.size === 0) return;
  const old = { pages: new Set(before.map((page) => page.path)), topics: {} };
  const where = (path: string) => moved.get(path) ?? path;
  for (const page of before) {
    const now = where(page.path);
    const source = draft.read(now);
    if (source === undefined) continue;
    const { yaml, body, offset } = splitFrontmatter(source);
    let next = body;
    const seen = new Set<string>();
    for (const { node } of walk(parse(body))) {
      if (node.type !== "link") continue;
      const href = node.href;
      if (seen.has(href)) continue;
      seen.add(href);
      if (
        linkKind(href) !== "relative" ||
        topicOf(href) ||
        href.startsWith("/") ||
        href.startsWith("#")
      ) {
        continue;
      }
      const target = resolveLink(old, page.path, href);
      if ("missing" in target) continue;
      const goes = where(target.path);
      if (goes === target.path && now === page.path) continue;
      const [written = ""] = href.split("#");
      let fresh = goes === now ? "" : relativeHref(now, goes);
      if (written.endsWith(".md") && !goes.endsWith("/index") && goes !== "index" && fresh !== "") {
        fresh = `${fresh}.md`;
      }
      if (target.anchor !== undefined) fresh = `${fresh}#${target.anchor}`;
      if (fresh === "") fresh = ".";
      if (fresh === href) continue;
      next = next.split(`](${href})`).join(`](${fresh})`).split(`](${href} `).join(`](${fresh} `);
    }
    if (next !== body) {
      draft.write(now, offset === 0 ? next : `---\n${yaml}\n---\n${next}`);
    }
  }
}

/** Every page under a folder, its own included. */
function under(pages: readonly PageSource[], folder: string): PageSource[] {
  return pages.filter((page) => page.path.startsWith(`${folder}/`));
}

const isFolder = (pages: readonly PageSource[], path: string) =>
  pages.some((page) => page.path.startsWith(`${path}/`));

/** Puts a name at a place in a folder's order, and writes the order when it is a change. */
function place(draft: Draft, where: Place, name: string): void {
  if (!("before" in where) && !("after" in where)) return;
  const names = orderOf(draft.now(), where.folder).filter((one) => one !== name);
  const beside = "before" in where ? where.before : where.after;
  let at = names.indexOf(beside);
  if (at === -1) at = names.length;
  else if ("after" in where) at += 1;
  names.splice(at, 0, name);
  const own = draft.read(indexOf(where.folder));
  const listed = own ? (frontmatterOf(own)?.pages as string[] | undefined) : undefined;
  if (listed && listed.join("/") === names.join("/")) return;
  setListing(draft, where.folder, names);
}

/**
 * Moves a page or a folder to a folder, and among what is there when a place
 * beside another is given. Both folders' lists follow, and links to and from
 * what moved are rewritten.
 */
export function planMove(pages: readonly PageSource[], path: string, where: Place): Plan {
  const folder = isFolder(pages, path);
  const exists = folder || pages.some((page) => page.path === path);
  if (!exists) return { problem: `There is nothing at ${path}.` };
  const name = lastOf(path);
  const from = parentOf(path);
  if (where.folder === "" && ("before" in where || "after" in where) && from === "") {
    return { problem: "Top-level folders are listed by name." };
  }
  if (folder && (where.folder === path || where.folder.startsWith(`${path}/`))) {
    return { problem: "A folder cannot go inside itself." };
  }
  if (where.folder === "" && !folder) {
    return { problem: "A page goes in a folder. Top-level folders are the sites." };
  }
  const draft = new Draft(pages);
  const before = new Map(pages.map((page) => [page.path, page.source]));
  const target = join(where.folder, name);
  const moved = new Map<string, string>();
  if (target !== path) {
    if (pages.some((page) => page.path === target || page.path.startsWith(`${target}/`))) {
      return {
        problem: `There is already something named ${name} in ${where.folder || "the top level"}.`,
      };
    }
    if (folder) {
      for (const page of under(pages, path))
        moved.set(page.path, `${target}${page.path.slice(path.length)}`);
    } else moved.set(path, target);
    unlist(draft, from, name);
    for (const [one, to] of moved) draft.move(one, to);
  }
  place(draft, where, name);
  rewriteLinks(draft, pages, moved);
  return { changes: draft.changes(before) };
}

/** Renames a page or a folder: its title, its name, or both. */
export function planRename(
  pages: readonly PageSource[],
  path: string,
  next: { title?: string; name?: string },
): Plan {
  const folder = isFolder(pages, path);
  const isPage = pages.some((page) => page.path === path);
  if (!folder && !isPage) return { problem: `There is nothing at ${path}.` };
  if (next.title !== undefined && next.title.trim() === "")
    return { problem: "A title is needed." };
  const draft = new Draft(pages);
  const before = new Map(pages.map((page) => [page.path, page.source]));
  const name = lastOf(path);
  const parent = parentOf(path);

  const moved = new Map<string, string>();
  if (next.name !== undefined && next.name !== name) {
    const problem = nameProblem(next.name);
    if (problem) return { problem };
    if (name === "index" && !folder)
      return { problem: "A folder's own page is always named index." };
    const target = join(parent, next.name);
    if (pages.some((page) => page.path === target || page.path.startsWith(`${target}/`))) {
      return {
        problem:
          next.name === "index"
            ? "This folder already has its own page. A folder can have one."
            : `There is already something named ${next.name} here.`,
      };
    }
    if (folder) {
      for (const page of under(pages, path))
        moved.set(page.path, `${target}${page.path.slice(path.length)}`);
    } else moved.set(path, target);
    for (const [one, to] of moved) draft.move(one, to);
    if (next.name === "index") unlist(draft, parent, name);
    else relist(draft, parent, name, next.name);
  }
  const at = moved.size === 0 ? path : join(parent, next.name as string);
  if (next.title !== undefined) {
    const own = folder ? indexOf(at) : at;
    const source = draft.read(own) ?? newPageSource(next.title);
    if (titleIn(own, source) !== next.title || !draft.has(own)) {
      const written = setFrontmatter(source, { title: next.title.trim() });
      if (written === undefined) {
        return { problem: "The top of this page cannot be read. Mend it in the editor first." };
      }
      draft.write(own, written);
    }
  }

  rewriteLinks(draft, pages, moved);
  return { changes: draft.changes(before) };
}

/** A new page in a folder, with nothing under its title. */
export function planNewPage(
  pages: readonly PageSource[],
  folder: string,
  next: { title: string; name: string; type?: DocType },
): Plan {
  if (next.title.trim() === "") return { problem: "A title is needed." };
  const problem = nameProblem(next.name);
  if (problem) return { problem };
  if (folder === "")
    return { problem: "A page goes in a folder. Top-level folders are the sites." };
  const path = join(folder, next.name);
  if (pages.some((page) => page.path === path || page.path.startsWith(`${path}/`))) {
    return {
      problem:
        next.name === "index"
          ? "This folder already has its own page. A folder can have one."
          : `There is already something named ${next.name} here.`,
    };
  }
  const source = newPageSource(
    next.title.trim(),
    next.type,
    next.type
      ? folderType(
          path,
          (at) => frontmatterOf(pages.find((page) => page.path === at)?.source ?? "")?.type,
        )
      : undefined,
  );
  return { changes: [{ path, source, created: true }] };
}

/**
 * A new folder. It is its own page, with nothing written in it, so that it
 * lists what is put in it until someone writes there.
 */
export function planNewFolder(
  pages: readonly PageSource[],
  parent: string,
  next: { title: string; name: string },
): Plan {
  if (next.title.trim() === "") return { problem: "A title is needed." };
  const problem = nameProblem(next.name);
  if (problem) return { problem };
  if (next.name === "index") return { problem: "A folder cannot be named index." };
  const path = join(parent, next.name);
  if (pages.some((page) => page.path === path || page.path.startsWith(`${path}/`))) {
    return { problem: `There is already something named ${next.name} here.` };
  }
  return {
    changes: [{ path: indexOf(path), source: newPageSource(next.title.trim()), created: true }],
  };
}

/** Removes a page, or a folder and everything in it. */
export function planDelete(pages: readonly PageSource[], path: string): Plan {
  const folder = isFolder(pages, path);
  const gone = folder ? under(pages, path) : pages.filter((page) => page.path === path);
  if (gone.length === 0) return { problem: `There is nothing at ${path}.` };
  const draft = new Draft(pages);
  const before = new Map(pages.map((page) => [page.path, page.source]));
  for (const page of gone) draft.remove(page.path);
  const name = lastOf(path);
  if (name !== "index") unlist(draft, parentOf(path), name);
  return { changes: draft.changes(before) };
}

/**
 * A copy of a page or a folder beside it. A copy takes no topic, terms or
 * key: those belong to one page.
 */
export function planDuplicate(pages: readonly PageSource[], path: string): Plan {
  const folder = isFolder(pages, path);
  const copied = folder ? under(pages, path) : pages.filter((page) => page.path === path);
  if (copied.length === 0) return { problem: `There is nothing at ${path}.` };
  const name = lastOf(path);
  if (name === "index") return { problem: "A folder's own page is copied with its folder." };
  const parent = parentOf(path);
  const taken = (one: string) =>
    pages.some(
      (page) => page.path === join(parent, one) || page.path.startsWith(`${join(parent, one)}/`),
    );
  let copy = `${name}-copy`;
  for (let n = 2; taken(copy); n++) copy = `${name}-copy-${n}`;
  const target = join(parent, copy);
  const changes: Change[] = [];
  for (const page of copied) {
    const to = folder ? `${target}${page.path.slice(path.length)}` : target;
    const own = page.path === path || page.path === indexOf(path);
    const title = titleIn(page.path, page.source);
    const source = setFrontmatter(page.source, {
      topic: undefined,
      terms: undefined,
      key: undefined,
      ...(own ? { title: `${title} (copy)` } : {}),
    });
    if (source === undefined) return { problem: `The top of ${page.path} cannot be read.` };
    changes.push({ path: to, source, created: true });
  }
  return { changes: changes.sort((a, b) => a.path.localeCompare(b.path)) };
}

/** What a plan undoes: the changes that put the pages back as they were. */
export function inverseOf(pages: readonly PageSource[], changes: readonly Change[]): Change[] {
  const before = new Map(pages.map((page) => [page.path, page.source]));
  return changes.map((change): Change => {
    if (change.created) return { path: change.path, deleted: true };
    const source = before.get(change.path) as string;
    if (change.deleted) return { path: change.path, source, created: true };
    if (change.to !== undefined) return { path: change.to, to: change.path, source };
    return { path: change.path, source };
  });
}
