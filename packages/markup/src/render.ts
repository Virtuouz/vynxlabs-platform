import { imageKind, isExternal, safeHref, topicOf } from "./links.js";
import { PROFILES, type ProfileName, REGISTRY, type Registry } from "./registry.js";
import { type Component, type Node, plain } from "./tree.js";

/**
 * What a tree is drawn as, before it is HTML or React: elements with a tag,
 * attributes and children. Both renderers are made from this one drawing, so
 * the page served and the page previewed cannot come apart.
 */
export interface El {
  tag: string;
  attrs: Record<string, string | true>;
  children: Drawn[];
  /** For an element whose tag is `CUSTOM`: what a renderer drew in its own way. */
  value?: unknown;
}

export type Drawn = El | string;

/** What stands behind a term: a few words, and where to read more. */
export interface TermInfo {
  short?: string;
  href?: string;
}

/** What a kind says about one of its fields. */
export interface FieldInfo {
  title?: string;
  description?: string;
}

export interface RenderOptions {
  /** Which links and pictures may be shown, and which components. `docs` when left out. */
  profile?: ProfileName;
  registry?: Registry;
  /** What `:product[]` is drawn as. */
  productName?: string;
  /**
   * Where a link goes, given what was written. Nothing, or the same address,
   * leaves it as written. `null` draws the link's words with no link: for a
   * page the reader may not open, or one that is not there.
   */
  link?: (href: string) => string | null | undefined;
  /** Where a picture is served from, given what was written. `null` leaves only its description. */
  image?: (src: string) => string | null | undefined;
  /** What a term means. `null`, or nothing, draws the word alone. */
  term?: (props: Record<string, string>) => TermInfo | null | undefined;
  field?: (path: string) => FieldInfo | null | undefined;
  /** Where a screenshot is served from, by its name. */
  screenshot?: (name: string) => string | null | undefined;
  /**
   * Marks each block drawn with the lines of the source it came from, as
   * `data-line` and, for a container, `data-end-line`: for an editor whose
   * preview follows its cursor. A served page leaves it out.
   */
  lines?: boolean;
  /** What is in the folder the page is in, for `::pages`. Nothing draws nothing. */
  folder?: () => readonly FolderItem[] | null | undefined;
  /**
   * How many levels to push headings down, for a page drawn inside another
   * that has headings of its own: 2 draws `#` as an h3. None goes past h6.
   */
  headingShift?: number;
  /** Put before every id this drawing makes up, so two drawings on one page do not clash. */
  idPrefix?: string;
  /** The words of the link behind a term. `{word}` is the term as it was written. "More about {word}" when left out. */
  learnMore?: string;
}

/** One page or folder of a folder, as `::pages` lists it. */
export interface FolderItem {
  title: string;
  description?: string;
  /** Where it is, already resolved. */
  href: string;
  folder?: boolean;
}

export interface Context {
  options: RenderOptions;
  profile: ProfileName;
  registry: Registry;
  ids: number;
  /**
   * A renderer's own way to draw a node: HTML of the caller's, or a React
   * component. It gives back what it drew, or nothing to leave the node as usual.
   */
  custom?: (node: Node, usual: () => Drawn[]) => unknown;
}

/** The tag of an element that holds what a renderer drew in its own way. */
export const CUSTOM = "#custom";

export function context(options: RenderOptions = {}): Context {
  return {
    options,
    profile: options.profile ?? "docs",
    registry: options.registry ?? REGISTRY,
    ids: 0,
  };
}

export const el = (tag: string, attrs: El["attrs"] = {}, children: Drawn[] = []): El => ({
  tag,
  attrs,
  children,
});

/** Whether a component may be drawn in the profile at hand, as the form it was written in. */
export function allowed(node: Component, ctx: Context): boolean {
  const spec = ctx.registry.components.get(node.name);
  return spec !== undefined && spec.form === node.form && spec.profiles.includes(ctx.profile);
}

