import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { firstRowTop, nested, overdraws } from "./measure.ts";
import {
  groupLabel,
  NOT_MEASURED,
  open,
  SCREEN_GROUPS,
  screensOf,
  test,
  WIDTHS,
  WORKBENCH_NAMES,
  workbenchesOf,
} from "./polish-setup.ts";

/**
 * The console's polish (phase 16, P4): the numbers as they stand, recorded for the phase.
 *
 * Phase 32: one test for each group of screens and width, on the worker's own tenant, so they
 * run in parallel. Each writes its part under `<outputDir>/polish/parts/`, and merges every part
 * so far into `<outputDir>/polish/polish.json`, which is what the one test wrote before.
 */

// Each test stands alone on its worker's tenant, so a file's tests spread over the workers.
test.describe.configure({ mode: "parallel" });

type Part = {
  kind: "firstRowTop" | "overdraws" | "nested";
  order: number;
  found: Record<string, unknown>;
};

/** The parts written so far, and the merged record, are one directory; a lock keeps two merges apart. */
function record(outputDir: string, file: string, part: Part) {
  const dir = join(outputDir, "polish");
  const parts = join(dir, "parts");
  mkdirSync(parts, { recursive: true });
  writeFileSync(join(parts, `${file}.json`), JSON.stringify(part));
  const lock = join(dir, "merge.lock");
  for (let tries = 0; ; tries += 1) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      // A lock left by a crash is broken after 20 s.
      if (tries > 200) rmSync(lock, { recursive: true, force: true });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    const all = readdirSync(parts)
      .map((name) => JSON.parse(readFileSync(join(parts, name), "utf8")) as Part)
      .sort((a, b) => a.order - b.order);
    const merged: Record<string, Record<string, unknown>> = {
      firstRowTop: {},
      overdraws: {},
      nested: {},
    };
    for (const one of all) Object.assign(merged[one.kind] as object, one.found);
    const target = join(dir, "polish.json");
    writeFileSync(
      `${target}.tmp`,
      JSON.stringify({ ...merged, notMeasured: NOT_MEASURED }, null, 2),
    );
    renameSync(`${target}.tmp`, target);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/** The numbers as they stand, written beside the results for the phase's record. */
test("the first row's top of every workbench is recorded", async ({ polish }, info) => {
  await polish.page.setViewportSize({ width: 1440, height: 900 });
  const tops: Record<string, number | null> = {};
  for (const [name, path] of workbenchesOf(polish, WORKBENCH_NAMES)) {
    // As a returning member sees it (the layout spec's rule): a description shown on the first
    // visit folds after it, so the number does not depend on which test visited the screen first.
    await open(polish.page, path);
    await open(polish.page, path);
    let top = await firstRowTop(polish.page);
    // A list that has not drawn its rows yet, on a loaded machine, is looked at again.
    for (let again = 0; top === null && again < 3; again += 1) {
      await polish.page.waitForTimeout(1000);
      top = await firstRowTop(polish.page);
    }
    tops[name] = top;
  }
  record(info.project.outputDir, "first-row-top", { kind: "firstRowTop", order: 0, found: tops });
});

SCREEN_GROUPS.forEach((names, group) => {
  WIDTHS.forEach((width, at) => {
    test(`what draws over what is recorded for ${groupLabel(group)} at ${width} px`, async ({
      polish,
    }, info) => {
      await polish.page.setViewportSize({ width, height: 900 });
      const drawn: Record<string, string[]> = {};
      for (const [name, path] of screensOf(polish, names)) {
        await open(polish.page, path);
        const found = await overdraws(polish.page);
        if (found.length > 0) drawn[`${name} at ${width}`] = found;
      }
      record(info.project.outputDir, `overdraws-${width}-${group}`, {
        kind: "overdraws",
        order: 1 + at * 100 + group,
        found: drawn,
      });
    });
  });
  test(`what sits in what is recorded for ${groupLabel(group)}`, async ({ polish }, info) => {
    await polish.page.setViewportSize({ width: 1440, height: 900 });
    const boxes: Record<string, string[]> = {};
    for (const [name, path] of screensOf(polish, names)) {
      await open(polish.page, path);
      const found = await nested(polish.page);
      if (found.length > 0) boxes[name] = found;
    }
    record(info.project.outputDir, `nested-${group}`, {
      kind: "nested",
      order: 1000 + group,
      found: boxes,
    });
  });
});
