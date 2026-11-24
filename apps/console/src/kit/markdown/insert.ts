import {
  COMPONENTS,
  type Component,
  type ComponentSpec,
  containersAt,
  type ProfileName,
  type Root,
} from "@volvel/markup";

/** A component as the Insert menu offers it. */
export interface Insertable {
  spec: ComponentSpec;
  /** What a writer calls it. */
  name: string;
  /** A character or two that stands for it. */
  glyph: string;
  /** How it is written, as a reminder. */
  syntax: string;
  block: boolean;
}

/** The menu's names and order: callouts first, as the most used. */
const MENU: Record<string, { name: string; glyph: string }> = {
  alert: { name: "Callout", glyph: "!" },
  tabs: { name: "Tabs", glyph: "⇆" },
  tab: { name: "Tab", glyph: "⇥" },
  steps: { name: "Steps", glyph: "1." },
  details: { name: "Details", glyph: "▸" },
  "code-tabs": { name: "Code tabs", glyph: "{}" },
  "file-tree": { name: "File tree", glyph: "┣" },
  pages: { name: "Pages in this folder", glyph: "▤" },
  glossary: { name: "Glossary", glyph: "A–Z" },
  changelog: { name: "Changelog", glyph: "◷" },
  field: { name: "Field", glyph: "ƒ" },
  term: { name: "Term", glyph: "Aa" },
  kbd: { name: "Key", glyph: "⌘" },
};

/**
 * What the registry can insert and the menu does not offer, and why. A component with an
 * `insert` that is in neither this nor the menu fails the test beside this file.
 */
export const NOT_IN_MENU: Record<string, string> = {
  product: "Only the product's own pages use it, so no writer's profile has it.",
  screenshot: "A picture taken when a version is released, written by the people who release it.",
};

const syntaxOf = (spec: ComponentSpec) =>
  spec.form === "inline"
    ? `:${spec.name}`
    : spec.form === "leaf"
      ? `::${spec.name}`
      : `:::${spec.name}`;

/** What can go where the cursor is: inside tabs, only a tab; anywhere else, anything but a tab. */
export function insertables(
  within: readonly Component[],
  profile: ProfileName = "docs",
): Insertable[] {
  const holder = within.at(-1);
  return Object.keys(MENU)
    .map((name) => COMPONENTS.find((spec) => spec.name === name))
    .filter((spec): spec is ComponentSpec => spec?.profiles.includes(profile) === true)
    .filter((spec) => {
      if (holder?.name === "tabs") return spec.name === "tab";
      if (holder?.name === "code-tabs") return false;
      return spec.name !== "tab";
    })
    .map((spec) => ({
      spec,
      name: MENU[spec.name]?.name ?? spec.name,
      glyph: MENU[spec.name]?.glyph ?? "·",
      syntax: syntaxOf(spec),
      block: spec.form !== "inline",
    }));
}

/** The words a container is known by where the cursor is: `tab "Cash"`, or `details`. */
export function nameOf(container: Component): string {
  const said = container.props.label ?? container.props.summary ?? container.label;
  return said ? `${container.name} “${said}”` : container.name;
}

/** The containers the cursor is in, by line, in the tree the page was read into. */
export function where(tree: Root | undefined, line: number): Component[] {
  return tree ? containersAt(tree, line) : [];
}

const lineStart = (text: string, at: number) => text.lastIndexOf("\n", at - 1) + 1;
const lineEnd = (text: string, at: number) => {
  const found = text.indexOf("\n", at);
  return found === -1 ? text.length : found;
};

/**
 * Puts a component where the cursor is. Inside a container it is written
 * with one more colon than the container, so that it reads as inside it, and
 * as deep as the line it goes on. A block goes on a line of its own, apart
 * from the words around it. What is selected becomes an inline component's
 * words. Gives the text as it is to be, and where the cursor is left.
 */
