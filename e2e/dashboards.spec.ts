import { readFileSync } from "node:fs";
import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations, readEveryList } from "./visual.ts";

/**
 * Phase 18, M10 and M11, in a browser: a dashboard asks questions of the
 * workspace's tables. Someone who has never written SQL builds a pivot of
 * loans by month and status from menus; the dashboard's date filter changes
 * every widget bound to it; a number opens the rows behind it; and a widget's
 * result is kept as a file.
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
let board: string;

const day = (back: number) => {
  const at = new Date();
  at.setDate(at.getDate() - back);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  await readEveryList(page);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `boards-${stamp}`,
    name: "Boards",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  link = `/t/${tenant.id}/workspaces/${dev.id}`;
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
      status: { type: "enum", values: ["out", "returned", "late"] },
      fee: { type: "integer" },
      lent_on: { type: "date" },
    },
  });
  const device = async (name: string) =>
    (await call(page, "POST", `${W}/rows/devices`, { name })).items[0].id as string;
  const laptop = await device("Laptop");
  const camera = await device("Camera");
  // Three in the last week, and two some sixty days back.
  const loans = [
    { device: laptop, status: "out", fee: 10, lent_on: day(2) },
    { device: laptop, status: "late", fee: 40, lent_on: day(3) },
    { device: camera, status: "out", fee: 30, lent_on: day(5) },
    { device: camera, status: "returned", fee: 20, lent_on: day(60) },
    { device: laptop, status: "returned", fee: 5, lent_on: day(62) },
  ];
  for (const loan of loans) await call(page, "POST", `${W}/rows/loans`, loan);

  const made = await call(page, "POST", `${W}/dashboards`, { title: "Lending" });
  board = made.id;
  await call(page, "PUT", `${W}/dashboards/${board}`, {
    revision: made.revision,
    body: {
      version: 2,
      filters: [{ name: "lent", label: "Lent", type: "date_range", default: "last_30_days" }],
      widgets: [
        {
          id: "fees",
          title: "Fees",
          type: "figure",
          width: 3,
          source: {
            visual: { table: "loans", measures: [{ fn: "sum", column: "fee", as: "fees" }] },
          },
          filters: [{ filter: "lent", column: "lent_on" }],
          options: { value: "fees", compareTo: "lent" },
        },
        {
          id: "by-device",
          title: "Fees by device",
          type: "table",
          width: 6,
          source: {
            visual: {
              table: "loans",
              joins: ["device"],
              groupBy: [{ column: "device.name" }],
              measures: [
                { fn: "sum", column: "fee", as: "fees" },
                { fn: "count", as: "loans" },
              ],
              sort: [{ by: "fees", descending: true }],
            },
          },
          filters: [{ filter: "lent", column: "lent_on" }],
        },
        {
          id: "chart",
          title: "Fees by status",
          type: "chart",
          width: 6,
          source: {
            visual: {
              table: "loans",
              groupBy: [{ column: "status" }],
              measures: [{ fn: "sum", column: "fee", as: "fees" }],
            },
          },
          filters: [{ filter: "lent", column: "lent_on" }],
          options: { mark: "bar", x: "status", y: "fees" },
        },
      ],
    },
  });
});

test.afterAll(async () => {
  await page.context().close();
});

const widget = (name: string) => page.getByRole("region", { name, exact: true });

test("each widget draws what its query gives, and the date filter changes every one bound to it", async () => {
  await page.goto(`${link}/dashboards/${board}`);
  // The last thirty days: three loans, 80 in fees. The thirty days before that had none.
  await expect(widget("Fees")).toContainText("80");
  await expect(widget("Fees")).toContainText("Nothing in the period before");
  const rows = widget("Fees by device").getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("Laptop");
  await expect(rows.nth(1)).toContainText("50");
  await expect(rows.nth(2)).toContainText("Camera");
  // A chart is drawn, and says what it shows to someone who cannot see it.
  await expect(widget("Fees by status").locator("svg, canvas").first()).toBeVisible();
  await expectNoAxeViolations(page, "a dashboard");

  // All time: every widget asks again, and the address keeps what was set.
  await page.getByLabel("Lent", { exact: true }).selectOption("all");
  await expect(widget("Fees")).toContainText("105");
  await expect(rows.nth(1)).toContainText("55");
  await expect(rows.nth(2)).toContainText("50");
  expect(new URL(page.url()).searchParams.get("f")).toBe('{"lent":"all"}');
  // A link shows the same thing.
  await page.reload();
  await expect(widget("Fees")).toContainText("105");

  // Between two dates: only what was lent long ago.
  await page.getByLabel("Lent", { exact: true }).selectOption("custom");
  await page.getByLabel("From", { exact: true }).fill(day(70));
  await page.getByLabel("To", { exact: true }).fill(day(40));
  await expect(widget("Fees")).toContainText("25");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("Camera");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(widget("Fees")).toContainText("80");
});

test("a number opens the rows behind it, and a result is kept as a file", async () => {
  await page.goto(`${link}/dashboards/${board}`);
  const rows = widget("Fees by device").getByRole("row");
  await expect(rows.nth(1)).toContainText("Laptop");
  // The rows behind the Laptop's line: its two loans of the last thirty days.
  await rows.nth(1).getByRole("button", { name: "Laptop: see the rows behind it" }).click();
  const behind = page.getByRole("dialog", { name: "Rows of loans" });
  await expect(behind).toContainText("2 rows");
  await expect(behind).toContainText("late");
  await expect(behind).not.toContainText("returned");
  await behind.getByRole("button", { name: "Done" }).click();

  // As CSV, and as a spreadsheet a zip reader opens.
  await widget("Fees by device").getByRole("button", { name: "More for Fees by device" }).click();
  const csv = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download as CSV" }).click();
  const text = readFileSync((await (await csv).path()) as string, "utf8");
  expect(text.split("\r\n")).toEqual(["device_name,fees,loans", "Laptop,50,2", "Camera,30,1"]);

  await widget("Fees by device").getByRole("button", { name: "More for Fees by device" }).click();
  const sheet = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download as a spreadsheet" }).click();
  const file = await sheet;
  expect(file.suggestedFilename()).toBe("fees-by-device.xlsx");
  const bytes = readFileSync((await file.path()) as string);
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.toString("latin1")).toContain("xl/worksheets/sheet1.xml");
});

test("a pivot of loans by month and status is built from menus, with no SQL written", async () => {
  await page.goto(`${link}/dashboards/${board}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Add a widget" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Title").fill("Loans by month");
  await sheet.getByLabel("It is").selectOption("pivot");
  await sheet.getByLabel("Width").selectOption("12");
  await sheet.getByLabel("Table").selectOption("loans");
  await sheet.getByLabel("Show", { exact: true }).selectOption("totals");
  // Grouped by the month it was lent in, and by its status.
  await sheet.getByRole("button", { name: "Add a group" }).click();
  await sheet.getByLabel("Column").last().selectOption("lent_on");
  await expect(sheet.getByLabel("By", { exact: true })).toHaveValue("month");
  await sheet.getByRole("button", { name: "Add a group" }).click();
  await sheet.getByLabel("Column").last().selectOption("status");
  // What it gives is shown as it is built: a line for each month and status.
  const gives = sheet.getByRole("region", { name: "What it gives" });
  await expect(gives.getByRole("columnheader", { name: "lent_on_month" })).toBeVisible();
  await expect(gives.getByRole("columnheader", { name: "status" })).toBeVisible();
  await expect(gives.getByRole("columnheader", { name: "count" })).toBeVisible();

  // Months down the side, statuses across the top, how many in each cell.
  const side = sheet.getByRole("combobox", { name: "Down the side" });
  await side.click();
  await page.getByRole("option", { name: "lent_on_month" }).click();
  await page.keyboard.press("Escape");
  const top = sheet.getByRole("combobox", { name: "Across the top" });
  await top.click();
  await page.getByRole("option", { name: "status" }).click();
  await page.keyboard.press("Escape");
  await sheet.getByLabel("In each cell").selectOption("count");
  await sheet.getByLabel("Worked out as").selectOption("sum");
  // The dashboard's date filter narrows it too.
  await sheet.getByLabel("Lent", { exact: true }).selectOption("lent_on");
  await sheet.getByRole("button", { name: "Save the widget" }).click();
  await expect(sheet).toBeHidden();

  const pivot = widget("Loans by month");
  await expect(pivot.getByRole("columnheader", { name: "out" })).toBeVisible();
  await expect(pivot.getByRole("columnheader", { name: "late" })).toBeVisible();
  // In the last thirty days: two out, one late, three in all.
  await expect(pivot.getByRole("row").last()).toContainText("Total");
  await expect(pivot.getByRole("row").last()).toContainText("3");
  // All time adds the months before, and the returned.
  await page.getByLabel("Lent", { exact: true }).selectOption("all");
  await expect(pivot.getByRole("columnheader", { name: "returned" })).toBeVisible();
  await expect(pivot.getByRole("row").last()).toContainText("5");
  // A cell opens the rows it counted.
  await pivot.getByRole("button", { name: "2" }).first().click();
  const behind = page.getByRole("dialog", { name: "Rows of loans" });
  await expect(behind).toContainText("2 rows");
  await behind.getByRole("button", { name: "Done" }).click();
  // It closes with motion, so it is on the page a moment longer.
  await expect(behind).toBeHidden();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Add a widget" })).toHaveCount(0);
});
