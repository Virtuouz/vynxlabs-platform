import { walk } from "@volvel/markup";
import { diataxisIssues, effectiveType } from "./diataxis.js";
import { type DocEntry, type DocIssue, readPage } from "./page.js";
import type { AboutKind } from "./schema.js";
import { ABOUT_KINDS } from "./schema.js";
import { crossIssues } from "./set.js";

/**
 * What is known of a page without its text: enough to check another page's
 * links, topics and terms against it. A writer's editor is given this for
 * every page of the app, and checks the page being typed where it is typed.
 */
export interface PageIndex {
  /** The page's path under its app's folder. */
  path: string;
  topic?: string | null | undefined;
  /** The ids of the terms it defines. */
  terms: readonly string[];
  /** What its headings are addressed by. */
  headings: readonly string[];
  /** What it says of its own `type:`: on an index, the type of what is under it. Left out, it says none. */
  type?: string | null | undefined;
  /** Its `subjects:`. */
  subjects?: readonly string[] | undefined;
  /** Its `moved_from:`. */
  moved_from?: readonly string[] | undefined;
}

export interface AmongOptions {
  /** The product's own terms and topics, which a page may use and extend and may not take. */
  reservedTerms?: Iterable<string>;
  reservedTopics?: Iterable<string>;
  /** Terms defined elsewhere in the workspace: another docs app's. */
  knownTerms?: Iterable<string>;
  /** Whether a resource is there. Left out, or answering nothing, it is not checked: a deploy says it. */
  resource?: (kind: AboutKind, path: string, column?: string) => boolean | undefined;
}

/**
 * Checks one page as it is being written, beside the other pages of its app:
 * everything a deploy would refuse it for that can be known from here. It is
 * the same reading and the same rules as the deploy's check, given an index of
 * the other pages in place of their text.
 */
export function checkPageAmong(
  path: string,
  source: string,
  others: readonly PageIndex[],
  options: AmongOptions = {},
): { entry: DocEntry; issues: DocIssue[] } {
  const { entry, issues } = readPage(path, source);
  const error = (code: string, message: string, line = 1) => {
    issues.push({ path, line, column: 1, code, message, severity: "error" });
  };
  const rest = others.filter((one) => one.path !== path);
  const paths = new Set([...rest.map((one) => one.path), path]);

  // Where it is among the folders.
  const parts = path.split("/");
  const name = parts.at(-1) as string;
  if (name === "index" && entry.frontmatter.pages) {
    const folder = parts.slice(0, -1).join("/");
    const prefix = folder === "" ? "" : `${folder}/`;
    const names = new Set(
      rest
        .filter((one) => one.path.startsWith(prefix))
        .map((one) => one.path.slice(prefix.length).split("/")[0] as string),
    );
    for (const listed of entry.frontmatter.pages) {
      if (listed !== "index" && !names.has(listed)) {
        issues.push({
          path,
          line: 1,
          column: 1,
          code: "pages_unknown",
          message: `pages: lists "${listed}", and there is no page or folder of that name in ${folder === "" ? "this folder" : folder}.`,
          severity: "warning",
        });
      }
    }
  }
  if (name !== "index" && rest.some((one) => one.path.startsWith(`${path}/`))) {
    error(
      "file_and_folder",
      `${path}.md sits beside a folder named ${name}. A folder's own page is the index.md inside it: move this file to ${path}/index.md.`,
    );
  }

  // What it says of itself, beside what the others say.
  const reservedTerms = new Set(options.reservedTerms ?? []);
  const reservedTopics = new Set(options.reservedTopics ?? []);
  const topics: Record<string, string> = {};
  for (const one of rest) if (one.topic) topics[one.topic] = one.path;
  const { topic } = entry.frontmatter;
  if (topic !== undefined) {
    if (reservedTopics.has(topic)) {
      error(
        "topic_reserved",
        `The topic "${topic}" is one of the product's own. A page can add notes to it with extends: [${topic}], and cannot take its name.`,
      );
    } else if (topics[topic] !== undefined) {
      error(
        "topic_duplicate",
        `The topic "${topic}" is also the topic of ${topics[topic]}. A topic belongs to one page.`,
      );
    } else topics[topic] = path;
  }
  const defined = new Map<string, string>();
  for (const one of rest) for (const id of one.terms) defined.set(id, one.path);
  for (const term of entry.frontmatter.terms ?? []) {
    if (reservedTerms.has(term.id)) {
      error(
        "term_reserved",
        `The term "${term.id}" is one of the product's own, and cannot be defined again. Give yours another id.`,
      );
    } else if (defined.has(term.id)) {
      error(
        "term_duplicate",
        `The term "${term.id}" is also defined on ${defined.get(term.id)}. A term is defined once.`,
      );
    }
  }
  for (const extended of entry.frontmatter.extends ?? []) {
    if (options.reservedTopics !== undefined && !reservedTopics.has(extended)) {
      error(
        "extends_unknown",
        `This page extends "${extended}", and the product's help has no such topic.`,
      );
    }
  }
  const resource = options.resource;
  for (const about of entry.frontmatter.about ?? []) {
    for (const kind of ABOUT_KINDS) {
      const target = about[kind];
      if (target !== undefined && resource?.(kind, target) === false) {
        error(
          "about_unknown",
          `This page is about the ${kind} ${target}, and there is no such ${kind}.`,
        );
      }
    }
  }

  // Where it used to be, and what its type says: the same checks as a deploy's, beside the others.
  for (const old of entry.frontmatter.moved_from ?? []) {
    if (old === path) {
      error("moved_from_self", `moved_from lists "${old}", which is this page's own path.`);
    } else if (paths.has(old)) {
      error(
        "moved_from_exists",
        `moved_from lists "${old}", and there is a page at that path. A path that is still a page cannot lead somewhere else: take it out of moved_from, or move that page.`,
      );
    } else {
      const other = rest.find((one) => one.moved_from?.includes(old));
      if (other) {
        error(
          "moved_from_duplicate",
          `moved_from lists "${old}", which ${other.path} also lists. An old path leads to one page.`,
        );
      }
    }
  }
  const ownType = (at: string) =>
    at === path ? entry.frontmatter.type : rest.find((one) => one.path === at)?.type;
  // Whether a subject is used once, and whether a folder says a type, are known to a deploy alone.
  issues.push(...diataxisIssues(entry, { type: effectiveType(path, ownType) }));

  // Its links and terms, against the pages around it.
  const own = new Set<string>();
  for (const { node } of walk(entry.tree)) if (node.type === "heading") own.add(node.id);
  const headings = new Map(rest.map((one) => [one.path, new Set(one.headings)]));
  issues.push(
    ...crossIssues(entry, {
      pages: paths,
      topics,
      headingsOf: (at) => (at === path ? own : (headings.get(at) ?? new Set())),
      knownTerms: new Set([
        ...reservedTerms,
        ...(options.knownTerms ?? []),
        ...defined.keys(),
        ...(entry.frontmatter.terms ?? []).map((term) => term.id),
      ]),
      ...(resource ? { resource: (kind, at, column) => resource(kind, at, column) !== false } : {}),
    }),
  );
  issues.sort((a, b) => a.line - b.line || a.column - b.column);
  return { entry, issues };
}
