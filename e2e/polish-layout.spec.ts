import { firstRowTop, nested, overdraws } from "./measure.ts";
import {
  groupLabel,
  open,
  SCREEN_GROUPS,
  screensOf,
  test,
  WIDTHS,
  WORKBENCH_NAMES,
  workbenchesOf,
} from "./polish-setup.ts";
import { expect } from "./test.ts";

/**
 * The console's polish (phase 16, P4), measured in a browser: where the first row stands (P4-1), what draws over what (P4-7), what sits in what (P4-2), and where a screen scrolls.
 *
 * Phase 32: no test waits for another. Each runs on its worker's own tenant, and the long ones
 * (every screen at every width) are one test for each group of screens and width.
 */

// Each test stands alone on its worker's tenant, so a file's tests spread over the workers.
test.describe.configure({ mode: "parallel" });

test("every workbench's first row starts within 160 px of the top", async ({ polish }) => {
  await polish.page.setViewportSize({ width: 1440, height: 900 });
  // Every workbench is measured before anything is said, so one over its limit does not hide the others.
  // As a returning member sees it: a description shown on the first visit folds after it. The
  // behaviour spec, on another worker, clears that mark for the same operator now and then, so
  // a workbench that is over is opened twice more before it is said.
  const over: string[] = [];
  for (const [name, path] of workbenchesOf(polish, WORKBENCH_NAMES)) {
    let said = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await open(polish.page, path);
      await open(polish.page, path);
      const top = await firstRowTop(polish.page);
      said = "";
      if (top === null) said = `${name} shows no first row`;
      else if (top > 160) said = `${name}'s first row is at ${top}`;
      if (!said) break;
    }
    if (said) over.push(said);
  }
  expect(over, "workbenches whose first row is not within 160 px").toEqual([]);
});

/** A2-08: a table's rows, and its definition, scroll in one place, and the page does not. */
for (const width of [1440, 768, 390]) {
  test(`a table's screen has one scroller, and its page does not scroll, at ${width} px`, async ({
    polish,
  }) => {
    await polish.page.setViewportSize({ width, height: 900 });
    const views = [
      ...["rows", "definition"].map((view) => [view, `${polish.ws}/tables/patients?view=${view}`]),
      ...(polish.sourceBound ? [["a data source", `${polish.ws}/sources/erp`]] : []),
    ] as [string, string][];
    for (const [view, address] of views) {
      await open(polish.page, address);
      const found = await polish.page.evaluate(() => {
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
  });
}

SCREEN_GROUPS.forEach((names, group) => {
  for (const width of WIDTHS) {
    test(`no text draws over what is beside it, at ${width} px, on ${groupLabel(group)}`, async ({
      polish,
    }) => {
      await polish.page.setViewportSize({ width, height: 900 });
      for (const [name, path] of screensOf(polish, names)) {
        await open(polish.page, path);
        expect(await overdraws(polish.page), `${name} at ${width}px`).toEqual([]);
      }
    });
  }
});

/**
 * Phase 30 walk-fix 24: a list's row actions (kit/ListCollection `rowActions`: All members,
 * Operators, Database locations) wrap inside their cell; none reaches past the table's edge.
 */
for (const width of WIDTHS) {
  test(`a list's row actions stay inside the table at ${width} px`, async ({ polish }) => {
    const over: string[] = [];
    await polish.page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/instance/members",
      "/instance/operators",
      "/instance/database-locations",
    ]) {
      await open(polish.page, path);
      const clipped = await polish.page.evaluate(() => {
        const edge = (
          document.querySelector("main table") as HTMLElement | null
        )?.parentElement?.getBoundingClientRect().right;
        if (edge === undefined) return [];
        return (
          [...document.querySelectorAll<HTMLElement>("[data-row-actions] button")]
            // Past the table's edge, or past the window: at first view, with no sideways scroll to find it (phase 30 re-walk A).
            .filter((button) => {
              const right = button.getBoundingClientRect().right;
              return right > edge + 1 || right > window.innerWidth + 1;
            })
            .map((button) => button.textContent ?? "")
        );
      });
      if (clipped.length > 0) over.push(`${path} at ${width}: ${clipped.join(", ")}`);
    }
    expect(over, "row actions that run past the table").toEqual([]);
  });
}

/**
 * Phase 31 (cols): at 390 px a table's Definition tab shows each column's rules and default under
 * its name, and its "Actions for <column>" menu is in the window at first view, no sideways scroll.
 */
test("a table's definition shows each column's rules and actions at first view at 390 px", async ({
  polish,
}) => {
  await polish.page.setViewportSize({ width: 390, height: 900 });
  await open(polish.page, `${polish.ws}/tables/patients?view=definition`);
  const found = await polish.page.evaluate(() => {
    const menus = [...document.querySelectorAll<HTMLElement>('main [aria-label^="Actions for "]')];
    return {
      menus: menus.length,
      outside: menus
        .filter((one) => one.getBoundingClientRect().right > window.innerWidth + 1)
        .map((one) => one.getAttribute("aria-label")),
      stacks: document.querySelectorAll("main [data-column-stack]").length,
    };
  });
  expect(found.stacks, "columns that stack their rules").toBeGreaterThan(0);
  expect(found.menus, "a column's actions menu").toBeGreaterThan(0);
  expect(found.outside, "menus past the window").toEqual([]);
});

/**
 * Phase 30 re-walk E: a documentation page whose title is one long unbroken name
 * (`@volvel/widgets/action`) breaks inside it at 390 px, and the page does not scroll sideways.
 */
test("a documentation page with a long unbroken title does not scroll sideways at 390 px", async ({
  polish,
}) => {
  await polish.page.setViewportSize({ width: 390, height: 900 });
  const wide: string[] = [];
  for (const path of [
    "/docs/develop/reference/sdk/widgets-action",
    "/docs/develop/reference/sdk/widgets-page",
  ]) {
    await open(polish.page, path);
    const over = await polish.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (over > 0) wide.push(`${path}: ${over}px`);
  }
  expect(wide, "documentation pages wider than the window").toEqual([]);
});

SCREEN_GROUPS.forEach((names, group) => {
  test(`no bordered box sits inside another, on ${groupLabel(group)}`, async ({ polish }) => {
    await polish.page.setViewportSize({ width: 1440, height: 900 });
    // Every screen is measured before anything is said, so one finding does not hide the next.
    const found: Record<string, string[]> = {};
    for (const [name, path] of screensOf(polish, names)) {
      await open(polish.page, path);
      const boxes = await nested(polish.page);
      if (boxes.length > 0) found[name] = boxes;
    }
    expect(found).toEqual({});
  });
});

test("a flow run's timeline puts each label above its bar and keeps its ticks apart at 390 px", async ({
  polish,
}) => {
  await polish.page.setViewportSize({ width: 390, height: 900 });
  await open(polish.page, `${polish.ws}/runs/${polish.waitingRun}`);
  const timeline = polish.page
    .locator("main .\\@container", { has: polish.page.locator("ol") })
    .first();
  await expect(timeline).toBeVisible();
  const labels = await polish.page.evaluate(() => {
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
