import { MAX_PAGES, PAGE_SIZES, type Page, type PageSize } from "@volvel/manifest";
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

/** How wide each size of side sheet and modal is, in pixels: as the served app draws them. `full` is the window. */
export const SIZE_WIDTH: Record<PageSize, number | undefined> = {
  small: 480,
  medium: 720,
  large: 960,
  xlarge: 1200,
  full: undefined,
};

export const SIZE_NAMES: Record<PageSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xlarge: "Extra large",
  full: "Full",
};

/** The size a side sheet or modal page opens at: left out, medium. */
export const sizeOf = (page: Page): PageSize => page.size ?? "medium";

/** The size whose width is nearest a width in pixels; `full` is taken for anything past the extra large and a half. */
export function snapSize(pixels: number): PageSize {
  let best: PageSize = "small";
  let gap = Number.POSITIVE_INFINITY;
  for (const size of PAGE_SIZES) {
    const width = SIZE_WIDTH[size] ?? 1500;
    if (Math.abs(width - pixels) < gap) {
      gap = Math.abs(width - pixels);
      best = size;
    }
  }
  return best;
}

/** The page with its size set; medium, the default, is left out. */
export function withSize(page: Page, size: PageSize): Page {
  const { size: _size, ...rest } = page;
  return size === "medium" ? rest : { ...rest, size };
}

/** The page made into another kind, keeping what it can: a plain page opens on no record. */
export function withKind(page: Page, kind: PageKind, table: string | undefined): Page {
  const { kind: _kind, record: _record, size: _size, ...rest } = page;
  const next: Page = { ...rest };
  if (kind !== "page") next.kind = kind;
  if (kind === "page") return next;
  if (page.size && (kind === "sheet" || kind === "modal")) next.size = page.size;
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