/** The address a link is drawn with, or nothing when it is drawn as words. */
export function hrefOf(href: string, ctx: Context, given = false): string | undefined {
  const safe = safeHref(href, PROFILES[ctx.profile].links);
  if (safe === undefined) return undefined;
  // An address a resolver already gave, such as where a term's page is, is not resolved again.
  const mapped = given ? undefined : ctx.options.link?.(safe);
  if (mapped === null) return undefined;
  const final = mapped ?? safe;
  // What a resolver gives back is checked as what an author writes is. A topic
  // nobody resolved is not an address a browser can follow.
  if (topicOf(final) !== undefined) return undefined;
  return safeHref(final, new Set(["http", "mailto", "relative"]));
}

/** The address a picture is drawn from, or nothing when only its description is shown. */
export function srcOf(src: string, ctx: Context): string | undefined {
  const kind = imageKind(src);
  if (kind === "refused" || !PROFILES[ctx.profile].images.has(kind)) return undefined;
  const mapped = ctx.options.image?.(src.trim());
  if (mapped === null) return undefined;
  const final = mapped ?? src.trim();
  return imageKind(final) === "refused" ? undefined : final;
}

export function drawAll(nodes: readonly Node[], ctx: Context): Drawn[] {
  const out: Drawn[] = [];
  for (const node of nodes) {
    for (const one of draw(node, ctx)) {
      const last = out.at(-1);
      if (typeof one === "string" && typeof last === "string") out[out.length - 1] = last + one;
      else if (one !== "") out.push(one);
    }
  }
  return out;
}

/** The kinds of node that are blocks of a page: what an editor's preview can point at. */
const BLOCK_TYPES = new Set([
  "heading",
  "paragraph",
  "list",
  "blockquote",
  "code",
  "table",
  "rule",
]);

export function draw(node: Node, ctx: Context): Drawn[] {
  const drawn = drawn0(node, ctx);
  if (!ctx.options.lines || node.line === undefined) return drawn;
  const block = BLOCK_TYPES.has(node.type) || (node.type === "component" && node.form !== "inline");
  const first = drawn[0];
  if (block && first && typeof first !== "string" && first.tag !== CUSTOM) {
    first.attrs["data-line"] = String(node.line);
    if (node.type === "component" && node.endLine !== undefined) {
      first.attrs["data-end-line"] = String(node.endLine);
    }
  }
  return drawn;
}

function drawn0(node: Node, ctx: Context): Drawn[] {
  if (!ctx.custom) return usual(node, ctx);
  const value = ctx.custom(node, () => usual(node, ctx));
  return value === undefined ? usual(node, ctx) : [{ tag: CUSTOM, attrs: {}, children: [], value }];
}

