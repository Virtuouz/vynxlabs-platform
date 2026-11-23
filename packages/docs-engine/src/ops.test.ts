import { describe, expect, test } from "vitest";
import {
  type Change,
  inverseOf,
  nameProblem,
  orderOf,
  type PageSource,
  planDelete,
  planDuplicate,
  planMove,
  planNewFolder,
  planNewPage,
  planRename,
  relativeHref,
  slugOf,
} from "./ops.js";
import { frontmatterOf } from "./page.js";
import { buildSearchIndex, loadSearchIndex } from "./search.js";
import { glossaryOf } from "./set.js";
import { buildApp, checkWorkspaceDocs } from "./workspace.js";

const md = (frontmatter: string, body = "") => `---\n${frontmatter}\n---\n\n${body}`;

const handbook: PageSource[] = [
  { path: "handbook/index", source: md("title: Shop handbook") },
  {
    path: "handbook/support/index",
    source: md("title: Customer support\npages:\n  - refunds\n  - returns"),
  },
  {
    path: "handbook/support/refunds",
    source: md(
      "title: Refund an order",
      "See [returns](returns) and [the till](../ops/till.md#count).\n",
    ),
  },
  {
    path: "handbook/support/returns",
    source: md("title: Returns", "Back to [refunds](refunds).\n"),
  },
  { path: "handbook/support/disputes/chargebacks", source: md("title: Chargebacks") },
  { path: "handbook/ops/till", source: md("title: The till", "## Count\n\nCount it.\n") },
  { path: "handbook/questions", source: md("title: Questions") },
];

const changes = (plan: ReturnType<typeof planMove>): Change[] => {
  if ("problem" in plan) throw new Error(plan.problem);
  return plan.changes;
};

/** The pages once a plan is made. */
function apply(pages: readonly PageSource[], planned: readonly Change[]): PageSource[] {
  const out = new Map(pages.map((page) => [page.path, page.source]));
  for (const change of planned) {
    if (change.deleted) {
      out.delete(change.path);
      continue;
    }
    if (change.to !== undefined) out.delete(change.path);
    out.set(change.to ?? change.path, change.source as string);
  }
  return [...out].map(([path, source]) => ({ path, source }));
}

const sourceAt = (pages: readonly PageSource[], path: string) =>
  pages.find((page) => page.path === path)?.source;

describe("names", () => {
  test("a name is made from a title", () => {
    expect(slugOf("Customer Support!")).toBe("customer-support");
    expect(slugOf("  Café — après  ")).toBe("cafe-apres");
  });

  test("a name that is not written as one says how to fix it", () => {
    expect(nameProblem("customer-support")).toBeUndefined();
    expect(nameProblem("Customer Support")).toBe(
      "Use lowercase letters, numbers, - and _. Use customer-support",
    );
  });

  test("a link between two pages is written from the first", () => {
    expect(relativeHref("a/b/c", "a/d")).toBe("../d");
    expect(relativeHref("a/b/c", "a/b/index")).toBe(".");
    expect(relativeHref("a/c", "a/b/d")).toBe("b/d");
  });
});

describe("order", () => {
  test("what a folder lists comes first, and the rest by title", () => {
    expect(orderOf(handbook, "handbook/support")).toEqual(["refunds", "returns", "disputes"]);
    expect(orderOf(handbook, "handbook")).toEqual(["support", "ops", "questions"]);
  });

  test("a page put before another writes its folder's list", () => {
    const planned = changes(
      planMove(handbook, "handbook/support/disputes", {
        folder: "handbook/support",
        before: "refunds",
      }),
    );
    expect(planned.map((one) => one.path)).toEqual(["handbook/support/index"]);
    const after = apply(handbook, planned);
    expect(frontmatterOf(sourceAt(after, "handbook/support/index") as string)?.pages).toEqual([
      "disputes",
      "refunds",
      "returns",
    ]);
  });

  test("a folder with no page of its own is given one to hold its order", () => {
    const planned = changes(
      planMove(handbook, "handbook/questions", { folder: "handbook/ops", after: "till" }),
    );
    const made = planned.find((one) => one.path === "handbook/ops/index");
    expect(made).toMatchObject({ created: true });
    expect(frontmatterOf(made?.source as string)).toEqual({
      title: "Ops",
      pages: ["till", "questions"],
    });
  });

  test("top-level folders are listed by name", () => {
    expect(planMove(handbook, "handbook", { folder: "", before: "x" })).toHaveProperty("problem");
  });
});

