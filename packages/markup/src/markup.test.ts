import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { LANGUAGE_NAMES, resolveLanguage } from "./highlight.js";
import {
  COMPONENTS,
  containersAt,
  DOC_CSS,
  DOC_DARK_CSS,
  ENHANCE_SCRIPT,
  highlightCode,
  linkKind,
  type Node,
  PROFILES,
  type ProfileName,
  parse,
  type RenderOptions,
  readProps,
  renderHtml,
  renderText,
  slug,
  validate,
  walk,
} from "./index.js";
import { renderReact } from "./react.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

/** What the fixtures are drawn with: a product name, two terms, one field and one screenshot. */
const OPTIONS: RenderOptions = {
  profile: "product",
  productName: "Volvel",
  term: (props) => {
    if (props.id === "workspace") {
      return { short: "A place where a tenant's resources live.", href: "../concepts/workspaces" };
    }
    if (props.id === "rma") return { short: "A return authorisation." };
    if (props.table === "sales/orders") return { short: "Where the order is in its life." };
    return null;
  },
  field: (path) =>
    path === "table.columns.*.type" ? { description: "What the column holds." } : null,
  screenshot: (name) => (name === "console/deploy" ? "/assets/console/deploy.png" : null),
  link: (href) => (href.startsWith("../guides/") ? `/docs${href.slice(2)}` : undefined),
};

function golden(name: string, made: string): void {
  const file = join(FIXTURES, name);
  if (UPDATE || !existsSync(file)) {
    if (!UPDATE && process.env.CI) throw new Error(`${name} is missing. Run with UPDATE_GOLDEN=1.`);
    writeFileSync(file, made);
    return;
  }
  expect(
    made,
    `${name} is not what the renderer makes now. Run with UPDATE_GOLDEN=1 if that is meant.`,
  ).toBe(readFileSync(file, "utf8"));
}

const pages = readdirSync(FIXTURES)
  .filter((file) => file.endsWith(".md"))
  .map((file) => file.slice(0, -3));

describe.each(pages)("the fixture %s", (page) => {
  const source = readFileSync(join(FIXTURES, `${page}.md`), "utf8");
  const tree = parse(source);

  test("reads into the tree on file", () => {
    golden(`${page}.tree.json`, `${JSON.stringify(tree, null, 2)}\n`);
  });

  test("is drawn as the HTML on file", () => {
    golden(`${page}.html`, `${renderHtml(tree, OPTIONS).replace(/></g, ">\n<")}\n`);
  });

  test("is drawn as the text on file", () => {
    golden(`${page}.txt`, `${renderText(tree, OPTIONS)}\n`);
  });

  test("is the same from React as from HTML", () => {
    expect(renderToStaticMarkup(renderReact(tree, OPTIONS))).toBe(renderHtml(tree, OPTIONS));
  });

  test("survives being stored and read back", () => {
    const stored = JSON.parse(JSON.stringify(tree));
    expect(stored).toEqual(tree);
    expect(renderHtml(stored, OPTIONS)).toBe(renderHtml(tree, OPTIONS));
  });
});

describe("reading", () => {
  test("a line is the line of the file, with what came before it counted", () => {
    const tree = parse("one\n\n## two\n\n:::alert\nthree\n:::\n", { lineOffset: 4 });
    expect(tree.children.map((node) => node.line)).toEqual([5, 7, 9]);
  });

  test("a word after a line break in a paragraph knows its own line", () => {
    const tree = parse("first\nsecond :term[x]{id=x}\n");
    const term = [...walk(tree)].find(({ node }) => node.type === "component");
    expect(term?.node.line).toBe(2);
  });

  test("two headings with the same words get two addresses", () => {
    const tree = parse("## Set up\n\n## Set up\n\n## Set up\n");
    expect(tree.children.map((node) => (node.type === "heading" ? node.id : ""))).toEqual([
      "set-up",
      "set-up-1",
      "set-up-2",
    ]);
  });

  test("a heading's address keeps letters of any script and drops marks", () => {
    expect(slug("  Orders & Returns: the “basics”  ")).toBe("orders-returns-the-basics");
    expect(slug("Übersicht für Aufträge")).toBe("übersicht-für-aufträge");
  });

  test("a colon in a time, an address or a ratio is not a component", () => {
    const tree = parse("At 12:30[sharp] see https://a.example/b[c] and a::b[c].");
    expect([...walk(tree)].some(({ node }) => node.type === "component")).toBe(false);
  });

  test("a container with no closing line runs to the end and says so", () => {
    const tree = parse(":::alert\nnever closed\n\nstill inside\n");
    expect(tree.children).toHaveLength(1);
    expect(validate(tree, "docs").map((issue) => issue.code)).toEqual(["component_unclosed"]);
  });

  test("containers of the same number of colons close innermost first", () => {
    const tree = parse(":::details{summary=a}\n:::alert\ninner\n:::\nouter\n:::\nafter\n");
    expect(tree.children.map((node) => node.type)).toEqual(["component", "paragraph"]);
    const [details] = tree.children;
    expect(details?.type === "component" && details.children.map((node) => node.type)).toEqual([
      "component",
      "paragraph",
    ]);
  });

  test("braces are read as names and values, quoted or not", () => {
    expect(readProps(`{a=1 b="two words" c='x' flag}`, 0)?.props).toEqual({
      a: "1",
      b: "two words",
      c: "x",
      flag: "true",
    });
    expect(readProps("{a=}", 0)?.bad).toBe(true);
    expect(readProps("{a=1", 0)).toBeUndefined();
  });

  test("HTML in the source is words, never markup", () => {
    const html = renderHtml(parse("<b>x</b> <script>alert(1)</script>\n\n<div>block</div>\n"));
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<div>");
    expect(html).toContain("&lt;script&gt;");
  });
});

