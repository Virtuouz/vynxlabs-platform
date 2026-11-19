import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * Resizable, remembered panes (phase 15, P3-5): every divider moves by
 * keyboard, a pane folds and opens again, and sizes survive a reload.
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

test("panes move by keyboard, fold, and are as they were left after a reload", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `panes-${stamp}`,
    name: "Panes",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const link = `/t/${tenant.id}/workspaces/${dev.id}`;
  // Each setting this test makes is the admin's own: forgotten at the end.
  const forget = async () => {
    for (const key of ["split:flow-editor", "split:run-page"]) {
      await call(page, "DELETE", `/me/preferences/${key}`).catch(() => {});
    }
  };
  await forget();

  // ----- The flow editor: the canvas and the step's settings -----
  await page.goto(`${link}/flows/new`);
  const divider = page.getByRole("separator", {
    name: "Resize the canvas and the step's settings",
  });
  await divider.focus();
  const before = Number(await divider.getAttribute("aria-valuenow"));
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(divider).toHaveAttribute("aria-valuenow", String(before - 10));
  // Kept with the member's settings: wait for it to reach the server, then reload.
  await expect
    .poll(async () =>
      (await call(page, "GET", "/me/preferences")).items.map((one: { key: string }) => one.key),
    )
    .toContain("split:flow-editor");
  await page.reload();
  await expect(divider).toHaveAttribute("aria-valuenow", String(before - 10), { timeout: 30_000 });
  // Enter folds the settings away; the rail opens them again.
  await divider.focus();
  await page.keyboard.press("Enter");
  const rail = page.getByRole("button", { name: "Show the step's settings" });
  await expect(rail).toBeVisible();
  await page.reload();
  await expect(rail).toBeVisible({ timeout: 30_000 });
  await rail.click();
  await expect(divider).toBeVisible();

  // ----- The run page: the attempts and the run's details -----
  await call(page, "PUT", `${W}/drafts/hello/greet`, {
    kind: "script",
    schemaVersion: 1,
    body: {
      description: "",
      input: { type: "object" },
      output: { type: "object" },
      timeoutSeconds: 60,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      source: { language: "typescript", code: "export default async () => ({ hi: 1 });\n" },
    },
  });
  const run = (await call(page, "POST", `${W}/test-runs`, { script: "hello/greet", input: {} }))
    .runId as string;
  await page.goto(`${link}/runs/${run}`);
  const side = page.getByRole("separator", { name: "Resize the run's attempts and its details" });
  await side.focus();
  const was = Number(await side.getAttribute("aria-valuenow"));
  await page.keyboard.press("Shift+ArrowRight");
  await expect(side).toHaveAttribute("aria-valuenow", String(was + 10));
  // The input and output tab is in the address too.
  await page.getByRole("tab", { name: /Output|Error/ }).click();
  await expect(page).toHaveURL(/[?&]io=output/);
  await expect
    .poll(async () =>
      (await call(page, "GET", "/me/preferences")).items.map((one: { key: string }) => one.key),
    )
    .toContain("split:run-page");
  await page.reload();
  await expect(side).toHaveAttribute("aria-valuenow", String(was + 10), { timeout: 30_000 });
  await expect(page.getByRole("tab", { name: /Output|Error/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await forget();
  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
