import { CUSTOM, context, type Drawn, draw, type RenderOptions } from "./render.js";
import type { Node } from "./tree.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

/** Text made safe to put in HTML, between tags or inside a quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] as string);
}

const VOID = new Set(["br", "hr", "img", "input", "source"]);

export function serialize(drawn: readonly Drawn[]): string {
  let out = "";
  for (const one of drawn) {
    if (typeof one === "string") {
      out += escapeHtml(one);
      continue;
    }
    if (one.tag === CUSTOM) {
      out += String(one.value ?? "");
      continue;
    }
    out += `<${one.tag}`;
    for (const [name, value] of Object.entries(one.attrs)) {
      out += value === true ? ` ${name}=""` : ` ${name}="${escapeHtml(value)}"`;
    }
    if (VOID.has(one.tag)) {
      out += "/>";
      continue;
    }
    out += `>${serialize(one.children)}</${one.tag}>`;
  }
  return out;
}

export interface HtmlOptions extends RenderOptions {
  /**
   * Draws a node some other way. It is given the node and a way to draw it as
   * usual, and gives back HTML, or nothing to leave it as usual. What it gives
   * back is put on the page as it is, so it must escape what it is given.
   */
  override?: (node: Node, usual: () => string) => string | undefined;
}

/**
 * Draws a tree as HTML. Every word and every attribute is escaped, there is no
 * script in it and no handler, and a link or a picture that may not be shown
 * is left as its words.
 */
export function renderHtml(tree: Node, options: HtmlOptions = {}): string {
  const ctx = context(options);
  const override = options.override;
  if (override) ctx.custom = (node, usual) => override(node, () => serialize(usual()));
  return serialize(draw(tree, ctx));
}