test("a page written to do harm draws no tag of its own, no handler and no address but http", () => {
  const source = readFileSync(join(FIXTURES, "hostile.md"), "utf8");
  for (const profile of ["product", "docs", "description", "short", "result", "page"] as const) {
    const html = renderHtml(parse(source), { ...OPTIONS, profile });
    const tags = [...html.matchAll(/<([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*\/?>/g)];
    // Every "<" in the output opens or closes one of these, or it is not a tag at all.
    expect(html.match(/<(?!\/)/g)?.length ?? 0).toBe(tags.length);
    for (const [, tag, attrs = ""] of tags) {
      expect(["h1", "p", "a", "div", "figure", "button", "img", "pre", "code"]).toContain(tag);
      expect(attrs).not.toMatch(/\son[a-z]+=/);
      for (const [, , value = ""] of attrs.matchAll(/\s(href|src)="([^"]*)"/g)) {
        expect(value).toMatch(/^(https:\/\/example\.com\/|\/assets\/)/);
      }
    }
  }
});

describe("links", () => {
  test.each([
    ["https://example.com", "http"],
    ["HTTP://example.com", "http"],
    ["mailto:a@example.com", "mailto"],
    ["../guides/refunds#partial", "relative"],
    ["#partial", "relative"],
    ["refunds", "relative"],
    ["javascript:alert(1)", "refused"],
    ["JaVaScRiPt:alert(1)", "refused"],
    ["java\tscript:alert(1)", "refused"],
    [" javascript:alert(1)", "refused"],
    ["\u0001javascript:alert(1)", "refused"],
    ["data:text/html,x", "refused"],
    ["vbscript:x", "refused"],
    ["file:///etc/passwd", "refused"],
    ["//evil.example/x", "refused"],
    ["\\\\evil.example\\x", "refused"],
    ["", "refused"],
  ])("%j is %s", (href, kind) => {
    expect(linkKind(href)).toBe(kind);
  });

  test("a refused link is drawn as its words and reported to its author", () => {
    const tree = parse("[click](javascript:alert(1)) and [ok](https://example.com)\n");
    const html = renderHtml(tree);
    expect(html).toBe(
      '<p>click and <a href="https://example.com" rel="noopener noreferrer">ok</a></p>',
    );
    const [issue] = validate(tree, "docs", { source: "[click](javascript:alert(1)) and x" });
    expect(issue).toMatchObject({ code: "link_refused", line: 1, column: 9 });
  });

  test("a resolver cannot put a refused address on the page", () => {
    const html = renderHtml(parse("[a](b)\n"), { link: () => "javascript:alert(1)" });
    expect(html).toBe("<p>a</p>");
  });

  test("a link a reader may not follow is its words alone", () => {
    expect(renderHtml(parse("[secret page](hidden)\n"), { link: () => null })).toBe(
      "<p>secret page</p>",
    );
  });

  test("a link to a topic is drawn only once something says where the topic is", () => {
    const tree = parse("[refunds](topic:support-refunds#partial)\n");
    expect(validate(tree, "docs")).toEqual([]);
    expect(renderHtml(tree)).toBe("<p>refunds</p>");
    expect(
      renderHtml(tree, {
        link: (href) => (href.startsWith("topic:") ? "/support/refunds#partial" : undefined),
      }),
    ).toBe('<p><a href="/support/refunds#partial">refunds</a></p>');
  });

  test("where a term's page is, is taken as given and not resolved a second time", () => {
    const html = renderHtml(parse(":term[RMA]{id=rma} and [a page](other)\n"), {
      term: () => ({ short: "A return.", href: "/docs/glossary" }),
      link: (href) => (href === "other" ? "/docs/other" : null),
    });
    expect(html).toContain('<a href="/docs/glossary">More about RMA</a>');
    expect(html).toContain('<a href="/docs/other">a page</a>');
    // It is still held to what a link may be.
    expect(
      renderHtml(parse(":term[RMA]{id=rma}\n"), { term: () => ({ href: "javascript:alert(1)" }) }),
    ).toBe("<p>RMA</p>");
  });

  test("a result may link out and nowhere else", () => {
    const tree = parse("[a](https://example.com) [b](other)\n");
    expect(renderHtml(tree, { profile: "result" })).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer">a</a> b</p>',
    );
    expect(validate(tree, "result").map((issue) => issue.code)).toEqual(["link_refused"]);
  });
});

describe("pictures", () => {
  test("a tenant's page takes a file beside it or an https address", () => {
    const tree = parse(
      "![a](./a.png) ![b](https://example.com/b.png) ![c](http://example.com/c.png)\n",
    );
    expect(validate(tree, "docs").map((issue) => issue.code)).toEqual(["image_refused"]);
    expect(renderHtml(tree)).toBe(
      '<p><button type="button" class="vd-zoom" data-vd-zoom="" aria-haspopup="dialog"><img src="./a.png" alt="a" loading="lazy"/></button> <button type="button" class="vd-zoom" data-vd-zoom="" aria-haspopup="dialog"><img src="https://example.com/b.png" alt="b" loading="lazy"/></button> c</p>',
    );
  });

  test("the product's pages take only files, so that they show offline", () => {
    const tree = parse("![b](https://example.com/b.png)\n");
    expect(validate(tree, "product")[0]?.message).toContain("offline");
    expect(renderHtml(tree, { profile: "product" })).toBe("<p>b</p>");
  });
});

