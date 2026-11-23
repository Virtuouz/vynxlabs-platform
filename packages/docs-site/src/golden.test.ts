import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, buildSearchIndex, type DocsApp, loadSearchIndex } from "@volvel/docs-engine";
import { describe, expect, test } from "vitest";
import { docPage, homePage, notFoundPage, pageAt, type SiteView, searchPage } from "./index.js";

/**
 * Golden HTML of a tenant docs site, drawn by the renderer. A move or a rewrite of the renderer
 * must leave these files as they are; only the names of hashed assets are normalised. To write
 * them again on purpose: `UPDATE_GOLDEN=1`.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, "..", "golden");

const app: DocsApp = {
  path: "handbook",
  title: "Fernhill handbook",
  docs: "handbook",
  feedback: "docs-feedback",
};
const doc = (path: string, frontmatter: string, body = "Words.\n") => ({
  kind: "doc",
  path,
  body: { source: `---\n${frontmatter}\n---\n\n${body}` },
  updated: "2026-03-04T10:00:00.000Z",
});

const resources = [
  { kind: "table", path: "orders", body: { columns: { status: { type: "text" } } } },
  doc(
    "handbook/index",
    "title: Handbook\ndescription: How the shop runs.\npages: [guide, support]",
    "Welcome. Start with [the guide](guide/components) or [refunds](support/refunds).\n",
  ),
  doc("handbook/glossary", "title: Glossary\ndescription: Words we use.", "::glossary\n"),
  doc(
    "handbook/guide/index",
    "title: Guide\ndescription: Every component.\npages: [components, fresh]",
    "::pages\n",
  ),
  doc(
    "handbook/guide/components",
    [
      "title: Every component",
      "description: One of each.",
      "since: 1.4.0",
      "terms:",
      "  - id: rma",
      "    term: RMA",
      "    short: A return authorisation.",
      "    aliases: [return number]",
    ].join("\n"),
    [
      "# Alerts",
      "",
      ":::alert[Careful]{type=warning}",
      "A **warning** with `code`.",
      ":::",
      "",
      ":::alert{type=info}",
      "An info note.",
      ":::",
      "",
      "## Terms",
      "",
      "Ask for the :term[RMA]{id=rma} first, then the :term[status]{table=orders column=status}.",
      "",
      "Press :kbd[Ctrl+K].",
      "",
      "::field{path=table.columns.*.type}",
      "",
      "## Steps",
      "",
      ":::steps",
      "1. Open the order.",
      "2. Choose refund.",
      ":::",
      "",
      ":::tabs",
      "::::tab{label=Card}",
      "Refund to the card.",
      "::::",
      "::::tab{label=Cash}",
      "Refund at the till.",
      "::::",
      ":::",
      "",
      ':::details{summary="More"}',
      "Hidden words.",
      ":::",
      "",
      ":::code-tabs",
      "```js title=JavaScript",
      "const a = 1;",
      "```",
      "```py title=Python",
      "a = 1",
      "```",
      ":::",
      "",
      ":::file-tree",
      "- docs/",
      "  - index.md",
      ":::",
      "",
      "## Table and picture",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "![A chart](chart.png) and ![Elsewhere](https://example.com/x.png)",
      "",
      "```mermaid",
      "graph TD; A-->B",
      "```",
      "",
      "<script>alert(1)</script> is only words. A [missing](nowhere) link, and a [home](../).",
      "",
      "::glossary",
    ].join("\n"),
  ),
  doc("handbook/guide/fresh", "title: Fresh page\ndescription: Brand new.", "# Hello\n\nNew.\n"),
  doc(
    "handbook/support/index",
    "title: Customer support\ndescription: Refunds and returns.\npages: [refunds]",
  ),
  doc(
    "handbook/support/refunds",
    "title: Refund an order\ndescription: Full and partial refunds.\ntopic: support-refunds",
    "# Before you start\n\nSee [the components](../guide/components#alerts).\n",
  ),
];

const built = buildApp(app, resources, { product: { terms: [], topics: [] } });
const search = loadSearchIndex(buildSearchIndex(built.set));

const look = {
  themeHref: "/theme.css",
  logoHref: "/logo.png",
  iconsHref: "/icons",
};
const pictures = new Set(["chart.png"]);
const site = (more: Partial<SiteView> = {}): SiteView => ({
  title: app.title,
  look,
  base: "/apps/handbook/",
  set: built.set,
  resolve: { asset: (file) => (pictures.has(file) ? `/apps/handbook/${file}` : undefined) },
  ...more,
});

/** Hashed names of the platform's stylesheet and script are the one thing allowed to change. */
const normal = (html: string) =>
  html.replace(/\/_platform\/docs(\.[0-9a-f]{8,})?\.(css|js)/g, "/_platform/docs.$2");