describe("moving", () => {
  test("a page moved keeps its links, and links to it follow", () => {
    const planned = changes(
      planMove(handbook, "handbook/support/refunds", { folder: "handbook/support/disputes" }),
    );
    const after = apply(handbook, planned);
    // Its own links are written from where it now is.
    expect(sourceAt(after, "handbook/support/disputes/refunds")).toContain(
      "See [returns](../returns) and [the till](../../ops/till.md#count).",
    );
    // A link to it from the page it was beside follows it.
    expect(sourceAt(after, "handbook/support/returns")).toContain("[refunds](disputes/refunds)");
    // The folder it left no longer lists it.
    expect(frontmatterOf(sourceAt(after, "handbook/support/index") as string)?.pages).toEqual([
      "returns",
    ]);
    // And it all still deploys.
    const resources = after.map((page) => ({
      kind: "doc",
      path: page.path,
      body: { source: page.source },
    }));
    expect(
      checkWorkspaceDocs([
        ...resources,
        { kind: "app", path: "handbook-app", body: { docs: "handbook" } },
      ]),
    ).toEqual([]);
  });

  test("a folder moves with everything in it", () => {
    const planned = changes(planMove(handbook, "handbook/support", { folder: "handbook/ops" }));
    const after = apply(handbook, planned);
    expect(
      after
        .map((page) => page.path)
        .filter((path) => path.startsWith("handbook/ops/support"))
        .sort(),
    ).toEqual([
      "handbook/ops/support/disputes/chargebacks",
      "handbook/ops/support/index",
      "handbook/ops/support/refunds",
      "handbook/ops/support/returns",
    ]);
    expect(sourceAt(after, "handbook/ops/support/refunds")).toContain(
      "[the till](../till.md#count)",
    );
  });

  test("a folder cannot go inside itself, and a name cannot be taken twice", () => {
    expect(planMove(handbook, "handbook/support", { folder: "handbook/support/disputes" })).toEqual(
      {
        problem: "A folder cannot go inside itself.",
      },
    );
    expect(
      planMove(
        [...handbook, { path: "handbook/ops/questions", source: md("title: Q") }],
        "handbook/questions",
        { folder: "handbook/ops" },
      ),
    ).toHaveProperty("problem");
  });
});

describe("renaming", () => {
  test("a page's title and name change together, and its folder's list follows", () => {
    const planned = changes(
      planRename(handbook, "handbook/support/refunds", {
        title: "Refund or exchange an order",
        name: "refund-or-exchange",
      }),
    );
    const after = apply(handbook, planned);
    expect(
      frontmatterOf(sourceAt(after, "handbook/support/refund-or-exchange") as string)?.title,
    ).toBe("Refund or exchange an order");
    expect(frontmatterOf(sourceAt(after, "handbook/support/index") as string)?.pages).toEqual([
      "refund-or-exchange",
      "returns",
    ]);
    expect(sourceAt(after, "handbook/support/returns")).toContain("[refunds](refund-or-exchange)");
  });

  test("a folder's title is its own page's, which is made when it has none", () => {
    const planned = changes(
      planRename(handbook, "handbook/support/disputes", { title: "Disputes", name: "claims" }),
    );
    expect(planned).toEqual([
      {
        path: "handbook/support/claims/index",
        source: "---\ntitle: Disputes\n---\n",
        created: true,
      },
      {
        path: "handbook/support/disputes/chargebacks",
        to: "handbook/support/claims/chargebacks",
        source: md("title: Chargebacks"),
      },
    ]);
  });

  test("index makes a page its folder's own, and a folder has one", () => {
    expect(planRename(handbook, "handbook/support/refunds", { name: "index" })).toEqual({
      problem: "This folder already has its own page. A folder can have one.",
    });
    expect(planRename(handbook, "handbook/support/refunds", { name: "Refunds" })).toHaveProperty(
      "problem",
    );
  });
});

