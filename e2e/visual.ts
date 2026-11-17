import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * A screen compared with its reviewed picture. Whatever differs from one run to
 * the next is masked (IDs and other values set in mono) or, when its size
 * changes too, not drawn: times, given one width, and anything a screen marks
 * `data-volatile`, such as the live indicator (`screenshot.css`). A change that is meant is a new picture, made
 * with `pnpm e2e --update-snapshots` and reviewed in the commit that causes it.
 */
export async function snap(page: Page, name: string, options: { fullPage?: boolean } = {}) {
  // Nothing hovered, and the screen's own requests answered.
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 1, size.height - 1);
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  // Soft: one run reports every screen that differs, not just the first.
  await expect.soft(page).toHaveScreenshot(`${name}.png`, {
    stylePath: new URL("./screenshot.css", import.meta.url).pathname,
    mask: [page.locator(".font-mono"), page.locator(".tabular-nums")],
    animations: "disabled",
    caret: "hide",
    fullPage: options.fullPage ?? false,
  });
}

/** No serious or critical accessibility violation on the page as it is now. */
export async function expectNoAxeViolations(page: Page, where: string) {
  // A dialog or menu that is closing is still in the page for its transition: let it go first.
  await page
    .waitForFunction(() => !document.querySelector("[data-ending-style]"), undefined, {
      timeout: 3000,
    })
    .catch(() => {});
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

/**
 * The lists whose description is shown on a first visit and kept behind help
 * after (phase 16, P4-1), by their help key. A picture is taken with each one
 * read, so it does not depend on which spec opened the list first.
 */
const LISTS = [
  "approvals",
  "end-users",
  "end-user-groups",
  "events",
  "flows",
  "published-apps",
  "scripts",
  "service-accounts",
  "triggers",
  "access",
  "groups",
  "members",
  "roles",
  "audit-log",
  "all-members",
  "operators",
  "tenants",
  "workspaces",
  "resources",
  "instance-audit-log",
];

/** Marks every list's description read for the signed-in member. */
export async function readEveryList(page: Page) {
  await page.evaluate(async (keys) => {
    for (const key of keys) {
      await fetch(`/api/v1/me/preferences/seen:${key}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: true }),
      });
    }
  }, LISTS);
  // The console keeps the server's settings in this browser as it loads: loaded once more, it
  // has them before the next screen draws.
  const loaded = page.waitForResponse((response) => response.url().endsWith("/me/preferences"));
  await page.reload();
  await loaded;
  await page.waitForTimeout(200);
}
