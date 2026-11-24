import { signInAs } from "./as.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * The script editor, in a browser (phase 12, milestone 2): a new script opens
 * with no errors in its starter, typing its path keeps the code's undo history,
 * and ⌘↵ with the code focused saves, runs, and shows the run beside it. The
 * tab's title says what is open, and the first Tab on a page skips to its content.
 */

const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
const call = (page: Page, method: string, path: string, body?: unknown): Promise<any> =>
  page.evaluate(
    async ([method, path, body]) => {
      // A draft save names the draft it saw: its revision now, or none when there is none.
      if (
        method === "PUT" &&
        String(path).includes("/drafts/") &&
        body &&
        typeof body === "object" &&
        !("revision" in body) &&
        !("create" in body)
      ) {
        const seen = await fetch(`/api/v1${path}`);
        if (seen.ok) body = { ...body, revision: (await seen.json()).revision };
      }
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

test("a new script has no errors, keeps its undo history, and runs with ⌘↵ from the code @builder", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  page.on("dialog", (dialog) => {
    errors.push(`a browser dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await signInAs(page, "operator");

  const tenant = await call(page, "POST", "/tenants", {
    slug: `se-${stamp}`,
    name: "Script editing",
  });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The script editor's e2e test",
    roleId: TENANT_ADMIN,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });

  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/scripts/new`);
  const editor = page.locator(".monaco-editor").first();
  await editor.getByText("z.object").first().waitFor();

  // The starter checks clean against the SDK's own types, zod included.
  // TypeScript works in a worker: give it time to say something before reading nothing.
  await page.waitForTimeout(4000);
  await expect(editor.locator(".squiggly-error")).toHaveCount(0);

  // A line typed, then a path typed: the code's undo history survives the path.
  await editor.locator(".view-lines").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("//note");
  await expect(editor.getByText("//note")).toBeVisible();
  await page.getByLabel("Path").fill("hello/greet");
  await editor.locator(".view-lines").click();
  await page.keyboard.press("Control+z");
  await expect(editor.getByText("//note")).toHaveCount(0);

  // A run's input is checked against the script's schema (SCR-05), so the starter's required name is
  // given, and sent with the form's own button: ⌘↵ runs again with the last input sent (the first
  // run also saves the draft).
  const run = page.getByRole("region", { name: "Test pane" });
  await run.getByLabel("Name").fill("Ada");
  await run.getByRole("button", { name: "Save and run" }).click();
  await run.getByRole("tablist", { name: "About this run" }).waitFor();
  await expect(run.getByText("Succeeded").first()).toBeVisible({ timeout: 60_000 });
  // ⌘↵ with the code focused saves the draft and runs it, and the run shows beside the code.
  await editor.locator(".view-lines").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("//again");
  const lines = await editor.locator(".view-line").count();
  const started = page.waitForResponse(
    (response) => response.url().endsWith("/test-runs") && response.request().method() === "POST",
  );
  await page.keyboard.press("Control+Enter");
  // ⌘↵ starts a second run, with the input remembered, and it succeeds.
  const second = (await (await started).json()).runId as string;
  expect(second).toBeTruthy();
  await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 15_000 });
  await expect
    .poll(
      async () =>
        (await call(page, "GET", `/tenants/${tenant.id}/workspaces/${dev.id}/runs/${second}`))
          .status,
      { timeout: 60_000 },
    )
    .toBe("succeeded");
  await expectNoAxeViolations(page, "the script editor with a run");
  await expect(page).toHaveURL(/\/scripts\/edit\/hello\/greet$/);
  await expect(run.getByText("Succeeded").first()).toBeVisible({ timeout: 60_000 });
  // The code has most of the width, and its result is in view beside it, not below the fold.
  const codeBox = await editor.boundingBox();
  const runBox = await run.boundingBox();
  const width = page.viewportSize()?.width ?? 1;
  expect((codeBox?.width ?? 0) / width).toBeGreaterThanOrEqual(0.55);
  expect(runBox && codeBox && runBox.x > codeBox.x + codeBox.width - 1).toBe(true);
  expect((runBox?.y ?? 9999) < (page.viewportSize()?.height ?? 0)).toBe(true);
  // The key ran the script; Monaco did not also insert a line, as it does with Ctrl+Enter by default.
  expect(await editor.locator(".view-line").count()).toBe(lines);
  // The tab says what is open, and the first save, which only refines the address, kept focus in the code.
  await expect(page).toHaveTitle(/^hello\/greet · Scripts · Dev · /);
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest(".monaco-editor"))),
  ).toBe(true);

  // A change not yet saved holds the page: leaving asks first. Then the draft saves itself.
  await editor.locator(".view-lines").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("//later");
  // The breadcrumb leads back to the list.
  await page
    .getByRole("navigation", { name: "Where you are" })
    .getByRole("link", { name: "Scripts" })
    .click();
  const leaving = page.getByRole("dialog");
  await expect(leaving).toContainText("Leave without saving?");
  await leaving.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(/\/scripts\/edit\/hello\/greet$/);
  await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 15_000 });
  const saved = await call(
    page,
    "GET",
    `/tenants/${tenant.id}/workspaces/${dev.id}/drafts/hello/greet`,
  );
  expect(saved.body.source.code).toContain("//later");

  // A new page: the first Tab reaches the skip link, which goes to the content.
  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/runs`);
  await expect(page).toHaveTitle(/^Runs · Dev · /);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();

  expect(errors).toEqual([]);
});
