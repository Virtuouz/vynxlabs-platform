import { overdraws } from "./measure.ts";
import { call, open, type Polish, test } from "./polish-setup.ts";
import { expect } from "./test.ts";
import { readEveryList } from "./visual.ts";

/** The console's polish (phase 16, P4; phases 23): what a screen does, rather than where it stands. */

test.describe.configure({ mode: "serial" });

// The tenant is the worker's (polish-setup's `polish` fixture), shared with the other polish specs.
let ctx: Polish;

test.beforeEach(({ polish }) => {
  ctx = polish;
});

/** P4-6: a time is one line, wherever it stands, from 1280 px up. */
test("no time wraps onto a second line at 1280 px or wider", async () => {
  for (const width of [1280, 1440]) {
    await ctx.page.setViewportSize({ width, height: 900 });
    for (const path of [
      `${ctx.ws}/runs`,
      `${ctx.ws}/runs/${ctx.failedRun}`,
      `/t/${ctx.tenant.id}/audit`,
    ]) {
      await open(ctx.page, path);
      const wrapped = await ctx.page.evaluate(() =>
        [...document.querySelectorAll("main time")]
          .filter((time) => {
            const box = time.getBoundingClientRect();
            const line = Number.parseFloat(getComputedStyle(time).lineHeight) || 20;
            return box.width > 0 && box.height > line * 1.5;
          })
          .map((time) => time.textContent),
      );
      expect(wrapped, `${path} at ${width}px`).toEqual([]);
    }
  }
});

/**
 * Phase 23 M5 (POLISH-004, 013): a list's filters have a row of their own. The audit log, on a
 * visit that shows its description, has no filter beside the title and no text over text.
 */
test("the audit log's filters sit under its title and description on a first visit", async () => {
  for (const width of [1440, 390]) {
    await ctx.page.setViewportSize({ width, height: 900 });
    // A member who has not read it: the preference is cleared, here and in the browser. The
    // layout specs, on other workers, read the same member's marks, so a visit of theirs
    // between the clearing and the opening is cleared again.
    await expect(async () => {
      await call(ctx.page, "DELETE", "/me/preferences/seen:audit-log").catch(() => {});
      await ctx.page.evaluate(() => localStorage.removeItem("vx-pref:seen:audit-log"));
      await open(ctx.page, `/t/${ctx.tenant.id}/audit`);
      await expect(ctx.page.locator("main header").first().locator("p")).toBeVisible({
        timeout: 2000,
      });
    }).toPass({ timeout: 30_000 });
    const title = ctx.page.getByRole("heading", { level: 1, name: "Audit log" });
    await expect(title).toBeVisible();
    const header = ctx.page.locator("main header").first();
    await expect(header.locator("p")).toBeVisible();
    const titleBox = await title.boundingBox();
    const controls = header.locator("select, input");
    expect(await controls.count(), "the filters are in the header").toBeGreaterThan(1);
    const tops = await controls.evaluateAll((all) =>
      all
        .filter((el) => (el as HTMLElement).getBoundingClientRect().width > 0)
        .map((el) => el.getBoundingClientRect().top),
    );
    const bottom = (titleBox?.y ?? 0) + (titleBox?.height ?? 0);
    for (const top of tops) expect(top, `a filter at ${width}px`).toBeGreaterThanOrEqual(bottom);
    expect(
      await ctx.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      `sideways at ${width}px`,
    ).toBe(false);
    expect(await overdraws(ctx.page), `text over text at ${width}px`).toEqual([]);
  }
});

