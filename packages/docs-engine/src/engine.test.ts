import { renderHtml } from "@volvel/markup";
import { describe, expect, test } from "vitest";
import {
  allTerms,
  attachedTo,
  type BuildOptions,
  buildDocSet,
  buildSearchIndex,
  check,
  checkPageAmong,
  clashes,
  type DocIssue,
  extensionsOf,
  FRONTMATTER_SCHEMA,
  findTerm,
  findTopic,
  frontmatterOf,
  loadSearchIndex,
  manifestOf,
  packageOutput,
  pagePath,
  pagesInOrder,
  readPage,
  resolveAsset,
  resolveLink,
  setFrontmatter,
  splitFrontmatter,
  trailOf,
} from "./index.js";

/** A page's file, from its frontmatter as written and its body. */
const page = (frontmatter: string, body = "Words.\n") => `---\n${frontmatter}\n---\n\n${body}`;

/** Reads files, by their names under the docs root, and builds a set from them. */
function build(files: Record<string, string>, options: BuildOptions = {}) {
  const issues: DocIssue[] = [];
  const entries = Object.entries(files).map(([file, text]) => {
    const named = pagePath(file);
    if ("problem" in named) throw new Error(named.problem);
    const read = readPage(named.path, text);
    issues.push(...read.issues);
    return read.entry;
  });
  const built = buildDocSet(entries, options);
  return { set: built.set, issues: [...issues, ...built.issues] };
}

const codes = (issues: DocIssue[]) => issues.map((issue) => issue.code);

describe("a page's file", () => {
  test("is parted into its frontmatter and its body, with the body's lines still the file's", () => {
    const text = "---\ntitle: Refunds\n---\n\nFirst.\n\n::nope\n";
    expect(splitFrontmatter(text)).toEqual({
      yaml: "title: Refunds",
      body: "\nFirst.\n\n::nope\n",
      offset: 3,
    });
    const { entry, issues } = readPage("refunds", text);
    expect(entry.frontmatter).toEqual({ title: "Refunds" });
    expect(issues).toMatchObject([
      { path: "refunds", line: 7, column: 1, code: "unknown_component" },
    ]);
  });

  test("the example in the architecture reads as written", () => {
    const { entry, issues } = readPage(
      "support/refund",
      page(
        [
          "title: Refund an order",
          "description: How support issues a full or partial refund.",
          "icon: receipt",
          "topic: support-refunds",
          "terms:",
          "  - id: rma",
          "    term: RMA",
          "    aliases: [return authorisation]",
          "    short: A return merchandise authorisation, issued before a refund.",
          "about:",
          "  - table: sales/orders",
          "  - flow: support/refund",
          "extends: [data-tables]",
        ].join("\n"),
        "An :term[RMA]{id=rma} comes first.\n",
      ),
    );
    expect(issues).toEqual([]);
    expect(entry.frontmatter).toMatchObject({
      title: "Refund an order",
      icon: "receipt",
      topic: "support-refunds",
      about: [{ table: "sales/orders" }, { flow: "support/refund" }],
      extends: ["data-tables"],
    });
  });

  test("a page with no frontmatter is told how to start, and still reads", () => {
    const { entry, issues } = readPage("guides/getting-started", "Just words.\n");
    expect(codes(issues)).toEqual(["frontmatter_missing"]);
    expect(entry.frontmatter.title).toBe("Getting started");
    expect(renderHtml(entry.tree)).toBe("<p>Just words.</p>");
  });

  test.each([
    ["description: no title", "It needs a title."],
    ["title: 12", "title is text."],
    ["title: A\norder: 1", 'There is no "order" here.'],
    ["title: A\npages: [Not A Name]", "pages[0] is written"],
    [
      "title: A\ntopic: Not A Topic",
      'topic is written in lowercase letters, digits, hyphens and underscores. It is "Not A Topic".',
    ],
    ["title: A\nnav: 3", 'There is no "nav" here.'],
    ["title: A\nterms:\n  - id: rma\n    term: RMA", "terms[0] needs short."],
    [
      "title: A\nabout:\n  - table: sales/orders\n    flow: x",
      "about[0] names 2 things (table, flow). It names one.",
    ],
    ["title: A\nabout:\n  - view: x", 'There is no "view" in about[0].'],
    [
      "title: A\nabout:\n  - table: Sales Orders",
      "about[0].table is written in lowercase letters, digits, hyphens and underscores, in folders.",
    ],
    ["title: A\nextends: [a, a]", "extends says the same thing twice."],
    ["title: A\nsince: soon", "since is not written as it should be"],
  ])("frontmatter %j is refused", (frontmatter, message) => {
    const { issues } = readPage("a", page(frontmatter));
    expect(issues.map((issue) => issue.message).join(" ")).toContain(message);
    expect(issues.every((issue) => issue.code === "frontmatter_invalid")).toBe(true);
  });

  test("what is wrong in the frontmatter is on the line that says it", () => {
    const { issues } = readPage("a", page("title: A\ndescription: fine\ntopic: Not A Topic"));
    expect(issues).toMatchObject([{ line: 4 }]);
  });

  test("YAML that cannot be read says where", () => {
    const { issues } = readPage("a", "---\ntitle: A\nterms: [unclosed\n---\n\nWords.\n");
    expect(issues).toMatchObject([{ code: "frontmatter_unreadable" }]);
    expect(issues[0]?.line).toBeGreaterThan(1);
  });

  test("what a term means is plain text", () => {
    const { issues } = readPage(
      "a",
      page("title: A\nterms:\n  - id: rma\n    term: RMA\n    short: A **bold** claim."),
    );
    expect(codes(issues)).toEqual(["term_short"]);
  });

  test("a file's name is never changed to make it fit", () => {
    expect(pagePath("guides/refunds.md")).toEqual({ path: "guides/refunds" });
    expect(pagePath("guides/Refund Policy.md")).toHaveProperty("problem");
    expect(pagePath("guides/01-intro.md")).toEqual({ path: "guides/01-intro" });
    expect(pagePath("guides/notes.txt")).toHaveProperty("problem");
  });

  test("the schema describes every field, for the reference page made from it", () => {
    for (const [name, schema] of Object.entries(FRONTMATTER_SCHEMA.properties)) {
      expect(schema.description, name).toBeTruthy();
    }
    expect(check({ title: "A" }, FRONTMATTER_SCHEMA)).toEqual([]);
  });
});