export function insertInto(
  source: string,
  selection: { start: number; end: number },
  item: Insertable,
  within: readonly Component[],
): { text: string; select: { start: number; end: number } } {
  const snippet = item.spec.insert;
  if (!item.block) {
    const chosen = source.slice(selection.start, selection.end);
    const [before = "", after = ""] = snippet.split("$0");
    // A selection is the component's words: `:term[what was selected]{…}`.
    const words = chosen !== "" && before.endsWith("[") ? chosen : "";
    const put = `${before}${words}${after}`;
    const text = source.slice(0, selection.start) + put + source.slice(selection.end);
    const cursor = selection.start + before.length + words.length;
    return { text, select: { start: cursor, end: cursor } };
  }

  // As deep as the container the cursor is in.
  const holder = within.at(-1);
  const lines = source.split("\n");
  const colonsOf = (line: number | undefined) => {
    if (line === undefined) return 0;
    return /^\s*(:+)/.exec(lines[line - 1] ?? "")?.[1]?.length ?? 0;
  };
  const outer = holder ? colonsOf(holder.line) : 0;
  const more = outer >= 3 ? outer + 1 - 3 : 0;
  // As far in as the line it goes on: a step's own words are indented under it.
  const startOfLine = lineStart(source, selection.start);
  const endOfLine = lineEnd(source, selection.start);
  const here = source.slice(startOfLine, endOfLine);
  const indent = /^\s*/.exec(here)?.[0] ?? "";
  const written = snippet
    .split("\n")
    .map((line) =>
      line.replace(
        /^(\s*)(:{3,})/,
        (_, space: string, colons: string) => `${space}${colons}${":".repeat(more)}`,
      ),
    )
    .map((line, index) => (index === 0 || line === "" ? line : `${indent}${line}`))
    .join("\n");
  const [head = "", tail = ""] = written.split("$0");
  const empty = here.trim() === "";
  // On an empty line it takes the line. After words, it goes under them, apart.
  const from = empty ? startOfLine + indent.length : endOfLine;
  const to = empty ? endOfLine : endOfLine;
  // Apart from the words above it, by a blank line.
  const above = source.slice(
    lineStart(source, Math.max(0, startOfLine - 1)),
    Math.max(0, startOfLine - 1),
  );
  const before = empty
    ? startOfLine > 0 && above.trim() !== ""
      ? `\n${indent}`
      : ""
    : `\n\n${indent}`;
  const following = source.slice(to);
  const after =
    following === "" || following.startsWith("\n\n")
      ? ""
      : following.startsWith("\n")
        ? "\n"
        : "\n\n";
  const text = `${source.slice(0, from)}${before}${head}${tail}${after}${following}`;
  const cursor = from + before.length + head.length;
  return { text, select: { start: cursor, end: cursor } };
}

/** Puts words around what is selected, or around a placeholder that is then selected. */
export function surround(
  source: string,
  selection: { start: number; end: number },
  before: string,
  after: string,
  placeholder: string,
): { text: string; select: { start: number; end: number } } {
  const chosen = source.slice(selection.start, selection.end) || placeholder;
  const text =
    source.slice(0, selection.start) + before + chosen + after + source.slice(selection.end);
  const start = selection.start + before.length;
  return { text, select: { start, end: start + chosen.length } };
}

/** Puts a prefix at the start of the cursor's line, or takes it off when it is there. */
export function togglePrefix(
  source: string,
  selection: { start: number; end: number },
  prefix: string,
): { text: string; select: { start: number; end: number } } {
  const start = lineStart(source, selection.start);
  const has = source.startsWith(prefix, start);
  const text = has
    ? source.slice(0, start) + source.slice(start + prefix.length)
    : source.slice(0, start) + prefix + source.slice(start);
  const by = has ? -prefix.length : prefix.length;
  const at = Math.max(start, selection.start + by);
  return { text, select: { start: at, end: Math.max(at, selection.end + by) } };
}
