import { expect, type Page, test } from "@playwright/test";

/**
 * The flow editor, in a browser (phase 10, milestone 4): a draft is tested
 * from its editor, each step's state shows on its own graph, a step's output
 * is read beside it, an expression shows what it gives against the test, and
 * a removed step comes back with ⌘Z, kept by autosave.
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

const flow = {
  description: "Counts a customer's name",
  nodes: {
    start: {
      type: "trigger",
      trigger: {
        type: "manual",
        input: {
          type: "object",
          properties: { customer: { type: "string", title: "Customer" } },
          required: ["customer"],
        },
      },
    },
    totals: { type: "set", values: { count: "size(trigger.customer)" } },
    check: { type: "set", values: { double: "steps.totals.output.count * 2.0" } },
  },
  edges: [
    { from: "start", to: "totals" },
    { from: "totals", to: "check" },
  ],
};

test("a draft flow is tested, read, previewed and undone without leaving its editor", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  page.on("dialog", (dialog) => {
    errors.push(`a browser dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await page.goto("/");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("All tenants").first().waitFor();

  const tenant = await call(page, "POST", "/tenants", {
    slug: `fe-${stamp}`,
    name: "Flow editing",
  });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The flow editor's e2e test",
    roleId: TENANT_ADMIN,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/orders/count`, {
    kind: "flow",
    schemaVersion: 1,
    body: flow,
  });

  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/flows/edit/orders/count`);
  const canvas = page.getByTestId("flow-canvas");
  await canvas.getByText("totals", { exact: true }).waitFor();

  // Tested from the editor: the steps' states fill in on its own graph.
  await page.getByRole("button", { name: "Test", exact: true }).click();
  const panel = page.getByRole("region", { name: "The test run" });
  await panel.getByLabel("Customer").fill("ada");
  await panel.getByRole("button", { name: "Run a test" }).click();
  const steps = panel.getByRole("list", { name: "Steps of the test" });
  await expect(steps.getByRole("button", { name: /^check/ })).toContainText("Succeeded", {
    timeout: 30_000,
  });
  await expect(canvas.getByText("Succeeded")).toHaveCount(3);
  expect(page.url()).toContain("/flows/edit/orders/count");

  // A step's output, beside its settings; and what an expression gives against the test.
  await steps.getByRole("button", { name: /^totals/ }).click();
  const aside = page.getByRole("complementary", { name: "The chosen step" });
  const last = aside.getByRole("region", { name: "Last test" });
  await expect(last).toContainText("Succeeded");
  await expect(last).toContainText('"count"');
  await expect(aside.getByText("Gives 3", { exact: true })).toBeVisible();
  await aside.getByLabel("Expression").fill("size(trigger.customr)");
  await expect(aside.getByText(/customr/).last()).toBeVisible();
  await aside.getByLabel("Expression").fill("size(trigger.customer) * 10");
  await expect(aside.getByText("Gives 30", { exact: true })).toBeVisible();
  // Undone and redone from outside the field: the step stays chosen, its settings in view.
  await page.getByRole("heading", { name: "Test the draft" }).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(aside.getByLabel("Expression")).not.toHaveValue("size(trigger.customer) * 10");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(aside.getByLabel("Expression")).toHaveValue("size(trigger.customer) * 10");

  // A step removed by mistake comes back with ⌘Z, and the draft keeps it.
  await steps.getByRole("button", { name: /^check/ }).click();
  await aside.getByRole("button", { name: "Remove this step" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(canvas.getByText("check", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("heading", { name: "About this flow" }).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvas.getByText("check", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({
    timeout: 10_000,
  });
  const saved = await call(page, "GET", `${W}/drafts/orders/count`);
  expect(Object.keys(saved.body.nodes).sort()).toEqual(["check", "start", "totals"]);
  expect(saved.body.nodes.totals.values.count).toBe("size(trigger.customer) * 10");

  // With the connection lost, saving says so and tries again, and leaving asks first.
  const draftAddress = `**/api/v1${W}/drafts/orders/count`;
  await page.route(draftAddress, (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(canvas.getByText("check", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Could not save. Trying again…" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "Flows", exact: true }).first().click();
  const leaving = page.getByRole("dialog");
  await expect(leaving).toContainText("Leave without saving?");
  await leaving.getByRole("button", { name: "Stay" }).click();
  expect(page.url()).toContain("/flows/edit/orders/count");
  // Back online, it catches up by itself.
  await page.unroute(draftAddress);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvas.getByText("check", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({
    timeout: 20_000,
  });

  await page.reload();
  await canvas.getByText("check", { exact: true }).waitFor();
  expect(errors).toEqual([]);
});