describe("structure from folders", () => {
  const files = {
    "index.md": page("title: Handbook\npages: [support, about]"),
    "faq.md": page("title: Questions"),
    "about.md": page("title: About us"),
    "support/index.md": page(
      "title: Customer support\nicon: headset\npages: [returns, escalations, refunds]",
    ),
    "support/refunds.md": page("title: Refunds"),
    "support/returns.md": page("title: Returns"),
    "support/escalations/index.md": page("title: Escalating"),
    "support/escalations/tier-two.md": page("title: Tier two"),
    "support/escalations/after-hours.md": page("title: After hours"),
    "ops/opening.md": page("title: Opening the shop"),
    "ops/closing/checklist.md": page("title: Closing checklist"),
  };

  test("top-level folders are collections, folders hold folders, and loose pages are Uncategorized, last", () => {
    const { set, issues } = build(files);
    expect(issues).toEqual([]);
    expect(set.nav.home).toMatchObject({ path: "index", url: "", title: "Handbook" });
    expect(
      set.nav.collections.map((collection) => [
        collection.id,
        collection.title,
        collection.items.map((item) => (item.type === "page" ? item.title : `[${item.title}]`)),
      ]),
    ).toEqual([
      ["support", "Customer support", ["Returns", "[Escalating]", "Refunds"]],
      ["ops", "Ops", ["[Closing]", "Opening the shop"]],
      ["", "Uncategorized", ["About us", "Questions"]],
    ]);
    expect(set.nav.collections[0]).toMatchObject({ icon: "headset", index: { url: "support" } });
  });

  test("what pages: does not list comes after, by title, and a folder's own page leads it", () => {
    const { set } = build(files);
    const folder = set.nav.collections[0]?.items[1];
    expect(folder).toMatchObject({
      type: "folder",
      id: "escalations",
      path: "support/escalations",
      index: { path: "support/escalations/index", url: "support/escalations" },
      items: [{ title: "After hours" }, { title: "Tier two" }],
    });
  });

  test("a folder with no index page is named from its folder", () => {
    const { set } = build(files);
    expect(set.nav.collections[1]).toMatchObject({ id: "ops", title: "Ops" });
    expect(set.nav.collections[1]?.index).toBeUndefined();
  });

  test("with no loose pages there is no Uncategorized", () => {
    const { set } = build({ "index.md": page("title: Home"), "a/b.md": page("title: B") });
    expect(set.nav.collections.map((collection) => collection.id)).toEqual(["a"]);
  });

  test("every page is met once, in reading order", () => {
    const { set } = build(files);
    expect(pagesInOrder(set.nav).map((one) => one.path)).toEqual([
      "index",
      "support/index",
      "support/returns",
      "support/escalations/index",
      "support/escalations/after-hours",
      "support/escalations/tier-two",
      "support/refunds",
      "ops/closing/checklist",
      "ops/opening",
      "about",
      "faq",
    ]);
  });

  test("folders go as deep as they are written", () => {
    const { set, issues } = build({
      "a/b/c/d/e/page.md": page("title: Deep"),
      "a/b/index.md": page("title: Bee"),
    });
    expect(issues).toEqual([]);
    expect(pagesInOrder(set.nav).map((one) => one.path)).toEqual(["a/b/index", "a/b/c/d/e/page"]);
    expect(trailOf(set.nav, "a/b/c/d/e/page").map((one) => one.title)).toEqual([
      "A",
      "Bee",
      "C",
      "D",
      "E",
    ]);
    expect(trailOf(set.nav, "a/b/index").map((one) => one.path)).toEqual(["a", "a/b"]);
  });

  test("a name pages: lists that is not there is a warning, not a refusal", () => {
    const { issues } = build({
      "a/index.md": page("title: A\npages: [one, gone]"),
      "a/one.md": page("title: One"),
    });
    expect(issues).toMatchObject([{ path: "a/index", code: "pages_unknown", severity: "warning" }]);
  });

  test("a file beside a folder of its name is refused, and told where to go", () => {
    const { issues } = build({
      "guides.md": page("title: Guides"),
      "guides/one.md": page("title: One"),
    });
    expect(issues).toMatchObject([{ path: "guides", code: "file_and_folder" }]);
    expect(issues[0]?.message).toContain("guides/index.md");
  });
});

