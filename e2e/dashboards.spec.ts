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
      title: "Lending",
      filters: [{ name: "lent", label: "Lent", type: "date_range", default: "last_30_days" }],
      widgets: [
        {
          id: "fees",
          type: "core/stat",
          title: "Fees",
          subtitle: "Charged on what was lent",
          at: { x: 0, y: 0, w: 3, h: 4 },
          data: {
            value: {
              source: {
                visual: { table: "loans", measures: [{ fn: "sum", column: "fee", as: "fees" }] },
              },
              filters: [{ filter: "lent", column: "lent_on" }],
            },
          },
          config: { compareTo: "lent", trendBy: "lent_on" },
        },
        {
          id: "by-device",
          type: "core/table",
          title: "Fees by device",
          at: { x: 3, y: 0, w: 6, h: 8 },
          data: {
            rows: {
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
          },
        },
        {
          id: "chart",
          type: "core/chart",
          title: "Fees by status",
          at: { x: 0, y: 8, w: 6, h: 8 },
          data: {
            rows: {
              source: {
                visual: {
                  table: "loans",
                  groupBy: [{ column: "status" }],
                  measures: [{ fn: "sum", column: "fee", as: "fees" }],
                },
              },
              filters: [{ filter: "lent", column: "lent_on" }],
            },
          },
          config: { mark: "bar" },
        },
      ],
    },
  });
});

test.afterAll(async () => {
  await page.context().close();
});

const widget = (name: string) => page.getByRole("region", { name, exact: true });

