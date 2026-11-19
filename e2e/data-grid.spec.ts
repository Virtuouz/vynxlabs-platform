import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * A table of 10,000 rows in the console's grid (phase 14, P2-9): pages follow
 * one another without repeating a row or moving the grid, and a cell is
 * reached, changed and put back from the keyboard alone.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
const call = (page: Page, method: string, path: string, body?: unknown): Promise<any> =>
  page.evaluate(
    async ([method, path, body]) => {
      const response = await fetch(`/api/v1${path}`, {
        method: method as string,
        headers: body ? { "content-type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      if (response.status >= 300) throw new Error(`${method} ${path}: ${response.status} ${text}`);
      return text ? JSON.parse(text) : null;
    },
    [method, path, body] as const,
  );

test("10,000 rows page without repeating or moving, and a cell is changed from the keyboard", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", { slug: `grid-${stamp}`, name: "Grid" });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The data grid e2e test",
    roleId: TENANT_ADMIN,
  });
  const ws = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${ws.id}`;
  await call(page, "PUT", `${W}/resources/stock`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body: { columns: { item: { type: "text" }, held: { type: "integer" } } },
  });
  for (let start = 0; start < 10_000; start += 1000) {
    await call(page, "POST", `${W}/rows/stock`, {
      rows: Array.from({ length: 1000 }, (_, n) => ({
        item: `item-${String(start + n).padStart(5, "0")}`,
        held: (start + n) % 97,
      })),
    });
  }

  await page.goto(`/t/${tenant.id}/workspaces/${ws.id}/tables/stock`);
  const grid = page.getByRole("grid", { name: /stock/i });
  await expect(grid.getByText("item-00000")).toBeVisible({ timeout: 30_000 });
  await expectNoAxeViolations(page, "the table's rows");

  // Pages, one after another: none repeats a row, and the grid does not move.
  // Where the grid sits in the page, whatever has been scrolled.
  const top = () =>
    grid.evaluate((element) => {
      let y = 0;
      for (let at: HTMLElement | null = element; at; at = at.offsetParent as HTMLElement | null) {
        y += at.offsetTop;
      }
      return y;
    });
  const firstTop = await top();
  const seen = new Set<string>();
  for (let n = 0; n < 5; n += 1) {
    const items = await grid
      .locator("tbody tr")
      .evaluateAll((rows) => rows.map((row) => /item-\d+/.exec(row.textContent ?? "")?.[0] ?? ""));
    expect(items).toHaveLength(50);
    for (const item of items) {
      expect(seen.has(item), `${item} shown twice`).toBe(false);
      seen.add(item);
    }
    expect(await top()).toBe(firstTop);
    const next = page.getByRole("button", { name: "Next" });
    await next.click();
    await expect(grid.getByText(`item-${String((n + 1) * 50).padStart(5, "0")}`)).toBeVisible();
  }
  expect(page.url()).toContain("page=");

  // From the keyboard: the grid is one tab stop; arrows move; Enter edits; Escape puts it back.
  const first = grid.locator('[tabindex="0"]');
  await expect(first).toHaveCount(1);
  await first.focus();
  // To the row's first cell, then right along it to "held".
  const headings = await grid.locator("thead tr").first().locator("th").allTextContents();
  const held = headings.findIndex((text) => text.trim() === "held");
  expect(held).toBeGreaterThan(0);
  await page.keyboard.press("Home");
  for (let n = 0; n < held; n += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const editor = grid.getByRole("textbox", { name: "held", exact: true });
  await expect(editor).toBeFocused();
  const before = await editor.inputValue();
  await editor.fill("999");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(page.locator(":focus")).toHaveText(before);
  // Enter again, a new value, Enter to save.
  await page.keyboard.press("Enter");
  await grid.getByRole("textbox", { name: "held", exact: true }).fill("123");
  await page.keyboard.press("Enter");
  await expect(grid.getByRole("textbox", { name: "held", exact: true })).toHaveCount(0);
  await expect(page.locator(":focus")).toHaveText("123");

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