function usual(node: Node, ctx: Context): Drawn[] {
  const inside = () => ("children" in node ? drawAll(node.children, ctx) : []);
  switch (node.type) {
    case "root":
      return inside();
    case "heading":
      return [
        el(
          `h${Math.min(6, node.depth + Math.max(0, ctx.options.headingShift ?? 0))}`,
          { id: node.id },
          inside(),
        ),
      ];
    case "paragraph":
      return [el("p", {}, inside())];
    case "text":
      return [node.value];
    case "strong":
      return [el("strong", {}, inside())];
    case "emphasis":
      return [el("em", {}, inside())];
    case "delete":
      return [el("del", {}, inside())];
    case "inlineCode":
      return [el("code", {}, [node.value])];
    case "code":
      return [codeBlock(node.value, node.lang)];
    case "link": {
      const href = hrefOf(node.href, ctx);
      if (href === undefined) return inside();
      const attrs: El["attrs"] = { href };
      if (node.title) attrs.title = node.title;
      if (isExternal(href)) attrs.rel = "noopener noreferrer";
      return [el("a", attrs, inside())];
    }
    case "image": {
      const src = srcOf(node.src, ctx);
      if (src === undefined) return [node.alt];
      const attrs: El["attrs"] = { src, alt: node.alt };
      if (node.title) attrs.title = node.title;
      attrs.loading = "lazy";
      return [el("img", attrs)];
    }
    case "list": {
      const attrs: El["attrs"] = {};
      if (node.children.some((item) => item.checked !== undefined)) attrs.class = "vd-tasks";
      if (node.ordered && node.start !== undefined) attrs.start = String(node.start);
      return [el(node.ordered ? "ol" : "ul", attrs, inside())];
    }
    case "listItem": {
      if (node.checked === undefined) return [el("li", {}, inside())];
      const box: El["attrs"] = { type: "checkbox", disabled: true };
      if (node.checked) box.checked = true;
      return [el("li", { class: "vd-task" }, [el("input", box), " ", ...inside()])];
    }
    case "blockquote":
      return [el("blockquote", {}, inside())];
    case "rule":
      return [el("hr")];
    case "table": {
      const cells = (row: (typeof node.children)[number]) =>
        row.children.map((cell, index) => {
          const align = node.align[index];
          return el(
            row.header ? "th" : "td",
            // A class, not a style: a page is served under a policy that takes no inline styles.
            align ? { class: `vd-align-${align}` } : {},
            drawAll(cell.children, ctx),
          );
        });
      const head = node.children.filter((row) => row.header);
      const body = node.children.filter((row) => !row.header);
      const parts: Drawn[] = [];
      if (head.length > 0) {
        parts.push(
          el(
            "thead",
            {},
            head.map((row) => el("tr", {}, cells(row))),
          ),
        );
      }
      if (body.length > 0) {
        parts.push(
          el(
            "tbody",
            {},
            body.map((row) => el("tr", {}, cells(row))),
          ),
        );
      }
      return [el("div", { class: "vd-table" }, [el("table", {}, parts)])];
    }
    case "tableRow":
    case "tableCell":
      return inside();
    case "break":
      return node.hard ? [el("br")] : ["\n"];
    case "component":
      return component(node, ctx);
  }
}

export function codeBlock(value: string, lang: string | undefined): El {
  const safe = lang && /^[A-Za-z0-9_+#-]+$/.test(lang) ? lang : undefined;
  return el("pre", safe ? { "data-lang": safe } : {}, [
    el("code", safe ? { class: `language-${safe}` } : {}, [value]),
  ]);
}

/** The tabs of a `tabs` or a `code-tabs`: what each is called and what it holds. */
export function tabsOf(node: Component): { label: string; node: Node }[] {
  if (node.name === "code-tabs") {
    return node.children
      .filter((child) => child.type === "code")
      .map((child) => ({
        label: (child.type === "code" && (titleOf(child.meta) ?? child.lang)) || "Code",
        node: child,
      }));
  }
  return node.children
    .filter((child): child is Component => child.type === "component" && child.name === "tab")
    .map((child) => ({ label: child.props.label ?? "", node: child }));
}

function titleOf(meta: string | undefined): string | undefined {
  const found = meta ? /title=(?:"([^"]*)"|(\S+))/.exec(meta) : null;
  return found ? (found[1] ?? found[2]) : undefined;
}

/** The lines a tab came from, for an editor's preview, when it asks. */
function linesOf(node: Node, ctx: Context): Record<string, string> {
  if (!ctx.options.lines || node.line === undefined) return {};
  return {
    "data-line": String(node.line),
    ...(node.type === "component" && node.endLine !== undefined
      ? { "data-end-line": String(node.endLine) }
      : {}),
  };
}

function tabs(node: Component, ctx: Context): Drawn[] {
  const sections = tabsOf(node).map(({ label, node: child }) =>
    el("section", { class: "vd-tab", ...linesOf(child, ctx) }, [
      el("h4", { class: "vd-tab-label" }, [label]),
      el(
        "div",
        { class: "vd-tab-body" },
        child.type === "component" ? drawAll(child.children, ctx) : draw(child, ctx),
      ),
    ]),
  );
  return [el("div", { class: "vd-tabs", "data-vd-tabs": "1" }, sections)];
}

