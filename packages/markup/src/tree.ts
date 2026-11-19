/**
 * The tree a page is read into. It is plain JSON: it is what is stored, sent
 * and drawn, and every renderer reads this and nothing else. `line` is the
 * line of the source a node began on, counted from 1.
 */

export const TREE_VERSION = 1;

interface Base {
  line?: number;
}

export interface Root extends Base {
  type: "root";
  v: typeof TREE_VERSION;
  children: Node[];
}

export interface Heading extends Base {
  type: "heading";
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  /** What a link to this heading ends in, after `#`. One per page. */
  id: string;
  children: Node[];
}

export interface Paragraph extends Base {
  type: "paragraph";
  children: Node[];
}

export interface Text extends Base {
  type: "text";
  value: string;
}

export interface Strong extends Base {
  type: "strong";
  children: Node[];
}

export interface Emphasis extends Base {
  type: "emphasis";
  children: Node[];
}

export interface Delete extends Base {
  type: "delete";
  children: Node[];
}

export interface InlineCode extends Base {
  type: "inlineCode";
  value: string;
}

export interface Code extends Base {
  type: "code";
  lang?: string;
  /** What follows the language on the fence's line. */
  meta?: string;
  value: string;
}

export interface Link extends Base {
  type: "link";
  href: string;
  title?: string;
  children: Node[];
}

export interface Image extends Base {
  type: "image";
  src: string;
  alt: string;
  title?: string;
}

export interface List extends Base {
  type: "list";
  ordered: boolean;
  start?: number;
  children: ListItem[];
}

export interface ListItem extends Base {
  type: "listItem";
  /** Set when the item is a task: ticked or not. */
  checked?: boolean;
  children: Node[];
}

export interface Blockquote extends Base {
  type: "blockquote";
  children: Node[];
}

export interface Rule extends Base {
  type: "rule";
}

export type Align = "left" | "right" | "center" | null;

export interface Table extends Base {
  type: "table";
  align: Align[];
  children: TableRow[];
}

export interface TableRow extends Base {
  type: "tableRow";
  header: boolean;
  children: TableCell[];
}

export interface TableCell extends Base {
  type: "tableCell";
  children: Node[];
}

export interface Break extends Base {
  type: "break";
  /** A hard break is one the author asked for. A soft one is where a line ended. */
  hard: boolean;
}

/** How a component was written: in a line of text, on a line of its own, or around other blocks. */
export type Form = "inline" | "leaf" | "container";

export interface Component extends Base {
  type: "component";
  name: string;
  form: Form;
  /** What was written between the braces. Every value is text. */
  props: Record<string, string>;
  /** What was written between the square brackets of a leaf or a container. */
  label?: string;
  /** Set when the braces could not be read. */
  badProps?: true;
  /** Set on a container that no line closed. */
  unclosed?: true;
  children: Node[];
}

export type Node =
  | Root
  | Heading
  | Paragraph
  | Text
  | Strong
  | Emphasis
  | Delete
  | InlineCode
  | Code
  | Link
  | Image
  | List
  | ListItem
  | Blockquote
  | Rule
  | Table
  | TableRow
  | TableCell
  | Break
  | Component;

export type NodeType = Node["type"];

/** A node's children, or none. */
export function childrenOf(node: Node): readonly Node[] {
  return "children" in node ? node.children : [];
}

/** Every node of a tree, parents before their children. */
export function* walk(node: Node, parent?: Node): Generator<{ node: Node; parent?: Node }> {
  yield parent ? { node, parent } : { node };
  for (const child of childrenOf(node)) yield* walk(child, node);
}

/** The words of a node and everything under it, with no markup. */
export function plain(node: Node): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "code":
      return node.value;
    case "image":
      return node.alt;
    case "break":
      return " ";
    default:
      return childrenOf(node).map(plain).join("");
  }
}

/**
 * The part of a heading's address made from its words: lowercase, with
 * hyphens for spaces, keeping letters and digits of any script.
 */
export function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
