import { mkdirSync } from "node:fs";
import { signInWithPassword } from "./sign-in.ts";
import { type Browser, expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * Documentation (phase 20), walked in a browser: help beside every screen,
 * what a column is for on its heading, a page written and deployed from the
 * console, and a docs app read by someone who is not signed in, with scripts
 * and without.
 *
 * Pictures of each step are written to `e2e/results/documentation/`, to be
 * looked at. They are not compared with reviewed ones.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const stamp = Date.now().toString(36);
const SHOTS = new URL("./results/documentation/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: `${SHOTS}${name}.png`, fullPage, animations: "disabled" });

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

const text = (frontmatter: string, body: string) => `---\n${frontmatter}\n---\n\n${body}`;

const PAGES: Record<string, string> = {
  "handbook/index": text(
    "title: Shop handbook\ndescription: How the shop runs, for everyone who works in it.\npages: [support]",
    "Start with [refunds](support/refunds), or read [what we call things](support/refunds#words).\n",
  ),
  "handbook/support/index": text(
    "title: Customer support\npages: [refunds, returns]",
    "What we do when a customer writes in.\n",
  ),
  "handbook/support/refunds": text(
    [
      "title: Refund an order",
      "description: Full and partial refunds, and who may give them.",
      "topic: support-refunds",
      "about:",
      "  - table: orders",
      "extends: [data-tables]",
      "terms:",
      "  - id: rma",
      "    term: RMA",
      "    aliases: [return authorisation]",
      "    short: A return authorisation, issued before a refund.",
    ].join("\n"),
    [
      "# Before you start",
      "",
      "Ask for the :term[RMA]{id=rma} first. The :term[status]{table=orders column=status} column says where the order is.",
      "",
      ":::alert[Mind the limit]{type=warning}",
      "A refund over 500 needs a second person.",
      ":::",
      "",
      ":::tabs",
      "::::tab{label=Card}",
      "Refund to the card it was paid with.",
      "::::",
      "::::tab{label=Cash}",
      "Refund at the till, and keep the receipt.",
      "::::",
      ":::",
      "",
      "## Words",
      "",
      "| Word | Means |",
      "| --- | --- |",
      "| RMA | A return authorisation |",
      "",
      "See [returns](returns).",
    ].join("\n"),
  ),
  "handbook/support/returns": text("title: Returns", "Parcels come back on Tuesdays.\n"),
};

interface Setup {
  tenant: string;
  slug: string;
  dev: string;
}

async function signedIn(browser: Browser, width = 1440, height = 900): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  return page;
}

let made: Setup;

test.describe.configure({ mode: "serial" });

test("a workspace is given a table that says what its columns hold, and a handbook about it", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const page = await signedIn(browser);
  const slug = `docs-${stamp}`;
  const tenant = await call(page, "POST", "/tenants", { slug, name: "Docs", addCreator: true });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/orders`, {
    kind: "table",
    schemaVersion: 1,
    body: {
      description: "What customers bought.",
      columns: {
        number: { type: "text", required: true, description: "The number printed on the order." },
        status: { type: "text", description: "Where the order is in its life." },
        total: { type: "number" },
      },
    },
  });
  for (const [path, source] of Object.entries(PAGES)) {
    await call(page, "PUT", `${W}/drafts/${path}`, {
      kind: "doc",
      schemaVersion: 1,
      body: { source },
    });
  }
  await call(page, "PUT", `${W}/drafts/help`, {
    kind: "app",
    schemaVersion: 1,
    body: { title: "Shop handbook", docs: "handbook" },
  });
  const deployed = await call(page, "POST", `${W}/changes/deploy`, {});
  expect(deployed.applied.length).toBeGreaterThanOrEqual(6);
  // Open to anyone: bound once the app is there to bind at.
  await call(page, "PUT", `${W}/drafts/bindings/help`, {
    kind: "binding",
    schemaVersion: 1,
    body: { role: "portal_user", principal: { type: "anonymous" }, resource: "help" },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  await call(page, "POST", `${W}/rows/orders`, {
    rows: [
      { number: "A-1", status: "open", total: 40 },
      { number: "A-2", status: "refunded", total: 12 },
    ],
  });
  made = { tenant: tenant.id, slug, dev: dev.id };
  await page.context().close();
});

test("a screen has help beside it on F1, with the team's own notes, and nothing is fetched from outside", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const page = await signedIn(browser);
  const outside: string[] = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (host !== "localhost" && host !== "127.0.0.1") outside.push(request.url());
  });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));

  await page.goto(`/t/${made.tenant}/workspaces/${made.dev}/tables/orders`);
  const grid = page.getByRole("grid", { name: "Rows of orders" });
  await expect(grid.getByText("A-2")).toBeVisible({ timeout: 30_000 });

  // What a column holds is behind its heading.
  await grid.getByRole("button", { name: "About status" }).click();
  await expect(page.getByText("Where the order is in its life.")).toBeVisible();
  await shot(page, "01-column-description");
  await page.keyboard.press("Escape");
  // The pages that document the table are listed on its screen.
  await expect(
    page
      .getByRole("region", { name: "Documentation" })
      .getByRole("link", { name: /Refund an order/ }),
  ).toBeVisible();

  // Help, from the keyboard.
  await page.keyboard.press("F1");
  const help = page.getByRole("complementary", { name: "Help" });
  await expect(help.getByRole("heading", { name: "Tables" })).toBeVisible();
  await expect(help).toHaveAttribute("data-help-panel", "docked");
  await expect(help.getByText(/A table holds rows the workspace owns/)).toBeVisible();
  const team = help.getByRole("region", { name: "From your team" });
  await expect(team.getByRole("link", { name: /Refund an order/ })).toBeVisible();
  // The work is still there beside it, and in use.
  await expect(grid).toBeVisible();
  await shot(page, "02-help-docked");
  await expectNoAxeViolations(page, "a table with the help beside it");

  // It is searched, and a result opens inside it.
  await help.getByRole("searchbox", { name: "Search the help" }).fill("approval");
  await help
    .getByRole("list", { name: "Pages found" })
    .getByRole("button", { name: /^Approvals\s*Flows waiting/ })
    .click();
  await expect(help.getByRole("heading", { name: /Approvals/ })).toBeVisible();
  await help.getByRole("button", { name: "Back to the help for this page" }).click();
  await expect(help.getByRole("heading", { name: "Tables" })).toBeVisible();

  // It follows to another screen, and Escape closes it from inside.
  await page.goto(`/t/${made.tenant}/workspaces/${made.dev}/runs`);
  await expect(page.getByRole("button", { name: "Help for this page" })).toBeVisible();
  await page.locator("#main").focus();
  await page.keyboard.press("F1");
  await expect(help.getByRole("heading", { name: "Runs" })).toBeVisible();
  await help.getByRole("heading", { name: "Runs" }).press("Escape");
  await expect(help).toHaveCount(0);

  // Narrower, it lies over the edge. On a phone it takes the screen.
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.getByRole("button", { name: "Help for this page" }).click();
  await expect(help).toHaveAttribute("data-help-panel", "over");
  await shot(page, "03-help-over");
  await page.setViewportSize({ width: 390, height: 780 });
  await expect(help).toHaveAttribute("data-help-panel", "full");
  await expect(help.getByRole("heading", { name: "Runs" })).toBeVisible();
  await shot(page, "04-help-phone");
  await help.getByRole("button", { name: "Close help" }).click();

  // The reference is in the help too, written from the code.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(
    `/t/${made.tenant}/workspaces/${made.dev}/runs?help=reference/errors%23draft_changed`,
  );
  await expect(help.getByRole("heading", { name: "Error codes" })).toBeVisible();
  await expect(help.getByText(/Nothing was overwritten/)).toBeVisible();
  await expect(page).toHaveURL(/\/runs$/);
  await shot(page, "05-help-reference");

  expect(outside, "requests to somewhere other than the instance").toEqual([]);
  expect(failures, "errors thrown in the page").toEqual([]);
  await page.context().close();
});

test("a page is read, written with a live preview, checked as it is typed, and deployed from the console", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = await signedIn(browser, 1500, 950);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const W = `/t/${made.tenant}/workspaces/${made.dev}`;

  await page.goto(`${W}/docs`);
  await expect(page.getByRole("heading", { level: 1, name: "Documentation" })).toBeVisible();
  const tree = page.getByRole("tree", { name: "Pages" });
  await tree.getByRole("treeitem", { name: "Refund an order" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Refund an order" })).toBeVisible();
  // A term means what its writer may know: the team's own, and the column's.
  await page.getByRole("button", { name: "RMA", exact: true }).first().click();
  await expect(page.getByText("A return authorisation, issued before a refund.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "status", exact: true }).click();
  await expect(page.getByText("Where the order is in its life.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: "Cash" })).toBeVisible();
  await shot(page, "06-docs-reader", true);
  await expectNoAxeViolations(page, "the Documentation section");

  // The editor: Monaco, the page as it is served, and its problems.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 30_000 });
  const preview = page.getByRole("region", { name: "The page as it will be served" });
  await expect(preview.getByRole("heading", { name: "Refund an order" })).toBeVisible();
  await expect(preview.locator(".vd-alert-warning")).toContainText("A refund over 500");
  await expect(page.getByText("This page would deploy as it is.")).toBeVisible();
  await shot(page, "07-editor");

  // Typed at the end: a link that leads nowhere. It is said at once, on its line.
  await page
    .locator(".monaco-editor textarea, .monaco-editor .native-edit-context")
    .first()
    .focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\nAnd [a page that is not there](nowhere).\n");
  const problems = page.getByRole("region", { name: "Problems" });
  await expect(problems.getByText("1 problem")).toBeVisible();
  await expect(problems.getByRole("button")).toContainText('The link to "nowhere" leads nowhere');
  // Undo takes it back, a step at a time as Monaco keeps them, and Redo makes it again.
  const fine = page.getByText("This page would deploy as it is.");
  for (let step = 0; step < 20 && (await fine.count()) === 0; step++) {
    await page.getByRole("button", { name: /^Undo/ }).click();
  }
  await expect(fine).toBeVisible();
  for (let step = 0; step < 20 && (await problems.getByText("1 problem").count()) === 0; step++) {
    await page.getByRole("button", { name: /^Redo/ }).click();
  }
  await expect(problems.getByText("1 problem")).toBeVisible();
  await expect(page.locator(".monaco-editor .squiggly-error").first()).toBeVisible();
  await expect(preview.getByText("And a page that is not there.")).toBeVisible();
  await shot(page, "08-editor-problem");

  // Mended, saved with the keyboard, and deployed by name.
  // Undone, back to the page as it was opened, however the editor closed the brackets.
  for (let i = 0; i < 60; i++) await page.keyboard.press("Control+z");
  await expect(page.getByText("This page would deploy as it is.")).toBeVisible();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\nExchanges are the same, the other way round.\n");
  await expect(page.getByText("This page would deploy as it is.")).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(page.getByText(/Saved as a draft/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Draft · not deployed").first()).toBeVisible();
  // Before it is deployed its writers see it in the app itself, at an address nobody else reaches.
  const previewAt = await page
    .getByRole("link", { name: "Preview with drafts" })
    .getAttribute("href");
  expect(previewAt).toContain("/help/_draft/support/refunds");
  const preview2 = await page.context().newPage();
  await preview2.goto(previewAt as string);
  await expect(preview2.getByRole("status")).toContainText(
    "A preview, with the workspace's drafts.",
  );
  await expect(preview2.getByText("Exchanges are the same, the other way round.")).toBeVisible();
  await shot(preview2, "08b-draft-preview", true);
  await preview2.close();
  const stranger = await (await browser.newContext()).newPage();
  expect((await stranger.goto(previewAt as string))?.status()).toBe(404);
  // What is deployed does not have the change yet.
  await stranger.goto((previewAt as string).replace("/_draft/", "/"));
  await expect(stranger.getByRole("heading", { level: 1, name: "Refund an order" })).toBeVisible();
  await expect(stranger.getByText("Exchanges are the same")).toHaveCount(0);
  await stranger.context().close();

  // And beside what is deployed, in the editor.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Compare with deployed" }).click();
  await expect(page.getByRole("region", { name: "What changes" })).toContainText(
    "Exchanges are the same, the other way round.",
  );
  await shot(page, "08c-compare", true);
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Deploy 1 change" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Deploy" }).click();
  await expect(page.getByText("The documentation is deployed.")).toBeVisible();
  await expect(page.getByText("Draft · not deployed")).toHaveCount(0);

  // Roles: what a permission allows is behind one control, not a browser's own tooltip.
  await page.goto(`/t/${made.tenant}/roles`);
  await page
    .getByRole("button", { name: /New role|Create role|Add role/ })
    .first()
    .click();
  await page.getByRole("button", { name: "What Documentation allows" }).click();
  await expect(page.getByText(/Write and change pages of documentation/)).toBeVisible();
  await shot(page, "09-roles-toggletip");
  await page.keyboard.press("Escape");

  expect(failures, "errors thrown in the page").toEqual([]);
  await page.context().close();
});

test("the docs app is read by someone who is not signed in, with scripts and without", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const address = `/apps/${made.slug}/dev/help/`;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    // A policy that refused something says so on the console.
    if (message.type() === "error") failures.push(message.text());
  });

  await page.goto(address);
  await expect(page.getByRole("heading", { level: 1, name: "Shop handbook" })).toBeVisible();
  await page.getByRole("link", { name: "refunds", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${address}support/refunds$`));
  await expect(page.getByRole("heading", { level: 1, name: "Refund an order" })).toBeVisible();
  // What was edited in the console is what is served.
  await expect(page.getByText("Exchanges are the same, the other way round.")).toBeVisible();
  // With the script, tabs are tabs, and a term opens when it is pressed.
  await expect(page.getByRole("tab", { name: "Card" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Cash" }).click();
  await expect(page.getByText("Refund at the till, and keep the receipt.")).toBeVisible();
  await expect(page.getByText("Refund to the card it was paid with.")).toBeHidden();
  await page.getByRole("button", { name: "RMA", exact: true }).click();
  await expect(
    page.getByRole("tooltip").filter({ hasText: "A return authorisation" }),
  ).toBeVisible();
  await shot(page, "10-docs-app", true);
  await expectNoAxeViolations(page, "a page of the docs app");
  await page.keyboard.press("Escape");

  // The column's meaning is not told to someone who may not read the table.
  await expect(page.getByText("Where the order is in its life.")).toHaveCount(0);

  // Search answers as it is typed, in a dialog, with the section where the words are.
  await page.keyboard.press("Control+k");
  const finder = page.getByRole("dialog", { name: "Search" });
  await finder.getByRole("combobox", { name: "Search" }).fill("tuesdays");
  await expect(finder.getByRole("option", { name: /Returns/ }).first()).toBeVisible();
  await shot(page, "11-docs-search");
  await page.keyboard.press("Escape");
  // Without the dialog, search is a form, and its answer a page.
  await page.goto(`${address}_search?q=tuesdays`);
  await expect(page.getByRole("link", { name: "Returns" }).last()).toBeVisible();

  // On a phone the navigation folds and the page still reads.
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`${address}support/refunds`);
  await expect(page.getByRole("heading", { level: 1, name: "Refund an order" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "the page scrolls sideways on a phone").toBeLessThanOrEqual(1);
  await shot(page, "12-docs-phone", true);
  // The navigation sheet is walked by keyboard: it takes focus, the page behind is out of reach,
  // and Escape gives focus back to the button that opened it.
  const menu = page.getByRole("link", { name: "Open the navigation" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Close the navigation" })).toBeFocused();
  await expect(page.locator(".page")).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const inside = await page.evaluate(() => document.activeElement?.closest(".side") !== null);
  expect(inside, "Tab leaves the navigation sheet for the page behind it").toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(page.locator(".page")).not.toHaveAttribute("inert", "");
  expect(failures, "errors on the served pages").toEqual([]);
  // A search the site does not answer says so, and offers the full results. The refused
  // request is itself an error on the console, so it is looked for after the check above.
  await page.route("**/_search.json*", (route) => route.abort());
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Search" }).getByRole("combobox").fill("refund");
  await expect(page.getByText("The search did not answer.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the full results" })).toBeVisible();
  await expectNoAxeViolations(page, "the served search");
  await page.keyboard.press("Escape");
  await page.unroute("**/_search.json*");
  await context.close();

  // With scripts off everything is still there: tabs as sections, and a term on focus.
  const plain = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    javaScriptEnabled: false,
  });
  const still = await plain.newPage();
  await still.goto(`${address}support/refunds`);
  await expect(still.getByRole("heading", { level: 1, name: "Refund an order" })).toBeVisible();
  await expect(still.getByText("Refund to the card it was paid with.")).toBeVisible();
  await expect(still.getByText("Refund at the till, and keep the receipt.")).toBeVisible();
  await still.getByRole("button", { name: "RMA", exact: true }).focus();
  await expect(
    still.getByRole("tooltip").filter({ hasText: "A return authorisation" }),
  ).toBeVisible();
  await still.getByRole("link", { name: "returns", exact: true }).click();
  await expect(still.getByRole("heading", { level: 1, name: "Returns" })).toBeVisible();
  await shot(still, "13-docs-no-script", true);
  await plain.close();
});

test("a page of an app names its help, and the app shows that page of the handbook", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const page = await signedIn(browser);
  const W = `/tenants/${made.tenant}/workspaces/${made.dev}`;
  await call(page, "PUT", `${W}/drafts/screens/desk`, {
    kind: "interface",
    schemaVersion: 1,
    body: {
      title: "Order desk",
      pages: [
        {
          id: "main",
          title: "Orders",
          help: "support-refunds",
          widgets: [
            {
              id: "list",
              type: "table",
              table: "orders",
              fields: [{ column: "number" }, { column: "status" }],
              at: { x: 0, y: 0, w: 12, h: 8 },
            },
          ],
        },
      ],
    },
  });
  await call(page, "PUT", `${W}/drafts/desk`, {
    kind: "app",
    schemaVersion: 1,
    body: { title: "Order desk", interface: "screens/desk" },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});

  await page.goto(`/apps/${made.slug}/dev/desk/`);
  const table = page.getByRole("table").or(page.getByRole("grid")).first();
  await expect(table).toBeVisible({ timeout: 30_000 });
  // What a column holds is behind its heading here too, for someone who may read the rows.
  await page.getByRole("button", { name: /^About Status/i }).click();
  await expect(page.getByText("Where the order is in its life.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Refund an order" });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.frameLocator("iframe").getByRole("heading", { level: 1, name: "Refund an order" }),
  ).toBeVisible();
  await shot(page, "15-app-help");
  await page.context().close();
});