describe("components", () => {
  const codes = (source: string, profile: ProfileName = "docs") =>
    validate(parse(source), profile, { source }).map((issue) => issue.code);

  test("every component of the contract is checked and drawn", () => {
    expect(COMPONENTS.map((one) => one.name)).toEqual([
      "alert",
      "term",
      "field",
      "steps",
      "tabs",
      "tab",
      "details",
      "kbd",
      "product",
      "screenshot",
      "code-tabs",
      "file-tree",
      "glossary",
      "changelog",
      "pages",
    ]);
    const source = readFileSync(join(FIXTURES, "components.md"), "utf8");
    expect(validate(parse(source), "product", { source })).toEqual([]);
  });

  test("an unknown one is named, with the ones there are", () => {
    const [issue] = validate(parse("text\n\n::nope\n"), "docs", { source: "text\n\n::nope\n" });
    expect(issue).toMatchObject({ code: "unknown_component", line: 3, column: 1 });
    expect(issue?.message).toContain("alert, term");
  });

  test.each([
    [":::alert{type=loud}\nx\n:::\n", "component_props"],
    [":::alert{colour=red}\nx\n:::\n", "component_props"],
    [":::alert{type=}\nx\n:::\n", "component_props"],
    ["::field\n", "component_props"],
    ["::field{path=nodots}\n", "component_props"],
    [":term[x]\n", "component_props"],
    [":term[x]{id=a table=b/c}\n", "component_props"],
    [":term[x]{table=a script=b}\n", "component_props"],
    [":term[x]{column=status}\n", "component_props"],
    [":term[x]{id=Not_An_Id!}\n", "component_props"],
    [":::details\nx\n:::\n", "component_props"],
    [":::tab{label=a}\nx\n:::\n", "component_place"],
    [":::tabs\nwords\n:::\n", "component_place"],
    [":::code-tabs\nwords\n:::\n", "component_place"],
    [":::steps\nwords\n:::\n", "component_place"],
    ["::alert\n", "component_form"],
    [":alert[x]\n", "component_form"],
    [":::kbd\nx\n:::\n", "component_form"],
    [":::tabs[label]\n::::tab{label=a}\nx\n::::\n:::\n", "component_props"],
  ])("%j is refused as %s", (source, code) => {
    expect(codes(source)).toContain(code);
  });

  test("a term is a glossary entry or one resource", () => {
    expect(
      codes(":term[a]{id=a} :term[b]{table=x/y} :term[c]{table=x/y column=z} :term[d]{flow=f}\n"),
    ).toEqual([]);
  });

  test("the product's own components are refused in a tenant's page, and what they hold is still drawn", () => {
    const source = ":product[] is here.\n\n::screenshot{name=a alt=b}\n";
    expect(codes(source)).toEqual(["component_not_allowed", "component_not_allowed"]);
    expect(codes(source, "product")).toEqual([]);
    // What it held is drawn, and a component on a line of its own that cannot be shown says so.
    expect(renderHtml(parse(source))).toBe(
      '<p> is here.</p><p class="vd-unavailable">“screenshot” is not something this text can show.</p>',
    );
  });

  test("a term nobody can explain to this reader is its word alone", () => {
    const tree = parse("The :term[status]{table=secret/orders column=status} column.\n");
    expect(renderHtml(tree, { term: () => null })).toBe("<p>The status column.</p>");
    expect(renderHtml(tree)).toBe("<p>The status column.</p>");
  });

  test("an override draws a node its own way, and can ask for the usual", () => {
    const tree = parse("# Title\n\n:::alert\n`code`\n:::\n");
    const html = renderHtml(tree, {
      override: (node, usual) => {
        if (node.type === "inlineCode") return `<span class="mine">${node.value}</span>`;
        if (node.type === "heading") return `<header>${usual()}</header>`;
        return undefined;
      },
    });
    expect(html).toBe(
      '<header><h1 id="title">Title</h1></header><div class="vd-alert vd-alert-info" role="note"><p><span class="mine">code</span></p></div>',
    );
  });

  test("React components are given what each needs", () => {
    const tree = parse(
      ":::alert[Mind]{type=danger}\nSee :term[x]{id=workspace} and [here](https://example.com).\n:::\n\n:::tabs\n::::tab{label=One}\n1\n::::\n::::tab{label=Two}\n2\n::::\n:::\n",
    );
    const html = renderToStaticMarkup(
      renderReact(tree, {
        ...OPTIONS,
        components: {
          alert: ({ type, title, children }) => [`[alert ${type} ${title}]`, children],
          term: ({ info, children }) => ["{", children, `|${info?.short}}`],
          link: ({ href, external }) => `<${href} ${external}>`,
          tabs: ({ tabs }) => tabs.map((tab) => `(${tab.label})`).join(""),
        },
      }),
    );
    expect(html).toBe(
      "[alert danger Mind]<p>See {x|A place where a tenant&#x27;s resources live.} and &lt;https://example.com true&gt;.</p>(One)(Two)",
    );
  });
});

test("headings can be pushed down to sit under a page's own, and never past the sixth level", () => {
  const tree = parse("# One\n\n##### Five\n");
  expect(renderHtml(tree, { headingShift: 2 })).toBe(
    '<h3 id="one">One</h3><h6 id="five">Five</h6>',
  );
});

test("the highest heading a page uses is drawn at the level asked, the next one below it, none skipped", () => {
  const top = (text: string, headingTop = 2) => renderHtml(parse(text), { headingTop });
  expect(top("## A\n\n### B\n")).toBe('<h2 id="a">A</h2><h3 id="b">B</h3>');
  expect(top("# A\n\n## B\n")).toBe('<h2 id="a">A</h2><h3 id="b">B</h3>');
  // The generated reference starts at the fourth level and is drawn from the second.
  expect(top("#### A\n\n##### B\n")).toBe('<h2 id="a">A</h2><h3 id="b">B</h3>');
  expect(top("### A\n\n##### B\n")).toBe('<h2 id="a">A</h2><h4 id="b">B</h4>');
  expect(top("## A\n", 3)).toBe('<h3 id="a">A</h3>');
});

