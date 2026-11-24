import { describe, expect, test } from "vitest";
import {
  buildDocSet,
  buildSearchIndex,
  checkPageAmong,
  DOC_TEMPLATES,
  DOC_TYPES,
  effectiveType,
  loadSearchIndex,
  manifestOf,
  newPageSource,
  planNewPage,
  readPage,
  relatedTo,
} from "./index.js";

const STEPS = ":::steps\n1. One.\n2. Two.\n:::\n";
const page = (path: string, frontmatter: string, body = `## Goal\n\n${STEPS}`) =>
  readPage(path, `---\n${frontmatter}\n---\n\n${body}`);
const set = (pages: [string, string, string?][]) => {
  const reads = pages.map(([path, frontmatter, body]) => page(path, frontmatter, body));
  const built = buildDocSet(reads.map((read) => read.entry));
  return { ...built, issues: [...reads.flatMap((read) => read.issues), ...built.issues] };
};
const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code).sort();

describe("types", () => {
  test("a page has its folder index's type, its own when it says one, and an index has none", () => {
    const { set: built, issues } = set([
      ["guides/index", "title: Guides\ntype: how-to", ""],
      ["guides/refund", "title: Refund an order"],
      ["guides/deep/index", "title: Deep", ""],
      ["guides/deep/cancel", "title: Cancel an order"],
      ["guides/why", "title: Why refunds wait\ntype: explanation", "Because."],
      ["plain", "title: Plain", "Words."],
    ]);
    expect(issues).toEqual([]);
    expect(built.types).toEqual({
      "guides/refund": "how-to",
      "guides/deep/cancel": "how-to",
      "guides/why": "explanation",
    });
    expect(effectiveType("guides/index", () => "how-to")).toBeUndefined();
  });

  test("a site that says no type has no types, and nothing is said of it", () => {
    const { set: built, issues } = set([
      ["index", "title: Home", "Hi."],
      ["a/index", "title: A", ""],
      ["a/b", "title: B", "Words."],
    ]);
    expect(built.types).toEqual({});
    expect(built.subjects).toEqual({});
    expect(built.redirects).toEqual({});
    expect(issues).toEqual([]);
    expect(JSON.stringify(built.nav)).not.toContain("docType");
    const manifest = JSON.stringify(manifestOf(built, "1"));
    expect(manifest).not.toContain("docType");
    expect(manifest).not.toContain("redirects");
  });

  test("the nav carries a page's type", () => {
    const { set: built } = set([
      ["g/index", "title: G\ntype: tutorial", ""],
      ["g/first", "title: Build it"],
    ]);
    expect(built.nav.collections[0]?.items[0]).toMatchObject({
      path: "g/first",
      docType: "tutorial",
    });
    expect(manifestOf(built, "1").pages.find((one) => one.path === "g/first")?.docType).toBe(
      "tutorial",
    );
  });
});

describe("the lints are warnings, and only warnings", () => {
  test("each is said, and none is an error", () => {
    const { issues } = set([
      ["t/index", "title: T\ntype: tutorial", ""],
      ["t/no-steps", "title: Build it", "Just words."],
      ["t/about", "title: About building", `## Goal\n\n${STEPS}`],
      ["r/index", "title: R\ntype: reference", ""],
      ["r/stepped", "title: Fields"],
      ["h/index", "title: H\ntype: how-to", ""],
      ["h/headless", "title: Do it", STEPS],
      ["h/odd", "title: Odd\ntype: nonsense"],
      ["free/typed", "title: Typed alone\ntype: explanation", "Words."],
      ["free/many", "title: Many\nsubjects: [a, b, c, d, e, f]", "Words."],
      ["free/once", "title: Once\nsubjects: [only-here]", "Words."],
    ]);
    expect(codes(issues)).toEqual(
      codes([
        { code: "type_steps_missing" },
        { code: "type_title" },
        { code: "type_steps_present" },
        { code: "type_goal_missing" },
        { code: "type_unknown" },
        { code: "type_folder" },
        { code: "subjects_many" },
        { code: "subject_once" },
        { code: "subject_once" },
        { code: "subject_once" },
        { code: "subject_once" },
        { code: "subject_once" },
        { code: "subject_once" },
      ]),
    );
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
  });

  test("a folder's index is not told it has no steps", () => {
    const { issues } = set([["t/index", "title: T\ntype: tutorial", "A landing page."]]);
    expect(issues).toEqual([]);
  });
});

describe("moved_from", () => {
  test("old paths lead to the page, and the schema reads the keys", () => {
    const { set: built, issues } = set([
      ["a/new", "title: New\nmoved_from: [a/old, older]", "Words."],
    ]);
    expect(issues).toEqual([]);
    expect(built.redirects).toEqual({ "a/old": "a/new", older: "a/new" });
    expect(manifestOf(built, "1").redirects).toEqual(built.redirects);
  });

  test("a path that is still a page, the page's own, or two pages' claim is refused", () => {
    const { issues } = set([
      ["a/one", "title: One\nmoved_from: [a/two, a/one, gone]", "Words."],
      ["a/two", "title: Two", "Words."],
      ["a/three", "title: Three\nmoved_from: [gone]", "Words."],
    ]);
    expect(codes(issues.filter((issue) => issue.severity === "error"))).toEqual([
      "moved_from_duplicate",
      "moved_from_exists",
      "moved_from_self",
    ]);
  });

  test("a bad path is a frontmatter problem", () => {
    const { issues } = page("a/x", "title: X\nmoved_from: [Bad Path]", "Words.");
    expect(codes(issues)).toEqual(["frontmatter_invalid"]);
  });
});