describe("links between pages", () => {
  const files = {
    "index.md": page(
      "title: Home",
      "[Refunds](support/refunds) and [by topic](topic:refunds#partial-refunds).\n",
    ),
    "support/index.md": page(
      "title: Support",
      "[Refunds](refunds.md#partial-refunds) [home](../) [up](..) [self](#top)\n\n## Top\n",
    ),
    "support/refunds.md": page(
      "title: Refunds\ntopic: refunds",
      "## Partial refunds\n\n[Support](./) [returns](returns) [home](/index) [abs](/support/returns)\n\n![chart](../img/chart.png) ![far](https://example.com/x.png)\n",
    ),
    "support/returns.md": page("title: Returns"),
  };

  test("are written from where the file is, to a page, a folder or a topic", () => {
    const { set, issues } = build(files, { asset: (path) => path === "img/chart.png" });
    expect(issues).toEqual([]);
    expect(resolveLink(set, "support/refunds", "returns")).toEqual({ path: "support/returns" });
    expect(resolveLink(set, "support/refunds", "./")).toEqual({ path: "support/index" });
    expect(resolveLink(set, "support/index", "../")).toEqual({ path: "index" });
    expect(resolveLink(set, "index", "topic:refunds")).toEqual({ path: "support/refunds" });
    expect(resolveLink(set, "index", "support/refunds.md#partial-refunds")).toEqual({
      path: "support/refunds",
      anchor: "partial-refunds",
    });
    expect(resolveAsset("support/refunds", "../img/chart.png")).toBe("img/chart.png");
  });

  test.each([
    ["[x](nowhere)", "link_broken", "there is no page at support/nowhere"],
    ["[x](../../outside)", "link_broken", "leads out of the documentation"],
    ["[x](returns#no-such-heading)", "anchor_missing", "#no-such-heading"],
    ["[x](#no-such-heading)", "anchor_missing", "this page"],
    ["[x](topic:no-such-topic)", "topic_unknown", "no page has that topic"],
    [":term[x]{id=no-such-term}", "term_unknown", 'There is no term "no-such-term"'],
    ["![x](missing.png)", "image_missing", "no file at support/missing.png"],
  ])("%s is a %s", (body, code, message) => {
    const { issues } = build(
      { ...files, "support/broken.md": page("title: Broken", `Fine.\n\n${body}\n`) },
      { asset: (path) => path === "img/chart.png" },
    );
    expect(issues).toMatchObject([{ path: "support/broken", line: 7, code }]);
    expect(issues[0]?.message).toContain(message);
  });

  test("a term or an attachment to a resource that is not there is refused, where someone can say", () => {
    const resource = (kind: string, path: string, column?: string) =>
      kind === "table" && path === "sales/orders" && (column === undefined || column === "status");
    const fine = build(
      {
        "a.md": page(
          "title: A\nabout:\n  - table: sales/orders",
          ":term[status]{table=sales/orders column=status}\n",
        ),
      },
      { resource },
    );
    expect(fine.issues).toEqual([]);
    expect(fine.set.attachments).toEqual({ "table:sales/orders": ["a"] });
    const wrong = build(
      {
        "a.md": page(
          "title: A\nabout:\n  - flow: support/refund",
          ":term[x]{table=sales/orders column=colour} :term[y]{script=nope}\n",
        ),
      },
      { resource },
    );
    expect(codes(wrong.issues)).toEqual(["about_unknown", "term_unknown", "term_unknown"]);
    // Where nobody knows the workspace, nothing is said either way.
    expect(build({ "a.md": page("title: A", ":term[y]{script=nope}\n") }).issues).toEqual([]);
  });
});

