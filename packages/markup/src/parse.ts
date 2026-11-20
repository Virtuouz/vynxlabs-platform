import createReader, { type MarkdownIt, type Token } from "markdown-it";
import { type DirectiveMeta, directives } from "./directive.js";
import {
  type Align,
  type Code,
  type Component,
  type Heading,
  type Image,
  type Link,
  type List,
  type ListItem,
  type Node,
  plain,
  type Root,
  slug,
  type Table,
  type TableCell,
  type TableRow,
  TREE_VERSION,
} from "./tree.js";

/**
 * The one way Markdown is read, for every author and every surface: CommonMark
 * with tables and strikethrough, task lists, and components. HTML in the source
 * is text, never markup. Which links may be followed is not decided here: every
 * link is read into the tree, and `validate` and the renderers each refuse the
 * ones that may not be.
 */
function reader(): MarkdownIt {
  const md = createReader({ html: false, linkify: false, typographer: false });
  md.validateLink = () => true;
  md.use(directives);
  return md;
}

let shared: MarkdownIt | undefined;

export interface ParseOptions {
  /** Lines that came before this source in its file, such as frontmatter. They are added to every `line`. */
  lineOffset?: number;
}

/** Reads Markdown into a tree. It never throws: anything not understood is text. */
export function parse(source: string, options: ParseOptions = {}): Root {
  shared ??= reader();
  const tokens = shared.parse(source.replace(/\r\n?/g, "\n"), {});
  const state: State = { tokens, at: 0, offset: options.lineOffset ?? 0, ids: new Map() };
  const root: Root = { type: "root", v: TREE_VERSION, children: blocks(state, undefined) };
  return root;
}

interface State {
  tokens: Token[];
  at: number;
  offset: number;
  /** Heading addresses given out so far, and how many times. */
  ids: Map<string, number>;
}

function lineOf(state: State, token: Token): number | undefined {
  return token.map ? token.map[0] + 1 + state.offset : undefined;
}

function withLine<T extends Node>(node: T, line: number | undefined): T {
  if (line !== undefined) node.line = line;
  return node;
}

/** Reads block tokens until the one that closes the block being read. */
function blocks(state: State, until: string | undefined): Node[] {
  const out: Node[] = [];
  while (state.at < state.tokens.length) {
    const token = state.tokens[state.at] as Token;
    if (until !== undefined && token.type === until) {
      state.at++;
      return out;
    }
    state.at++;
    const line = lineOf(state, token);
    switch (token.type) {
      case "paragraph_open": {
        const children = inlineOf(state, line);
        skip(state, "paragraph_close");
        // In a list written without blank lines, an item's words are not a paragraph.
        if (token.hidden) out.push(...children);
        else out.push(withLine({ type: "paragraph", children }, line));
        break;
      }
      case "heading_open": {
        const children = inlineOf(state, line);
        skip(state, "heading_close");
        const heading: Heading = {
          type: "heading",
          depth: Number(token.tag.slice(1)) as Heading["depth"],
          id: "",
          children,
        };
        heading.id = headingId(state, plain(heading));
        out.push(withLine(heading, line));
        break;
      }
      case "bullet_list_open":
      case "ordered_list_open": {
        const ordered = token.type === "ordered_list_open";
        const list: List = { type: "list", ordered, children: [] };
        const start = token.attrGet("start");
        if (ordered && start !== null && Number(start) !== 1) list.start = Number(start);
        const close = ordered ? "ordered_list_close" : "bullet_list_close";
        while (state.at < state.tokens.length) {
          const next = state.tokens[state.at] as Token;
          state.at++;
          if (next.type === close) break;
          if (next.type !== "list_item_open") continue;
          const item: ListItem = { type: "listItem", children: blocks(state, "list_item_close") };
          task(item);
          list.children.push(withLine(item, lineOf(state, next)));
        }
        out.push(withLine(list, line));
        break;
      }
      case "blockquote_open":
        out.push(
          withLine({ type: "blockquote", children: blocks(state, "blockquote_close") }, line),
        );
        break;
      case "hr":
        out.push(withLine({ type: "rule" }, line));
        break;
      case "fence":
      case "code_block": {
        const [lang = "", ...rest] = token.info.trim().split(/\s+/);
        const node: Code = { type: "code", value: token.content.replace(/\n$/, "") };
        if (lang !== "") node.lang = lang;
        if (rest.length > 0) node.meta = rest.join(" ");
        out.push(withLine(node, line));
        break;
      }
      case "table_open":
        out.push(withLine(table(state), line));
        break;
      case "directive_leaf": {
        out.push(withLine(component(token.meta as unknown as DirectiveMeta, "leaf", []), line));
        break;
      }
      case "directive_container_open": {
        const children = blocks(state, "directive_container_close");
        const made = withLine(
          component(token.meta as unknown as DirectiveMeta, "container", children),
          line,
        );
        if (token.map) made.endLine = token.map[1] + state.offset;
        out.push(made);
        break;
      }
      case "inline":
        // Only reached for a block this reader does not name. Its words are kept.
        state.at--;
        out.push(...inlineOf(state, line));
        break;
      default:
        break;
    }
  }
  return out;
}

