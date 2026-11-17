import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * A screen compared with its reviewed picture. Whatever differs from one run to
 * the next is masked: times, IDs and other values set in mono, and anything a
 * screen marks `data-volatile`. A change that is meant is a new picture, made
 * with `pnpm e2e --update-snapshots` and reviewed in the commit that causes it.
 */
export async function snap(page: Page, name: string) {
  // Nothing hovered, and the screen's own requests answered.
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 1, size.height - 1);
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    mask: [
      page.locator("time"),
      page.locator("[data-volatile]"),
      page.locator(".font-mono"),
      page.locator(".tabular-nums"),
    ],
    animations: "disabled",
    caret: "hide",
    fullPage: false,
  });
}

/** No serious or critical accessibility violation on the page as it is now. */
export async function expectNoAxeViolations(page: Page, where: string) {
  const result = await new AxeBuilder({ page })
    // Colour contrast is checked against the tokens by their own test, for both themes.
    .disableRules(["color-contrast"])
    .analyze();
  const serious = result.violations
    .filter((one) => one.impact === "serious" || one.impact === "critical")
    .map(
      (one) =>
        `${one.id}: ${one.help} (${one.nodes
          .map((node) => node.target.join(" "))
          .slice(0, 3)
          .join(" | ")})`,
    );
  expect(serious, `accessibility violations on ${where}`).toEqual([]);
}