describe("related pages", () => {
  const { set: built } = set([
    ["c/index", "title: C", ""],
    ["c/tut/index", "title: Tut\ntype: tutorial", ""],
    ["c/tut/learn", "title: Learn refunds\nsubjects: [refunds, orders]"],
    ["c/how/index", "title: How\ntype: how-to", ""],
    ["c/how/refund", "title: Refund an order\nsubjects: [refunds]"],
    ["c/how/cancel", "title: Cancel an order\nsubjects: [orders]"],
    ["c/how/about-table", "title: Tidy the table\nabout:\n  - table: orders"],
    ["c/ref/index", "title: Ref\ntype: reference", ""],
    [
      "c/ref/orders",
      "title: Orders table\nabout:\n  - table: orders\nsubjects: [orders]",
      "Words.",
    ],
  ]);

  test("pages of other types that share a subject or a resource, most shared first", () => {
    const related = relatedTo(built, "c/tut/learn");
    expect(related["how-to"]?.map((one) => one.path)).toEqual(["c/how/cancel", "c/how/refund"]);
    expect(related.reference?.map((one) => one.path)).toEqual(["c/ref/orders"]);
    expect(related.tutorial).toBeUndefined();
  });

  test("about counts as a subject, an index has none, and an untyped page has none", () => {
    expect(relatedTo(built, "c/how/about-table").reference?.map((one) => one.path)).toEqual([
      "c/ref/orders",
    ]);
    expect(relatedTo(built, "c/tut/index")).toEqual({});
    expect(relatedTo(built, "c/index")).toEqual({});
  });
});

describe("a page checked among its neighbours", () => {
  test("the type an index gives is known, and moved_from is checked as a deploy checks it", () => {
    const others = [
      { path: "t/index", terms: [], headings: [], type: "tutorial" },
      { path: "t/taken", terms: [], headings: [], moved_from: ["gone"] },
      { path: "old", terms: [], headings: [] },
    ];
    const { issues } = checkPageAmong(
      "t/new",
      "---\ntitle: Build it\nmoved_from: [old, gone]\n---\n\nNo steps.\n",
      others,
    );
    expect(codes(issues)).toEqual([
      "moved_from_duplicate",
      "moved_from_exists",
      "type_steps_missing",
    ]);
  });

  test("with nothing known of types, nothing is said of them", () => {
    const { issues } = checkPageAmong("a", "---\ntitle: A\n---\n\nWords.\n", []);
    expect(issues).toEqual([]);
  });
});

describe("new pages", () => {
  test("each type's template reads without a problem, and is that type", () => {
    for (const type of DOC_TYPES) {
      const source = newPageSource("Do the thing", type);
      const { issues } = readPage("g/new", source);
      expect(issues).toEqual([]);
      expect(source).toContain("title: Do the thing");
      expect(source).toContain(DOC_TEMPLATES[type]);
    }
  });

  test("the how-to template is the goal, Before you start, steps, The result, If it does not work", () => {
    const headings = [...DOC_TEMPLATES["how-to"].matchAll(/^## (.+)$/gm)].map((one) => one[1]);
    expect(headings).toEqual([
      "Do the thing",
      "Before you start",
      "The result",
      "If it does not work",
    ]);
    expect(DOC_TEMPLATES["how-to"]).not.toContain("## Goal");
  });

  test("the tutorial template opens with what you will have and how long it takes", () => {
    expect(DOC_TEMPLATES.tutorial.split("\n")[0]).toMatch(/you will build.*takes about/);
  });

  test("a page whose folder says the type does not repeat it", () => {
    expect(newPageSource("Do it", "how-to", "how-to")).not.toContain("type:");
    expect(newPageSource("Do it", "how-to")).toContain("type: how-to");
    expect(newPageSource("Plain")).toBe("---\ntitle: Plain\n---\n");
  });

  test("planNewPage takes the type, and reads the folder's", () => {
    const pages = [{ path: "g/index", source: "---\ntitle: G\ntype: how-to\n---\n" }];
    const plan = planNewPage(pages, "g", { title: "Refund", name: "refund", type: "how-to" });
    const source = "changes" in plan ? plan.changes[0]?.source : "";
    expect(source).not.toContain("type:");
    expect(source).toContain(":::steps");
    const other = planNewPage(pages, "g", { title: "Why", name: "why", type: "explanation" });
    expect("changes" in other && other.changes[0]?.source).toContain("type: explanation");
  });
});

describe("search", () => {
  test("a type narrows the answer, and an index built before types still answers", () => {
    const { set: built } = set([
      ["g/index", "title: G", ""],
      ["g/a", "title: Refund guide\ntype: how-to"],
      ["g/b", "title: Refund facts\ntype: reference", "Refund words."],
    ]);
    const index = loadSearchIndex(buildSearchIndex(built));
    expect(index.search("refund").length).toBe(2);
    expect(index.search("refund", 20, { type: "reference" }).map((hit) => hit.path)).toEqual([
      "g/b",
    ]);
    expect(index.grouped("refund", { type: "how-to" }).map((hit) => hit.path)).toEqual(["g/a"]);
  });
});

test("a page's type is said with a or an by the word", () => {
  const { issues } = set([["free/typed", "title: Typed alone\ntype: explanation", "Words."]]);
  const text = JSON.stringify(issues);
  expect(text).toContain("says it is an explanation");
  expect(text).not.toContain("a explanation");
});
