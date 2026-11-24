import { type Issue, type ProfileName, parse, type Root, validate } from "@volvel/markup";
import { isMap, parseDocument, parse as parseYaml } from "yaml";
import { isDay } from "./changelog.js";
import { check, FRONTMATTER_SCHEMA, type Frontmatter, PATH_PATTERN } from "./schema.js";

/** Something wrong with a page or with a set of them, and where. */
export interface DocIssue {
  /** The page, by its path under the docs root. */
  path: string;
  line: number;
  column: number;
  code: string;
  message: string;
  /** An error stops a deploy. A warning is shown and does not. */
  severity: "error" | "warning";
}

/** One page, read. */
export interface DocEntry {
  /** Its path under the docs root, without `.md`: `guides/refunds`, `guides/index`, `index`. */
  path: string;
  frontmatter: Frontmatter;
  tree: Root;
  /** When the page last changed, if whoever read it knows. An ISO date. */
  updated?: string;
}

const FENCE = /^---[ \t]*$/;

/**
 * Parts a file into what is between its first two `---` lines and what comes
 * after. `offset` is how many lines of the file come before the body.
 */
export function splitFrontmatter(text: string): { yaml: string; body: string; offset: number } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (!FENCE.test(lines[0] ?? "")) return { yaml: "", body: lines.join("\n"), offset: 0 };
  const close = lines.findIndex((line, index) => index > 0 && FENCE.test(line));
  if (close === -1) return { yaml: "", body: lines.join("\n"), offset: 0 };
  return {
    yaml: lines.slice(1, close).join("\n"),
    body: lines.slice(close + 1).join("\n"),
    offset: close + 1,
  };
}

