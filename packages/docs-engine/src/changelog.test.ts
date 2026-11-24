import { describe, expect, test } from "vitest";
import {
  changelogDate,
  changelogOf,
  dayInName,
  isChangelogEntry,
  isDay,
  planNewChangelogEntry,
  readPage,
} from "./index.js";
import { changelogEntryName } from "./ops.js";
import { manifestOf } from "./output.js";
import { setFromManifest } from "./package.js";
import { buildDocSet, folderItems, neighboursOf, pagesInOrder } from "./set.js";

const page = (path: string, front: string, updated?: string) =>
  readPage(path, `---\n${front}\n---\n\nBody of ${path}.\n`, {
    profile: "docs",
    ...(updated ? { updated } : {}),
  });

const site = (...pages: [string, string, string?][]) =>
  buildDocSet(pages.map(([path, front, updated]) => page(path, front, updated).entry)).set;

describe("what is an entry", () => {
  test("a page under a folder named changelog, at any depth, or with the subject changelog", () => {
    const fm = (subjects?: string[]) => ({
      frontmatter: { title: "T", ...(subjects ? { subjects } : {}) },
    });
    expect(isChangelogEntry("changelog/a", fm())).toBe(true);
    expect(isChangelogEntry("handbook/changelog/2026/a", fm())).toBe(true);
    expect(isChangelogEntry("handbook/news/a", fm(["changelog"]))).toBe(true);
    expect(isChangelogEntry("handbook/news/a", fm(["refunds"]))).toBe(false);
    // A folder only called something like it is not it.
    expect(isChangelogEntry("handbook/changelogs/a", fm())).toBe(false);
  });

  test("the folder's own page is not an entry, even with the subject", () => {
    const fm = { frontmatter: { title: "T", subjects: ["changelog"] } };
    expect(isChangelogEntry("changelog/index", fm)).toBe(false);
    expect(isChangelogEntry("handbook/changelog/index", fm)).toBe(false);
  });
});

describe("an entry's date", () => {
  const entry = (front: string, updated?: string) => page("x/y", front, updated).entry;

  test("is `date:` first, whatever the name and the last update say", () => {
    const got = changelogDate(
      "changelog/2026-01-01-a",
      entry("title: A\ndate: 2026-11-24", "2026-12-31T10:00:00Z"),
    );
    expect(got).toEqual({ date: "2026-11-24", source: "frontmatter" });
  });

  test("else a day that begins the file name, or one that ends it", () => {
    expect(changelogDate("changelog/2026-11-24-new-intake", entry("title: A"))).toEqual({
      date: "2026-11-24",
      source: "name",
    });
    expect(changelogDate("changelog/new-intake-2026-11-24", entry("title: A"))).toEqual({
      date: "2026-11-24",
      source: "name",
    });
    expect(dayInName("changelog/2026-11-24")).toBe("2026-11-24");
    expect(dayInName("changelog/2026-11-24_a")).toBe("2026-11-24");
    // In the middle, a day is only part of a name.
    expect(dayInName("changelog/a-2026-11-24-b")).toBeUndefined();
    // Not a day on the calendar.
    expect(dayInName("changelog/2026-13-45-a")).toBeUndefined();
    expect(dayInName("changelog/2026-02-30")).toBeUndefined();
  });

  test("else the day the page last changed, in UTC; else none", () => {
    expect(changelogDate("changelog/a", entry("title: A", "2026-11-23T23:59:59Z"))).toEqual({
      date: "2026-11-23",
      source: "updated",
    });
    expect(changelogDate("changelog/a", entry("title: A"))).toBeUndefined();
    expect(changelogDate("changelog/a", entry("title: A", "not a date"))).toBeUndefined();
  });

  test("isDay is the calendar's", () => {
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-1-1")).toBe(false);
  });
});

describe("the entries of a site", () => {
  const set = site(
    ["index", "title: Home"],
    ["changelog/index", "title: Changelog"],
    ["changelog/2026-11-24-new-intake", "title: New intake"],
    ["changelog/old-2026-09-01", "title: Old"],
    ["changelog/by-date", "title: By date\ndate: 2026-10-15"],
    ["changelog/by-update", "title: By update", "2026-11-01T08:00:00Z"],
    ["changelog/product/2026-11-24-b", "title: Same day, b\nsubjects: [intake]"],
    ["news/item", "title: Tagged\nsubjects: [changelog, intake]\ndate: 2026-08-01"],
    ["handbook/refunds", "title: Refunds"],
  );

  test("are listed newest first, a day's entries in the reverse order of their paths, and the page itself kept out", () => {
    expect(changelogOf(set).map((one) => [one.path, one.date, one.source])).toEqual([
      ["changelog/product/2026-11-24-b", "2026-11-24", "name"],
      ["changelog/2026-11-24-new-intake", "2026-11-24", "name"],
      ["changelog/by-update", "2026-11-01", "updated"],
      ["changelog/by-date", "2026-10-15", "frontmatter"],
      ["changelog/old-2026-09-01", "2026-09-01", "name"],
      ["news/item", "2026-08-01", "frontmatter"],
    ]);
  });

  test("are narrowed by folder, and by subject", () => {
    expect(changelogOf(set, { folder: "changelog/product" }).map((one) => one.path)).toEqual([
      "changelog/product/2026-11-24-b",
    ]);
    expect(changelogOf(set, { folder: "/changelog/" })).toHaveLength(5);
    expect(changelogOf(set, { subject: "intake" }).map((one) => one.path)).toEqual([
      "changelog/product/2026-11-24-b",
      "news/item",
    ]);
    expect(changelogOf(set, { folder: "changelog", subject: "intake" })).toHaveLength(1);
    expect(changelogOf(set, { folder: "nowhere" })).toEqual([]);
  });

  test("an entry nothing dates has not been released, so it comes first", () => {
    const undated = site(
      ["changelog/unreleased", "title: Unreleased"],
      ["changelog/0-5-0", "title: 0.5.0"],
      ["changelog/2026-11-24-a", "title: A"],
    );
    expect(changelogOf(undated).map((one) => one.path)).toEqual([
      "changelog/unreleased",
      "changelog/0-5-0",
      "changelog/2026-11-24-a",
    ]);
  });

  test("a date survives a built package, which is what a served site reads", () => {
    const again = setFromManifest(manifestOf(set, "1.0.0"));
    expect(changelogOf(again).map((one) => one.date)).toEqual(
      changelogOf(set).map((one) => one.date),
    );
    expect(again.pages.get("changelog/by-date")?.frontmatter.date).toBe("2026-10-15");
  });
});

