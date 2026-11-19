import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * The first minutes (phase 14, P2-13): an operator makes a tenant and is its
 * first member, with no access grant; a new workspace shows its first steps;
 * a first script runs from a starter in twelve presses or fewer, and the steps
 * check themselves off.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
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

test("a tenant made in the console, its first workspace's steps, and a first run in twelve presses", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);

  // Made from the tenants list; the operator is offered membership, checked already.
  // Opening the console takes a member back to where they were last; the tenants list is the
  // instance's first screen, a click away.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Instance" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Create tenant" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(`First ${stamp}`);
  await dialog.getByLabel("Slug").fill(`first-${stamp}`);
  await expect(dialog.getByLabel("Make me a member, as tenant admin")).toBeChecked();
  await dialog.getByRole("button", { name: "Create tenant" }).click();
  // The new tenant opens, and the operator is inside it as a member: no access grant.
  await expect(page).toHaveURL(/\/t\/[0-9a-f-]{36}$/);
  const tenantId = /\/t\/([0-9a-f-]{36})/.exec(page.url())?.[1] as string;
  await expect(page.getByText(/Operator access as/)).toHaveCount(0);
  const workspace = await call(page, "POST", `/tenants/${tenantId}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });

  // A new workspace shows its first steps, not "nothing needs you".
  const link = `/t/${tenantId}/workspaces/${workspace.id}`;
  await page.goto(`${link}/overview`);
  const steps = page.getByRole("region", { name: "First steps" });
  await expect(steps).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Nothing needs you here")).toHaveCount(0);
  await expectNoAxeViolations(page, "a new workspace's overview");

  // From there to a first successful run: every click, field and key counts.
  let presses = 0;
  const press = async (action: () => Promise<void>) => {
    presses += 1;
    await action();
  };
  await press(() => steps.getByRole("button", { name: "New script" }).click());
  await expect(page).toHaveURL(new RegExp(`${link}/scripts/new$`));
  await press(() => page.getByRole("button", { name: /Total some numbers/ }).click());
  await press(() => page.getByLabel("Path").fill("first/totals"));
  const editor = page.locator(".monaco-editor").first();
  await editor.getByText("z.object").first().waitFor();
  await press(() => editor.locator(".view-lines").click());
  // ⌘↵ saves the draft and runs it; the starter needs no input to succeed.
  await press(() => page.keyboard.press("Control+Enter"));
  const run = page.getByRole("region", { name: "Test pane" });
  await expect(run.getByText("Succeeded").first()).toBeVisible({ timeout: 90_000 });
  expect(presses).toBeLessThanOrEqual(12);

  // The steps check themselves off: a first script, and a first run.
  await page.goto(`${link}/overview`);
  await expect(steps.getByText("2 of 4 done").or(steps.getByText("3 of 4 done"))).toBeVisible({
    timeout: 30_000,
  });
  // The script, never deployed, is in the scripts list as a draft.
  await page.goto(`${link}/scripts`);
  await expect(page.getByText("Draft, never deployed")).toBeVisible();

  await call(page, "POST", `/tenants/${tenantId}/deletion`, { confirm: `first-${stamp}` }).catch(
    () => {},
  );
});
