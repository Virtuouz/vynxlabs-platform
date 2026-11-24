import { expect, test } from "vitest";
import { changelogFor, type DocsList, pendingOf } from "./model.js";

test("an app a draft removes is a change a deploy carries, beside the pages removed with it", () => {
  const list = {
    apps: [],
    removedApps: ["site"],
    pages: [{ path: "handbook/index", state: "removed" }],
    tables: [],
  } as unknown as DocsList;
  const pending = pendingOf(list);
  expect(pending.paths).toEqual(["handbook/index", "site"]);
  expect(pending.count).toBe(2);
});

test("::changelog in the editor's preview lists the entries of the page's own site, newest first, as the site will", () => {
  const page = (path: string, front: string, state = "deployed") => ({
    path,
    state,
    source: `---\n${front}\n---\n\nWords of ${path}.\n`,
  });
  const list = {
    apps: [
      { path: "apps/handbook", docs: "handbook" },
      { path: "apps/other", docs: "other" },
    ],
    removedApps: [],
    pages: [
      page("handbook/index", "title: Handbook"),
      page("handbook/changelog/2026-11-24-new-intake", "title: New intake"),
      page("handbook/changelog/old", "title: Old\ndate: 2026-10-02"),
      page("handbook/changelog/gone", "title: Gone\ndate: 2026-11-30", "removed"),
      page("other/changelog/2026-12-01-elsewhere", "title: Elsewhere"),
    ],
    tables: [],
  } as unknown as DocsList;
  const entries = changelogFor(list, { path: "handbook/index" }, {}, (to) => `/docs/${to}`);
  expect(entries.map((one) => [one.title, one.date, one.href])).toEqual([
    ["New intake", "2026-11-24", "/docs/handbook/changelog/2026-11-24-new-intake"],
    ["Old", "2026-10-02", "/docs/handbook/changelog/old"],
  ]);
  expect(entries[0]?.tree.type).toBe("root");
  expect(
    changelogFor(list, { path: "handbook/index" }, { folder: "changelog/archive" }, (to) => to),
  ).toEqual([]);
  // A page of no site has none.
  expect(changelogFor(list, { path: "stray/page" }, {}, (to) => to)).toEqual([]);
});