function component(node: Component, ctx: Context): Drawn[] {
  const inside = () => drawAll(node.children, ctx);
  // A component that may not be here is not drawn. What it held is, so that
  // nothing an author wrote is lost to a reader.
  if (!allowed(node, ctx)) return inside();
  switch (node.name) {
    case "alert": {
      const type = ["info", "success", "warning", "danger"].includes(node.props.type ?? "")
        ? (node.props.type as string)
        : "info";
      const title = node.label ? [el("p", { class: "vd-alert-title" }, [node.label])] : [];
      return [
        el("div", { class: `vd-alert vd-alert-${type}`, role: "note" }, [...title, ...inside()]),
      ];
    }
    case "term": {
      const info = ctx.options.term?.(node.props);
      const href = info?.href ? hrefOf(info.href, { ...ctx, profile: "docs" }, true) : undefined;
      // Nothing to say, or only an address that may not be followed: the word alone.
      if (!info || (!info.short && !href)) return inside();
      const id = `${ctx.options.idPrefix ?? "vd"}-term-${++ctx.ids}`;
      const tip: Drawn[] = [];
      if (info.short) tip.push(info.short);
      if (href) {
        if (info.short) tip.push(" ");
        tip.push(
          el("a", { href }, [
            (ctx.options.learnMore ?? "More about {word}").replace("{word}", plain(node)),
          ]),
        );
      }
      return [
        el("span", { class: "vd-term" }, [
          el("button", { type: "button", class: "vd-term-word", "aria-describedby": id }, inside()),
          el("span", { class: "vd-term-tip", role: "tooltip", id }, tip),
        ]),
      ];
    }
    case "field": {
      const path = node.props.path ?? "";
      const info = ctx.options.field?.(path);
      const name = path.split(".").at(-1) ?? path;
      if (!info?.description) return [el("p", { class: "vd-field" }, [el("code", {}, [path])])];
      return [
        el("p", { class: "vd-field" }, [
          el("code", { title: path }, [info.title ?? name]),
          " ",
          info.description,
        ]),
      ];
    }
    case "steps":
      return [el("div", { class: "vd-steps" }, inside())];
    case "tabs":
    case "code-tabs":
      return tabs(node, ctx);
    case "tab":
      // Drawn by the tabs that hold it. One on its own is its contents.
      return inside();
    case "details":
      return [
        el("details", { class: "vd-details" }, [
          el("summary", {}, [node.props.summary ?? ""]),
          el("div", { class: "vd-details-body" }, inside()),
        ]),
      ];
    case "kbd":
      return [el("kbd", {}, [plain(node)])];
    case "product":
      return [ctx.options.productName ?? "Volvel"];
    case "screenshot": {
      const src = ctx.options.screenshot?.(node.props.name ?? "");
      const alt = node.props.alt ?? "";
      if (!src || imageKind(src) === "refused") {
        return [el("p", { class: "vd-screenshot-missing" }, [alt])];
      }
      return [el("figure", { class: "vd-screenshot" }, [el("img", { src, alt, loading: "lazy" })])];
    }
    case "file-tree":
      return [el("div", { class: "vd-file-tree" }, inside())];
    case "pages": {
      const items = ctx.options.folder?.() ?? [];
      if (items.length === 0) return [];
      return [
        el(
          "ul",
          { class: "vd-pages" },
          items.map((item) => {
            const href = hrefOf(item.href, { ...ctx, profile: "docs" }, true);
            const words: Drawn[] = [
              el("span", { class: "vd-pages-title" }, [item.title]),
              ...(item.description
                ? [el("span", { class: "vd-pages-text" }, [item.description])]
                : []),
            ];
            return el("li", item.folder ? { class: "vd-pages-folder" } : {}, [
              href ? el("a", { href }, words) : el("span", {}, words),
            ]);
          }),
        ),
      ];
    }
    default:
      return inside();
  }
}
