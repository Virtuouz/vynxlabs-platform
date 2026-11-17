import { expect, type Page, test } from "@playwright/test";
import { signInWithPassword } from "./sign-in.ts";
import { expectNoAxeViolations, readEveryList, snap } from "./visual.ts";

/**
 * Wide screens (phase 15, P3-8): from 1920 px the runs list gives each column
 * what it needs, a run page shows its log and what it was given side by side,
 * and an overview takes a third column. And a run page scrolls on a short window.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const stamp = Date.now().toString(36);
const WIDE = { width: 2200, height: 1100 };

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

let page: Page;
let link: string;
let failed: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await (await browser.newContext({ viewport: WIDE })).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  await readEveryList(page);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `wide-${stamp}`,
    name: "Wide",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  link = `/t/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/stock/check`, {
    kind: "script",
    schemaVersion: 1,
    body: {
      description: "",
      input: { type: "object" },
      output: { type: "object" },
      timeoutSeconds: 60,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      source: {
        language: "typescript",
        code:
          "export default async (input: { sku: string }, ctx: { log: { info: (m: string) => void } }) => {\n" +
          "  for (let i = 1; i <= 80; i++) ctx.log.info(`Checked shelf ${i} for ${input.sku}`);\n" +
          '  throw new Error("No stock for " + input.sku);\n};\n',
      },
    },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  for (let i = 0; i < 6; i++) {
    const id = (
      await call(page, "POST", `${W}/runs`, { script: "stock/check", input: { sku: `A-${i}` } })
    ).id;
    failed = id;
  }
  await expect
    .poll(async () => (await call(page, "GET", `${W}/runs/${failed}`)).status, { timeout: 90_000 })
    .toBe("failed");
});

for (const theme of ["light", "dark"] as const) {
  test(`at 2200 px the runs list, a run and the overview use the room, in ${theme}`, async () => {
    await page.setViewportSize(WIDE);
    await page.evaluate((choice) => localStorage.setItem("vx-theme", choice), theme);

    // The runs list with a run open beside it: no column more than twice what it holds.
    await page.goto(`${link}/runs?run=${failed}`);
    const grid = page.getByRole("grid", { name: "Runs" });
    await expect(grid.getByRole("row")).toHaveCount(7, { timeout: 30_000 });
    await page.getByRole("complementary", { name: "The chosen run" }).waitFor();
    const columns = await grid.evaluate((table) => {
      const width = (node: Node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect().width;
      };
      const heads = [...table.querySelectorAll("thead th")];
      const rows = [...table.querySelectorAll("tbody tr")];
      return heads.map((head, index) => ({
        // A column of a set width is sized for its longest value, and does not grow.
        fixed: /(^|\s)w-(\d|\[)/.test(head.className),
        name: head.textContent?.trim() || `column ${index}`,
        width: head.getBoundingClientRect().width,
        content: Math.max(
          width(head),
          ...rows.map((row) => (row.children[index] ? width(row.children[index] as Node) : 0)),
        ),
      }));
    });
    for (const column of columns.filter((one) => !one.fixed)) {
      // A column with room for twice its content, padding aside, is wasting it.
      expect(column.width, `${column.name} at 2200 px`).toBeLessThanOrEqual(
        Math.max(120, 2 * (column.content + 32)),
      );
    }
    if (theme === "light") await expectNoAxeViolations(page, "the runs list at 2200 px");
    await snap(page, `wide-${theme}-runs`);

    // A failed run: its log and what it was given, side by side.
    await page.goto(`${link}/runs/${failed}`);
    const log = page.getByRole("region", { name: "Log", exact: true });
    const given = page.getByRole("tablist", { name: "What it was given and what it gave" });
    await expect(log).toBeVisible({ timeout: 30_000 });
    await expect(given).toBeVisible();
    const [logBox, givenBox] = [await log.boundingBox(), await given.boundingBox()];
    expect(logBox && givenBox && logBox.x + logBox.width <= givenBox.x).toBe(true);
    expect(givenBox && givenBox.y < WIDE.height).toBe(true);
    await snap(page, `wide-${theme}-run`);

    // The overview: a third column.
    await page.goto(`${link}/overview`);
    await page
      .getByRole("region", { name: "First steps" })
      .or(page.locator("main section").first())
      .first()
      .waitFor();
    await snap(page, `wide-${theme}-overview`);
  });
}

test("on a short window a run page scrolls to what is below the fold", async () => {
  await page.setViewportSize({ width: 1440, height: 640 });
  await page.goto(`${link}/runs/${failed}`);
  const given = page.getByRole("tablist", { name: "What it was given and what it gave" });
  await given.waitFor({ timeout: 30_000 });
  await given.scrollIntoViewIfNeeded();
  const box = await given.boundingBox();
  expect(box && box.y >= 0 && box.y + box.height <= 640).toBe(true);
});
