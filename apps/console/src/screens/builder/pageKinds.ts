import { MAX_PAGES, type Page } from "@volvel/manifest";
import type { PageKind } from "./contract.ts";
import { slug } from "./data.ts";

/** What each kind of page is called, as the Pages list and the Page type menu say it. */
export const KIND_NAMES: Record<PageKind, string> = {
  page: "Page",
  record: "Record page",
  sheet: "Side sheet",
  modal: "Modal",
};

export const KIND_LINE =
  "Record pages, side sheets and modals open on one record, passed in by whatever opened them.";

export const kindOf = (page: Page): PageKind => page.kind ?? "page";

/** "Money — Page", "Invoice detail — Side sheet". */
export const pageLine = (page: Page): string => `${page.title} — ${KIND_NAMES[kindOf(page)]}`;

/** Whether the page is in the app's menu: only a plain page is. */
export const inMenu = (page: Page): boolean => kindOf(page) === "page";

/** How wide a side sheet and a modal are drawn while building, in pixels: as the served app draws them. */
export const SHEET_WIDTH = 480;
export const MODAL_WIDTH = 560;

/** The page made into another kind, keeping what it can: a plain page opens on no record. */
export function withKind(page: Page, kind: PageKind, table: string | undefined): Page {
  const { kind: _kind, record: _record, ...rest } = page;
  const next: Page = { ...rest };
  if (kind !== "page") next.kind = kind;
  if (kind === "page") return next;
  const keep = page.record?.table ?? table;
  if (keep) next.record = { table: keep };
  return next;
}

/** A page's id, made from its name and unique among the app's pages. */
export function uniquePageId(pages: readonly Page[], title: string): string {
  const base = slug(title).replace(/^[^a-z]+/, "") || "page";
  let id = base;
  for (let count = 2; pages.some((one) => one.id === id); count += 1) id = `${base}-${count}`;
  return id;
}

export const canAddPage = (pages: readonly Page[]): boolean => pages.length < MAX_PAGES;

/** The pages with one moved a place earlier or later. */
export function movedPage(pages: readonly Page[], id: string, by: -1 | 1): Page[] {
  const from = pages.findIndex((one) => one.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= pages.length) return [...pages];
  const next = [...pages];
  const [taken] = next.splice(from, 1);
  if (taken) next.splice(to, 0, taken);
  return next;
}