describe("where a changelog is listed", () => {
  const set = site(
    ["ref/changelog/index", "title: Changelog"],
    ["ref/changelog/0-1-0", "title: 0.1.0"],
    ["ref/changelog/0-5-0", "title: 0.5.0"],
    ["ref/changelog/unreleased", "title: Unreleased"],
    ["ref/changelog/2026-02-01-dated", "title: Dated", "2026-02-01T00:00:00Z"],
  );
  const titles = (items: { title: string }[]) => items.map((one) => one.title);

  test("the navigation and Previous/Next run in the order ::changelog gives, newest first", () => {
    const folder = folderItems(set.nav, "ref/changelog/0-5-0");
    const wanted = changelogOf(set).map((one) => one.title);
    expect(titles(folder)).toEqual(wanted);
    expect(titles(pagesInOrder(set.nav))).toEqual(["Changelog", ...wanted]);
    expect(neighboursOf(set.nav, "ref/changelog/0-5-0").before?.title).toBe("Unreleased");
  });

  test("a page its index lists by name keeps the place the index gives it", () => {
    const listed = site(
      ["ref/changelog/index", "title: Changelog\npages: [0-1-0]"],
      ["ref/changelog/0-1-0", "title: 0.1.0"],
      ["ref/changelog/0-5-0", "title: 0.5.0"],
    );
    expect(titles(folderItems(listed.nav, "ref/changelog/0-5-0"))).toEqual(["0.1.0", "0.5.0"]);
  });
});

describe("the date key", () => {
  test("is in the schema as a day, and a value that is not one is refused", () => {
    expect(page("changelog/a", "title: A\ndate: 2026-11-24").issues).toEqual([]);
    const bad = page("changelog/a", "title: A\ndate: yesterday");
    expect(bad.issues.map((one) => one.code)).toEqual(["frontmatter_invalid"]);
    expect(bad.entry.frontmatter.date).toBeUndefined();
  });

  test("is refused when it is in shape and not on the calendar, and the page loses it", () => {
    const bad = page("changelog/a", "title: A\ndate: 2026-02-30");
    expect(bad.issues.map((one) => one.message)).toEqual([
      'The date is not a day on the calendar: "2026-02-30". Write it as YYYY-MM-DD.',
    ]);
    expect(bad.entry.frontmatter.date).toBeUndefined();
  });
});

describe("a new changelog entry", () => {
  const pages = [
    { path: "handbook/index", source: "---\ntitle: Handbook\n---\n" },
    { path: "handbook/guides/index", source: "---\ntitle: Guides\ntype: how-to\n---\n" },
  ];

  test("is named with the day, kept in the site's changelog folder, and made from the template", () => {
    const plan = planNewChangelogEntry(pages, "handbook/guides", {
      title: "New intake!",
      today: "2026-11-24",
    });
    if ("problem" in plan) throw new Error(plan.problem);
    const [made] = plan.changes;
    expect(made?.path).toBe("handbook/changelog/2026-11-24-new-intake");
    expect(made?.created).toBe(true);
    expect(made?.source).toContain("title: New intake!");
    expect(made?.source).toContain("## What is new");
    // It is no type of page, so says none, though its neighbors' folder does.
    expect(made?.source).not.toContain("type:");
    expect(readPage("x", made?.source ?? "", { profile: "docs" }).issues).toEqual([]);
  });

  test("goes in the changelog folder the page's own folder is in, and is the entry the changelog then lists", () => {
    const plan = planNewChangelogEntry(pages, "handbook/changelog/product", {
      title: "Second",
      today: "2026-11-24",
    });
    if ("problem" in plan) throw new Error(plan.problem);
    expect(plan.changes[0]?.path).toBe("handbook/changelog/2026-11-24-second");
    const set = site(["handbook/changelog/2026-11-24-second", "title: Second"]);
    expect(changelogOf(set)).toHaveLength(1);
  });

  test("says what is wrong: no title, no site, a name taken", () => {
    expect(planNewChangelogEntry(pages, "handbook", { title: " ", today: "2026-11-24" })).toEqual({
      problem: "A title is needed.",
    });
    expect(planNewChangelogEntry(pages, "", { title: "A", today: "2026-11-24" })).toEqual({
      problem: "A page goes in a folder. Top-level folders are the sites.",
    });
    const taken = [
      ...pages,
      { path: "handbook/changelog/2026-11-24-a", source: "---\ntitle: A\n---\n" },
    ];
    expect(planNewChangelogEntry(taken, "handbook", { title: "A", today: "2026-11-24" })).toEqual({
      problem: "There is already an entry named 2026-11-24-a. Change its title or its name.",
    });
    expect(changelogEntryName("!!!", "2026-11-24")).toBe("2026-11-24");
  });
});
