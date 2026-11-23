import { describe, expect, test } from "vitest";
import { buildDocSet, buildSearchIndex, loadSearchIndex, pagePath, readPage } from "./index.js";

const page = (frontmatter: string, body: string) => `---\n${frontmatter}\n---\n\n${body}`;

function setOf(files: Record<string, string>) {
  const entries = Object.entries(files).map(([file, text]) => {
    const named = pagePath(file);
    if ("problem" in named) throw new Error(named.problem);
    return readPage(named.path, text).entry;
  });
  return buildDocSet(entries).set;
}

const LONG = `${"Filler words about nothing in particular. ".repeat(60)}The needle lives far from the start.`;

const set = setOf({
  "index.md": page("title: Home", "Welcome.\n"),
  "guide/refunds.md": page(
    "title: Refund an order",
    `Ask first.\n\n## Issue the refund\n\n${LONG}\n\n## Cancel\n\nStop the refund early.\n`,
  ),
  "reference/refund-limits.md": page(
    "title: Refund limits",
    "Limits for every refund.\n\n## Maximum refund\n\nThe refund limit is 500.\n",
  ),
  "reference/refund.md": page("title: Refund", "A refund returns money.\n"),
});

describe("the search index", () => {
  test("does not store the full text of a page", () => {
    const json = buildSearchIndex(set);
    const stored = JSON.stringify(JSON.parse(json).storedFields);
    // The needle is the last words of a long section: the section's passage is clipped before it.
    expect(stored).not.toContain("needle lives far");
    // And it is still found, by the section it is in.
    const found = loadSearchIndex(json).grouped("needle");
    expect(found.map((hit) => hit.url)).toEqual(["guide/refunds"]);
  });

  test("a section hit still shows the heading and a passage for the help panel", () => {
    const [hit] = loadSearchIndex(buildSearchIndex(set)).grouped("cancel");
    expect(hit?.url).toBe("guide/refunds");
    expect(hit?.places[0]).toMatchObject({ type: "heading", url: "guide/refunds#cancel" });
    const [early] = loadSearchIndex(buildSearchIndex(set)).grouped("early");
    expect(early?.places[0]?.type).toBe("text");
    expect(early?.places[0]?.words.some((part) => part.hit)).toBe(true);
  });

  test("a page of results finds a page by words that are deep in a section", () => {
    const hits = loadSearchIndex(buildSearchIndex(set)).search("needle");
    expect(hits.map((hit) => hit.path)).toEqual(["guide/refunds"]);
    expect(hits[0]?.title).toBe("Refund an order");
    expect(hits[0]?.excerpt.length).toBeGreaterThan(0);
  });

  test("keeps only a clipped passage for each page and section", () => {
    const stored = JSON.parse(buildSearchIndex(set)).storedFields as Record<string, unknown>;
    for (const fields of Object.values(stored)) {
      expect(JSON.stringify(fields).length).toBeLessThan(900);
    }
  });

  test("reference pages rank below other pages, unless the title is what was typed", () => {
    const index = loadSearchIndex(buildSearchIndex(set));
    expect(index.search("refund limits")[0]?.path).toBe("reference/refund-limits");
    const paths = index.search("refund").map((hit) => hit.path);
    expect(paths.indexOf("guide/refunds")).toBeLessThan(paths.indexOf("reference/refund-limits"));
    // Typed in full as a heading or as a title, a reference page is first.
    // An exact title is not held back: it keeps the score it earned.
    const plain = JSON.parse(buildSearchIndex(set));
    expect(plain.documentCount).toBeGreaterThan(0);
    expect(paths.indexOf("reference/refund")).toBeLessThan(
      paths.indexOf("reference/refund-limits"),
    );
    const grouped = index.grouped("refund").map((hit) => hit.url);
    expect(grouped.indexOf("guide/refunds")).toBeLessThan(
      grouped.indexOf("reference/refund-limits"),
    );
  });

  test("keeps each page's type, empty for an untyped page, stored and not searched", () => {
    const json = JSON.parse(buildSearchIndex(set));
    const fields = Object.values(json.storedFields) as { docType?: string }[];
    expect(fields.length).toBeGreaterThan(0);
    for (const one of fields) expect(one.docType).toBe("");
    expect(json.fieldIds).not.toHaveProperty("docType");
  });

  test("an index built before this one is still read", () => {
    const old = JSON.parse(buildSearchIndex(set));
    for (const [id, fields] of Object.entries(old.storedFields) as [
      string,
      Record<string, unknown>,
    ][]) {
      fields.text = id.includes("#") ? "An older index kept the words of this part." : "";
      delete fields.passage;
      delete fields.docType;
    }
    const hits = loadSearchIndex(JSON.stringify(old)).search("refund");
    expect(hits.length).toBeGreaterThan(0);
  });
});