test("the stylesheet styles only what is inside a page of documentation", () => {
  const selectors = DOC_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{[^{}]*\}/g, "{}")
    .split("{}")
    .flatMap((rule) => rule.split(","))
    // What follows a nested block (an @media or @starting-style) starts with its closing brace.
    .map((selector) => selector.trim().replace(/^(\}\s*)+/, ""))
    .filter((selector) => selector !== "" && !selector.startsWith("@") && selector !== "}");
  expect(selectors.length).toBeGreaterThan(30);
  for (const selector of selectors) expect(selector.replace(/^\}\s*/, "")).toMatch(/^\.vd-doc\b/);
  expect(DOC_CSS).not.toMatch(/url\(|@import|expression\(/);
});

describe("profiles", () => {
  test("a description takes small headings, lists, terms and alerts, and no pictures or tables", () => {
    const fine =
      "### Small\n\nText with :term[a]{id=a} and a [link](https://example.com).\n\n- one\n\n:::alert\nMind.\n:::\n";
    expect(validate(parse(fine), "description")).toEqual([]);
    const not = "## Big\n\n![a](a.png)\n\n| a |\n|---|\n| 1 |\n\n:::tabs\n:::\n";
    expect(validate(parse(not), "description").map((issue) => issue.code)).toEqual([
      "heading_too_shallow",
      "markdown_not_allowed",
      "markdown_not_allowed",
      "component_not_allowed",
    ]);
  });

  test("the short text behind a term is plain words, 500 at most", () => {
    expect(validate(parse("A return authorisation, issued before a refund.\n"), "short")).toEqual(
      [],
    );
    expect(
      validate(parse("With **bold** and a [link](x).\n"), "short").map((issue) => issue.code),
    ).toEqual(["markdown_not_allowed", "markdown_not_allowed"]);
    expect(validate(parse(`${"word ".repeat(120)}\n`), "short").map((issue) => issue.code)).toEqual(
      ["too_long"],
    );
  });

  test("a result takes Markdown and no components", () => {
    const tree = parse("# Done\n\n| a |\n|---|\n| 1 |\n\n:::alert\nx\n:::\n");
    expect(validate(tree, "result").map((issue) => issue.code)).toEqual(["markdown_not_allowed"]);
    expect(renderHtml(tree, { profile: "result" })).not.toContain("vd-alert");
  });

  test("a page's text takes small headings, Markdown and the documentation's components", () => {
    const source = [
      "## Heading",
      "",
      "Some *text*, `code`, :kbd[Esc] and :term[a]{id=a} with [a link](https://example.com) and [mail](mailto:a@example.com).",
      "",
      "- one",
      "",
      "> quoted",
      "",
      ":::alert[Mind]{type=warning}",
      "Careful.",
      ":::",
      "",
      ":::steps",
      "1. First",
      "2. Second",
      ":::",
      "",
      ":::tabs",
      "::::tab{label=One}",
      "In one.",
      "::::",
      "::::tab{label=Two}",
      "In two.",
      "::::",
      ":::",
      "",
      ':::details{summary="More"}',
      "Hidden.",
      ":::",
      "",
      "::field{path=table.columns.*.type}",
      "",
    ].join("\n");
    const tree = parse(source);
    expect(validate(tree, "page", { source })).toEqual([]);
    const html = renderHtml(tree, { profile: "page", term: () => ({ short: "A." }) });
    for (const part of ["<h2", "<em>", "<code>", "<kbd", "<blockquote", "<ul", "<a ", "vd-alert"]) {
      expect(html).toContain(part);
    }
    for (const word of ["Careful.", "First", "In one.", "In two.", "Hidden."]) {
      expect(html).toContain(word);
    }
  });

  test("a page's text refuses a big heading, the product's own components, tables and HTML", () => {
    const codes = (source: string) =>
      validate(parse(source), "page", { source }).map((issue) => issue.code);
    expect(codes("# Big\n")).toEqual(["heading_too_shallow"]);
    expect(codes("##### Deep\n")).toEqual(["heading_too_deep"]);
    expect(codes("Called :product[].\n")).toEqual(["component_not_allowed"]);
    expect(codes('::screenshot{name=a/b alt="x"}\n')).toEqual(["component_not_allowed"]);
    expect(codes("::glossary\n")).toEqual(["component_not_allowed"]);
    expect(codes("| a |\n|---|\n| 1 |\n")).toEqual(["markdown_not_allowed"]);
    expect(codes("[x](javascript:alert(1))\n")).toEqual(["link_refused"]);
    const html = renderHtml(parse('<script>alert(1)</script>\n\n<img src=x onerror="y">\n'), {
      profile: "page",
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    const product = renderHtml(parse("Called :product[].\n"), {
      profile: "page",
      productName: "Volvel",
    });
    expect(product).not.toContain("Volvel");
  });

  test("every profile is described", () => {
    for (const profile of Object.values(PROFILES)) expect(profile.description).not.toBe("");
  });
});

test("the page's script holds no HTML writing and reads nothing from the address", () => {
  for (const word of [
    "innerHTML",
    "outerHTML",
    "insertAdjacentHTML",
    "document.write",
    "eval(",
    "location",
    "localStorage",
    "fetch(",
  ]) {
    expect(ENHANCE_SCRIPT).not.toContain(word);
  }
  expect(() => new Function(ENHANCE_SCRIPT)).not.toThrow();
});

describe("components inside components", () => {
  const source = readFileSync(join(FIXTURES, "nesting.md"), "utf8");
  const tree = parse(source);

  test("every one may sit inside every other, as deep as it is written", () => {
    expect(validate(tree, "docs")).toEqual([]);
    const names = (node: Node): string[] =>
      [...walk(node)].flatMap(({ node: one }) => (one.type === "component" ? [one.name] : []));
    expect(names(tree)).toEqual([
      "tabs",
      "tab",
      "steps",
      "tab",
      "alert",
      "code-tabs",
      "details",
      "tabs",
      "tab",
      "file-tree",
      "tab",
      "tabs",
      "tab",
      "steps",
      "details",
      "kbd",
      "term",
      "alert",
      "details",
      "steps",
    ]);
  });

  test("React draws what HTML draws, however deep", () => {
    const html = renderHtml(tree, { profile: "docs" });
    const react = renderToStaticMarkup(renderReact(tree, { profile: "docs" }) as ReactElement);
    expect(react).toBe(html);
  });

  test("a line knows the containers it is in, outermost first", () => {
    const lines = source.split("\n");
    const at = (words: string) => lines.findIndex((line) => line.includes(words)) + 1;
    const chain = (line: number) =>
      containersAt(tree, line).map((one) =>
        one.props.label ? `${one.name} ${one.props.label}` : one.name,
      );
    expect(chain(at("File it with"))).toEqual(["tabs", "tab Cash", "alert"]);
    expect(chain(at("Tabs inside tabs."))).toEqual([
      "details",
      "tabs",
      "tab Two",
      "tabs",
      "tab Inner",
    ]);
    expect(chain(at("Inside a step"))).toEqual(["steps", "details"]);
    expect(chain(at("# Every component"))).toEqual([]);
  });
});

describe("what is in a folder", () => {
  test("::pages lists what the page's host says the folder holds", () => {
    const tree = parse("::pages\n");
    const folder = () => [
      { title: "Refunds", description: "Full and partial.", href: "refunds" },
      { title: "Disputes", href: "disputes", folder: true },
    ];
    expect(renderHtml(tree, { profile: "docs", folder })).toBe(
      '<ul class="vd-pages"><li><a href="refunds"><span class="vd-pages-title">Refunds</span><span class="vd-pages-text">Full and partial.</span></a></li><li class="vd-pages-folder"><a href="disputes"><span class="vd-pages-title">Disputes</span></a></li></ul>',
    );
    expect(renderText(tree, { profile: "docs", folder })).toBe("- Refunds\n- Disputes");
    // Nothing to list draws nothing.
    expect(renderHtml(tree, { profile: "docs" })).toBe("");
  });

  test("a description's backticks are drawn as code, and what is between them stays text", () => {
    const folder = () => [
      { title: "SDK", description: "Everything `@volvel/<x>` exports.", href: "sdk" },
    ];
    expect(renderHtml(parse("::pages\n"), { profile: "docs", folder })).toContain(
      '<span class="vd-pages-text">Everything <code>@volvel/&lt;x&gt;</code> exports.</span>',
    );
  });
});

test("an editor's preview is told which lines each block came from", () => {
  const source = "# Title\n\nWords.\n\n:::tabs\n::::tab{label=Card}\nOne.\n::::\n:::\n";
  const html = renderHtml(parse(source), { profile: "docs", lines: true });
  expect(html).toContain('<h1 id="title" data-line="1">');
  expect(html).toContain('<p data-line="3">Words.</p>');
  expect(html).toContain('<div class="vd-tabs" data-vd-tabs="1" data-line="5" data-end-line="9">');
  expect(html).toContain('<section class="vd-tab" data-line="6" data-end-line="8">');
  // A served page says nothing of where its words were.
  expect(renderHtml(parse(source), { profile: "docs" })).not.toContain("data-line");
});

describe("a changelog", () => {
  const entry = (id: string, title: string, source: string, date?: string) => ({
    id,
    title,
    href: `/handbook/changelog/${id}`,
    ...(date ? { date } : {}),
    tree: parse(source),
  });
  const items = [
    entry(
      "2026-11-24-new-intake",
      "New intake",
      "Intake takes a photo.\n\n# Details\n\nMore.\n\n## Deeper\n",
      "2026-11-24",
    ),
    entry("old-2026-10-02", "Older", "Old words.\n", "2026-10-02"),
    entry("oldest", "Oldest", "Oldest.\n"),
  ];
  const seen: unknown[] = [];
  const changelog = (query: { folder?: string; subject?: string }) => {
    seen.push(query);
    return items;
  };

  test("::changelog draws each entry: its title linked, its date, its body with headings shifted down and ids prefixed", () => {
    const html = renderHtml(parse("::changelog{limit=2}\n"), {
      profile: "docs",
      changelog,
      headingShift: 1,
      idPrefix: "page",
    });
    expect(html).toContain(
      '<article class="vd-changelog-entry" id="page-changelog-2026-11-24-new-intake">',
    );
    // The entry's title sits under the page's own headings (h1 shifted to h2), and its body's under that.
    expect(html).toContain(
      '<h3 class="vd-changelog-title"><a href="/handbook/changelog/2026-11-24-new-intake">New intake</a></h3>',
    );
    expect(html).toContain(
      '<time class="vd-changelog-date" datetime="2026-11-24">24 November 2026</time>',
    );
    expect(html).toContain("Intake takes a photo.");
    expect(html).toMatch(
      /<h4 id="page-changelog-2026-11-24-new-intake-[a-z-]*details">Details<\/h4>/,
    );
    expect(html).toMatch(
      /<h5 id="page-changelog-2026-11-24-new-intake-[a-z-]*deeper">Deeper<\/h5>/,
    );
    // Written from ## as the template does, the first heading is still directly under the title.
    const second = renderHtml(parse("::changelog\n"), {
      profile: "docs",
      changelog: () => [entry("b", "B", "## What is new\n\n### Settings\n")],
    });
    expect(second).toContain(
      '<h2 class="vd-changelog-title"><a href="/handbook/changelog/b">B</a></h2>',
    );
    expect(second).toContain('<h3 id="vd-changelog-b-what-is-new">What is new</h3>');
    expect(second).toContain('<h4 id="vd-changelog-b-settings">Settings</h4>');
    // The next ones are a link, and not drawn.
    expect(html).toContain("Old words.");
    expect(html).not.toContain("Oldest.");
    expect(html).toContain(
      '<p class="vd-changelog-more"><a href="/handbook/changelog/oldest">1 older entry, from Oldest</a></p>',
    );
  });

  test("a limit of 10 is the default, and an entry without a date is drawn without one", () => {
    const html = renderHtml(parse("::changelog\n"), { profile: "docs", changelog });
    expect(html).toContain("Oldest.");
    expect(html).not.toContain("vd-changelog-more");
    expect(html.match(/<time /g)).toHaveLength(2);
    expect(html).toContain('<h2 class="vd-changelog-title">');
  });

  test("the folder and the subject are passed on to what draws the entries, and nothing draws nothing", () => {
    seen.length = 0;
    renderHtml(parse("::changelog{folder=handbook/changelog subject=intake}\n"), {
      profile: "docs",
      changelog,
    });
    expect(seen).toEqual([{ folder: "handbook/changelog", subject: "intake" }]);
    expect(renderHtml(parse("::changelog\n"), { profile: "docs" })).toBe("");
    expect(renderHtml(parse("::changelog\n"), { profile: "docs", changelog: () => [] })).toBe("");
  });

  test("an entry that has a changelog of its own is not drawn again inside itself", () => {
    const loop = [entry("a", "A", "Before.\n\n::changelog\n")];
    const html = renderHtml(parse("::changelog\n"), { profile: "docs", changelog: () => loop });
    expect(html.match(/vd-changelog-entry/g)).toHaveLength(1);
  });

  test("is for the docs and the product, and refuses what is not a number or a name", () => {
    const codes = (source: string, profile: ProfileName = "docs") =>
      validate(parse(source), profile, { source }).map((one) => one.code);
    expect(codes("::changelog{limit=5 folder=a/b subject=x}\n")).toEqual([]);
    expect(codes("::changelog\n", "product")).toEqual([]);
    expect(codes("::changelog\n", "description")).toEqual(["component_not_allowed"]);
    expect(codes("::changelog{limit=0}\n")).not.toEqual([]);
    expect(codes("::changelog{limit=51}\n")).not.toEqual([]);
    expect(codes("::changelog{limit=many}\n")).not.toEqual([]);
    expect(codes("::changelog{folder=A/B}\n")).not.toEqual([]);
  });

  test("as text it is the titles and days", () => {
    expect(renderText(parse("::changelog{limit=2}\n"), { profile: "docs", changelog })).toBe(
      "- New intake (2026-11-24)\n- Older (2026-10-02)",
    );
  });
});

describe("a glossary and a diagram", () => {
  test("::glossary lists the terms its host gives, from A to Z, grouped by letter", () => {
    const tree = parse("::glossary\n");
    const glossary = (scope: "collection" | "site") =>
      scope === "collection"
        ? [
            {
              id: "rma",
              term: "RMA",
              short: "A return authorisation.",
              href: "refunds",
              page: "Refunds",
            },
            { id: "courier", term: "courier", aliases: ["couriers"], short: "Carries the parcel." },
          ]
        : [];
    const html = renderHtml(tree, { profile: "docs", glossary });
    expect(html.indexOf("courier")).toBeLessThan(html.indexOf("RMA"));
    expect(html).toContain('<p class="vd-glossary-letter">C</p>');
    expect(html).toContain('<div class="vd-glossary-item" id="vd-glossary-rma"><dt>RMA</dt>');
    expect(html).toContain('<span class="vd-glossary-also">Also: couriers</span>');
    expect(html).toContain('<a class="vd-glossary-page" href="refunds">Defined on Refunds</a>');
    expect(renderText(tree, { profile: "docs", glossary })).toBe(
      "courier: Carries the parcel.\nRMA: A return authorisation.",
    );
    // The site's terms are asked for by name, and none draws nothing.
    expect(renderHtml(parse("::glossary{scope=site}\n"), { profile: "docs", glossary })).toBe("");
    expect(
      validate(parse("::glossary{scope=everywhere}\n"), "docs").map((one) => one.code),
    ).not.toEqual([]);
  });

  test("a mermaid block is its source until a script draws it", () => {
    const html = renderHtml(parse("```mermaid\ngraph TD\n  A --> B\n```\n"), { profile: "docs" });
    expect(html).toBe(
      '<figure class="vd-mermaid" data-vd-mermaid="1"><pre class="vd-mermaid-source"><code class="language-mermaid">graph TD\n  A --&gt; B</code></pre></figure>',
    );
  });
});

describe("the product's own pages", () => {
  test("may list a folder and a glossary", () => {
    const source = "::pages\n\n::glossary{scope=site}\n";
    expect(validate(parse(source), "product", { source })).toEqual([]);
    const html = renderHtml(parse(source), {
      profile: "product",
      folder: () => [{ title: "Errors", href: "errors", description: "What went wrong." }],
      glossary: () => [
        { id: "rma", term: "RMA", short: "A return.", href: "rma", page: "Returns" },
      ],
    });
    expect(html).toContain("Errors");
    expect(html).toContain("A return.");
  });

  test("show a picture that is a file beside the page, through the resolver that serves it", () => {
    const html = renderHtml(parse("![Tables](./tables.png)\n"), {
      profile: "product",
      image: (src) => `/docs/_assets/${src.replace("./", "")}`,
    });
    expect(html).toContain('src="/docs/_assets/tables.png"');
  });
});

describe("highlighted code", () => {
  const source = "```ts\nconst a = 'x'; // note\n```\n";

  test("is code as it was without a highlighter", () => {
    expect(renderHtml(parse(source))).toBe(
      '<pre data-lang="ts"><code class="language-ts">const a = \'x\'; // note</code></pre>'.replace(
        /'/g,
        "&#x27;",
      ),
    );
  });

  test("is drawn as the highlighter gives it, in classes and never in styles", () => {
    const html = renderHtml(parse(source), { highlight: highlightCode });
    expect(html).toContain('<span class="token keyword">const</span>');
    expect(html).toContain('<span class="token string">&#x27;x&#x27;</span>');
    expect(html).toContain('<span class="token comment">// note</span>');
    expect(html).toContain('class="language-ts"');
    expect(html).not.toContain("style=");
  });

  test("keeps every character of the code, and escapes it", () => {
    const code = 'if (a < b && c) { return "</code><script>"; }';
    const html = renderHtml(parse(`\`\`\`js\n${code}\n\`\`\`\n`), { highlight: highlightCode });
    expect(html).not.toContain("<script>");
    expect(
      html
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    ).toContain(code);
  });

  test("leaves a language it does not know, and a diagram, as they were", () => {
    const plain = renderHtml(parse("```cobol\nMOVE 1 TO A\n```\n"), { highlight: highlightCode });
    expect(plain).toBe(renderHtml(parse("```cobol\nMOVE 1 TO A\n```\n")));
    const diagram = "```mermaid\ngraph TD; A-->B\n```\n";
    expect(renderHtml(parse(diagram), { highlight: highlightCode })).toBe(
      renderHtml(parse(diagram)),
    );
  });

  test("is the same in HTML and in React", () => {
    const tree = parse(source);
    const html = renderHtml(tree, { highlight: highlightCode });
    const react = renderToStaticMarkup(
      renderReact(tree, { highlight: highlightCode }) as ReactElement,
    );
    expect(react).toContain('<span class="token keyword">const</span>');
    expect(react).toContain('<span class="token comment">// note</span>');
    expect(html).toContain('<span class="token comment">// note</span>');
  });

  test("covers the languages the documentation is written in", () => {
    const spans = (lang: string, code: string) =>
      renderHtml(parse(`\`\`\`${lang}\n${code}\n\`\`\`\n`), { highlight: highlightCode });
    expect(spans("yaml", "name: fern # x\nitems:\n  - 1")).toContain('token key atrule">name');
    expect(spans("json", '{"a": [1, true, null]}')).toContain('token number">1');
    expect(spans("sh", "pnpm add x # run\necho $HOME")).toContain('token comment"># run');
    expect(spans("tsx", "export const A = () => <b>1</b>;")).toContain('token keyword">export');
  });

  test("resolves aliases and draws a diff, marks and an unknown language as they are said", () => {
    const draw = (info: string, code: string) =>
      renderHtml(parse(`\`\`\`${info}\n${code}\n\`\`\`\n`), { highlight: highlightCode });
    expect(draw("js", "let a")).toContain('token keyword">let');
    expect(draw("html", "<b>x</b>")).toContain("token tag");
    expect(draw("shell", "echo $HOME")).toContain("token environment constant");
    expect(draw("jsonc", '{"a": 1}')).toContain('token number">1');
    expect(draw("zsh", "echo $HOME")).toContain("token environment constant");
    expect(draw("css", "a { color: red; }")).toContain("token property");
    expect(draw("tsx", "const a = <b>1</b>;")).toContain("token tag");
    expect(draw("md", "# T")).toContain("token title");
    expect(draw("text", "a < b")).toBe(
      '<pre data-lang="text"><code class="language-text">a &lt; b</code></pre>',
    );
    // diff-<lang>: lines marked as added and removed, the rest drawn in the language
    const diff = draw("diff-ts", "-let a = 1;\n+const a = 2;\n keep();");
    expect(diff).toContain('<span class="token deleted">-<span class="token keyword">let</span>');
    expect(diff).toContain(
      '<span class="token inserted">+<span class="token keyword">const</span>',
    );
    expect(draw("diff", "-a\n+b")).toContain("token deleted");
    // lang/1,3-5: those lines in a mark; a token across lines is closed and opened again
    const marked = draw("ts/1,3-4", "const a = `x\ny`;\nb();\nc();\nd();");
    expect(marked).toContain('<mark class="vd-line vd-line-mark">');
    expect(marked.match(/<mark /g)?.length).toBe(3);
    expect(marked.match(/<span/g)?.length).toBe(marked.match(/<\/span>/g)?.length);
    expect(marked).toContain('class="language-ts"');
    expect(draw("ts/", "a")).toContain("language-ts");
    // an unbalanced or odd mark spec is no mark, not a failure
    expect(draw("ts/x", "const a")).not.toContain("<mark");
    // unknown stays plain
    expect(draw("cobol/1", "MOVE 1")).not.toContain("token");
  });

  test("the alias table is what Prism's own component list says for the languages imported", async () => {
    const { createRequire } = await import("node:module");
    const components = createRequire(import.meta.url)("prismjs/components.json")
      .languages as Record<string, { alias?: string | string[] }>;
    for (const lang of LANGUAGE_NAMES) {
      for (const alias of [components[lang]?.alias ?? []].flat()) {
        expect(resolveLanguage(alias), alias).toBe(lang);
      }
    }
  });

  test("has a light and a dark style, classes only, for the page and the help to share", () => {
    expect(DOC_CSS).toMatch(/\.vd-doc \.token\.keyword/);
    expect(DOC_CSS).toMatch(/\.vd-doc \.token\.string/);
    expect(DOC_CSS).not.toContain("hljs");
    expect(DOC_DARK_CSS).toMatch(/--vd-tok-keyword/);
    expect(DOC_DARK_CSS).toContain('[data-theme="dark"]');
    expect(DOC_DARK_CSS).not.toMatch(/url\(|@import/);
  });
});

describe("a screenshot in both looks", () => {
  const source = "::screenshot{name=console/deploy alt=Deploy}\n";
  const draw = (more: Partial<RenderOptions>) => renderHtml(parse(source), { ...OPTIONS, ...more });

  test("is one picture unless a dark one is given", () => {
    expect(draw({})).toBe(
      '<figure class="vd-screenshot"><button type="button" class="vd-zoom" data-vd-zoom="" aria-haspopup="dialog"><img src="/assets/console/deploy.png" alt="Deploy" loading="lazy"/></button></figure>',
    );
  });

  test("is two, and the page's look shows one", () => {
    const html = draw({ screenshotDark: () => "/assets/console/deploy-dark.png" });
    expect(html).toContain('class="vd-shot-light" src="/assets/console/deploy.png" alt="Deploy"');
    expect(html).toContain('class="vd-shot-dark" src="/assets/console/deploy-dark.png" alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(DOC_CSS).toContain(".vd-shot-dark { display: none; }");
    expect(DOC_DARK_CSS).toContain(".vd-shot-dark { display: block; }");
    expect(DOC_DARK_CSS).toContain(".vd-shot-light:has(+ .vd-shot-dark) { display: none; }");
  });

  test("is one when there is no dark picture for it", () => {
    expect(draw({ screenshotDark: () => null })).toBe(draw({}));
  });
});

test("Prism's core is put on the global before any language loads, as a bundle needs", () => {
  // A bundler makes the core a lazy module while each language file runs at once and reads the global `Prism`
  // (the app runtime failed to start, phase 30's e2e run). prism-global reads the core, so it must come first.
  const order = readFileSync(new URL("./prism.ts", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.startsWith("import "));
  const core = order.findIndex((line) => line.includes("prism-core"));
  const global = order.findIndex((line) => line.includes("./prism-global.js"));
  const firstLanguage = order.findIndex((line) => line.includes("prismjs/components/prism-markup"));
  expect(core).toBeGreaterThanOrEqual(0);
  expect(global).toBeGreaterThan(core);
  expect(global).toBeLessThan(firstLanguage);
});

describe("a picture opens larger (p31-site 1)", () => {
  test("every picture in the text is a button that opens it, and a picture in a link is left to the link", () => {
    const html = renderHtml(parse("![a](./a.png) [![b](./b.png)](https://example.com)\n"));
    expect(html).toContain(
      '<button type="button" class="vd-zoom" data-vd-zoom="" aria-haspopup="dialog"><img src="./a.png" alt="a" loading="lazy"/></button>',
    );
    expect(html).toContain(
      '<a href="https://example.com" rel="noopener noreferrer"><img src="./b.png"',
    );
  });

  test("a screenshot is one button over both looks", () => {
    const html = renderHtml(parse("::screenshot{name=console/deploy alt=Deploy}\n"), {
      ...OPTIONS,
      screenshot: () => "/a.png",
      screenshotDark: () => "/b.png",
    });
    expect(html).toBe(
      '<figure class="vd-screenshot"><button type="button" class="vd-zoom" data-vd-zoom="" aria-haspopup="dialog"><img class="vd-shot-light" src="/a.png" alt="Deploy" loading="lazy"/><img class="vd-shot-dark" src="/b.png" alt="" aria-hidden="true" loading="lazy"/></button></figure>',
    );
  });

  test("the stylesheet draws the larger view, with motion only where it is allowed", () => {
    expect(DOC_CSS).toContain(".vd-lightbox");
    expect(DOC_CSS).toContain(".vd-lightbox::backdrop");
    expect(DOC_CSS).toMatch(/\.vd-zoom\s*\{[^}]*cursor: zoom-in/);
  });
});

describe("a table stacks on a narrow container (p31-site 3)", () => {
  const html = renderHtml(
    parse("| Name | Type |\n| :-- | --: |\n| id | text |\n| age | number |\n"),
  );

  test("each body cell carries its column's header as its label", () => {
    expect(html).toContain('<td class="vd-align-left" data-label="Name">id</td>');
    expect(html).toContain('<td class="vd-align-right" data-label="Type">number</td>');
    expect(html).not.toMatch(/<th[^>]*data-label/);
  });

  test("a table knows its columns, and one of two fits a phone unstacked", () => {
    expect(html).toContain('<div class="vd-table" data-cols="2">');
    expect(renderHtml(parse("| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |\n"))).toContain(
      'data-cols="3"',
    );
  });

  test("the larger view's backdrop hides the page behind it", () => {
    expect(DOC_CSS).toMatch(/\.vd-lightbox::backdrop \{ background: rgb\(0 0 0 \/ 0\.9\d*\)/);
  });

  test("a cell of several pieces is one value, so that a stacked row does not break it into columns", () => {
    const mixed = renderHtml(parse("| Name |\n| --- |\n| a `b` c |\n"));
    expect(mixed).toContain(
      '<td data-label="Name"><span class="vd-cell">a <code>b</code> c</span></td>',
    );
  });

  test("a container query stacks the rows as label and value pairs, and stripes them", () => {
    expect(DOC_CSS).toMatch(/\.vd-table\s*\{[^}]*container-type: inline-size/);
    expect(DOC_CSS).toMatch(/@container \(max-width: [\d.]+rem\)/);
    expect(DOC_CSS).toContain('.vd-table:not([data-cols="1"]):not([data-cols="2"])');
    expect(DOC_CSS).toContain("attr(data-label)");
    expect(DOC_CSS).toMatch(/tbody tr:nth-child\(even\)/);
  });
});

describe("inline code is its own look (p31-site 4)", () => {
  test("has its own background, text and border, which a block's does not use", () => {
    const rule = /\.vd-doc :not\(pre\) > code \{([^}]*)\}/.exec(DOC_CSS)?.[1] ?? "";
    expect(rule).toContain("var(--vd-code-bg");
    expect(rule).toContain("var(--vd-code-ink");
    expect(rule).toContain("var(--vd-code-line");
    expect(rule).not.toContain("--vd-sunken");
  });
});