describe("terms, topics and layers", () => {
  const product = build({
    "index.md": page("title: Help"),
    "data/tables.md": page(
      "title: Tables\ntopic: data-tables\nterms:\n  - id: workspace\n    term: workspace\n    short: Where a tenant's resources live.",
    ),
  }).set;
  const reserved: BuildOptions = {
    reservedTerms: Object.keys(product.terms),
    reservedTopics: Object.keys(product.topics),
  };
  const handbook = (extra: Record<string, string> = {}) =>
    build(
      {
        "support/refunds.md": page(
          "title: Refunds\ntopic: support-refunds\nextends: [data-tables]\nabout:\n  - table: sales/orders\nterms:\n  - id: rma\n    term: RMA\n    aliases: [return authorisation]\n    short: A return authorisation.",
          "A :term[workspace]{id=workspace} holds every :term[RMA]{id=rma}.\n",
        ),
        ...extra,
      },
      reserved,
    );

  test("a tenant's page uses the product's terms, defines its own, and adds notes to a product topic", () => {
    const { set, issues } = handbook();
    expect(issues).toEqual([]);
    const stack = [
      { id: "product", set: product },
      { id: "ops/handbook", set },
    ];
    expect(findTerm(stack, "workspace")).toMatchObject({ layer: "product", path: "data/tables" });
    expect(findTerm(stack, "rma")).toMatchObject({ layer: "ops/handbook", term: "RMA" });
    expect(allTerms(stack).map((term) => term.id)).toEqual(["workspace", "rma"]);
    expect(findTopic(stack, "data-tables")).toMatchObject({ layer: "product" });
    expect(findTopic(stack, "support-refunds")?.page.path).toBe("support/refunds");
    expect(extensionsOf(stack, "data-tables").map((found) => found.page.frontmatter.title)).toEqual(
      ["Refunds"],
    );
    expect(attachedTo(stack, "table", "sales/orders").map((found) => found.page.path)).toEqual([
      "support/refunds",
    ]);
    expect(attachedTo(stack, "table", "sales/other")).toEqual([]);
  });

  test("a reader who may not open the tenant's docs sees the product's alone", () => {
    const stack = [{ id: "product", set: product }];
    expect(findTerm(stack, "rma")).toBeUndefined();
    expect(extensionsOf(stack, "data-tables")).toEqual([]);
    expect(attachedTo(stack, "table", "sales/orders")).toEqual([]);
  });

  test.each([
    ["title: X\nterms:\n  - id: workspace\n    term: workspace\n    short: Ours.", "term_reserved"],
    ["title: X\ntopic: data-tables", "topic_reserved"],
    ["title: X\ntopic: support-refunds", "topic_duplicate"],
    ["title: X\nterms:\n  - id: rma\n    term: RMA\n    short: Again.", "term_duplicate"],
    ["title: X\nextends: [no-such-topic]", "extends_unknown"],
  ])("%j is a %s", (frontmatter, code) => {
    const { issues } = handbook({ "x.md": page(frontmatter) });
    expect(issues).toMatchObject([{ path: "x", code }]);
  });

  test("two docs apps in one workspace may not define the same term or topic", () => {
    const one = handbook().set;
    const two = build({
      "a.md": page(
        "title: A\ntopic: support-refunds\nterms:\n  - id: rma\n    term: RMA\n    short: Theirs.",
      ),
    }).set;
    expect(
      clashes([
        { id: "ops/handbook", set: one },
        { id: "hr/handbook", set: two },
      ]),
    ).toEqual([
      { kind: "term", id: "rma", layers: ["ops/handbook", "hr/handbook"] },
      { kind: "topic", id: "support-refunds", layers: ["ops/handbook", "hr/handbook"] },
    ]);
  });
});

