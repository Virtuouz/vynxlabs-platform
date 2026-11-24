import { buildDocSet, readPage } from "@volvel/docs-engine";
import { describe, expect, test } from "vitest";
import { changelogFeed } from "./feed.js";

const page = (path: string, text: string, updated?: string) =>
  readPage(path, text, { profile: "docs", ...(updated ? { updated } : {}) }).entry;

const set = (...pages: ReturnType<typeof page>[]) => buildDocSet(pages).set;

/** Every tag closed by its own, in order: what a reader of feeds needs before anything else. */
function balanced(xml: string): boolean {
  const stack: string[] = [];
  for (const tag of xml
    .replace(/<\?[\s\S]*?\?>/g, "")
    .matchAll(/<(\/?)([A-Za-z:]+)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosed] = tag as unknown as [string, string, string, string];
    if (selfClosed) continue;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0;
}

describe("a site's changelog as RSS", () => {
  const entries = set(
    page(
      "changelog/2026-11-24-new-intake",
      "---\ntitle: New intake\n---\n\nIntake takes a photo.\n",
    ),
    page(
      "changelog/old",
      "---\ntitle: Tom & Jerry <3\ndate: 2026-10-02\ndescription: Before the change.\n---\n\nOld.\n",
    ),
    page("handbook", "---\ntitle: Handbook\n---\n\nNot an entry.\n"),
  );

  test("is RSS 2.0, balanced, newest first, with whole links when it has an origin", () => {
    const feed = changelogFeed(entries, {
      title: "Fernhill handbook",
      base: "/t/fernhill/handbook/",
      origin: "https://app.example.com",
    }) as string;
    expect(feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(
      true,
    );
    expect(balanced(feed)).toBe(true);
    expect(feed).toContain("<title>Fernhill handbook: changelog</title>");
    expect(feed).toContain("<link>https://app.example.com/t/fernhill/handbook/</link>");
    expect(feed).toContain(
      '<atom:link href="https://app.example.com/t/fernhill/handbook/changelog.xml" rel="self" type="application/rss+xml"/>',
    );
    const links = [...feed.matchAll(/<item><title>[^<]*<\/title><link>([^<]*)<\/link>/g)].map(
      (one) => one[1],
    );
    expect(links).toEqual([
      "https://app.example.com/t/fernhill/handbook/changelog/2026-11-24-new-intake/",
      "https://app.example.com/t/fernhill/handbook/changelog/old/",
    ]);
    expect(feed).toContain("<pubDate>Tue, 24 Nov 2026 00:00:00 GMT</pubDate>");
    expect(feed).toContain("<pubDate>Fri, 02 Oct 2026 00:00:00 GMT</pubDate>");
    expect(feed).toContain("<lastBuildDate>Tue, 24 Nov 2026 00:00:00 GMT</lastBuildDate>");
    // Not an entry.
    expect(feed).not.toContain("Handbook");
  });

  test("escapes what XML reads as markup, and says what an entry says in its description or its words", () => {
    const feed = changelogFeed(entries, { title: "A", base: "/" }) as string;
    expect(feed).toContain("<title>Tom &amp; Jerry &lt;3</title>");
    expect(feed).toContain("<description>Before the change.</description>");
    expect(feed).toContain("<description>Intake takes a photo.</description>");
    expect(balanced(feed)).toBe(true);
  });

  test("has no feed for a site with no entries", () => {
    expect(
      changelogFeed(set(page("handbook", "---\ntitle: Handbook\n---\n\nHi.\n")), {
        title: "A",
        base: "/",
      }),
    ).toBeUndefined();
  });

  test("an entry nothing dates has no pubDate, and is still listed", () => {
    const feed = changelogFeed(set(page("changelog/next", "---\ntitle: Next\n---\n\nSoon.\n")), {
      title: "A",
      base: "/",
    }) as string;
    expect(feed).toContain("<title>Next</title>");
    expect(feed).not.toContain("<pubDate>");
    expect(feed).not.toContain("<lastBuildDate>");
  });
});
