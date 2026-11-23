import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
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
      expect(["h1", "p", "a", "div", "figure", "img", "pre", "code"]).toContain(tag);
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
      '<p><img src="./a.png" alt="a" loading="lazy"/> <img src="https://example.com/b.png" alt="b" loading="lazy"/> c</p>',
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
    expect(html).toContain('<span class="hljs-keyword">const</span>');
    expect(html).toContain('<span class="hljs-string">&#x27;x&#x27;</span>');
    expect(html).toContain('<span class="hljs-comment">// note</span>');
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
    expect(react).toContain('<span class="hljs-keyword">const</span>');
    expect(react).toContain('<span class="hljs-comment">// note</span>');
    expect(html).toContain('<span class="hljs-comment">// note</span>');
  });

  test("covers the languages the documentation is written in", () => {
    const spans = (lang: string, code: string) =>
      renderHtml(parse(`\`\`\`${lang}\n${code}\n\`\`\`\n`), { highlight: highlightCode });
    expect(spans("yaml", "name: fern # x\nitems:\n  - 1")).toContain('hljs-attr">name');
    expect(spans("json", '{"a": [1, true, null]}')).toContain('hljs-number">1');
    expect(spans("sh", "pnpm add x # run\necho $HOME")).toContain('hljs-comment"># run');
    expect(spans("tsx", "export const A = () => <b>1</b>;")).toContain('hljs-keyword">export');
  });

  test("has a light and a dark style, classes only, for the page and the help to share", () => {
    expect(DOC_CSS).toMatch(/\.vd-doc \.hljs-keyword/);
    expect(DOC_CSS).toMatch(/\.vd-doc \.hljs-string/);
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
      '<figure class="vd-screenshot"><img src="/assets/console/deploy.png" alt="Deploy" loading="lazy"/></figure>',
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
