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

// The filter bar and the comparison are drawn by the page renderer (phase 25, stream B), whose
// words and controls are not fixed yet. The steps are walked again once they are.
test.fixme("the date filter changes every widget bound to it, and the address keeps it", async () => {
  // - "Lent" is a date range. "All time" is not one of the ranges a page filter offers, so the
  //   older loans (day(60) and day(62)) are reached with "Last 90 days": 105 in fees, and 55 and 50 by device;
  // - the address keeps the filters, and a reload shows the same;
  // - a custom range of day(70) to day(40) shows 25 and Camera alone, and Reset returns to 80;
  // - "Nothing in the period before" and the picture of how it went, under the number.
});

// Drill-through to the rows behind a number, and a widget's result as a file, are not in
// the page model yet (a click is an event from phase 26, and the frame's menu is stream B's).
test.fixme("a number opens the rows behind it, and a result is kept as a file", async () => {
  // - click Laptop's line in "Fees by device": a dialog "Rows of loans" with its two loans;
  // - sort by a heading, and filter the rows in the dialog;
  // - Download as CSV gives device_name,fees,loans / Laptop,50,2 / Camera,30,1;
  // - Download as a spreadsheet gives fees-by-device.xlsx.
});

// The editor is stream C's: "Add to page" and the inspector.
test.fixme("a pivot of loans by month and status is built from menus, with no SQL written", async () => {
  // - Edit, Add to page, Pivot; Data: Source Loans, Value Count, Break down by Lent on (Monthly) and Status;
  // - Display: Show totals; the page's Lent filter is bound for Lent on;
  // - in the last 30 days: two out, one late, three in all.
});

// Select, move and size on the page are stream B's canvas (arrow keys move, Shift+arrows size, a chip
// says "6 × 8 · col 7 · row 1"), and Undo is the editor's.
test.fixme("widgets are dragged into place and stretched, from the keyboard too, and a change is undone", async () => {
  // - drag "Fees by status" six columns right; it stays where it was put while the save is on its way;
  // - what was under it rises beside it, and nothing lies on anything after a stretch;
  // - arrows move it, Shift+arrows size it, and the move is announced;
  // - Undo and Redo, by keys and by buttons that say what they would do;
  // - Delete removes a widget, and Undo brings it back with what it asked.
});
