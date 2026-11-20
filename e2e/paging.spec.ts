import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * Lists that page (phase 22, M6): a tenant with 250 members. The 250th is past
 * the 200 that the console used to read and stop at, so it is reached two ways:
 * by searching, which the server answers, and by loading more pages.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);
const COUNT = 250;
/** The 250th: its name sorts nowhere near the first page of IDs. */
const last = `person250-${stamp}@paging.example`;

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

test.describe.configure({ mode: "serial" });

let page: Page;
let tenant: { id: string };

test.beforeAll(async ({ browser }) => {
  test.setTimeout(600_000);
  page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  tenant = await call(page, "POST", "/tenants", { slug: `paging-${stamp}`, name: "Paging" });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "Looking for the 250th member of a long list",
    roleId: TENANT_ADMIN,
  });
  // In batches: each new account hashes a password.
  for (let from = 1; from <= COUNT; from += 10) {
    await Promise.all(
      Array.from({ length: Math.min(10, COUNT - from + 1) }, (_, i) =>
        call(page, "POST", `/tenants/${tenant.id}/members`, {
          email: `person${from + i}-${stamp}@paging.example`,
          name: `Person ${from + i}`,
          password: "a-good-long-password",
        }),
      ),
    );
  }
});

test.afterAll(async () => {
  await page.context().close();
});

test("the 250th member is found by searching for them", async () => {
  await page.goto(`/t/${tenant.id}/members`);
  await expect(page.getByText("Showing the first")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("textbox", { name: /Search by email or name/ }).fill(last);
  await expect(page.getByRole("gridcell", { name: last }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Showing the first")).toHaveCount(0);
});

test("the 250th member is reached by loading more pages", async () => {
  await page.goto(`/t/${tenant.id}/members`);
  const more = page.getByRole("button", { name: "Load more" });
  // Fifty to a page, and the operator who made them is a member too: six pages hold them all.
  for (let pages = 0; pages < 10 && (await more.isVisible().catch(() => false)); pages++) {
    await more.click();
    await expect(more).toBeEnabled({ timeout: 30_000 });
  }
  await expect(page.getByRole("gridcell", { name: last }).first()).toBeVisible({ timeout: 30_000 });
});

test("a group's picker finds the 250th by typing, not only the first page", async () => {
  const group = await call(page, "POST", `/tenants/${tenant.id}/groups`, {
    name: `everyone-${stamp}`,
  });
  await page.goto(`/t/${tenant.id}/groups`);
  await page.getByRole("button", { name: "Members" }).first().click();
  const search = page.getByRole("combobox");
  await search.fill(`person250-${stamp}`);
  await expect(page.getByRole("option", { name: new RegExp(last) })).toBeVisible({
    timeout: 30_000,
  });
  expect(group.id).toBeTruthy();
});