test("from inside a dashboard, its section is a link back, and the rail shows an area's screens without leaving", async () => {
  await page.goto(`${link}/dashboards/${board}`);
  await expect(page.getByRole("heading", { name: "Lending", level: 1 })).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Where you are" });
  // The dashboard is the last crumb, and Dashboards before it is a link.
  await expect(crumbs).toContainText("Lending");
  await expect(crumbs.getByRole("link", { name: "Dashboards", exact: true })).toHaveAttribute(
    "href",
    `${link}/dashboards`,
  );
  // The workspace's name opens the list of workspaces, wherever on it is pressed.
  await crumbs.getByRole("button", { name: "Switch workspace" }).getByText("Dev").click();
  await expect(page.getByRole("menuitem", { name: /Dev/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/dashboards/${board}$`));
  // Pressing Data does not go to Tables: its screens come out beside the rail.
  const rail = page.getByRole("navigation", { name: "Main" });
  await rail.getByRole("button", { name: "Data" }).click();
  const sections = page.getByRole("navigation", { name: "Sections" });
  await expect(sections.getByRole("link", { name: "Tables" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/dashboards/${board}$`));
  // Another area's, in the same place, and Esc puts them away.
  await rail.getByRole("button", { name: "Build" }).click();
  await expect(sections.getByRole("link", { name: "Scripts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sections).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/dashboards/${board}$`));
  // And a screen chosen there is gone to.
  await rail.getByRole("button", { name: "Build" }).click();
  await sections.getByRole("link", { name: "Scripts" }).click();
  await expect(page).toHaveURL(/\/scripts$/);
  await page.goBack();
  await crumbs.getByRole("link", { name: "Dashboards", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboards$/);
});

test("each widget draws what its query gives, and says how fresh it is", async () => {
  await page.goto(`${link}/dashboards/${board}`);
  // The last thirty days: three loans, 80 in fees.
  await expect(widget("Fees")).toContainText("80");
  await expect(widget("Fees")).toContainText("Charged on what was lent");
  // One scroll bar: the page scrolls in its own region, the document under it does not,
  // and a chart fits the widget it is in.
  await expect(widget("Fees by status").locator("svg").first()).toBeVisible();
  await page.setViewportSize({ width: 1500, height: 600 });
  const scrolls = await page.evaluate(() => {
    const whole = document.documentElement;
    return { document: whole.scrollHeight - whole.clientHeight };
  });
  expect(scrolls).toEqual({ document: 0 });
  await page.setViewportSize({ width: 1500, height: 1000 });
  // It says how old its numbers are and how often it asks again, and asks again when told to.
  const fresh = page.locator("[data-freshness]");
  await expect(fresh).toContainText("Last refreshed");
  await expect(fresh).toContainText("Refreshes every 5 minutes");
  const again = page.waitForRequest((request) => request.url().includes("/widget-data"));
  await fresh.getByRole("button", { name: "Refresh now" }).click();
  await again;
  const rows = widget("Fees by device").getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("Laptop");
  await expect(rows.nth(1)).toContainText("50");
  await expect(rows.nth(2)).toContainText("Camera");
  await expectNoAxeViolations(page, "a dashboard");
});

test("the date filter changes every widget bound to it, and the address keeps it (POLISH-006)", async () => {
  await page.goto(`${link}/dashboards/${board}`);
  await expect(widget("Fees")).toContainText("80");
  // The older loans, 60 and 62 days ago, are reached with "Last 90 days": 105 in fees.
  await page.getByRole("combobox", { name: "Lent" }).selectOption({ label: "Last 90 days" });
  await expect(widget("Fees")).toContainText("105");
  const rows = widget("Fees by device").getByRole("row");
  await expect(rows.nth(1)).toContainText("55");
  await expect(rows.nth(2)).toContainText("50");
  // The address keeps the filter, so a reload, or the link sent to someone, shows the same.
  await expect(page).toHaveURL(/[?&]f=/);
  await page.reload();
  await expect(widget("Fees")).toContainText("105");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(widget("Fees")).toContainText("80");
});

// Drill-through to the rows behind a number (phase 18) is not in the page model: a click is an
// event, and what it does is phase 26's actions. Whether it comes back now is the owner's to say;
// see docs/phases/phase-25-one-widget-system.md, Findings.
test.fixme("a number opens the rows behind it", async () => {
  // - click Laptop's line in "Fees by device": a dialog "Rows of loans" with its two loans;
  // - sort by a heading, and filter the rows in the dialog.
});

test("a widget's rows are kept as a file, from its frame (POLISH-002)", async () => {
  await page.goto(`${link}/dashboards/${board}`);
  await widget("Fees by device").getByRole("button", { name: "Download Fees by device" }).click();
  const csv = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download as CSV" }).click();
  const file = await csv;
  expect(file.suggestedFilename()).toBe("fees-by-device.csv");
  const text = await (await import("node:fs/promises")).readFile(await file.path(), "utf8");
  expect(text).toContain("Laptop,50,2");
  expect(text).toContain("Camera,30,1");
  await widget("Fees by device").getByRole("button", { name: "Download Fees by device" }).click();
  const sheet = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download as a spreadsheet" }).click();
  expect((await sheet).suggestedFilename()).toBe("fees-by-device.xlsx");
  // One number is read off the page, and offers no file.
  await expect(widget("Fees").getByRole("button", { name: /^Download/ })).toHaveCount(0);
});

test("a pivot of loans by month and status is built from menus, with no SQL written", async () => {
  await page.goto(`${link}/dashboards/${board}?edit=1`);
  await page
    .getByRole("button", { name: /Add to page/ })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Pivot/ })
    .click();
  const inspector = page.getByRole("complementary", { name: "Settings" });
  // The page reads one table, so the new widget reads it too, and follows the page's filter.
  await expect(inspector.getByText("Follows the page filters")).toBeVisible();
  await inspector.getByLabel("What value 1 works out").selectOption("count");
  await inspector.getByLabel("Breakdown 1", { exact: true }).selectOption("lent_on");
  await inspector.getByLabel("How often breakdown 1 is cut").selectOption("month");
  await inspector.getByRole("button", { name: "Break it down" }).click();
  await inspector.getByLabel("Breakdown 2", { exact: true }).selectOption("status");
  const pivot = page.locator("section[data-selected]");
  // In the last 30 days: two out, one late, three in all.
  await expect(pivot).toContainText("out");
  await expect(pivot).toContainText("late");
  await expect(pivot).toContainText("3");
  const stored = await call(page, "GET", `${W}/dashboards/${board}`);
  const made = stored.body.widgets.find((one: { type: string }) => one.type === "core/pivot");
  expect(made.data.rows.source).toHaveProperty("visual");
  expect(made.data.rows.source.visual.groupBy).toEqual([
    { column: "lent_on", bucket: "month" },
    { column: "status" },
  ]);
});

test("widgets are dragged into place and stretched, from the keyboard too, and a change is undone (POLISH-007)", async () => {
  await page.goto(`${link}/dashboards/${board}?edit=1`);
  const chart = page.getByRole("group", { name: "Fees by status", exact: true });
  await expect(chart).toBeVisible();
  await chart.focus();
  const chip = chart.getByText(/^\d+ × \d+ · col \d+ · row \d+$/);
  await expect(chip).toHaveText(/^6 × 8 · col 1 ·/);
  // Dragged six columns right by the pointer: it lands there, and the chip says so.
  const at = await chart.boundingBox();
  if (!at) throw new Error("Fees by status is not on the page");
  await page.mouse.move(at.x + 80, at.y + 80);
  await page.mouse.down();
  await page.mouse.move(at.x + 80 + at.width, at.y + 80, { steps: 12 });
  await page.mouse.up();
  await expect(chip).toHaveText(/^6 × 8 · col 7 ·/);
  // Arrows move it a cell; Shift and an arrow make it bigger; the move is said.
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(chip).toHaveText(/col 6/);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(chip).toHaveText(/^6 × 9 /);
  await expect(page.getByRole("status").filter({ hasText: "is 6 wide and 9 tall" })).toHaveCount(1);
  // Undo takes back the size, then the move.
  await page.keyboard.press("Control+z");
  await expect(chip).toHaveText(/^6 × 8 /);
  // Delete removes it, and Undo brings it back.
  await chart.focus();
  await page.keyboard.press("Delete");
  await expect(chart).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("group", { name: "Fees by status", exact: true })).toBeVisible();
});