describe("search and what is shipped", () => {
  const { set } = build(
    {
      "index.md": page("title: Handbook\ndescription: How the shop runs."),
      "support/refunds.md": page(
        "title: Refund an order\ndescription: Full and partial refunds.\ntopic: support-refunds\nsince: '1.2'",
        "## Partial refunds\n\nA partial refund returns part of what the customer paid. Ask for the :term[RMA]{id=rma} first.\n",
      ),
      "support/returns.md": page(
        "title: Returns",
        "Parcels come back to the warehouse on Tuesdays.\n",
      ),
    },
    { knownTerms: ["rma"] },
  );

  test("a page is found by its title, its headings and its words, best first", () => {
    const search = loadSearchIndex(buildSearchIndex(set));
    expect(search.search("refund").map((hit) => hit.path)[0]).toBe("support/refunds");
    expect(search.search("warehouse")).toMatchObject([
      { path: "support/returns", url: "support/returns", title: "Returns" },
    ]);
    expect(search.search("warehouse")[0]?.excerpt).toContain("warehouse on Tuesdays");
    expect(search.search("parti")[0]?.path).toBe("support/refunds");
    expect(search.search("zebra")).toEqual([]);
    expect(search.search("  ")).toEqual([]);
  });

  test("the files shipped are a manifest, one tree for each page, and the index", () => {
    const files = packageOutput(set, { version: "1.4.0" });
    expect([...files.keys()]).toEqual([
      "manifest.json",
      "pages/index.json",
      "pages/support/refunds.json",
      "pages/support/returns.json",
      "search.json",
    ]);
    const manifest = JSON.parse(files.get("manifest.json") as string);
    expect(manifest).toEqual(JSON.parse(JSON.stringify(manifestOf(set, "1.4.0"))));
    expect(manifest.version).toBe("1.4.0");
    expect(manifest.topics).toEqual({ "support-refunds": "support/refunds" });
    expect(manifest.pages[1]).toEqual({
      path: "support/refunds",
      url: "support/refunds",
      title: "Refund an order",
      description: "Full and partial refunds.",
      topic: "support-refunds",
      since: "1.2",
    });
    const shipped = JSON.parse(files.get("pages/support/refunds.json") as string);
    expect(renderHtml(shipped.tree)).toContain('<h2 id="partial-refunds">Partial refunds</h2>');
    expect(loadSearchIndex(files.get("search.json") as string).search("tuesdays")).toHaveLength(1);
  });
});

