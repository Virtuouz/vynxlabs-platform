import { signInAs } from "./as.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * What the API already lets someone change is changed from the screens (phase 22, M8): a
 * workspace and a tenant are renamed, a table is renamed and described where it is edited, and
 * a change to its definition is taken back with the undo button. Each is read back from the
 * API, so a name that only looked changed would fail.
 */

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

test("a workspace, a tenant and a table are renamed from their screens, and a table change is undone @data @instance", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  await signInAs(page, "operator");
  const tenant = await call(page, "POST", "/tenants", { slug: `rename-${stamp}`, name: "Before" });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The rename e2e test",
    roleId: TENANT_ADMIN,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "shop",
    name: "Shop",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const table = (body: object) => ({
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body,
  });
  await call(
    page,
    "PUT",
    `${W}/resources/stock`,
    table({ columns: { item: { type: "text" }, held: { type: "integer" } } }),
  );

  // A workspace: its name sits in the settings, and is saved from the bar.
  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/settings`);
  await page.getByLabel("Workspace name").fill("Storefront");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => (await call(page, "GET", W)).name).toBe("Storefront");

  // A tenant: from the overview's header.
  await page.goto(`/t/${tenant.id}`);
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("After");
  await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
  await expect
    .poll(async () => (await call(page, "GET", `/tenants/${tenant.id}`)).name)
    .toBe("After");

  // A table: described, then a column renamed and taken back.
  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/tables/stock?view=definition`);
  await page.getByRole("button", { name: "Describe the table" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("What is on the shelves.");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect
    .poll(async () => (await call(page, "GET", `${W}/resources/stock`)).body.description)
    .toBe("What is on the shelves.");

  await page.getByRole("button", { name: "Rename", exact: true }).nth(1).click();
  await page.getByRole("dialog").getByRole("textbox").fill("on_hand");
  await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
  await expect
    .poll(async () => Object.keys((await call(page, "GET", `${W}/resources/stock`)).body.columns))
    .toContain("on_hand");
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect
    .poll(async () => Object.keys((await call(page, "GET", `${W}/resources/stock`)).body.columns))
    .toContain("held");

  // A table is renamed through a draft, which says where to deploy it.
  await page.getByRole("button", { name: "Rename table" }).click();
  await page.getByRole("dialog").getByLabel("Path").fill("inventory");
  await page.getByRole("dialog").getByRole("button", { name: "Save as a draft" }).click();
  await expect(page.getByText("A draft renames stock to inventory.")).toBeVisible();
});
