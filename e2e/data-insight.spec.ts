import { expect, type Page, test } from "@playwright/test";
import { signInWithPassword } from "./sign-in.ts";
import { readEveryList } from "./visual.ts";

/**
 * Phase 18, M3 to M9, in a browser: a trigger that is only a draft is listed
 * and edited from its list; a workspace has its own approvals; an enum column
 * is made, coloured and chosen from; a reference shows what stands for the row
 * it points to; and a question is asked of two tables in SQL, with the editor
 * completing from what the workspace has, and kept by name.
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

let page: Page;
let link: string;
let W: string;
let T: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  await readEveryList(page);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `insight-${stamp}`,
    name: "Insight",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  T = `/tenants/${tenant.id}`;
  W = `${T}/workspaces/${dev.id}`;
  link = `/t/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/lending/remind`, {
    kind: "script",
    schemaVersion: 1,
    body: {
      description: "",
      input: { type: "object" },
      output: { type: "object" },
      timeoutSeconds: 60,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      source: { language: "typescript", code: "export default async () => ({ ok: true });\n" },
    },
  });
  await call(page, "PUT", `${W}/drafts/lending/approve`, {
    kind: "flow",
    schemaVersion: 1,
    body: {
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        gate: { type: "approval", title: "Lend the camera" },
        done: { type: "set", values: { ok: "true" } },
      },
      edges: [
        { from: "start", to: "gate" },
        { from: "gate", to: "done" },
      ],
    },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  const table = (name: string, body: object) =>
    call(page, "PUT", `${W}/resources/${name}`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body,
    });
  await table("devices", { columns: { name: { type: "text", required: true } }, display: "name" });
  await table("loans", {
    columns: {
      device: { type: "reference", references: "devices" },
      fee: { type: "integer" },
    },
  });
  const laptop = (await call(page, "POST", `${W}/rows/devices`, { name: "Laptop" })).items[0].id;
  const camera = (await call(page, "POST", `${W}/rows/devices`, { name: "Camera" })).items[0].id;
  await call(page, "POST", `${W}/rows/loans`, { device: laptop, fee: 10 });
  await call(page, "POST", `${W}/rows/loans`, { device: laptop, fee: 40 });
  await call(page, "POST", `${W}/rows/loans`, { device: camera, fee: 30 });
});

test.afterAll(async () => {
  await page.context().close();
});

test("a trigger made here is in the list at once, marked as a draft, and is edited and deployed from there", async () => {
  await page.goto(`${link}/triggers`);
  await page.getByRole("button", { name: "New trigger" }).first().click();
  await page.getByRole("menuitem", { name: /Schedule/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet
    .getByLabel(/Name|Path/)
    .first()
    .fill("lending/nightly");
  // What it starts, and when: the form's own defaults do for the rest.
  await sheet.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /lending\/remind/ }).click();
  await sheet.getByRole("button", { name: /Save|Create/ }).click();

  await expect(sheet).toBeHidden();
  // It is in the list without a deploy, and says what it is.
  const row = page.getByRole("row", { name: /lending\/nightly/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Draft, never deployed");
  // The row's own name, not the link to what it starts.
  await row.getByText("Not fired yet").click();
  const panel = page.getByRole("complementary", { name: "The chosen trigger" });
  await expect(panel).toContainText("It starts nothing until it is deployed");
  // Its editor is one press away, and so is deploying it.
  await expect(panel.getByRole("link", { name: "Edit" })).toHaveAttribute(
    "href",
    /resources\/edit\/schedule\/lending\/nightly/,
  );
  await panel.getByRole("button", { name: "Deploy" }).click();
  await page.getByRole("menuitem", { name: "This change only" }).click();
  await expect(row).not.toContainText("Draft, never deployed");
  // Deployed, it is still edited from here.
  // The row's own name, not the link to what it starts.
  await row.getByText("Not fired yet").click();
  await expect(panel.getByRole("link", { name: "Edit" })).toBeVisible();
});

test("an approval is listed in its workspace, and for the tenant only when its step says so", async () => {
  await call(page, "POST", `${W}/flow-runs`, { flow: "lending/approve", input: {} });
  await page.goto(`${link}/approvals`);
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await expect(page.getByText("Lend the camera")).toBeVisible();
  // Under Operate, beside runs and triggers.
  await expect(page.getByRole("link", { name: "Approvals" }).first()).toBeVisible();

  // The tenant's page has none of it: the step did not surface it.
  await page.goto(link.replace(/\/workspaces\/.*$/, "/approvals"));
  await expect(page.getByText("Nothing is waiting for you")).toBeVisible();
  await expect(page.getByText("Lend the camera")).toHaveCount(0);

  // Decided where it belongs.
  await page.goto(`${link}/approvals`);
  await page.getByRole("button", { name: "Approve" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Nothing is waiting for you")).toBeVisible();
});

test("an enum column is added, given colours that can be read, and chosen from in a row", async () => {
  await page.goto(`${link}/tables/loans?view=definition`);
  await page.getByRole("button", { name: "Add column" }).click();
  const dialog = page.getByRole("dialog", { name: "Add column" });
  await dialog.getByLabel("Name").fill("status");
  await dialog.getByLabel("It holds").selectOption("enum");
  await dialog.getByLabel("Values").fill("out, back, late");
  await dialog.getByRole("button", { name: "Add column" }).click();
  await expect(dialog).toBeHidden();

  // Each value its label and its colour.
  const column = page.getByRole("row", { name: /status/ });
  await column.getByRole("button", { name: "Values" }).click();
  const values = page.getByRole("dialog", { name: "Values of status" });
  const late = values.getByRole("listitem").filter({ has: page.locator('input[value="late"]') });
  await late.getByLabel("Shown as").fill("Overdue");
  await late.getByLabel("Colour").selectOption("custom");
  await late.getByLabel("As #rrggbb").fill("#fde047");
  const out = values.getByRole("listitem").filter({ has: page.locator('input[value="out"]') });
  await out.getByLabel("Colour").selectOption("blue");
  await values.getByRole("button", { name: "Save" }).click();
  await expect(values).toBeHidden();

  // The chips in the definition: black on the pale yellow, white on the blue.
  const chip = (text: string) => column.getByText(text, { exact: true });
  await expect(chip("Overdue")).toBeVisible();
  const colours = async (text: string) =>
    chip(text).evaluate((node) => {
      const style = getComputedStyle(node);
      return { on: style.backgroundColor, text: style.color };
    });
  expect(await colours("Overdue")).toEqual({ on: "rgb(253, 224, 71)", text: "rgb(0, 0, 0)" });
  expect(await colours("out")).toEqual({ on: "rgb(37, 99, 235)", text: "rgb(255, 255, 255)" });

  // In a row, the value is chosen from the list and shows as its chip.
  await page.goto(`${link}/tables/loans`);
  await page.getByRole("gridcell", { name: "30" }).click();
  const editor = page.getByRole("complementary");
  await editor.getByLabel("status").selectOption("late");
  await editor.getByRole("button", { name: "Save row" }).click();
  await expect(page.getByRole("grid").getByText("Overdue")).toBeVisible();
  // And the device it points to is shown by its name, not its ID.
  await expect(page.getByRole("grid").getByText("Camera")).toBeVisible();
  await expect(page.getByRole("grid").getByText("Laptop").first()).toBeVisible();
});

test("a question is asked of two tables in SQL, with the editor offering what the workspace has, and kept by name", async () => {
  await page.goto(`${link}/queries`);
  await expect(page.getByRole("heading", { name: "Queries", exact: true })).toBeVisible();
  // The tables are there to read, with what each column is.
  await page.getByText("loans", { exact: true }).first().click();
  await expect(page.getByText("→ devices")).toBeVisible();

  const editor = page.locator(".monaco-editor").first();
  await editor.click();
  // After FROM the editor offers the workspace's tables.
  await page.keyboard.type("select d.name, sum(l.fee) as fees from ", { delay: 15 });
  const offers = page.locator(".suggest-widget");
  await expect(offers).toBeVisible();
  await expect(offers).toContainText("devices");
  await expect(offers).toContainText("loans");
  await page.keyboard.press("Escape");
  await page.keyboard.type("loans l join ", { delay: 15 });
  // After JOIN, the join its reference gives comes first.
  await expect(offers).toContainText("devices on l.device");
  await page.keyboard.press("Escape");
  await page.keyboard.type("devices d on d.id = l.device group by d.name order by fees desc", {
    delay: 15,
  });
  await page.keyboard.press("Escape");
  // What was typed is what the editor holds: the list of offers took nothing over.
  await expect(page.locator(".monaco-editor .view-lines").first()).toContainText(
    "order by fees desc",
  );
  await page.getByRole("button", { name: "Run" }).click();

  const result = page.getByRole("region", { name: "Result" });
  await expect(result).toContainText("2 rows");
  await expect(result).toContainText("read devices, loans");
  const cells = await result.getByRole("cell").allTextContents();
  expect(cells.map((text) => text.trim())).toEqual(["Laptop", "50", "Camera", "30"]);

  // Kept by name: a draft of a resource, listed here.
  await page.getByRole("button", { name: "Save as…" }).click();
  const asked = page.getByRole("dialog");
  await asked.getByRole("textbox").fill("reports/fees");
  await asked.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: /reports\/fees/ })).toBeVisible();
  await expect(page.getByText("Draft, never deployed")).toBeVisible();
});

test("a query that is not allowed says why and where, and runs nothing", async () => {
  await page.goto(`${link}/queries`);
  const editor = page.locator(".monaco-editor").first();
  await editor.click();
  await page.keyboard.type("select * from loans where pg_sleep(1) is null", { delay: 15 });
  // The list of what could come next is put away, so the keys go to the editor.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(
    page.getByText(/Line 1, column 27: The function pg_sleep\(\) is not one a query may call/),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Result" })).toHaveCount(0);
});