describe("a page checked as it is written, beside an index of the others", () => {
  const others = [
    { path: "index", terms: [], headings: [] },
    { path: "support/index", terms: [], headings: ["top"] },
    { path: "support/returns", topic: "returns", terms: ["rma"], headings: ["by-post"] },
  ];
  const codes = (path: string, frontmatter: string, body = "Words.\n", options = {}) =>
    checkPageAmong(path, page(frontmatter, body), others, options).issues.map(
      (issue) => `${issue.line}: ${issue.code}`,
    );

  test("is held to what a deploy would hold it to, with only the other pages' paths, topics, terms and headings", () => {
    expect(
      codes(
        "support/refunds",
        "title: Refunds\ntopic: refunds",
        "[a](returns#by-post) [b](topic:returns) [c](../) [d](#here) :term[RMA]{id=rma}\n\n## Here\n",
      ),
    ).toEqual([]);
    expect(
      codes(
        "support/refunds",
        "title: Refunds",
        "[a](returns#no-heading)\n\n[b](topic:nope)\n\n[c](gone)\n\n:term[x]{id=nope}\n\n::nope\n",
      ),
    ).toEqual([
      "5: anchor_missing",
      "7: topic_unknown",
      "9: link_broken",
      "11: term_unknown",
      "13: unknown_component",
    ]);
  });

  test("says what the page takes that is another's, or the product's", () => {
    expect(codes("support/refunds", "title: R\ntopic: returns")).toEqual(["1: topic_duplicate"]);
    expect(
      codes("support/refunds", "title: R\nterms:\n  - id: rma\n    term: RMA\n    short: Again."),
    ).toEqual(["1: term_duplicate"]);
    const product = { reservedTerms: ["workspace"], reservedTopics: ["data-tables"] };
    expect(
      codes(
        "support/refunds",
        "title: R\ntopic: data-tables\nextends: [data-tables, nope]\nterms:\n  - id: workspace\n    term: workspace\n    short: Ours.",
        ":term[w]{id=workspace}\n",
        product,
      ),
    ).toEqual(["1: topic_reserved", "1: term_reserved", "1: extends_unknown"]);
  });

  test("says where it may not be among the folders", () => {
    expect(codes("a/b/c/d", "title: Deep")).toEqual([]);
    expect(codes("support", "title: Support")).toEqual(["1: file_and_folder"]);
    // Its own earlier self in the index is not another page.
    expect(codes("support/returns", "title: Returns\ntopic: returns", "## By post\n")).toEqual([]);
  });

  test("a resource is checked only where someone can say whether it is there", () => {
    const body = ":term[s]{table=orders column=status} :term[t]{table=secret}\n";
    expect(codes("a", "title: A\nabout:\n  - table: gone", body)).toEqual([]);
    expect(
      codes("a", "title: A\nabout:\n  - table: gone", body, {
        // Says no to one, yes to one, and nothing of one it may not know of.
        resource: (_kind: string, path: string) =>
          path === "gone" ? false : path === "orders" ? true : undefined,
      }),
    ).toEqual(["1: about_unknown"]);
  });
});

describe("a page's frontmatter, written by a form", () => {
  const page =
    "---\n# Kept by support.\ntitle: Refunds\nicon: receipt # after returns\ntopic: refunds\n---\n\nAsk for the receipt.\n";

  test("one key changes, and the rest stays as it was written", () => {
    const next = setFrontmatter(page, { title: "Refund an order" });
    expect(next).toBe(
      "---\n# Kept by support.\ntitle: Refund an order\nicon: receipt # after returns\ntopic: refunds\n---\n\nAsk for the receipt.\n",
    );
  });

  test("a key given nothing is taken out, and a new one is added", () => {
    const next = setFrontmatter(page, {
      topic: "",
      extends: ["data-tables"],
      terms: [{ id: "rma", term: "RMA", short: "A return authorisation." }],
      about: [],
    }) as string;
    expect(frontmatterOf(next)).toEqual({
      title: "Refunds",
      icon: "receipt",
      extends: ["data-tables"],
      terms: [{ id: "rma", term: "RMA", short: "A return authorisation." }],
    });
    expect(next.endsWith("---\n\nAsk for the receipt.\n")).toBe(true);
    // And what it wrote reads as a page.
    expect(readPage("refunds", next).issues).toEqual([]);
  });

  test("a page with none is given one, and one that cannot be read is left alone", () => {
    expect(setFrontmatter("Just words.\n", { title: "Words" })).toBe(
      "---\ntitle: Words\n---\n\nJust words.\n",
    );
    expect(
      setFrontmatter("---\ntitle: [unclosed\n---\n\nWords.\n", { title: "x" }),
    ).toBeUndefined();
    expect(frontmatterOf("---\ntitle: [unclosed\n---\n")).toBeUndefined();
  });
});
