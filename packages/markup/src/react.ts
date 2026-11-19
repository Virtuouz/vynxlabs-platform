import { createElement, Fragment, type ReactNode } from "react";
import { isExternal } from "./links.js";
import {
  allowed,
  type Context,
  CUSTOM,
  context,
  type Drawn,
  draw,
  drawAll,
  type FieldInfo,
  hrefOf,
  type RenderOptions,
  srcOf,
  type TermInfo,
  tabsOf,
} from "./render.js";
import { type Component, type Node, plain } from "./tree.js";

/**
 * The components a page's own are drawn with. Each one left out is drawn as
 * plain elements, the same ones the HTML renderer writes, so a page looks
 * right before any of these is given and the two renderers can be compared.
 */
export interface Components {
  alert?: (props: {
    type: "info" | "success" | "warning" | "danger";
    title?: string;
    children: ReactNode;
  }) => ReactNode;
  /** `info` is null when nothing stands behind the word for this reader. */
  term?: (props: {
    props: Record<string, string>;
    /** The term as it was written, as plain text. */
    word: string;
    info: TermInfo | null;
    children: ReactNode;
  }) => ReactNode;
  field?: (props: { path: string; info: FieldInfo | null }) => ReactNode;
  steps?: (props: { children: ReactNode }) => ReactNode;
  /** Draws `tabs` and `code-tabs` alike. */
  tabs?: (props: { tabs: { label: string; children: ReactNode }[] }) => ReactNode;
  details?: (props: { summary: string; children: ReactNode }) => ReactNode;
  kbd?: (props: { keys: string }) => ReactNode;
  screenshot?: (props: { src: string | null; alt: string }) => ReactNode;
  fileTree?: (props: { children: ReactNode }) => ReactNode;
  link?: (props: {
    href: string;
    external: boolean;
    title?: string;
    children: ReactNode;
  }) => ReactNode;
  code?: (props: { value: string; lang?: string }) => ReactNode;
  image?: (props: { src: string; alt: string; title?: string }) => ReactNode;
}

export interface ReactOptions extends RenderOptions {
  components?: Components;
}

const RENAMED: Record<string, string> = {
  class: "className",
  tabindex: "tabIndex",
  checked: "defaultChecked",
};

function style(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(";")) {
    const [name, value] = part.split(":");
    if (!name || !value) continue;
    out[name.trim().replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value.trim();
  }
  return out;
}

function toReact(drawn: readonly Drawn[]): ReactNode {
  const out = drawn.map((one, index) => {
    if (typeof one === "string") return one;
    if (one.tag === CUSTOM) {
      return createElement(Fragment, { key: index }, one.value as ReactNode);
    }
    const props: Record<string, unknown> = { key: index };
    for (const [name, value] of Object.entries(one.attrs)) {
      if (name === "style" && typeof value === "string") props.style = style(value);
      else if (name === "start") props.start = Number(value);
      else props[RENAMED[name] ?? name] = value;
    }
    return one.children.length === 0
      ? createElement(one.tag, props)
      : createElement(one.tag, props, toReact(one.children));
  });
  return out.length === 1 ? out[0] : out;
}

function own(node: Node, ctx: Context, components: Components): ReactNode | undefined {
  const inside = () => ("children" in node ? toReact(drawAll(node.children, ctx)) : null);
  switch (node.type) {
    case "link": {
      const href = hrefOf(node.href, ctx);
      if (!components.link || href === undefined) return undefined;
      return components.link({
        href,
        external: isExternal(href),
        ...(node.title ? { title: node.title } : {}),
        children: inside(),
      });
    }
    case "code":
      return components.code?.({ value: node.value, ...(node.lang ? { lang: node.lang } : {}) });
    case "image": {
      const src = srcOf(node.src, ctx);
      if (!components.image || src === undefined) return undefined;
      return components.image({
        src,
        alt: node.alt,
        ...(node.title ? { title: node.title } : {}),
      });
    }
    case "component":
      return allowed(node, ctx) ? ownComponent(node, ctx, components, inside) : undefined;
    default:
      return undefined;
  }
}

function ownComponent(
  node: Component,
  ctx: Context,
  components: Components,
  inside: () => ReactNode,
): ReactNode | undefined {
  switch (node.name) {
    case "alert": {
      const type = (
        ["info", "success", "warning", "danger"].includes(node.props.type ?? "")
          ? node.props.type
          : "info"
      ) as "info";
      return components.alert?.({
        type,
        ...(node.label ? { title: node.label } : {}),
        children: inside(),
      });
    }
    case "term":
      return components.term?.({
        props: node.props,
        word: plain(node),
        info: ctx.options.term?.(node.props) ?? null,
        children: inside(),
      });
    case "field": {
      const path = node.props.path ?? "";
      return components.field?.({ path, info: ctx.options.field?.(path) ?? null });
    }
    case "steps":
      return components.steps?.({ children: inside() });
    case "tabs":
    case "code-tabs":
      return components.tabs?.({
        tabs: tabsOf(node).map((tab) => ({
          label: tab.label,
          children: toReact(
            tab.node.type === "component" ? drawAll(tab.node.children, ctx) : draw(tab.node, ctx),
          ),
        })),
      });
    case "details":
      return components.details?.({ summary: node.props.summary ?? "", children: inside() });
    case "kbd":
      return components.kbd?.({ keys: plain(node) });
    case "screenshot":
      return components.screenshot?.({
        src: ctx.options.screenshot?.(node.props.name ?? "") ?? null,
        alt: node.props.alt ?? "",
      });
    case "file-tree":
      return components.fileTree?.({ children: inside() });
    default:
      return undefined;
  }
}

/**
 * Draws a tree as React elements. With no components given it writes the same
 * elements as `renderHtml`, one for one.
 */
export function renderReact(tree: Node, options: ReactOptions = {}): ReactNode {
  const ctx = context(options);
  const components = options.components;
  if (components) ctx.custom = (node) => own(node, ctx, components);
  return toReact(draw(tree, ctx));
}

export type { FieldInfo, RenderOptions, TermInfo } from "./render.js";
