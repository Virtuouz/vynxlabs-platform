import { context, type RenderOptions, tabsOf } from "./render.js";
import type { Node } from "./tree.js";

const BLOCKS = new Set(["heading", "paragraph", "code", "list", "blockquote", "table", "rule"]);

/**
 * The words of a tree and nothing else, for a search index, for `llms.txt`
 * and for a label read aloud. A blank line parts one block from the next.
 */
export function renderText(tree: Node, options: RenderOptions = {}): string {
  const ctx = context(options);
  const text = (node: Node): string => {
    switch (node.type) {
      case "text":
      case "inlineCode":
      case "code":
        return node.value;
      case "image":
        return node.alt;
      case "break":
        return node.hard ? "\n" : " ";
      case "rule":
        return "";
      case "listItem":
        return `- ${blocks(node.children).replace(/\n\n/g, "\n").replace(/\n/g, "\n  ")}`;
      case "list":
        return node.children.map(text).join("\n");
      case "tableRow":
        return node.children.map((cell) => blocks(cell.children)).join(" | ");
      case "table":
        return node.children.map(text).join("\n");
      case "component":
        switch (node.name) {
          case "product":
            return ctx.options.productName ?? "Volvel";
          case "screenshot":
            return node.props.alt ?? "";
          case "glossary":
            return [
              ...(ctx.options.glossary?.(node.props.scope === "site" ? "site" : "collection") ??
                []),
            ]
              .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }))
              .map((item) => `${item.term}: ${item.short}`)
              .join("\n");
          case "changelog":
            return (
              ctx.options.changelog?.({
                ...(node.props.folder ? { folder: node.props.folder } : {}),
                ...(node.props.subject ? { subject: node.props.subject } : {}),
              }) ?? []
            )
              .slice(0, Math.max(1, Math.min(50, Number(node.props.limit) || 10)))
              .map((item) => `- ${item.title}${item.date ? ` (${item.date})` : ""}`)
              .join("\n");
          case "pages":
            return (ctx.options.folder?.() ?? []).map((item) => `- ${item.title}`).join("\n");
          case "field":
            return ctx.options.field?.(node.props.path ?? "")?.description ?? node.props.path ?? "";
          case "details":
            return join([node.props.summary ?? "", blocks(node.children)]);
          case "alert":
            return join([node.label ?? "", blocks(node.children)]);
          case "tabs":
          case "code-tabs":
            return join(tabsOf(node).flatMap((tab) => [tab.label, text(tab.node)]));
          default:
            return blocks(node.children);
        }
      default:
        return "children" in node ? blocks(node.children) : "";
    }
  };
  const join = (parts: string[]) => parts.filter((part) => part !== "").join("\n\n");
  const blocks = (nodes: readonly Node[]): string => {
    let out = "";
    for (const node of nodes) {
      const piece = text(node);
      const block = BLOCKS.has(node.type) || (node.type === "component" && node.form !== "inline");
      if (block && out !== "" && piece !== "") out = `${out.replace(/\s+$/, "")}\n\n`;
      out += piece;
      if (block && piece !== "") out += "\n\n";
    }
    return out.replace(/\s+$/, "");
  };
  return blocks([tree])
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
