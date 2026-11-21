import { imageKind, linkKind } from "./links.js";
import {
  type ComponentSpec,
  PROFILES,
  type ProfileName,
  REGISTRY,
  type Registry,
} from "./registry.js";
import { type Component, type Node, plain, type Root, walk } from "./tree.js";

export interface Issue {
  /** The line of the source, from 1. */
  line: number;
  /** The column on that line, from 1. It is 1 when only the line is known. */
  column: number;
  /** A short name for what is wrong, the same for every case of it. */
  code:
    | "unknown_component"
    | "component_not_allowed"
    | "component_form"
    | "component_props"
    | "component_place"
    | "component_unclosed"
    | "markdown_not_allowed"
    | "heading_too_shallow"
    | "link_refused"
    | "image_refused"
    | "too_long";
  message: string;
}

export interface ValidateOptions {
  registry?: Registry;
  /** The page's source. With it, an issue says its column as well as its line. */
  source?: string;
  /** Lines that came before the source in its file, as given to `parse`. */
  lineOffset?: number;
}

const NAMES: Partial<Record<Node["type"], string>> = {
  heading: "A heading",
  list: "A list",
  blockquote: "A quote",
  rule: "A rule",
  code: "A code block",
  link: "A link",
  image: "A picture",
  table: "A table",
  strong: "Bold text",
  emphasis: "Italic text",
  delete: "Struck-out text",
  inlineCode: "Code",
  component: "A component",
};

/**
 * Checks a tree against a profile. Nothing here changes the tree, and a tree
 * with issues can still be drawn: the renderers leave out what may not be shown.
 */
export function validate(tree: Root, profile: ProfileName, options: ValidateOptions = {}): Issue[] {
  const rules = PROFILES[profile];
  const components = (options.registry ?? REGISTRY).components;
  const issues: Issue[] = [];
  const lines = options.source?.split("\n");
  const offset = options.lineOffset ?? 0;

  const report = (node: Node, code: Issue["code"], message: string, find?: string) => {
    const line = node.line ?? 1 + offset;
    let column = 1;
    const text = lines?.[line - 1 - offset];
    if (text !== undefined && find) {
      const at = text.indexOf(find);
      if (at >= 0) column = at + 1;
    }
    issues.push({ line, column, code, message });
  };

  for (const { node, parent } of walk(tree)) {
    if (node.type === "listItem" || node.type === "tableRow" || node.type === "tableCell") continue;
    if (!rules.nodes.has(node.type)) {
      report(
        node,
        "markdown_not_allowed",
        `${NAMES[node.type] ?? "This"} cannot be used here: ${rules.description.toLowerCase().replace(/\.$/, "")} does not hold one.`,
      );
      continue;
    }
    switch (node.type) {
      case "heading":
        if (node.depth < rules.minHeading) {
          report(
            node,
            "heading_too_shallow",
            `A heading here starts at level ${rules.minHeading} (${"#".repeat(rules.minHeading)}). This one is level ${node.depth}.`,
          );
        }
        break;
      case "link": {
        const kind = linkKind(node.href);
        if (kind === "refused") {
          report(
            node,
            "link_refused",
            `The link to "${node.href}" cannot be followed. A link goes to an http or https address, to mailto:, or to another page.`,
            node.href,
          );
        } else if (!rules.links.has(kind)) {
          report(
            node,
            "link_refused",
            kind === "relative"
              ? `The link to "${node.href}" goes to another page, and there are no pages to go to from here. Give a full address.`
              : `A link cannot be used here.`,
            node.href,
          );
        }
        break;
      }
      case "image": {
        const kind = imageKind(node.src);
        if (kind === "refused") {
          report(
            node,
            "image_refused",
            `The picture "${node.src}" cannot be shown. A picture is a file beside the page or an https address.`,
            node.src,
          );
        } else if (!rules.images.has(kind)) {
          report(
            node,
            "image_refused",
            kind === "https"
              ? `The picture "${node.src}" is at another address. Pictures here are files beside the page, so that they show offline.`
              : `A picture cannot be used here.`,
            node.src,
          );
        }
        break;
      }
      case "component":
        checkComponent(node, parent, profile, components, report);
        break;
      default:
        break;
    }
  }

  if (rules.maxLength !== undefined) {
    const length = plain(tree).length;
    if (length > rules.maxLength) {
      issues.push({
        line: 1 + offset,
        column: 1,
        code: "too_long",
        message: `This is ${length} characters. It can be ${rules.maxLength} at most.`,
      });
    }
  }
  return issues.sort((a, b) => a.line - b.line || a.column - b.column);
}

