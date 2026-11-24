import { signInAs } from "./as.ts";
import { fernhillTenant } from "./fernhill.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

const TENANT = fernhillTenant();

/**
 * "Group rows by" (phase 28, asked for after the first look), walked on the Fernhill example in
 * its sandbox, on a draft of the walk's own that it removes: set in the drawer of a Table and of a
 * List, drawn under headings on the canvas, counted over every page, and kept after a reload.
 */

const stamp = Date.now().toString(36);
const PATH = `screens/group-${stamp}`;

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
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
      return text ? JSON.parse(text) : null;
    },
    [method, path, body] as const,
  );

let owner: Page;
let W: string;
let L: string;

const rows = { source: { visual: { table: "appointments" } } };
const body = {
  title: `Group ${stamp}`,
  pages: [
    {
      id: "main",
      title: "Main",
      widgets: [
        {
          id: "table",
          type: "core/table",
          title: "Visits",
          at: { x: 0, y: 0, w: 12, h: 10 },
          data: { rows },
          config: {
            pageSize: 25,
            columns: [
              { column: "starts_at", label: "When", sortable: true },
              { column: "pet_name", label: "Pet", sortable: true },
              { column: "status" },
            ],
          },
        },
        {
          id: "list",
          type: "core/list",
          title: "By clinic",
          at: { x: 0, y: 10, w: 12, h: 8 },
          data: { rows },
          config: { title: "pet_name", right: "starts_at" },
        },
      ],
    },
  ],
};

const cell = (id: string) => owner.locator(`[data-canvas] [data-widget-cell="${id}"]`);
const drawer = () => owner.getByRole("complementary", { name: "Settings" });
const groups = (id: string) => cell(id).locator("[data-row-group]");
const stored = async (id: string) =>
  (await call(owner, "GET", `${W}/drafts/${PATH}`)).body.pages[0].widgets.find(
    (one: { id: string }) => one.id === id,
  ).config.groupRows;
const groupBy = async (id: string, column: string) => {
  await cell(id).getByRole("heading").first().click();
  await drawer()
    .getByRole("tab", { name: /^Display/ })
    .click();
  await drawer()
    .getByRole("button", { name: /^Group rows by/ })
    .click();
  const editor = owner.getByRole("dialog", { name: "Group rows by" });
  await editor.getByLabel("Column").selectOption(column);
  return editor;
};

test.beforeAll(async ({ browser }) => {
  owner = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await signInAs(owner, "maya.brooks@fernhill.example");
  const tenants = await call(owner, "GET", `/tenants?search=${TENANT}&limit=200`);
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const { items } = await call(owner, "GET", `/tenants/${tenant.id}/workspaces`);
  const sandbox = items.find((one: { slug: string }) => one.slug === "sandbox");
  W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  L = `/t/${tenant.id}/workspaces/${sandbox.id}`;
  await call(owner, "PUT", `${W}/drafts/${PATH}`, {
    kind: "interface",
    schemaVersion: 2,
    body,
    create: true,
  });
});
test.afterAll(async () => {
  if (W) await call(owner, "DELETE", `${W}/drafts/${PATH}`).catch(() => {});
  await owner?.context().close();
});

test("POLISH-009: a Table's rows are grouped by day from the drawer, each day with how many it has, and kept after a reload @fernhill @builder", async () => {
  await owner.goto(`${L}/screens/${PATH}`);
  await expect(cell("table").getByRole("row").nth(3)).toBeVisible();
  await expect(groups("table")).toHaveCount(0);
  const editor = await groupBy("table", "starts_at");
  await expect.poll(() => stored("table")).toEqual({ column: "starts_at", by: "day" });
  await editor.locator("label", { hasText: "Latest" }).click();
  await expect
    .poll(() => stored("table"))
    .toEqual({ column: "starts_at", by: "day", descending: true });
  await owner.keyboard.press("Escape");
  await expect(groups("table").first()).toBeVisible();
  // Under a day, the time alone.
  await expect(groups("table").first().getByRole("cell").first()).toHaveText(
    /^\d{1,2}:\d{2}\s[AP]M$/,
  );
  // The heading counts the day whole, as the table's rows do: read back from the table itself.
  const first = groups("table").first();
  const day = (await first.getAttribute("data-row-group")) as string;
  const there = await owner.evaluate(
    ([from]) => {
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return [start.toISOString(), end.toISOString()];
    },
    [day] as const,
  );
  const filter = JSON.stringify({
    and: [
      { column: "starts_at", op: "gte", value: there[0] },
      { column: "starts_at", op: "lt", value: there[1] },
    ],
  });
  const found = await call(
    owner,
    "GET",
    `${W}/rows/appointments?limit=1000&filter=${encodeURIComponent(filter)}`,
  );
  await expect(first.getByRole("rowheader")).toContainText(
    found.items.length.toLocaleString("en-US"),
  );
  await owner.reload();
  await expect(groups("table").first()).toBeVisible();
  await expect(groups("table").first()).toHaveAttribute("data-row-group", day);
  await expectNoAxeViolations(owner, "a page with grouped rows");
});

test("POLISH-009: a List is grouped by a choice, as cards too, and Nothing takes it off @fernhill @builder", async () => {
  await owner.goto(`${L}/screens/${PATH}`);
  const editor = await groupBy("list", "clinic");
  await owner.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(groups("list").first()).toHaveAttribute("data-row-group", "hilltop");
  await expect(groups("list").first().getByRole("heading")).toContainText("hilltop");
  await drawer().locator("label", { hasText: "Cards" }).click();
  await expect(groups("list").first().locator("ul.grid")).toBeVisible();
  const again = await groupBy("list", "");
  await expect(again).toBeVisible();
  await expect.poll(() => stored("list")).toBeUndefined();
  await expect(groups("list")).toHaveCount(0);
});