test("a page is dragged to another folder, its details are a form, and a trigger says what it is for", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const page = await signedIn(browser);
  const W = `/tenants/${made.tenant}/workspaces/${made.dev}`;
  const at = `/t/${made.tenant}/workspaces/${made.dev}`;
  await call(page, "PUT", `${W}/drafts/handbook/questions`, {
    kind: "doc",
    schemaVersion: 1,
    body: { source: text("title: Questions", "What people ask.\n") },
  });

  await page.goto(`${at}/docs/handbook/questions`);
  const tree = page.getByRole("tree", { name: "Pages" });
  const dragged = tree.getByRole("treeitem", { name: /^Questions/ });
  await expect(dragged).toBeVisible({ timeout: 30_000 });
  await dragged.dragTo(tree.getByRole("treeitem", { name: /^Customer support/ }).first());
  await expect(page.getByText("Moved Questions into Customer support.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${at}/docs/handbook/support/questions$`));
  await expect(page.getByRole("heading", { level: 2, name: "Questions" })).toBeVisible();
  await shot(page, "16-dragged");

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Page details" }).click();
  const details = page.getByRole("region", { name: "Page details" });
  await details.getByLabel(/^Description/).fill("What customers ask most.");
  await details.getByRole("button", { name: "Term" }).click();
  await details.getByLabel("Term", { exact: true }).fill("SLA");
  await details.getByLabel("Id", { exact: true }).fill("sla");
  await details.getByLabel("What it means").fill("How fast we answer.");
  // The form wrote the page's own source, and the preview is drawn from that.
  await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(
    "description: What customers ask most.",
  );
  // The preview and the details share one side since phase 21: the preview is its own tab.
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("region", { name: "The page as it will be served" })).toContainText(
    "What customers ask most.",
  );
  await expect(page.getByText("This page would deploy as it is.")).toBeVisible();
  await shot(page, "17-page-details", true);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Saved as a draft/)).toBeVisible();
  const saved = await call(page, "GET", `${W}/docs/page/handbook/support/questions`);
  expect(saved.source).toContain("description: What customers ask most.\n");
  expect(saved.source).toContain("  - id: sla\n    term: SLA\n    short: How fast we answer.\n");
  expect(saved.source).toContain("What people ask.");

  await page.goto(`${at}/resources/new/trigger`);
  const purpose = page.getByLabel(/^What it is for/);
  await expect(purpose).toBeVisible({ timeout: 30_000 });
  await purpose.fill("Takes feedback from the shop's site.");
  await page.getByRole("button", { name: "About what it is for" }).click();
  await shot(page, "18-trigger-description");
  await page.context().close();
});

test("the kit's new pieces are on the kit sheet, and pass the accessibility check", async ({
  browser,
}) => {
  const page = await signedIn(browser, 1440, 1000);
  await page.goto("/instance/kit");
  const section = page.getByRole("heading", { name: "A page of documentation" });
  await section.scrollIntoViewIfNeeded();
  await expect(page.getByRole("tree", { name: "Example pages" })).toBeVisible();
  await page.getByRole("button", { name: "workspace", exact: true }).click();
  await expect(page.getByText(/A place where a tenant's resources live/)).toBeVisible();
  await shot(page, "14-kit-sheet");
  await page.keyboard.press("Escape");
  await expectNoAxeViolations(page, "the kit sheet");
  await page.context().close();
});