/** P4-1: what a list is for is said once, then kept behind help; operator access is one line. */
test("a list says what it is for once, and operator access hides to a mark and comes back", async () => {
  await ctx.page.setViewportSize({ width: 1440, height: 900 });
  const sentence = ctx.page.getByText(/A flow is a graph of steps/);
  // Other workers' visits to Flows may mark it read between the clearing and the opening.
  await expect(async () => {
    await call(ctx.page, "DELETE", "/me/preferences/seen:flows").catch(() => {});
    await ctx.page.evaluate(() => localStorage.removeItem("vx-pref:seen:flows"));
    await open(ctx.page, `${ctx.ws}/flows`);
    await expect(sentence).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await open(ctx.page, `${ctx.ws}/flows`);
  await expect(sentence).toBeHidden();
  await ctx.page.getByRole("button", { name: "About Flows" }).click();
  await expect(ctx.page.getByRole("dialog").getByText(/A flow is a graph of steps/)).toBeVisible();
  await ctx.page.keyboard.press("Escape");
  await readEveryList(ctx.page);

  const strip = ctx.page.getByRole("region", { name: "Operator access" });
  await expect(strip).toContainText("Operator access as tenant_admin until");
  expect((await strip.boundingBox())?.height ?? 99).toBeLessThanOrEqual(40);
  await strip.getByRole("button", { name: "Hide" }).click();
  await expect(strip).toBeHidden();
  await open(ctx.page, `${ctx.ws}/runs`);
  await expect(strip).toBeHidden();
  await ctx.page.getByRole("button", { name: /^Operator access as tenant_admin/ }).click();
  await ctx.page.getByRole("menuitem", { name: "Show the notice" }).click();
  await expect(strip).toBeVisible();
});

/** P4-4: a run that starts while rows are checked waits at the top, and nothing moves under reduced motion. */
test("a run that arrives while rows are checked waits behind a control, and reduced motion moves nothing", async ({
  browser,
}) => {
  await ctx.page.setViewportSize({ width: 1440, height: 900 });
  await open(ctx.page, `${ctx.ws}/runs`);
  const grid = ctx.page.getByRole("grid", { name: "Runs" });
  await grid.getByRole("checkbox").nth(1).check();
  const started = await call(ctx.page, "POST", `${ctx.W}/runs`, {
    script: "stock/check",
    input: {},
  });
  const pill = ctx.page.getByRole("button", { name: /^1 new run$/ });
  await expect(pill).toBeVisible({ timeout: 20_000 });
  const before = await grid.locator("tbody tr[data-row]").count();
  await pill.click();
  await expect(pill).toBeHidden();
  await expect(grid.locator("tbody tr[data-row]")).toHaveCount(before + 1);
  // The run is finished before the worker's next test: a run still queued draws the queue on the Workers screen.
  await expect
    .poll(async () => (await call(ctx.page, "GET", `${ctx.W}/runs/${started.id}`)).status, {
      timeout: 200_000,
    })
    .not.toMatch(/^(queued|running)$/);

  const still = await (
    await browser.newContext({
      reducedMotion: "reduce",
      storageState: await ctx.page.context().storageState(),
    })
  ).newPage();
  await still.goto(`${ctx.ws}/runs`);
  await still.getByRole("grid", { name: "Runs" }).waitFor();
  const moving = async () =>
    still.evaluate(
      () =>
        [...document.querySelectorAll("*")]
          .map((element) => getComputedStyle(element))
          .filter(
            (style) =>
              style.transitionDuration.split(",").some((one) => one.trim() !== "0s") ||
              (style.animationName !== "none" && style.animationDuration !== "0s"),
          ).length,
    );
  await still.getByRole("button", { name: "Row density" }).click();
  await still.getByRole("menu").waitFor();
  expect(await moving(), "with a menu open").toBe(0);
  await still.keyboard.press("Escape");
  await still.getByRole("button", { name: "Search or jump to" }).click();
  await still.getByRole("dialog").waitFor();
  expect(await moving(), "with the palette open").toBe(0);
  await still.context().close();
});

/**
 * P4-5: in production three marks agree, seen without scrolling at every width: the header's
 * filled tag, the switcher's entry, and the amber rule under the header. In dev, none of them.
 * (The roadmap's acceptance is a usability test; this checks what that test would rely on.)
 */
test("production carries three marks that agree, and dev carries none", async () => {
  for (const width of [390, 768, 1440]) {
    await ctx.page.setViewportSize({ width, height: 900 });
    for (const [path, production] of [
      [`${ctx.prodWs}/overview`, true],
      [`${ctx.ws}/overview`, false],
    ] as const) {
      await open(ctx.page, path);
      const header = ctx.page.locator("header").first();
      const tag = header
        .locator(".text-tag")
        .filter({ hasText: production ? /^Production$/ : /^Dev$/ })
        .first();
      await expect(tag, `the header's tag at ${width}px`).toBeInViewport();
      const filled = await tag.evaluate((element) => getComputedStyle(element).backgroundColor);
      if (production) expect(filled, "production's tag is filled").not.toBe("rgba(0, 0, 0, 0)");
      else expect(filled, "dev's tag is outlined").toBe("rgba(0, 0, 0, 0)");
      const rule = ctx.page.locator("[data-production-rule]");
      if (production) await expect(rule, `the rule at ${width}px`).toBeInViewport();
      else await expect(rule).toHaveCount(0);
      await ctx.page.getByRole("button", { name: "Switch workspace" }).click();
      const entry = ctx.page.getByRole("menuitem", { name: /^Main/ });
      await expect(entry).toContainText("Production");
      await expect(ctx.page.getByRole("menuitem", { name: /^Dev/ })).toContainText("Dev");
      await ctx.page.keyboard.press("Escape");
    }
  }
});
