import { writeFileSync } from "node:fs";
import { firstRowTop, nested, overdraws } from "./measure.ts";
import {
  NOT_MEASURED,
  open,
  type Polish,
  screens,
  setUpPolishTenant,
  tearDownPolishTenant,
  WIDTHS,
  workbenches,
} from "./polish-setup.ts";
import { test } from "./test.ts";

/** The console's polish (phase 16, P4): the numbers as they stand, recorded for the phase. */

test.describe.configure({ mode: "serial" });

let ctx: Polish;

test.beforeAll(async ({ browser }) => {
  ctx = await setUpPolishTenant(browser, "m");
});

test.afterAll(async () => {
  if (ctx) await tearDownPolishTenant(ctx);
});

/** The numbers as they stand, written beside the results for the phase's record. */
test("the measures are recorded", async () => {
  // Every screen of the navigation, at four widths: more than five minutes since phase 22 M7.
  test.setTimeout(600_000);
  const record: Record<string, unknown> = {};
  await ctx.page.setViewportSize({ width: 1440, height: 900 });
  const tops: Record<string, number | null> = {};
  for (const [name, path] of workbenches(ctx)) {
    await open(ctx.page, path as string);
    tops[name as string] = await firstRowTop(ctx.page);
  }
  record.firstRowTop = tops;
  const drawn: Record<string, string[]> = {};
  for (const width of WIDTHS) {
    await ctx.page.setViewportSize({ width, height: 900 });
    for (const [name, path] of screens(ctx)) {
      await open(ctx.page, path as string);
      const found = await overdraws(ctx.page);
      if (found.length > 0) drawn[`${name} at ${width}`] = found;
    }
  }
  record.overdraws = drawn;
  await ctx.page.setViewportSize({ width: 1440, height: 900 });
  const boxes: Record<string, string[]> = {};
  for (const [name, path] of screens(ctx)) {
    await open(ctx.page, path as string);
    const found = await nested(ctx.page);
    if (found.length > 0) boxes[name as string] = found;
  }
  record.nested = boxes;
  record.notMeasured = NOT_MEASURED;
  writeFileSync(test.info().outputPath("polish.json"), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));
});