const cases: Record<string, () => string> = {
  home: () => homePage(site()),
  "home-no-feedback-no-look": () =>
    homePage({
      ...site(),
      look: { themeHref: "/t.css" },
    }),
  "page-components": () => docPage(site(), "guide/components"),
  "page-components-feedback": () =>
    docPage(site({ feedback: { said: () => false, recording: true } }), "guide/components"),
  "page-said-feedback": () =>
    docPage(site({ feedback: { said: () => true, recording: true } }), "support/refunds"),
  "page-preview": () =>
    docPage(
      site({
        base: "/apps/handbook/_draft/",
        notice: "A preview, with the workspace's drafts.",
        feedback: { said: () => false, recording: false },
      }),
      "support/refunds",
    ),
  "page-folder-index": () => docPage(site(), "guide/index"),
  "page-glossary": () => docPage(site(), "glossary"),
  "page-nested-base": () =>
    docPage(site({ base: "/t/acme/w/prod/apps/handbook/" }), "support/refunds"),
  "page-index-is-home": () => docPage(site(), "index"),
  "page-missing": () => docPage(site(), "no/such"),
  "search-empty": () => searchPage(site(), "", []),
  "search-hits": () => searchPage(site(), "refund", search.search("refund", 30)),
  "search-none": () => searchPage(site(), "zzzzqq", []),
  "search-escaped": () => searchPage(site(), '<b>"x"', []),
  "not-found": () => notFoundPage(site()),
  "not-found-preview": () => notFoundPage(site({ notice: "A preview." })),
};

describe("the docs renderer's golden pages", () => {
  test("the fixture reads, but for the one broken link that shows how one is drawn", () => {
    expect(built.issues.map((issue) => issue.code)).toEqual(["link_broken"]);
  });

  for (const [name, draw] of Object.entries(cases)) {
    test(name, () => {
      const html = normal(draw());
      const file = join(GOLDEN, `${name}.html`);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) {
        mkdirSync(GOLDEN, { recursive: true });
        writeFileSync(file, html);
      }
      expect(html).toBe(readFileSync(file, "utf8"));
    });
  }

  test("trailing slash variants name the same page", () => {
    for (const address of ["guide/components", "guide/components/", "guide/components///"]) {
      expect(pageAt(built.set, address)).toBe("guide/components");
    }
    expect(pageAt(built.set, "")).toBe("index");
    expect(pageAt(built.set, "/")).toBe("index");
    expect(pageAt(built.set, "guide/")).toBe("guide/index");
    expect(pageAt(built.set, "nowhere/")).toBeUndefined();
  });

  test("the pages carry the since line and the unresolved terms as they are", () => {
    const html = docPage(site(), "guide/components");
    expect(html).toContain('<p class="since">New in version 1.4.0</p>');
  });
});

describe("what a site's view changes", () => {
  test("a trailing slash ends every page's address, and not the search or the Markdown copy", () => {
    const html = docPage(site({ trailingSlash: true }), "guide/components");
    expect(html).toContain('href="/apps/handbook/guide/fresh/"');
    expect(html).toContain('href="/apps/handbook/_search"');
    expect(html).toContain('data-copy="/apps/handbook/guide/components.md"');
  });

  test("the profile and the platform's address are the view's", () => {
    const html = homePage(site({ platform: "/static/", profile: "product" }));
    expect(html).toMatch(/href="\/static\/docs\.[0-9a-f]{10}\.css"/);
    expect(html).toContain('"platform":"/static/"');
  });
});