function skip(state: State, type: string): void {
  if (state.tokens[state.at]?.type === type) state.at++;
}

function headingId(state: State, text: string): string {
  const base = slug(text) || "section";
  const seen = state.ids.get(base) ?? 0;
  state.ids.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen}`;
}

/** A list item that begins `[ ]` or `[x]` is a task. The mark is taken out of its words. */
function task(item: ListItem): void {
  let first = item.children[0];
  if (first?.type === "paragraph") first = first.children[0];
  if (first?.type !== "text") return;
  const mark = /^\[([ xX])\]\s+/.exec(first.value);
  if (!mark) return;
  item.checked = mark[1] !== " ";
  first.value = first.value.slice(mark[0].length);
}

function component(meta: DirectiveMeta, form: Component["form"], children: Node[]): Component {
  const node: Component = { type: "component", name: meta.name, form, props: meta.props, children };
  if (meta.label !== undefined && form !== "inline") node.label = meta.label;
  if (meta.badProps) node.badProps = true;
  if (meta.unclosed) node.unclosed = true;
  return node;
}

function table(state: State): Table {
  const node: Table = { type: "table", align: [], children: [] };
  let header = false;
  while (state.at < state.tokens.length) {
    const token = state.tokens[state.at] as Token;
    state.at++;
    if (token.type === "table_close") break;
    if (token.type === "thead_open") header = true;
    if (token.type === "thead_close") header = false;
    if (token.type !== "tr_open") continue;
    const row: TableRow = { type: "tableRow", header, children: [] };
    while (state.at < state.tokens.length) {
      const cell = state.tokens[state.at] as Token;
      state.at++;
      if (cell.type === "tr_close") break;
      if (cell.type !== "th_open" && cell.type !== "td_open") continue;
      if (header) {
        const style = String(cell.attrGet("style") ?? "");
        const align = /text-align:\s*(left|right|center)/.exec(style);
        node.align.push(align ? (align[1] as Align) : null);
      }
      const line = lineOf(state, token);
      const made: TableCell = { type: "tableCell", children: inlineOf(state, line) };
      skip(state, cell.type === "th_open" ? "th_close" : "td_close");
      row.children.push(made);
    }
    node.children.push(withLine(row, lineOf(state, token)));
  }
  return node;
}

/** Reads the `inline` token at hand into nodes. A line break moves `line` on by one. */
function inlineOf(state: State, line: number | undefined): Node[] {
  const token = state.tokens[state.at];
  if (token?.type !== "inline") return [];
  state.at++;
  const cursor = { tokens: token.children ?? [], at: 0, line };
  return inline(cursor, undefined);
}

interface Cursor {
  tokens: Token[];
  at: number;
  line: number | undefined;
}

function inline(cursor: Cursor, until: string | undefined): Node[] {
  const out: Node[] = [];
  const push = (node: Node) => {
    const last = out.at(-1);
    if (node.type === "text" && last?.type === "text") last.value += node.value;
    else out.push(withLine(node, cursor.line));
  };
  while (cursor.at < cursor.tokens.length) {
    const token = cursor.tokens[cursor.at] as Token;
    cursor.at++;
    if (until !== undefined && token.type === until) return out;
    switch (token.type) {
      case "text":
        if (token.content !== "") push({ type: "text", value: token.content });
        break;
      case "code_inline":
        push({ type: "inlineCode", value: token.content });
        break;
      case "softbreak":
      case "hardbreak":
        push({ type: "break", hard: token.type === "hardbreak" });
        if (cursor.line !== undefined) cursor.line++;
        break;
      case "strong_open":
        push({ type: "strong", children: inline(cursor, "strong_close") });
        break;
      case "em_open":
        push({ type: "emphasis", children: inline(cursor, "em_close") });
        break;
      case "s_open":
        push({ type: "delete", children: inline(cursor, "s_close") });
        break;
      case "link_open": {
        const node: Link = {
          type: "link",
          href: String(token.attrGet("href") ?? ""),
          children: [],
        };
        const title = token.attrGet("title");
        if (title) node.title = String(title);
        const line = cursor.line;
        node.children = inline(cursor, "link_close");
        out.push(withLine(node, line));
        break;
      }
      case "image": {
        const node: Image = {
          type: "image",
          src: String(token.attrGet("src") ?? ""),
          alt: token.content,
        };
        const title = token.attrGet("title");
        if (title) node.title = String(title);
        push(node);
        break;
      }
      case "directive_inline_open": {
        const line = cursor.line;
        const children = inline(cursor, "directive_inline_close");
        out.push(
          withLine(component(token.meta as unknown as DirectiveMeta, "inline", children), line),
        );
        break;
      }
      default:
        if (token.content) push({ type: "text", value: token.content });
        break;
    }
  }
  return out;
}