function mark(node: Component): string {
  return `${node.form === "inline" ? ":" : node.form === "leaf" ? "::" : ":::"}${node.name}`;
}

function checkComponent(
  node: Component,
  parent: Node | undefined,
  profile: ProfileName,
  components: ReadonlyMap<string, ComponentSpec>,
  report: (node: Node, code: Issue["code"], message: string, find?: string) => void,
): void {
  const written = mark(node);
  const spec = components.get(node.name);
  if (!spec) {
    report(
      node,
      "unknown_component",
      `There is no component named "${node.name}". The components are: ${[...components.keys()].join(", ")}.`,
      written,
    );
    return;
  }
  if (!spec.profiles.includes(profile)) {
    report(
      node,
      "component_not_allowed",
      `"${node.name}" cannot be used here. It is for: ${spec.profiles.join(", ")}.`,
      written,
    );
    return;
  }
  if (spec.form !== node.form) {
    const how = {
      inline: `in a line of text, as :${spec.name}[…]`,
      leaf: `on a line of its own, as ::${spec.name}`,
      container: `around what it holds, as :::${spec.name} … :::`,
    }[spec.form];
    report(node, "component_form", `"${node.name}" is written ${how}.`, written);
    return;
  }
  if (node.unclosed) {
    report(node, "component_unclosed", `"${node.name}" is never closed.`, written);
  }
  if (node.badProps) {
    report(
      node,
      "component_props",
      `What is between the braces of "${node.name}" cannot be read. Write it as {name=value other="two words"}.`,
      written,
    );
  }
  if (node.form !== "inline") {
    if (spec.label === "required" && !node.label) {
      report(node, "component_props", `"${node.name}" needs words in square brackets.`, written);
    }
    if (spec.label === "none" && node.label !== undefined) {
      report(node, "component_props", `"${node.name}" takes no square brackets.`, written);
    }
  }
  for (const [name, value] of Object.entries(node.props)) {
    const prop = spec.props.properties[name];
    if (!prop) {
      const known = Object.keys(spec.props.properties);
      report(
        node,
        "component_props",
        known.length === 0
          ? `"${node.name}" takes nothing between braces. It has "${name}".`
          : `"${node.name}" has no "${name}". It takes: ${known.join(", ")}.`,
        name,
      );
      continue;
    }
    if (prop.enum && !prop.enum.includes(value)) {
      report(
        node,
        "component_props",
        `"${node.name}": ${name} is one of ${prop.enum.join(", ")}. It is "${value}".`,
        name,
      );
    }
    if (prop.maxLength !== undefined && value.length > prop.maxLength) {
      report(
        node,
        "component_props",
        `"${node.name}": ${name} is ${value.length} characters. It can be ${prop.maxLength} at most.`,
        name,
      );
    }
    if (prop.pattern && !new RegExp(prop.pattern).test(value)) {
      report(
        node,
        "component_props",
        `"${node.name}": ${name} is not written as it should be: "${value}".`,
        name,
      );
    }
  }
  for (const name of spec.props.required ?? []) {
    if (node.props[name] === undefined) {
      report(node, "component_props", `"${node.name}" needs ${name}.`, written);
    }
  }
  const wrong = spec.check?.(node.props);
  if (wrong) report(node, "component_props", `"${node.name}" ${wrong}`, written);

  if (spec.within) {
    const holder = parent?.type === "component" ? parent.name : undefined;
    if (holder !== spec.within) {
      report(
        node,
        "component_place",
        `"${node.name}" goes directly inside "${spec.within}".`,
        written,
      );
    }
  }
  if (spec.holds) {
    for (const child of node.children) {
      if (child.type === "component" && spec.holds.includes(child.name)) continue;
      report(
        child,
        "component_place",
        `"${node.name}" holds only ${spec.holds.map((one) => `"${one}"`).join(", ")}.`,
      );
    }
  }
  if (node.name === "code-tabs") {
    for (const child of node.children) {
      if (child.type !== "code") {
        report(child, "component_place", `"code-tabs" holds only code blocks.`);
      }
    }
  }
  if (node.name === "steps" && !node.children.some((one) => one.type === "list")) {
    report(node, "component_place", `"steps" holds a numbered list.`, written);
  }
  if (node.name === "file-tree" && !node.children.some((one) => one.type === "list")) {
    report(node, "component_place", `"file-tree" holds a list of files and folders.`, written);
  }
}
