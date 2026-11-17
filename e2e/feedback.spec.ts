import { expect, type Page, test } from "@playwright/test";
import { signInWithPassword } from "./sign-in.ts";

/**
 * Every write says what it did (phase 14, P2-8): pressing a button that changes
 * something is answered within a second, by a message that names the result,
 * with a way to it when something was made.
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

/** Presses, and expects the page to say `said` within a second. */
async function answered(page: Page, press: () => Promise<void>, said: RegExp) {
  await press();
  await expect(page.getByText(said).first()).toBeVisible({ timeout: 1000 });
}

test("each write is answered within a second, naming what it did", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", { slug: `say-${stamp}`, name: "Say" });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The feedback e2e test",
    roleId: TENANT_ADMIN,
  });
  const ws = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const link = `/t/${tenant.id}/workspaces/${ws.id}`;

  // A secret set, then set again.
  await page.goto(`${link}/secrets`);
  for (const value of ["first-value", "second-value"]) {
    await page.getByRole("button", { name: "Set secret" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("STRIPE_KEY");
    await dialog.getByLabel("Value").fill(value);
    await answered(
      page,
      () => dialog.getByRole("button", { name: "Set secret" }).click(),
      /The secret STRIPE_KEY is set/,
    );
  }

  // The workspace's triggers resumed and paused again: a dev workspace starts paused.
  await page.goto(`${link}/settings`);
  await answered(
    page,
    () => page.getByRole("button", { name: "Resume triggers" }).click(),
    /Triggers in Dev run again/,
  );
  await answered(
    page,
    () => page.getByRole("button", { name: "Pause triggers" }).click(),
    /Triggers in Dev are paused/,
  );

  // A workspace made from the tenant's list, with a way to it.
  await page.goto(`/t/${tenant.id}/workspaces`);
  await page
    .getByRole("button", { name: /Create workspace|New workspace/ })
    .first()
    .click();
  const made = page.getByRole("dialog");
  await made.getByLabel("Name").fill("Second");
  await made.getByLabel("Slug").fill("second");
  await made.getByLabel("Type").selectOption("dev");
  await answered(
    page,
    () => made.getByRole("button", { name: /Create workspace|New workspace/ }).click(),
    /Workspace Second is made/,
  );
  await page.getByRole("link", { name: "Open Second" }).click();
  await expect(page).toHaveURL(/\/workspaces\/[^/]+\/overview$/);

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