/** What a page's frontmatter says, as it is written, when it can be read at all. */
export function frontmatterOf(text: string): Record<string, unknown> | undefined {
  const { yaml, offset } = splitFrontmatter(text);
  if (offset === 0) return {};
  try {
    const read: unknown = parseYaml(yaml);
    if (read === null || read === undefined) return {};
    return typeof read === "object" && !Array.isArray(read)
      ? (read as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const empty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/**
 * A page's source with some of its frontmatter changed, for a form that
 * writes what a person would have typed. A key given nothing, an empty text
 * or an empty list is taken out. Everything else stays as it was written:
 * the other keys, their order, the comments among them, and the page under
 * them. A page with no frontmatter is given one. Undefined when what is
 * there cannot be read, which a form cannot mend.
 */
export function setFrontmatter(text: string, changes: Record<string, unknown>): string | undefined {
  const { yaml, body, offset } = splitFrontmatter(text);
  // An empty top is read as an empty map, so that there is something to set keys on.
  const written0 = offset === 0 || yaml.trim() === "" ? "{}" : yaml;
  const document = parseDocument(written0);
  if (document.errors.length > 0) return undefined;
  if (!isMap(document.contents)) return undefined;
  document.contents.flow = false;
  for (const [key, value] of Object.entries(changes)) {
    if (empty(value)) document.delete(key);
    else document.set(key, value);
  }
  const written =
    isMap(document.contents) && document.contents.items.length === 0
      ? ""
      : document.toString({ lineWidth: 0 });
  const under = offset === 0 && body !== "" ? `\n${body}` : body;
  return `---\n${written}---\n${under}`;
}

const PATH = new RegExp(PATH_PATTERN);

/**
 * A file's path under the docs root as a page's path: without `.md`, and
 * refused when it is not written as a resource's path is. Nothing is changed
 * to make a name fit, so that a file and its page always have the one name.
 */
export function pagePath(file: string): { path: string } | { problem: string } {
  if (!file.endsWith(".md")) return { problem: `${file}: a page is a file ending in .md.` };
  const path = file.slice(0, -3);
  if (!PATH.test(path)) {
    return {
      problem: `${file}: a page's name and its folders are written in lowercase letters, digits, hyphens and underscores. Rename the file: nothing renames it for you.`,
    };
  }
  return { path };
}

export interface ReadOptions {
  /** What the body may hold. `docs` when left out. */
  profile?: ProfileName;
  updated?: string;
}

/**
 * Reads one file into a page. It always gives a page back, with whatever
 * could be read: a page that fails here can still be shown to its author
 * beside what is wrong with it.
 */
export function readPage(
  path: string,
  text: string,
  options: ReadOptions = {},
): { entry: DocEntry; issues: DocIssue[] } {
  const issues: DocIssue[] = [];
  const { yaml, body, offset } = splitFrontmatter(text);
  const yamlLines = yaml.split("\n");
  const lineOfKey = (key: string | undefined): number => {
    if (key === undefined) return 1;
    const at = yamlLines.findIndex((line) => new RegExp(`^\\s*(-\\s+)?${key}\\s*:`).test(line));
    return at === -1 ? 1 : at + 2;
  };
  const error = (line: number, code: string, message: string) => {
    issues.push({ path, line, column: 1, code, message, severity: "error" });
  };

  let frontmatter: Frontmatter = { title: "" };
  if (offset === 0) {
    error(
      1,
      "frontmatter_missing",
      'A page starts with its title between two lines of "---":\n---\ntitle: …\n---',
    );
  } else {
    let read: unknown;
    try {
      read = parseYaml(yaml, { version: "1.2" }) ?? {};
    } catch (caught) {
      const failure = caught as { message: string; linePos?: { line: number }[] };
      error(
        (failure.linePos?.[0]?.line ?? 0) + 1,
        "frontmatter_unreadable",
        `The top of the page is not valid YAML. ${failure.message.split("\n")[0]}`,
      );
      read = undefined;
    }
    if (read !== undefined) {
      const problems = check(read, FRONTMATTER_SCHEMA);
      for (const problem of problems) {
        error(lineOfKey(problem.key), "frontmatter_invalid", problem.message);
      }
      if (typeof read === "object" && read !== null && !Array.isArray(read)) {
        // What could be read is kept, so that the page can still be listed and drawn.
        frontmatter = {
          title: "",
          ...(problems.length === 0 ? read : usable(read)),
        } as Frontmatter;
      }
    }
  }
  if (frontmatter.date !== undefined && !isDay(frontmatter.date)) {
    // Right in shape (the schema said so) and not a day: 2026-02-30. A changelog would skip it silently.
    error(
      lineOfKey("date"),
      "frontmatter_invalid",
      `The date is not a day on the calendar: "${frontmatter.date}". Write it as YYYY-MM-DD.`,
    );
    delete frontmatter.date;
  }
  if (frontmatter.title === "") frontmatter.title = titleOf(path);

  const tree = parse(body, { lineOffset: offset });
  const profile = options.profile ?? "docs";
  for (const issue of validate(tree, profile, { source: body, lineOffset: offset })) {
    issues.push({ path, ...issue, severity: "error" });
  }
  for (const term of frontmatter.terms ?? []) {
    const short = validate(parse(term.short), "short");
    if (short.length > 0) {
      error(
        lineOfKey("terms"),
        "term_short",
        `The term "${term.id}": what it means is plain text, with no Markdown.`,
      );
    }
  }
  const entry: DocEntry = { path, frontmatter, tree };
  if (options.updated !== undefined) entry.updated = options.updated;
  return { entry, issues };
}

/** The values of a frontmatter that are each right, when the whole is not. */
function usable(read: object): Partial<Frontmatter> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(read)) {
    const schema = (FRONTMATTER_SCHEMA.properties as Record<string, object>)[key];
    if (schema && check(value, schema, key, key).length === 0) out[key] = value;
  }
  return out;
}

/** A title made from a path's last part, for a page or a folder that gives none. */
export function titleOf(path: string): string {
  const parts = path.split("/");
  const last = parts.at(-1) === "index" ? parts.at(-2) : parts.at(-1);
  const words = (last ?? "").replace(/[-_]+/g, " ").trim();
  return words === "" ? "Home" : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A folder's own page with nothing written in it lists what the folder holds:
 * its tree, with `::pages` in place of nothing. Any other page is as it is.
 */
export function asDirectory(path: string, tree: Root): Root {
  if (tree.children.length > 0 || !(path === "index" || path.endsWith("/index"))) return tree;
  return {
    ...tree,
    children: [{ type: "component", name: "pages", form: "leaf", props: {}, children: [] }],
  };
}

export type { Issue };
