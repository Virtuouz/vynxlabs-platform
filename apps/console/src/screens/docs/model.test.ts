import { expect, test } from "vitest";
import { type DocsList, pendingOf } from "./model.js";

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
