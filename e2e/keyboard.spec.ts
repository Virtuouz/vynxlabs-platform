import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * Core journeys from the keyboard alone (phase 14, P2-12): opening a failed
 * run from the runs list, and giving someone access. Building a flow and
 * editing a row have their own keyboard walks, in flow-editor and data-grid.
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

/** Presses Tab until focus is on `target`, as a person moving through the page does. */
async function tabTo(page: Page, target: () => Promise<boolean>, most = 60) {
  for (let n = 0; n < most; n += 1) {
    if (await target()) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached it");
}

test("a failed run is opened from the runs list, and access is given, from the keyboard alone", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", { slug: `keys-${stamp}`, name: "Keys" });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The keyboard e2e test",
    roleId: TENANT_ADMIN,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
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
        code: 'export default async () => { throw new Error("No warehouse for A-1"); };\n',
      },
    },
  });
  const run = (await call(page, "POST", `${W}/test-runs`, { script: "stock/check", input: {} }))
    .runId as string;
  await expect
    .poll(async () => (await call(page, "GET", `${W}/runs/${run}`)).status, { timeout: 90_000 })
    .toBe("failed");

  // ----- The runs list: Tab to it, arrows to the run, Enter to open it -----
  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/runs`);
  const grid = page.getByRole("grid", { name: "Runs" });
  await expect(grid.getByRole("row").nth(1)).toBeVisible({ timeout: 30_000 });
  await tabTo(page, () => grid.evaluate((element) => element.contains(document.activeElement)));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  // Enter opens the run beside the list, in the address, with why it failed.
  await expect(page).toHaveURL(new RegExp(`[?&]run=${run}`));
  await expect(page.getByText("No warehouse for A-1").first()).toBeVisible({ timeout: 30_000 });

  // ----- Giving access: Tab to Give access, type who, choose where and the role -----
  await call(page, "POST", `/tenants/${tenant.id}/members`, {
    email: `bob-${stamp}@keys.example`,
    name: "Bob Keys",
    password: "a-good-long-password",
  });
  await page.goto(`/t/${tenant.id}/access`);
  const give = page.getByRole("button", { name: "Give access" }).first();
  await expect(give).toBeVisible({ timeout: 30_000 });
  await tabTo(page, () => give.evaluate((element) => element === document.activeElement));
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Give access" });
  await expect(sheet).toBeVisible();
  await expectNoAxeViolations(page, "the give access sheet");
  // Who, found by typing: the server is asked for what is typed.
  await tabTo(page, () =>
    sheet.getByLabel("Who").evaluate((element) => element === document.activeElement),
  );
  await page.keyboard.type("bob-");
  const option = page.getByRole("option", { name: new RegExp(`bob-${stamp}`) });
  await expect(option).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  // Where: the dev workspace. Role: the first one the list offers.
  await tabTo(page, () =>
    sheet.getByLabel("Where").evaluate((element) => element === document.activeElement),
  );
  // A native select chooses by what is typed.
  await page.keyboard.type("Dev");
  await expect(sheet.getByLabel("Where")).toHaveValue(dev.id);
  await page.keyboard.press("Tab");
  await expect(sheet.getByLabel("Role")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await tabTo(page, () =>
    sheet
      .getByRole("button", { name: "Give access" })
      .evaluate((element) => element === document.activeElement),
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByText(new RegExp(`bob-${stamp}@keys\\.example holds .* in Dev`)),
  ).toBeVisible({
    timeout: 15_000,
  });

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});

test("⌘K opens the palette from inside the code editor; g r, / and the sheet work from the keyboard", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `palette-${stamp}`,
    name: "Palette",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const base = `/t/${tenant.id}/workspaces/${dev.id}`;
  // Single keys on, whatever an earlier run left: the setting is kept on the server now.
  await call(page, "DELETE", "/me/preferences/shortcuts.single-key");
  try {
    // Inside the editor, which keeps ⌘K for its own chords.
    await page.goto(`${base}/scripts/new`);
    const editor = page.locator(".monaco-editor").first();
    await editor.locator(".view-lines").waitFor({ timeout: 30_000 });
    await editor.locator(".view-lines").click();
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Go to" });
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();

    // g then r goes to the runs; / searches the list on screen.
    await page.goto(`${base}/overview`);
    await page.locator("main").first().waitFor();
    await page.locator("body").click({ position: { x: 5, y: 500 } });
    await page.keyboard.press("g");
    await page.keyboard.press("r");
    await expect(page).toHaveURL(new RegExp(`${base}/runs`));
    const search = page.locator('main input[type="search"]').first();
    await search.waitFor();
    // The list's shortcut is bound once the screen has drawn: pressed until it is.
    await expect(async () => {
      await page.keyboard.press("/");
      await expect(search).toBeFocused({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    // The sheet, from the account menu, lists the shortcuts and can turn the single keys off.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Your account" }).click();
    await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(sheet.getByText("Search this list")).toBeVisible();
    await expectNoAxeViolations(page, "the keyboard shortcuts");
    await sheet.getByLabel("Single-key shortcuts").uncheck();
    await page.keyboard.press("Escape");
    await page.keyboard.press("g");
    await page.keyboard.press("o");
    await expect(page).toHaveURL(new RegExp(`${base}/runs`));
  } finally {
    // Turned on again, for whoever signs in as the admin next, even when a step failed.
    await call(page, "DELETE", "/me/preferences/shortcuts.single-key").catch(() => {});
  }

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});

test("rows are checked with j and x and run again together, and the palette offers the open run's commands", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  await call(page, "DELETE", "/me/preferences/shortcuts.single-key");
  const tenant = await call(page, "POST", "/tenants", {
    slug: `rows-${stamp}`,
    name: "Rows",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const link = `/t/${tenant.id}/workspaces/${dev.id}`;
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
  await call(page, "POST", `${W}/changes/deploy`, {});
  const runs: string[] = [];
  for (let i = 0; i < 3; i++) {
    runs.push(
      (await call(page, "POST", `${W}/runs`, { script: "hello/greet", input: { n: i } })).id,
    );
  }
  for (const id of runs) {
    await expect
      .poll(async () => (await call(page, "GET", `${W}/runs/${id}`)).status, { timeout: 90_000 })
      .toBe("succeeded");
  }

  // Into the list by Tab, then x, j, x, j, x checks all three.
  await page.goto(`${link}/runs`);
  const grid = page.getByRole("grid", { name: "Runs" });
  await expect(grid.getByRole("row")).toHaveCount(4, { timeout: 30_000 });
  await tabTo(page, () => grid.evaluate((element) => element.contains(document.activeElement)));
  for (const key of ["x", "j", "x", "j", "x"]) await page.keyboard.press(key);
  const bar = page.getByRole("toolbar", { name: "Batch actions" });
  await expect(bar.getByText("3 selected")).toBeVisible();
  await tabTo(page, () =>
    bar
      .getByRole("button", { name: "Run again" })
      .evaluate((element) => element === document.activeElement),
  );
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").getByRole("button", { name: "Run again", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("3 runs started again.")).toBeVisible({ timeout: 30_000 });

  // With a run open, ⌘K offers its own commands first.
  await page.goto(`${link}/runs/${runs[0]}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30_000 });
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Go to" });
  await expect(palette.getByRole("group", { name: "This run" })).toBeVisible();
  await expect(palette.getByRole("option").first()).toContainText("Run again with the same input");
  await expectNoAxeViolations(page, "the palette with a run open");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Run hello\/greet again/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
