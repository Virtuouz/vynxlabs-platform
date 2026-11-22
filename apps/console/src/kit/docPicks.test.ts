import { expect, test } from "vitest";
import type { DocPage, DocsList } from "../screens/docs/model.ts";
import { grouped, matching, pickOfTopic, picksOf } from "./docPicks.ts";

const page = (path: string, title: string, topic: string | null, more: Partial<DocPage> = {}) =>
  ({
    path,
    title,
    description: null,
    pages: null,
    topic,
    app: "docs",
    url: null,
    state: "deployed",
    file: null,
    headings: [],
    terms: [],
    source: "",
    revision: null,
    ...more,
  }) as DocPage;
const list = {
  apps: [{ path: "docs", key: "docs", title: "Handbook", docs: "handbook" }],
  pages: [
    page("handbook/billing/refunds", "Refunds", "refunds", { description: "Give money back" }),
    page("handbook/index", "Welcome", null),
    page("handbook/billing/invoices", "Invoices", "invoicing"),
    page("handbook/gone", "Gone", "gone", { state: "removed" }),
  ],
  tables: [],
} as unknown as DocsList;

test("pages are offered by folder and title, without the ones being removed", () => {
  const picks = picksOf(list);
  expect(picks.map((one) => one.title)).toEqual(["Invoices", "Refunds", "Welcome"]);
  expect(grouped(picks).map((one) => one.folder)).toEqual(["billing", "Handbook"]);
});

test("a search looks at title, description, folder, path and topic, every word", () => {
  const picks = picksOf(list);
  expect(matching(picks, "").length).toBe(3);
  expect(matching(picks, "money").map((one) => one.title)).toEqual(["Refunds"]);
  expect(matching(picks, "billing invoicing").map((one) => one.title)).toEqual(["Invoices"]);
  expect(matching(picks, "welcome").map((one) => one.topic)).toEqual([null]);
  expect(matching(picks, "nothing like it")).toEqual([]);
});

test("a topic is found among the pages, or is not", () => {
  const picks = picksOf(list);
  expect(pickOfTopic(picks, "refunds")?.title).toBe("Refunds");
  expect(pickOfTopic(picks, "gone")).toBeUndefined();
});