describe("making, copying and removing", () => {
  test("a new folder is its own page, with nothing written in it", () => {
    expect(
      changes(planNewFolder(handbook, "handbook/support", { title: "Disputes", name: "x" })),
    ).toEqual([
      { path: "handbook/support/x/index", source: "---\ntitle: Disputes\n---\n", created: true },
    ]);
    expect(
      planNewFolder(handbook, "handbook", { title: "Support", name: "support" }),
    ).toHaveProperty("problem");
  });

  test("a new page goes in a folder", () => {
    expect(
      changes(planNewPage(handbook, "handbook/ops", { title: "Closing", name: "closing" })),
    ).toEqual([
      { path: "handbook/ops/closing", source: "---\ntitle: Closing\n---\n", created: true },
    ]);
    expect(planNewPage(handbook, "", { title: "Loose", name: "loose" })).toHaveProperty("problem");
  });

  test("a page left to its folder's type starts from that type's template and says no type", () => {
    const typed: PageSource[] = [
      { path: "handbook/index", source: md("title: Handbook") },
      { path: "handbook/guides/index", source: md("title: Guides\ntype: how-to") },
    ];
    const [one] = changes(planNewPage(typed, "handbook/guides", { title: "Close", name: "close" }));
    expect(one?.source).toContain("## Goal");
    expect(frontmatterOf(one?.source as string)).toEqual({ title: "Close" });
    // A folder with no type leaves the page as it was: a title and nothing under it.
    expect(
      changes(planNewPage(typed, "handbook", { title: "Plain", name: "plain" }))[0]?.source,
    ).toBe("---\ntitle: Plain\n---\n");
  });

  test("a folder removed takes everything in it and leaves its folder's list", () => {
    const planned = changes(planDelete(handbook, "handbook/support"));
    expect(planned.every((one) => one.deleted)).toBe(true);
    expect(planned).toHaveLength(4);
  });

  test("a copy takes no topic or terms, and is named beside its original", () => {
    const pages = [
      ...handbook,
      {
        path: "handbook/ops/open",
        source: md(
          "title: Opening\ntopic: opening\nterms:\n  - id: till\n    term: Till\n    short: The cash drawer.",
        ),
      },
    ];
    const planned = changes(planDuplicate(pages, "handbook/ops/open"));
    expect(planned).toHaveLength(1);
    expect(planned[0]?.path).toBe("handbook/ops/open-copy");
    expect(frontmatterOf(planned[0]?.source as string)).toEqual({ title: "Opening (copy)" });
  });
});

describe("undoing", () => {
  test("the inverse of a plan puts every page back", () => {
    const planned = changes(planMove(handbook, "handbook/support", { folder: "handbook/ops" }));
    const after = apply(handbook, planned);
    const back = apply(after, inverseOf(handbook, planned));
    expect(back.sort((a, b) => a.path.localeCompare(b.path))).toEqual(
      [...handbook].sort((a, b) => a.path.localeCompare(b.path)),
    );
  });
});

describe("sites", () => {
  const doc = (path: string, updated?: string) => ({
    kind: "doc",
    path,
    body: { source: md("title: Page") },
    ...(updated ? { updated } : {}),
  });

  test("a docs app serves a top-level folder, and no other", () => {
    expect(
      checkWorkspaceDocs([doc("a/b/page"), { kind: "app", path: "site", body: { docs: "a/b" } }]),
    ).toEqual([
      'site (app): serves "a/b", which is inside another folder. A docs app serves a top-level folder: move its pages to a folder of their own, or serve "a".',
    ]);
    expect(
      checkWorkspaceDocs([doc("a/b/page"), { kind: "app", path: "site", body: { docs: "a" } }]),
    ).toEqual([]);
  });

  test("a served page knows when it last changed", () => {
    const built = buildApp({ path: "site", title: "Site", docs: "a" }, [
      doc("a/page", "2026-11-19T10:00:00.000Z"),
      doc("a/other"),
    ]);
    expect(built.set.pages.get("page")?.updated).toBe("2026-11-19T10:00:00.000Z");
    expect(built.set.pages.get("other")?.updated).toBeUndefined();
  });
});

