import { firstRowTop, nested, overdraws } from "./measure.ts";
import {
  open,
  type Polish,
  screens,
  setUpPolishTenant,
  tearDownPolishTenant,
  WIDTHS,
  workbenches,
} from "./polish-setup.ts";
import { expect, test } from "./test.ts";

/** The console's polish (phase 16, P4), measured in a browser: where the first row stands (P4-1), what draws over what (P4-7), what sits in what (P4-2), and where a screen scrolls. */

test.describe.configure({ mode: "serial" });

let ctx: Polish;

test.beforeAll(async ({ browser }) => {
  ctx = await setUpPolishTenant(browser, "l");
});

test.afterAll(async () => {
  if (ctx) await tearDownPolishTenant(ctx);
});

test("every workbench's first row starts within 160 px of the top", async () => {
  await ctx.page.setViewportSize({ width: 1440, height: 900 });
  // Every workbench is measured before anything is said, so one over its limit does not hide the others.
  const over: string[] = [];
  for (const [name, path] of workbenches(ctx)) {
    // As a returning member sees it: a description shown on the first visit folds after it.
    // This file no longer follows the recording that used to open every screen first.
    await open(ctx.page, path as string);
    await open(ctx.page, path as string);
    const top = await firstRowTop(ctx.page);
    if (top === null) over.push(`${name} shows no first row`);
    else if (top > 160) over.push(`${name}'s first row is at ${top}`);
  }
  expect(over, "workbenches whose first row is not within 160 px").toEqual([]);
});

/** A2-08: a table's rows, and its definition, scroll in one place, and the page does not. */
test("a table's screen has one scroller, and its page does not scroll", async () => {
  for (const width of [1440, 768, 390]) {
    await ctx.page.setViewportSize({ width, height: 900 });
    const views = [
      ...["rows", "definition"].map((view) => [view, `${ctx.ws}/tables/patients?view=${view}`]),
      ...(ctx.sourceBound ? [["a data source", `${ctx.ws}/sources/erp`]] : []),
    ] as [string, string][];
    for (const [view, address] of views) {
      await open(ctx.page, address);
      const found = await ctx.page.evaluate(() => {
        const main = document.querySelector("main") as HTMLElement;
        const scrollers = [...main.querySelectorAll<HTMLElement>("*")].filter((el) => {
          const y = getComputedStyle(el).overflowY;
          return (y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight + 1;
        });
        return {
          pageScrolls: main.scrollHeight > main.clientHeight + 1,
          sideways: document.documentElement.scrollWidth > innerWidth,
          scrollers: scrollers.length,
        };
      });
      expect(found.pageScrolls, `${view} at ${width}: the page scrolls`).toBe(false);
      expect(found.sideways, `${view} at ${width}: the page scrolls sideways`).toBe(false);
      // A source's list of tables scrolls on its own beside the rows, so it may be the second.
      expect(found.scrollers, `${view} at ${width}: scrollers`).toBeLessThanOrEqual(
        view === "a data source" ? 2 : 1,
      );
    }
  }
});

test("no text draws over what is beside it, at any width", async () => {
  test.setTimeout(300_000);
  for (const width of WIDTHS) {
    await ctx.page.setViewportSize({ width, height: 900 });
    for (const [name, path] of screens(ctx)) {
      await open(ctx.page, path as string);
      expect(await overdraws(ctx.page), `${name} at ${width}px`).toEqual([]);
    }
  }
});

test("no bordered box sits inside another", async () => {
  await ctx.page.setViewportSize({ width: 1440, height: 900 });
  // Every screen is measured before anything is said, so one finding does not hide the next.
  const found: Record<string, string[]> = {};
  for (const [name, path] of screens(ctx)) {
    await open(ctx.page, path as string);
    const boxes = await nested(ctx.page);
    if (boxes.length > 0) found[name as string] = boxes;
  }
  expect(found).toEqual({});
});

test("a flow run's timeline puts each label above its bar and keeps its ticks apart at 390 px", async () => {
  await ctx.page.setViewportSize({ width: 390, height: 900 });
  await open(ctx.page, `${ctx.ws}/runs/${ctx.waitingRun}`);
  const timeline = ctx.page.locator("main .\\@container", { has: ctx.page.locator("ol") }).first();
  await expect(timeline).toBeVisible();
  const labels = await ctx.page.evaluate(() => {
    const root = document.querySelector("main .\\@container ol") as HTMLElement;
    const rows = [...root.querySelectorAll<HTMLElement>("li > button, li > div")].map((row) => {
      const parts = [...row.children].map((part) => part.getBoundingClientRect());
      return { label: parts[0], bar: parts[1] };
    });
    const axis = root.parentElement?.querySelector('[aria-hidden="true"].flex.gap-3');
    const ticks = [...(axis?.querySelectorAll<HTMLElement>("span.absolute") ?? [])]
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0);
    return {
      rows: rows.map((row) => ({ label: row.label?.bottom ?? 0, bar: row.bar?.top ?? 0 })),
      ticks: ticks.map((box) => ({ left: box.left, right: box.right })),
    };
  });
  expect(labels.rows.length).toBeGreaterThan(0);
  // Each label ends where its bar begins: above it, not beside it.
  for (const row of labels.rows) expect(row.label).toBeLessThanOrEqual(row.bar + 1);
  // Only the first and last ticks are named, and they do not touch.
  expect(labels.ticks).toHaveLength(2);
  const [first, last] = labels.ticks as { left: number; right: number }[];
  expect(first?.right as number).toBeLessThan(last?.left as number);
});