describe("search as it is typed", () => {
  const built = buildApp({ path: "site", title: "Shop", docs: "shop" }, [
    {
      kind: "doc",
      path: "shop/support/refunds",
      body: {
        source: md(
          "title: Refund an order\ndescription: Full and partial refunds.",
          "Ask first.\n\n# Before you start\n\nA refund over 500 needs a second person.\n\n# Issue the refund\n\nRefund to the card it was paid with.\n",
        ),
      },
    },
    {
      kind: "doc",
      path: "shop/ops/closing",
      body: {
        source: md("title: Closing the shop", "Count the till and file the day's refund slips.\n"),
      },
    },
  ]);
  const index = loadSearchIndex(buildSearchIndex(built.set));

  test("a page is found with the places on it, the words asked for marked", () => {
    const [first, second] = index.grouped("refund");
    expect(first?.url).toBe("support/refunds");
    expect(first?.title).toEqual([{ text: "Refund", hit: true }, { text: " an order" }]);
    expect(first?.places.map((place) => [place.type, place.url])).toEqual(
      expect.arrayContaining([["heading", "support/refunds#issue-the-refund"]]),
    );
    expect(second?.url).toBe("ops/closing");
    expect(second?.places[0]?.words.some((part) => part.hit && part.text === "refund")).toBe(true);
  });

  test("a search is narrowed to one collection", () => {
    expect(index.grouped("refund", { collection: "ops" }).map((page) => page.url)).toEqual([
      "ops/closing",
    ]);
  });

  test("a page of results still lists pages once", () => {
    expect(index.search("refund").map((hit) => hit.url)).toEqual([
      "support/refunds",
      "ops/closing",
    ]);
  });
});

describe("a site that asks its readers", () => {
  const doc = { kind: "doc", path: "a/index", body: { source: md("title: A") } };
  const app = {
    kind: "app",
    path: "site",
    body: { title: "Site", docs: "a", feedback: { table: "votes" } },
  };

  test("keeps the answers in a table that is there, with what an answer is", () => {
    expect(checkWorkspaceDocs([doc, app])).toEqual([
      "site (app): keeps its readers' answers in the table votes, and there is no such table.",
    ]);
    expect(
      checkWorkspaceDocs([
        doc,
        app,
        {
          kind: "table",
          path: "votes",
          body: { columns: { page: { type: "text" }, helpful: { type: "text" } } },
        },
      ]),
    ).toEqual([
      "site (app): the table votes keeps its readers' answers, and needs a text column site_key, a text column site, a boolean column helpful, a text column version, a timestamp column at.",
    ]);
    expect(
      checkWorkspaceDocs([
        doc,
        app,
        {
          kind: "table",
          path: "votes",
          body: {
            columns: {
              site_key: { type: "text" },
              site: { type: "text" },
              page: { type: "text" },
              helpful: { type: "boolean" },
              version: { type: "text" },
              at: { type: "timestamp" },
            },
          },
        },
      ]),
    ).toEqual([]);
  });
});

describe("a glossary", () => {
  test("lists the terms of the page's collection, or of the whole site", () => {
    const term = (id: string) => `terms:\n  - id: ${id}\n    term: ${id}\n    short: ${id}.`;
    const built = buildApp({ path: "site", title: "Site", docs: "s" }, [
      { kind: "doc", path: "s/index", body: { source: md(`title: Home\n${term("home-word")}`) } },
      { kind: "doc", path: "s/a/index", body: { source: md(`title: A\n${term("a-word")}`) } },
      {
        kind: "doc",
        path: "s/a/deep/page",
        body: { source: md(`title: Deep\n${term("deep-word")}`) },
      },
      { kind: "doc", path: "s/b/page", body: { source: md(`title: B\n${term("b-word")}`) } },
    ]);
    const ids = (path: string, scope: "collection" | "site") =>
      glossaryOf(built.set, path, scope)
        .map((one) => one.id)
        .sort();
    expect(ids("a/deep/page", "collection")).toEqual(["a-word", "deep-word"]);
    expect(ids("a/index", "site")).toEqual(["a-word", "b-word", "deep-word", "home-word"]);
    expect(ids("index", "collection")).toEqual(["a-word", "b-word", "deep-word", "home-word"]);
  });
});
