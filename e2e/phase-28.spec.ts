import { signInWithPassword } from "./sign-in.ts";
import { expect, type Locator, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * Phase 28, walked in a browser on the Fernhill example (`examples/fernhill/setup/setup.mjs`),
 * in its sandbox workspace and under names of its own: the builder as boards 1 to 19 draw it
 * (docs/phases/phase-28-phone-publish-and-the-boards.md), the phone layout, the publish check,
 * View as, who can run and who can see, draft history, and the acceptance walk-throughs. Each
 * test is one journey through the real UI, titled with the POLISH rule
 * (docs/polish/polish-prevention-rules.md) it checks. What a journey changed is read back from
 * the draft through the API, and is looked for on the canvas and again after a reload.
 *
 * The walk makes interfaces of its own (`screens/p28<area>-<stamp>`, each with an app of its own,
 * published once so that there is something to change), and the invoices it needs, numbered
 * `P28-<stamp>-…`. It deletes them at the end. Nothing of Fernhill's own is changed.
 *
 * The locators of what the build draws are small functions near the top, so one that the build
 * named a little differently is changed in one place.
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = process.env.E2E_FERNHILL_TENANT ?? "fernhill";
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const OWNER = "maya.brooks@fernhill.example";
/** In Practice managers and in Billing. */
const BOTH = "rowan.ellis@fernhill.example";
/** In Billing only: not a Practice manager. */
const OUTSIDE = "devi.shah@fernhill.example";
const stamp = Date.now().toString(36);
const PREFIX = `P28-${stamp.toUpperCase()}`;
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
type Answer = { status: number; body: any };
const call = (page: Page, method: string, path: string, body?: unknown): Promise<Answer> =>
  page.evaluate(
    async ([method, path, body]) => {
      const response = await fetch(`/api/v1${path}`, {
        method: method as string,
        headers: body ? { "content-type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    [method, path, body] as const,
  );
const ok = async (page: Page, method: string, path: string, body?: unknown) => {
  const answer = await call(page, method, path, body);
  if (answer.status >= 300) {
    throw new Error(`${method} ${path}: ${answer.status} ${JSON.stringify(answer.body)}`);
  }
  return answer.body;
};

let owner: Page;
/** The workspace's address in the API, and in the console. */
let W: string;
let L: string;
let TENANT_ID: string;

// biome-ignore lint/suspicious/noExplicitAny: widgets are inspected freely
type Wid = any;

/** The interfaces the walk made, by area; each is published as an app of the same name. */
const AREAS = [
  "frame",
  "charts",
  "tables",
  "records",
  "layout",
  "rules",
  "sizes",
  "phone",
  "publish",
  "invoices",
  "appointments",
  "portal",
  "analytics",
] as const;
type Area = (typeof AREAS)[number];
const path = (area: Area) => `screens/p28${area}-${stamp}`;
const appOf = (area: Area) => `p28${area}-${stamp}`;
/** Where each served app is, with the closing slash. */
const served: Partial<Record<Area, string>> = {};

/** A stat as the exit criterion's pages draw one: a count of the walk's own invoices. */
const countOf = (id: string, title: string, at: Wid["at"]): Wid => ({
  id,
  type: "core/stat",
  title,
  at,
  data: {
    value: {
      source: {
        visual: {
          table: "invoices",
          filters: [{ column: "number", op: "contains", value: PREFIX }],
          measures: [{ fn: "count", as: "value" }],
        },
      },
    },
  },
});
const tableOf = (id: string, title: string, at: Wid["at"], extra: Wid = {}): Wid => ({
  id,
  type: "core/table",
  title,
  at,
  data: {
    rows: {
      source: {
        visual: {
          table: "invoices",
          filters: [{ column: "number", op: "contains", value: PREFIX }],
          sort: [{ by: "number" }],
        },
      },
    },
  },
  config: {
    columns: [
      { column: "number", label: "Number" },
      { column: "clinic", label: "Clinic" },
      { column: "total", label: "Total" },
      { column: "status", label: "Status" },
      { column: "issued_on", label: "Issued" },
    ],
  },
  ...extra,
});

type Made = { id: string; number: string };
/** The walk's invoices: a spread of statuses, clinics and days, for conditions to count. */
const INVOICES = [
  { key: "a", clinic: "northside", status: "unpaid", total: 12345, ago: 1 },
  { key: "b", clinic: "northside", status: "paid", total: 20000, ago: 3 },
  { key: "c", clinic: "riverside", status: "unpaid", total: 5500, ago: 10 },
  { key: "d", clinic: "riverside", status: "paid", total: 7000, ago: 45 },
  { key: "e", clinic: "hilltop", status: "unpaid", total: 9900, ago: 60 },
  { key: "f", clinic: "hilltop", status: "void", total: 1500, ago: 120 },
] as const;
const made: Record<string, Made> = {};
const numberOf = (key: string) => `${PREFIX}-${key.toUpperCase()}`;

// ----- What the build draws, in one place -----

/** The builder's right pane. */
const settings = () => owner.getByRole("complementary", { name: "Settings" });
/** A tab of the inspector. Its name gains ", has settings" once something on it is set. */
const tabOf = (name: string) => settings().getByRole("tab", { name: new RegExp(`^${name}\\b`) });
/** A row of the inspector: a button named by its label and its current value ("Source Invoices"). */
const rowOf = (label: string) =>
  settings().getByRole("button", { name: new RegExp(`^${label}( |$)`) });
/** The small editor a row opens. */
const editor = () => owner.getByRole("dialog").last();
/** A choice of radio tiles or options, which are drawn over a visually hidden input. */
const pickIn = (inside: Locator, name: string | RegExp) =>
  inside.getByText(name, { exact: typeof name === "string" }).first();
/** A widget on the canvas, by its name: a cell of the grid. */
const widget = (name: string | RegExp) =>
  owner
    .locator("[data-widget-cell]")
    .and(owner.getByRole("group", { name, ...(typeof name === "string" ? { exact: true } : {}) }));
/** The outline ("On this page"). */
const outline = () => owner.getByRole("region", { name: "On this page" });
const pages = () => owner.getByRole("region", { name: "Pages", exact: true });
const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

/**
 * The draft of an area's interface, as the API has it (the builder saves a moment after a change;
 * until its first change there is no draft, and the published interface is what stands).
 */
const drafted = async (area: Area): Promise<{ pages: Wid[] }> => {
  const answer = await call(owner, "GET", `${W}/drafts/${path(area)}`);
  if (answer.status === 404) return (await ok(owner, "GET", `${W}/interfaces/${path(area)}`)).body;
  return answer.body.body;
};
const draftPage = async (area: Area, id: string): Promise<Wid> =>
  (await drafted(area)).pages.find((one: { id: string }) => one.id === id);
const draftWidget = async (area: Area, page: string, match: (one: Wid) => boolean) =>
  (await draftPage(area, page))?.widgets.find(match);
/** Waits for the builder's save to reach the server, then returns the widget. */
async function savedWidget(area: Area, page: string, match: (one: Wid) => boolean): Promise<Wid> {
  let found: Wid;
  await expect
    .poll(async () => {
      found = await draftWidget(area, page, match);
      return Boolean(found);
    })
    .toBe(true);
  return found;
}

async function openBuilder(area: Area, pageTitle: RegExp, size = { width: 1440, height: 1000 }) {
  await owner.setViewportSize(size);
  await owner.goto(`${L}/screens/${path(area)}`);
  const choose = pages().getByRole("button", { name: pageTitle });
  await expect(choose).toBeVisible({ timeout: 30_000 });
  // At a narrow width choosing a page opens its settings as a sheet over the builder: the
  // journeys that need the pane at 768 or 390 open it themselves.
  if (size.width > 900) {
    await choose.click();
    await expect(choose).toHaveAttribute("aria-pressed", "true");
  }
}

/** Chooses a widget in "Add to page", by name. */
async function addWidget(name: string) {
  await owner
    .getByRole("button", { name: /^Add to page/ })
    .first()
    .click();
  await owner
    .getByRole("dialog", { name: "Add to page" })
    .getByRole("button", { name: new RegExp(`^${name}\\b`) })
    .click();
}

/** Opens a row of the inspector and returns the editor it opens. */
async function openRow(label: string) {
  await rowOf(label).click();
  const open = editor();
  await expect(open).toBeVisible();
  return open;
}

// ----- Setup -----

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  owner = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signInWithPassword(owner, OWNER, PASSWORD);
  const tenants = await ok(owner, "GET", "/tenants?limit=200");
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const workspaces = (await ok(owner, "GET", `/tenants/${tenant.id}/workspaces`)).items;
  const sandbox = workspaces.find((one: { slug: string }) => one.slug === SANDBOX);
  test.skip(!sandbox, "Fernhill's sandbox workspace is needed.");
  TENANT_ID = tenant.id;
  W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  L = `/t/${tenant.id}/workspaces/${sandbox.id}`;

  for (const one of INVOICES) {
    const row = await ok(owner, "POST", `${W}/rows/invoices`, {
      number: numberOf(one.key),
      client_code: `CZ${stamp.toUpperCase()}${one.key.toUpperCase()}`,
      clinic: one.clinic,
      total: one.total,
      status: one.status,
      issued_on: day(one.ago),
    });
    made[one.key] = { id: row.items[0].id, number: numberOf(one.key) };
  }

  // Every area's interface, with the pages the journeys start from.
  const stacked = Array.from({ length: 8 }, (_, at) =>
    countOf(`s${at}`, `Stat ${at + 1}`, { x: 0, y: at * 4, w: 6, h: 3 }),
  );
  const bodies: Record<Area, { title: string; pages: Wid[] }> = {
    frame: {
      title: `Frame ${stamp}`,
      pages: [
        { id: "tall", title: "Tall", widgets: stacked },
        { id: "blank", title: "Blank", widgets: [] },
        { id: "welcome", title: "Welcome", widgets: [] },
        {
          id: "dialog",
          title: "A dialog",
          kind: "modal",
          widgets: [countOf("one", "One", { x: 0, y: 0, w: 6, h: 3 })],
        },
      ],
    },
    charts: { title: `Charts ${stamp}`, pages: [{ id: "blank", title: "Blank", widgets: [] }] },
    tables: {
      title: `Tables ${stamp}`,
      pages: [
        {
          id: "invoices",
          title: "Invoices",
          widgets: [tableOf("list", "Invoices", { x: 0, y: 0, w: 12, h: 10 })],
        },
        {
          id: "bulk",
          title: "To pay",
          widgets: [tableOf("pay", "To pay", { x: 0, y: 0, w: 12, h: 10 })],
        },
        { id: "blank", title: "Blank", widgets: [] },
      ],
    },
    records: {
      title: `Records ${stamp}`,
      pages: [
        { id: "blank", title: "Blank", widgets: [] },
        {
          id: "invoice",
          title: "Invoice sheet",
          kind: "sheet",
          record: { table: "invoices" },
          widgets: [],
        },
      ],
    },
    layout: { title: `Layout ${stamp}`, pages: [{ id: "blank", title: "Blank", widgets: [] }] },
    rules: { title: `Rules ${stamp}`, pages: [{ id: "blank", title: "Blank", widgets: [] }] },
    sizes: {
      title: `Sizes ${stamp}`,
      pages: [
        { id: "home", title: "Home", widgets: [] },
        {
          id: "sheet",
          title: "A sheet",
          kind: "sheet",
          record: { table: "invoices" },
          widgets: [countOf("a", "A", { x: 0, y: 0, w: 6, h: 3 })],
        },
        {
          id: "modal",
          title: "A modal",
          kind: "modal",
          widgets: [countOf("b", "B", { x: 0, y: 0, w: 6, h: 3 })],
        },
      ],
    },
    phone: {
      title: `Phone ${stamp}`,
      pages: [
        {
          id: "blank",
          title: "Blank",
          widgets: [
            countOf("alpha", "Alpha", { x: 0, y: 0, w: 6, h: 3 }),
            countOf("beta", "Beta", { x: 6, y: 0, w: 6, h: 3 }),
            tableOf("rows", "Rows", { x: 0, y: 3, w: 12, h: 8 }),
            countOf("gamma", "Gamma", { x: 0, y: 11, w: 4, h: 3 }),
            countOf("delta", "Delta", { x: 4, y: 11, w: 4, h: 3 }),
          ],
        },
      ],
    },
    publish: { title: `Publish ${stamp}`, pages: [{ id: "blank", title: "Blank", widgets: [] }] },
    invoices: { title: `Invoices ${stamp}`, pages: [{ id: "blank", title: "Blank", widgets: [] }] },
    appointments: {
      title: `Appointments ${stamp}`,
      pages: [{ id: "blank", title: "Blank", widgets: [] }],
    },
    portal: { title: `Portal ${stamp}`, pages: [{ id: "blank", title: "Blank", widgets: [] }] },
    analytics: {
      title: `Analytics ${stamp}`,
      pages: [{ id: "blank", title: "Blank", widgets: [] }],
    },
  };
  const paths: string[] = [];
  for (const area of AREAS) {
    await ok(owner, "PUT", `${W}/drafts/${path(area)}`, {
      kind: "interface",
      schemaVersion: 2,
      body: bodies[area],
      create: true,
    });
    await ok(owner, "PUT", `${W}/drafts/${appOf(area)}`, {
      kind: "app",
      schemaVersion: 1,
      body: { title: bodies[area].title, interface: path(area) },
      create: true,
    });
    paths.push(path(area), appOf(area));
  }
  await ok(owner, "POST", `${W}/changes/deploy`, { paths, message: `Phase 28 walk ${stamp}` });
  const apps = (await ok(owner, "GET", `${W}/apps`)).items as { url: string }[];
  for (const area of AREAS) {
    const app = apps.find((one) => one.url.includes(appOf(area)));
    if (app) served[area] = `${new URL(app.url).pathname.replace(/\/$/, "")}/`;
  }
});

test.afterAll(async () => {
  if (!owner) return;
  if (W) {
    for (const one of Object.values(made))
      await call(owner, "DELETE", `${W}/rows/invoices/${one.id}`);
    for (const area of AREAS) {
      for (const name of [path(area), appOf(area)]) {
        await call(owner, "DELETE", `${W}/drafts/${name}`);
      }
    }
  }
  await owner.context().close();
});

// ----- 1. The builder's frame -----

test("POLISH-001: the frame is one header, a pages and outline pane, the canvas and the settings, edge to edge at 1440", async () => {
  await openBuilder("frame", /^Tall/);
  const header = owner.getByRole("heading", { name: `Frame ${stamp}`, level: 1 });
  await expect(header).toBeVisible();
  // One header row holds the name, its pencil, the device switch, View as, undo, redo and Publish.
  const top = (await header.boundingBox())?.y ?? 0;
  for (const control of [
    owner.getByRole("button", { name: "Rename the app" }),
    owner.getByRole("radiogroup", { name: "Screen size" }),
    owner.getByRole("button", { name: /^View as/ }),
    owner.getByRole("button", { name: "Undo" }),
    owner.getByRole("button", { name: "Redo" }),
    owner.getByRole("button", { name: "Publish", exact: true }),
  ]) {
    const box = await control.boundingBox();
    expect(box, "a control of the header is on the page").toBeTruthy();
    expect(
      Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - (top + 12)),
      "on the header's row",
    ).toBeLessThan(40);
  }
  // The panes: pages and the outline on the left, the settings on the right, the canvas between.
  await expect(pages()).toBeVisible();
  await expect(outline()).toBeVisible();
  await expect(owner.getByRole("button", { name: /^Add to page/ }).first()).toBeVisible();
  await expect(settings()).toBeVisible();
  // Edge to edge: the settings reach the right edge of the window, and the page does not scroll.
  const right = await settings().boundingBox();
  expect(right && Math.abs(right.x + right.width - 1440) <= 1, "the settings end at 1440").toBe(
    true,
  );
  const left = await pages().boundingBox();
  expect(left && left.x < 120, "the left pane starts beside the navigation").toBe(true);
  expect(await noSideways(owner)).toBe(true);
  await expectNoAxeViolations(owner, "the builder");
});

test("POLISH-005: the builder does not scroll sideways at 768 or at 390, and its panes stay reachable", async () => {
  for (const width of [768, 390]) {
    await openBuilder("frame", /^Tall/, { width, height: 900 });
    await expect(owner.getByRole("heading", { name: `Frame ${stamp}`, level: 1 })).toBeVisible();
    await expect(widget("Stat 1")).toBeVisible();
    expect(await noSideways(owner), `no sideways scroll at ${width}`).toBe(true);
    // The pane that lists the widgets is reached, whatever the width.
    await expect(owner.getByRole("button", { name: /^Add to page/ }).first()).toBeAttached();
    await owner.reload();
    await expect(owner.getByRole("heading", { name: `Frame ${stamp}`, level: 1 })).toBeVisible();
    expect(await noSideways(owner), `no sideways scroll at ${width} after a reload`).toBe(true);
  }
  await owner.setViewportSize({ width: 1440, height: 1000 });
});

test("POLISH-007: the device switch is a radio group the arrow keys move, and the canvas follows it", async () => {
  await openBuilder("frame", /^Tall/);
  const group = owner.getByRole("radiogroup", { name: "Screen size" });
  const desktop = group.getByRole("radio", { name: "Desktop" });
  await expect(desktop).toBeChecked();
  const wide = (await owner.locator("[data-widget-cell]").first().boundingBox())?.width ?? 0;
  await desktop.focus();
  await owner.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Tablet" })).toBeChecked();
  await expect(group.getByRole("radio", { name: "Tablet" })).toBeFocused();
  const tablet = (await owner.locator("[data-widget-cell]").first().boundingBox())?.width ?? 0;
  expect(tablet, "the canvas is drawn at the tablet's width").not.toBe(wide);
  await owner.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Phone" })).toBeChecked();
  await expect(owner.getByText("Phone layout is made from the desktop one.")).toBeVisible();
  const phone = (await owner.locator("[data-widget-cell]").first().boundingBox())?.width ?? 0;
  expect(phone, "the widgets are drawn inside a phone's width").toBeLessThanOrEqual(390);
  await owner.keyboard.press("ArrowRight");
  await expect(desktop).toBeChecked();
  await owner.keyboard.press("ArrowLeft");
  await expect(group.getByRole("radio", { name: "Phone" })).toBeChecked();
  await group.getByRole("radio", { name: "Desktop" }).click();
  await expect(desktop).toBeChecked();
});

test("POLISH-011: a widget chosen in the outline is scrolled into view on the canvas and selected", async () => {
  await openBuilder("frame", /^Tall/, { width: 1440, height: 700 });
  await expect(widget("Stat 1")).toBeVisible();
  await expect(widget("Stat 8")).not.toBeInViewport();
  await outline().getByRole("button", { name: "Stat 8" }).click();
  await expect(widget("Stat 8")).toBeInViewport();
  await expect(outline().getByRole("button", { name: "Stat 8" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(settings().getByRole("heading", { name: "Stat 8" })).toBeVisible();
  await outline().getByRole("button", { name: "Stat 1" }).click();
  await expect(widget("Stat 1")).toBeInViewport();
  await owner.setViewportSize({ width: 1440, height: 1000 });
});

test("POLISH-003: a page's icon, its size and its title are chosen in the settings, saved, and kept after a reload", async () => {
  await openBuilder("frame", /^Welcome/);
  const form = settings().getByRole("region", { name: "Page settings" });
  await expect(form).toBeVisible();
  await form.getByLabel(/^Title in the app menu/).fill("Front page");
  await form.getByLabel("Icon").selectOption({ label: "Wallet" });
  await expect
    .poll(async () => {
      const page = await draftPage("frame", "welcome");
      return `${page.title}|${page.icon}`;
    })
    .toBe("Front page|wallet");
  await expect(pages().getByRole("button", { name: /^Front page/ })).toBeVisible();
  // The size is a modal's: open the dialog page, and choose a size by its name.
  await pages()
    .getByRole("button", { name: /^A dialog/ })
    .click();
  const dialog = settings().getByRole("region", { name: "Page settings" });
  await dialog.getByLabel("Size").selectOption({ label: "Large" });
  await expect.poll(async () => (await draftPage("frame", "dialog")).size).toBe("large");
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Front page/ })
    .click();
  await expect(
    settings()
      .getByRole("region", { name: "Page settings" })
      .getByLabel(/^Title in the app menu/),
  ).toHaveValue("Front page");
  await expect(
    settings().getByRole("region", { name: "Page settings" }).getByLabel("Icon"),
  ).toHaveValue("wallet");
  await pages()
    .getByRole("button", { name: /^A dialog/ })
    .click();
  await expect(
    settings().getByRole("region", { name: "Page settings" }).getByLabel("Size"),
  ).toHaveValue("large");
});

// ----- 2. The widget selector -----

const selector = () => owner.getByRole("dialog", { name: "Add to page" });
const selectorSearch = () =>
  selector().getByRole("textbox", {
    name: "Find something to add, or describe what people should do",
  });

test("POLISH-007: Add to page opens with the cursor in its search, and Escape closes it and gives the focus back", async () => {
  await openBuilder("frame", /^Blank/);
  const opener = owner.getByRole("button", { name: /^Add to page/ }).first();
  await opener.focus();
  await owner.keyboard.press("Enter");
  await expect(selector()).toBeVisible();
  await expect(selectorSearch()).toBeFocused();
  // Every kind of widget is offered, in the board's four groups.
  for (const group of [
    "Work with records",
    "Understand data",
    "Take action",
    "Organize and explain",
  ]) {
    await expect(selector().getByRole("region", { name: group })).toBeVisible();
  }
  // The preview says what the tile in view is for, and the keys.
  await expect(selector().getByRole("complementary", { name: "Preview" })).toContainText(
    "Good for",
  );
  await expectNoAxeViolations(owner, "the widget selector");
  await owner.keyboard.press("Escape");
  await expect(selector()).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('POLISH-009: typing what people should do, "take payments", finds Button; the arrow keys and Enter place it', async () => {
  await openBuilder("frame", /^Blank/);
  await owner
    .getByRole("button", { name: /^Add to page/ })
    .first()
    .click();
  await selectorSearch().fill("take payments");
  const button = selector().getByRole("button", { name: /^Button\b/ });
  await expect(button).toBeVisible();
  // Words that match nothing about payments are left out.
  await expect(selector().getByRole("button", { name: /^Chart\b/ })).toHaveCount(0);
  // The arrow goes from the search to the first tile; Enter on it places it at the end of the page.
  await owner.keyboard.press("ArrowDown");
  await expect(button).toBeFocused();
  await expect(selector().getByRole("complementary", { name: "Preview" })).toContainText("Button");
  await owner.keyboard.press("Enter");
  await expect(selector()).toHaveCount(0);
  const placed = await savedWidget("frame", "blank", (one) => one.type === "core/button");
  expect(placed.type).toBe("core/button");
  await expect(outline().getByRole("button", { name: "Button" })).toBeVisible();
  await expect(widget("Button")).toBeVisible();
  // A search that matches nothing says so, and says what to try.
  await owner
    .getByRole("button", { name: /^Add to page/ })
    .first()
    .click();
  await selectorSearch().fill("zzzz qqqq");
  await expect(selector().getByRole("status")).toContainText("Nothing matches");
  await owner.keyboard.press("Escape");
  await expect(selector()).toHaveCount(0);
});

test("POLISH-009: a page that shows Invoices is offered next steps, and one applied adds what it says", async () => {
  await openBuilder("tables", /^Invoices/);
  await owner
    .getByRole("button", { name: /^Add to page/ })
    .first()
    .click();
  const suggested = selector().getByRole("region", { name: "Suggested for Invoices" });
  await expect(suggested).toBeVisible();
  for (const label of ["Search invoices", "Invoice detail", "New invoice form"]) {
    await expect(
      suggested.getByRole("button", { name: new RegExp(`^${label}`) }),
      label,
    ).toBeVisible();
  }
  const before = (await draftPage("tables", "invoices")).widgets.length;
  await suggested.getByRole("button", { name: /^Search invoices/ }).click();
  await expect(selector()).toHaveCount(0);
  const filter = await savedWidget("tables", "invoices", (one) => one.type === "core/filter");
  expect((filter.config.filters as Wid[]).some((one) => one.type === "search")).toBe(true);
  expect((await draftPage("tables", "invoices")).widgets.length).toBeGreaterThan(before);
  await expect(widget("Search and filter")).toBeVisible();
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Invoices/ })
    .click();
  await expect(widget("Search and filter")).toBeVisible();
  // It is offered no longer.
  await owner
    .getByRole("button", { name: /^Add to page/ })
    .first()
    .click();
  await expect(
    selector()
      .getByRole("region", { name: "Suggested for Invoices" })
      .getByRole("button", { name: /^Search invoices/ }),
  ).toHaveCount(0);
  await owner.keyboard.press("Escape");
});

// ----- 3. One inspector journey per kind -----

/** A tile of radio choices is drawn over a hidden input: press its label. */
const choose = (inside: Locator, name: string | RegExp) =>
  inside.getByRole("radio", { name }).first().locator("xpath=(ancestor::label[1] | self::*)[1]");
/** A switch of the inspector, by its name. */
const flip = (name: string) => settings().getByRole("switch", { name });
/** Adds a widget to the open page by the selector, and waits until the builder has saved it. */
async function addAndSave(area: Area, page: string, name: string, type: string): Promise<Wid> {
  const before = ((await draftPage(area, page)).widgets as Wid[]).filter(
    (one) => one.type === type,
  ).length;
  await addWidget(name);
  await expect
    .poll(
      async () =>
        ((await draftPage(area, page)).widgets as Wid[]).filter((one) => one.type === type).length,
    )
    .toBe(before + 1);
  return ((await draftPage(area, page)).widgets as Wid[]).filter((one) => one.type === type).at(-1);
}
/** Reads the widget with this id from the draft, once the builder has saved. */
const widgetNow = async (area: Area, page: string, id: string): Promise<Wid> =>
  draftWidget(area, page, (one) => one.id === id);
/** Reads a row of the draft's widget until `read` says what is wanted. */
const settle = async (area: Area, page: string, id: string, read: (one: Wid) => unknown) => {
  let at: unknown;
  await expect
    .poll(async () => {
      const one = await widgetNow(area, page, id);
      at = one ? read(one) : undefined;
      return JSON.stringify(at);
    })
    .not.toBe(undefined);
  return at;
};
/** Chooses a source: the table the widget reads. */
async function chooseSource(table: string) {
  await rowOf("Source").click();
  await pickIn(owner.getByRole("dialog", { name: "Where it reads from" }), table).click();
  await expect(rowOf("Source")).toContainText(table);
}

test("POLISH-004: Chart: Measure, For each, the chart type and its colours are written, drawn, and kept after a reload", async () => {
  await openBuilder("charts", /^Blank/);
  const added = await addAndSave("charts", "blank", "Chart", "core/chart");
  await chooseSource("Invoices");
  // Measure: Sum of Total. The sentence under the rows says it in words.
  let open = await openRow("Measure");
  await open.getByLabel("What it works out").selectOption({ label: "Sum" });
  await open
    .getByLabel("Of")
    .or(open.getByLabel("Column"))
    .first()
    .selectOption({ label: "Total" });
  await owner.keyboard.press("Escape");
  await expect(rowOf("Measure")).toContainText("Sum");
  // For each: Clinic. The columns are ordered by how well they group, and say how many values.
  open = await openRow("For each");
  await expect(choose(open, /^Clinic\b.*3 values/)).toBeVisible();
  await choose(open, /^Clinic\b/).click();
  await owner.keyboard.press("Escape");
  await expect(rowOf("For each")).toContainText("Clinic");
  await expect(settings()).toContainText("Reads as the sum of total for each clinic");
  // The chart is drawn with the clinics.
  const drawn = widget(/^Chart/);
  for (const clinic of ["northside", "riverside", "hilltop"]) {
    await expect(drawn.getByText(clinic, { exact: true }).first()).toBeVisible();
  }
  // Display: a type that fits, the colours, and the number format.
  await tabOf("Display").click();
  const kind = settings().getByRole("group", { name: "Chart type" });
  await expect(kind.getByRole("radio", { name: /^Line needs a date/ })).toBeDisabled();
  await choose(kind, /^Bar, sideways/).click();
  open = await openRow("Colors");
  await choose(open, "Warm").click();
  await owner.keyboard.press("Escape");
  open = await openRow("Numbers");
  await choose(open, /^Money, whole/).click();
  await owner.keyboard.press("Escape");
  const config = await settle("charts", "blank", added.id, (one) =>
    one.config?.colors === "warm" ? one : undefined,
  );
  const chart = config as Wid;
  expect(chart.config.mark).toBe("bar");
  expect(chart.config.horizontal).toBe(true);
  const visual = chart.data.rows.source.visual;
  expect(visual.measures[0]).toMatchObject({ fn: "sum", column: "total" });
  expect(visual.groupBy[0].column).toBe("clinic");
  // Kept after a reload.
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await outline()
    .getByRole("button", { name: /^Chart/ })
    .click();
  await expect(
    widget(/^Chart/)
      .getByText("northside", { exact: true })
      .first(),
  ).toBeVisible();
  await tabOf("Display").click();
  await expect(rowOf("Colors")).toContainText("Warm");
  await expect(rowOf("Numbers")).toContainText("Money");
  await tabOf("Data").click();
  await expect(rowOf("Measure")).toContainText("Sum");
  await expect(rowOf("For each")).toContainText("Clinic");
});

/** Gives a measure its function and column, in the editor a row ("Measure", "Value") opens. */
async function setMeasure(row: string, fn: string, column?: string) {
  const open = await openRow(row);
  await open.getByLabel("What it works out").selectOption({ label: fn });
  if (column) {
    await open
      .getByLabel("Of")
      .or(open.getByLabel("Column"))
      .first()
      .selectOption({ label: column });
  }
  await owner.keyboard.press("Escape");
}

/** "Only include": a sentence, from the editor the dashed "+ Condition" opens. */
async function addCondition(field: string, test: string, fill: (editor: Locator) => Promise<void>) {
  await settings()
    .getByRole("button", { name: /^Condition/ })
    .click();
  const open = owner.getByRole("dialog", { name: "Only include rows where" });
  await open.getByLabel("Field").selectOption({ label: field });
  await choose(open, new RegExp(`^${test}$`)).click();
  await fill(open);
  await open.getByRole("button", { name: "Add" }).click();
}
/** The sentence a condition is, as the inspector's chips write it. */
const chip = (words: string | RegExp) =>
  settings().getByRole("group", { name: "Conditions rows must meet" }).getByText(words);

test("POLISH-004: Stat: a value, a condition, a title and a money format are written, shown on the canvas as the number, and kept after a reload", async () => {
  await openBuilder("charts", /^Blank/);
  const added = await addAndSave("charts", "blank", "Stat", "core/stat");
  await chooseSource("Invoices");
  await addCondition("Number", "contains", (open) =>
    open.getByRole("textbox", { name: "Value" }).fill(PREFIX),
  );
  await setMeasure("Value", "Sum", "Total");
  await tabOf("Display").click();
  const open = await openRow("Numbers");
  await choose(open, /^Money\b(?!,)/).click();
  await open.getByRole("switch", { name: "Stored in cents" }).check();
  await owner.keyboard.press("Escape");
  await rowOf("Title").click();
  await editor().getByRole("textbox").first().fill("Invoiced by the walk");
  await owner.keyboard.press("Enter");
  // The six invoices of the walk add up to $562.45, and the stat on the canvas says so.
  const total = INVOICES.reduce((sum, one) => sum + one.total, 0) / 100;
  await expect(widget("Invoiced by the walk")).toContainText(`$${total.toFixed(2)}`);
  const stat = (await settle("charts", "blank", added.id, (one) =>
    one.title === "Invoiced by the walk" ? one : undefined,
  )) as Wid;
  const visual = stat.data.value.source.visual;
  expect(visual.measures[0]).toMatchObject({ fn: "sum", column: "total" });
  expect(visual.filters[0]).toMatchObject({ column: "number", op: "contains", value: PREFIX });
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await expect(widget("Invoiced by the walk")).toContainText(`$${total.toFixed(2)}`);
});

/** Narrows the open widget to the walk's own invoices, so what it counts is known. */
const onlyTheWalks = () =>
  addCondition("Number", "contains", (open) =>
    open.getByRole("textbox", { name: "Value" }).fill(PREFIX),
  );

test("POLISH-004: Goal: a value, a goal and when it is reached are written, drawn as progress, and kept after a reload", async () => {
  await openBuilder("charts", /^Blank/);
  const added = await addAndSave("charts", "blank", "Goal", "labs/goal");
  await chooseSource("Invoices");
  await onlyTheWalks();
  // The value is the count of the walk's invoices: six. The goal is ten: sixty per cent.
  const open = await openRow("Goal");
  await open.getByRole("spinbutton").first().fill("10");
  await owner.keyboard.press("Escape");
  const goal = widget(/^Goal/);
  await expect(goal).toContainText("6");
  await expect(goal).toContainText("60%");
  await expect(goal.getByRole("progressbar")).toBeVisible();
  // "Show the percentage" off takes the figure away.
  await tabOf("Display").click();
  await flip("Show the percentage").uncheck();
  await expect(goal).not.toContainText("60%");
  const saved = (await settle("charts", "blank", added.id, (one) =>
    one.config?.percent === false ? one : undefined,
  )) as Wid;
  expect(saved.config.target).toBe(10);
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await expect(widget(/^Goal/)).toContainText("6");
  await expect(widget(/^Goal/)).not.toContainText("60%");
});

test("POLISH-004: Pivot: a measure, rows and columns are written, drawn as a grid with the right counts, and kept after a reload", async () => {
  await openBuilder("charts", /^Blank/);
  const added = await addAndSave("charts", "blank", "Pivot", "core/pivot");
  await chooseSource("Invoices");
  await onlyTheWalks();
  let open = await openRow("Rows");
  await choose(open, /^Clinic\b/).click();
  await owner.keyboard.press("Escape");
  open = await openRow("Columns");
  await choose(open, /^Status\b/).click();
  await owner.keyboard.press("Escape");
  const grid = widget(/^Pivot/);
  // The walk's invoices: northside has one unpaid and one paid; hilltop one unpaid and one void.
  const northside = grid.getByRole("row", { name: /northside/ });
  await expect(northside).toBeVisible();
  const cells = async (clinic: string) =>
    (
      await grid
        .getByRole("row", { name: new RegExp(clinic) })
        .getByRole("cell")
        .allTextContents()
    ).map((one) => one.trim());
  expect(await cells("northside")).toEqual(expect.arrayContaining(["1"]));
  await tabOf("Display").click();
  await flip("Shade cells by size").check();
  const saved = (await settle("charts", "blank", added.id, (one) =>
    one.config?.shade === true ? one : undefined,
  )) as Wid;
  expect(saved.data.rows.source.visual.groupBy.map((one: Wid) => one.column)).toEqual([
    "clinic",
    "status",
  ]);
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await expect(widget(/^Pivot/).getByRole("row", { name: /northside/ })).toBeVisible();
});

test("POLISH-004: List: a column is put in each named place, drawn in the rows, and Cards changes the look; kept after a reload", async () => {
  await openBuilder("records", /^Blank/);
  const added = await addAndSave("records", "blank", "List", "core/list");
  await chooseSource("Invoices");
  await onlyTheWalks();
  await tabOf("Display").click();
  const place = (name: string) =>
    settings()
      .getByRole("region", { name: "What goes where" })
      .getByRole("button", { name: new RegExp(`^${name}( |$)`) });
  await place("Title").click();
  await editor().getByRole("button", { name: "Number", exact: true }).click();
  await owner.keyboard.press("Escape");
  await place("Under the title").click();
  await editor().getByRole("button", { name: "Clinic", exact: true }).click();
  await owner.keyboard.press("Escape");
  const list = widget(/^List/);
  await expect(list).toContainText(made.a?.number ?? "");
  await expect(list).toContainText("northside");
  await choose(settings().getByRole("group", { name: "Rows" }), "Cards").click();
  const saved = (await settle("records", "blank", added.id, (one) =>
    one.config?.look === "cards" ? one : undefined,
  )) as Wid;
  expect(saved.config.title).toBe("number");
  expect(saved.config.subtitle).toBe("clinic");
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await expect(widget(/^List/)).toContainText(made.a?.number ?? "");
});

test("POLISH-004: List: the Badge place offers the Status column, as Conditions offers its values", async () => {
  await openBuilder("layout", /^Blank/);
  await addAndSave("layout", "blank", "List", "core/list");
  await chooseSource("Invoices");
  await tabOf("Display").click();
  await settings()
    .getByRole("region", { name: "What goes where" })
    .getByRole("button", { name: /^Badge( |$)/ })
    .click();
  await expect(editor().getByRole("button", { name: "Status", exact: true })).toBeVisible();
  await owner.keyboard.press("Escape");
});

test("POLISH-004: Record detail: the record, its fields in sections and edit in place are written, drawn on the sheet, and kept after a reload", async () => {
  await openBuilder("records", /^Invoice sheet/);
  const added = await addAndSave("records", "invoice", "Record detail", "core/detail");
  // On a sheet the record to show is the one the sheet was opened with.
  await choose(
    settings().getByRole("group", { name: "Where the record comes from" }),
    /^The record this page was opened with/,
  ).click();
  await expect(owner.getByText(/Record detail needs Record to show/)).toHaveCount(0);
  await tabOf("Display").click();
  const fields = settings().getByRole("region", { name: "Fields" });
  // Every column is shown, so each is in the list, to hide, reorder and group into sections.
  await expect
    .soft(fields.getByRole("list", { name: "Fields" }), "the Fields list holds the columns shown")
    .toContainText("Number");
  // A column is not drawn as the words "[object Object]".
  await expect.soft(widget(/^Record detail/)).not.toContainText("[object Object]");
  await choose(settings().getByRole("group", { name: "Fields across" }), "3").click();
  await flip("Let people edit fields in place").check();
  const saved = (await settle("records", "invoice", added.id, (one) =>
    one.config?.edit && one.config?.across === 3 ? one : undefined,
  )) as Wid;
  expect(saved.config.across).toBe(3);
  // The sheet on the canvas is previewed on a sample invoice, with the fields.
  await expect(widget(/^Record detail/)).toContainText("Number");
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Invoice sheet/ })
    .click();
  await outline()
    .getByRole("button", { name: /^Record detail/ })
    .click();
  await tabOf("Display").click();
  await expect(flip("Let people edit fields in place")).toBeChecked();
  await expect(widget(/^Record detail/)).toContainText("Number");
});

test("POLISH-004: Form: made in its dialog on a table of choice, fields unchecked, previewed live, and the form is a modal page that writes that table", async () => {
  await openBuilder("records", /^Blank/);
  await owner
    .getByRole("button", { name: /^Add to page/ })
    .first()
    .click();
  await selector()
    .getByRole("button", { name: /^Form\b/ })
    .click();
  const dialog = owner.getByRole("dialog", { name: "Add a form" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Table").selectOption({ label: "Invoices" });
  // The preview on the right is drawn from the settings on the left, live.
  const preview = dialog.getByRole("region", { name: "Preview" });
  await expect(preview).toContainText("New invoice");
  await expect(preview).toContainText("Payment ref");
  await dialog.getByRole("checkbox", { name: "Payment ref" }).uncheck();
  await expect(preview).not.toContainText("Payment ref");
  await expectNoAxeViolations(owner, "the Add a form dialog");
  await dialog.getByRole("button", { name: /^Create form$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => (await drafted("records")).pages.some((one: Wid) => one.kind === "modal"))
    .toBe(true);
  const modal = (await drafted("records")).pages.find((one: Wid) => one.kind === "modal");
  const form = modal.widgets.find((one: Wid) => one.type === "core/form");
  expect(form, "the modal page holds the form").toBeTruthy();
  const columns = (form.config.fields as Wid[]).map((one) => one.column);
  expect(columns).toContain("number");
  expect(columns).not.toContain("payment_ref");
  expect(JSON.stringify(form.data)).toContain("invoices");
  await owner.reload();
  await expect(pages().getByRole("button", { name: /^New invoice/ })).toBeVisible();
});

test("POLISH-004: Button: its words, tone, icon and place in its cell (3 by 3) are written, drawn in that corner, and kept after a reload", async () => {
  await openBuilder("layout", /^Blank/);
  const added = await addAndSave("layout", "blank", "Button", "core/button");
  await tabOf("Display").click();
  await rowOf("Says").click();
  await editor().getByRole("textbox").first().fill("Print");
  await owner.keyboard.press("Enter");
  await choose(settings().getByRole("group", { name: "Style" }), "Danger").click();
  await rowOf("Icon").click();
  await choose(editor(), "Download").click();
  await owner.keyboard.press("Escape");
  // The nine places in the cell: the button moves to the bottom right of it.
  const where = settings().getByRole("radiogroup", { name: "Where it sits in its place" });
  const cell = widget("Button");
  await expect(cell).toBeVisible();
  await choose(where, "Bottom right").click();
  const saved = (await settle("layout", "blank", added.id, (one) =>
    one.config?.place === "bottom-right" ? one : undefined,
  )) as Wid;
  expect(saved.config.label).toBe("Print");
  expect(saved.config.tone).toBe("danger");
  expect(saved.config.icon).toBe("download");
  const button = cell.getByRole("button", { name: /Print/ });
  const inner = await button.boundingBox();
  const outer = await cell.boundingBox();
  expect(inner && outer, "the button and its cell are drawn").toBeTruthy();
  if (inner && outer) {
    expect(inner.x + inner.width, "right edge").toBeGreaterThan(outer.x + outer.width - 40);
    expect(inner.y + inner.height, "bottom edge").toBeGreaterThan(outer.y + outer.height - 40);
  }
  await choose(where, "Top left").click();
  await expect
    .poll(async () => (await widgetNow("layout", "blank", added.id))?.config?.place)
    .toBe("top-left");
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await outline().getByRole("button", { name: "Button" }).click();
  await tabOf("Display").click();
  await expect(
    choose(settings().getByRole("radiogroup", { name: "Where it sits in its place" }), "Top left"),
  ).toBeVisible();
  await expect(
    settings()
      .getByRole("radiogroup", { name: "Where it sits in its place" })
      .getByRole("radio", { name: "Top left" }),
  ).toBeChecked();
});

test("POLISH-004: Action group: its buttons are rows with their own settings, lined up and shown up to a number; kept after a reload", async () => {
  await openBuilder("layout", /^Blank/);
  const added = await addAndSave("layout", "blank", "Action group", "core/actions");
  await tabOf("Display").click();
  await settings().getByRole("button", { name: "Button", exact: true }).click();
  // The new button opens its own Display, Actions and Rules; Back returns to the group.
  await expect(settings().getByRole("button", { name: /^Back/ })).toBeVisible();
  await settings().getByRole("button", { name: /^Back/ }).click();
  await expect(settings().getByRole("list", { name: "Buttons" }).getByRole("listitem")).toHaveCount(
    2,
  );
  // A button with nothing to do keeps the page from being published, and the page says why in
  // its own words, not in the schema's.
  await expect(owner.getByText(/To fix before it can be published/)).toBeVisible();
  await expect
    .soft(owner.getByText(/must NOT have fewer than/), "the reason is in words, not the schema's")
    .toHaveCount(0);
  await choose(settings().getByRole("group", { name: "Line up" }), "Spread").click();
  const saved = (await settle("layout", "blank", added.id, (one) =>
    one.config?.lineUp === "spread" ? one : undefined,
  )) as Wid;
  expect((saved.config.actions as Wid[]).length).toBe(2);
  const group = widget(/^Action group/);
  await expect(group.getByRole("button")).toHaveCount(2);
  await rowOf("Show up to").click();
  await editor().getByLabel("Buttons shown before the ⋯ menu").selectOption("1");
  await owner.keyboard.press("Escape");
  await expect
    .poll(async () => (await widgetNow("layout", "blank", added.id))?.config?.showUpTo)
    .toBe(1);
  // One button shows; the other is under ⋯.
  await expect(group.getByRole("button", { name: /More/ })).toBeVisible();
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await expect(widget(/^Action group/).getByRole("button", { name: /More/ })).toBeVisible();
});

test("POLISH-004: Section: plain or a card, and can be collapsed; kept after a reload", async () => {
  await openBuilder("layout", /^Blank/);
  const section = await addAndSave("layout", "blank", "Section", "core/section");
  await tabOf("Display").click();
  await choose(settings().getByRole("group", { name: "Style" }), "Card").click();
  await flip("Can be collapsed").check();
  const savedSection = (await settle("layout", "blank", section.id, (one) =>
    one.config?.look === "card" && one.config?.folds ? one : undefined,
  )) as Wid;
  expect(savedSection.config.look).toBe("card");
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await outline()
    .getByRole("button", { name: /^Section/ })
    .click();
  await tabOf("Display").click();
  await expect(flip("Can be collapsed")).toBeChecked();
});

test("POLISH-004: Tabs: the tab that opens first is chosen, the style is pills and the last tab is remembered; kept after a reload", async () => {
  await openBuilder("layout", /^Blank/);
  const tabs = await addAndSave("layout", "blank", "Tabs", "core/tabs");
  await tabOf("Display").click();
  const list = settings().getByRole("list", { name: "Tabs" });
  await expect(list).toContainText("First");
  await expect(list).toContainText("Second");
  // "Opens first" is a chip on the tab chosen: Second is chosen, and the page opens on it.
  await list.getByRole("button", { name: "Open Second first" }).last().click();
  await choose(settings().getByRole("group", { name: "Style" }), "Pills").click();
  await flip("Remember the last tab").check();
  const saved = (await settle("layout", "blank", tabs.id, (one) =>
    one.config?.look === "pills" && one.config?.remember === true && one.config?.opensFirst
      ? one
      : undefined,
  )) as Wid;
  expect(saved.config.opensFirst).toBe((saved.config.tabs as Wid[])[1].id);
  const strip = widget(/^Tabs/).getByRole("tablist");
  await expect(strip.getByRole("tab", { name: "Second" })).toHaveAttribute("aria-selected", "true");
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await expect(
    widget(/^Tabs/).getByRole("tablist").getByRole("tab", { name: "Second" }),
  ).toHaveAttribute("aria-selected", "true");
});

test("POLISH-004: Search and filter: a filter is added, sits behind a button, and the page's table follows it; kept after a reload", async () => {
  await openBuilder("layout", /^Blank/);
  const filter = await addAndSave("layout", "blank", "Search and filter", "core/filter");
  await tabOf("Display").click();
  await expect(settings().getByRole("list", { name: "Filters" })).toContainText("Search");
  await choose(settings().getByRole("group", { name: "Filters sit" }), "Behind a button").click();
  const saved = (await settle("layout", "blank", filter.id, (one) =>
    one.config?.sit === "button" ? one : undefined,
  )) as Wid;
  expect(saved.config.sit).toBe("button");
  await expect
    .soft(settings(), "the words are not written as escapes")
    .not.toContainText("\\u201c");
  await expect
    .soft(
      widget(/^Search and filter/).getByRole("button", { name: /^Filters/ }),
      "behind a button on the canvas",
    )
    .toBeVisible();
  // As a row it is a search box in the bar again.
  await choose(settings().getByRole("group", { name: "Filters sit" }), "In a row").click();
  await expect(widget(/^Search and filter/).getByRole("search")).toBeVisible();
  await choose(settings().getByRole("group", { name: "Filters sit" }), "Behind a button").click();
  await expect
    .poll(async () => (await widgetNow("layout", "blank", filter.id))?.config?.sit)
    .toBe("button");
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await outline()
    .getByRole("button", { name: /^Search and filter/ })
    .click();
  await expect(
    choose(settings().getByRole("group", { name: "Filters sit" }), "Behind a button").locator(
      "input",
    ),
  ).toBeChecked();
});

test("POLISH-004: Text: the style is chosen by looking, the words are written on the page in the Markdown editor, and what readers see is drawn; kept after a reload", async () => {
  await openBuilder("layout", /^Blank/);
  const text = await addAndSave("layout", "blank", "Text", "core/text");
  await choose(settings().getByRole("group", { name: "Style" }), "Warning").click();
  await settings().getByRole("button", { name: "Edit on the page" }).click();
  // The documentation's editor opens, with its toolbar, the component help and its modes.
  const write = owner.getByRole("dialog", { name: "Edit Text on the page" });
  await expect(write).toBeVisible();
  await expect(write.getByRole("toolbar", { name: "Write" })).toBeVisible();
  await expect(write.getByRole("button", { name: "Insert /" })).toBeVisible();
  const modes = write.getByRole("group", { name: "What is shown" });
  await write.locator(".monaco-editor .view-lines").click();
  await owner.keyboard.insertText("Closed on **Sunday**.");
  await expect(
    write.getByRole("region", { name: "Preview of the text" }).locator("strong"),
  ).toHaveText("Sunday");
  await modes.getByRole("button", { name: "Source" }).click();
  await expect(write.getByRole("region", { name: "Preview of the text" })).toHaveCount(0);
  await modes.getByRole("button", { name: "Preview" }).click();
  await expect(
    write.getByRole("region", { name: "Preview of the text" }).locator("strong"),
  ).toHaveText("Sunday");
  await expectNoAxeViolations(owner, "the Markdown editor of a Text widget");
  await write.getByRole("button", { name: "Done" }).click();
  await expect(write).toHaveCount(0);
  const saved = (await settle("layout", "blank", text.id, (one) =>
    typeof one.config?.text === "string" && one.config.text.includes("Sunday") ? one : undefined,
  )) as Wid;
  expect(saved.config.look).toBe("warning");
  await expect(widget(/^Text/).getByText("Sunday")).toBeVisible();
  await expect(widget(/^Text/).locator("strong")).toHaveText("Sunday");
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await expect(widget(/^Text/).locator("strong")).toHaveText("Sunday");
});

/** What a table draws as its headings, left to right. */
const headingsOf = async (name: string) =>
  (await widget(name).getByRole("columnheader").allTextContents()).map((one) => one.trim());
/** A column's own editor: opened from the inspector's list or from its heading on the page. */
const columnEditor = (name: string) => owner.getByRole("dialog", { name: `Column · ${name}` });

test("POLISH-004: Table: a column is renamed, hidden, reordered and formatted, and a heading on the page opens the same column", async () => {
  await openBuilder("tables", /^Invoices/);
  await outline().getByRole("button", { name: "Invoices", exact: true }).click();
  await tabOf("Display").click();
  await expect(settings().getByRole("region", { name: "Columns" })).toContainText("5 of 5 shown");
  expect(await headingsOf("Invoices")).toEqual(["Number", "Clinic", "Total", "Status", "Issued"]);
  // Rename: the heading on the page says so at once.
  await rowOf("Clinic").click();
  await columnEditor("Clinic").getByRole("textbox", { name: "Heading" }).fill("Branch");
  await owner.keyboard.press("Escape");
  await expect
    .poll(() => headingsOf("Invoices"))
    .toEqual(["Number", "Branch", "Total", "Status", "Issued"]);
  // Hide: the eye. The count says how many are shown.
  await settings().getByRole("button", { name: "Hide Issued" }).click();
  await expect(settings().getByRole("region", { name: "Columns" })).toContainText("4 of 5 shown");
  await expect.poll(() => headingsOf("Invoices")).toEqual(["Number", "Branch", "Total", "Status"]);
  // Reorder from the keyboard: Alt and the arrow move Total before Branch.
  await settings()
    .getByRole("button", { name: /^Reorder Total/ })
    .focus();
  await owner.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => headingsOf("Invoices")).toEqual(["Number", "Total", "Branch", "Status"]);
  // The format: money, kept in cents. The numbers on the page say so.
  await rowOf("Total").click();
  await columnEditor("Total")
    .getByRole("button", { name: /^Format/ })
    .click();
  const formats = owner.getByRole("dialog").last();
  await choose(formats, /^Money\b(?!,)/).click();
  await formats.getByRole("switch", { name: "Stored in cents" }).check();
  await owner.keyboard.press("Escape");
  await owner.keyboard.press("Escape");
  await expect(
    widget("Invoices").getByRole("row", { name: new RegExp(made.a?.number ?? "") }),
  ).toContainText("$123.45");
  // A heading on the page opens the same column.
  await widget("Invoices")
    .getByRole("columnheader", { name: "Branch" })
    .getByText("Branch")
    .click();
  await expect(columnEditor("Branch")).toBeVisible();
  await expect(columnEditor("Branch").getByRole("textbox", { name: "Heading" })).toHaveValue(
    "Branch",
  );
  await owner.keyboard.press("Escape");
  // All of it is kept after a reload (once the builder has saved: the header says so).
  await expect
    .poll(async () => {
      const columns = ((await widgetNow("tables", "invoices", "list"))?.config?.columns ??
        []) as Wid[];
      const at = (name: string) => columns.findIndex((one) => one.column === name);
      return (
        columns.find((one) => one.column === "clinic")?.label === "Branch" &&
        at("total") < at("clinic") &&
        JSON.stringify(columns.find((one) => one.column === "total")).includes("currency")
      );
    })
    .toBe(true);
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Invoices/ })
    .click();
  expect(await headingsOf("Invoices")).toEqual(["Number", "Total", "Branch", "Status"]);
  await expect(
    widget("Invoices").getByRole("row", { name: new RegExp(made.a?.number ?? "") }),
  ).toContainText("$123.45");
});

test("POLISH-004: Table: a column shown as a badge is offered each of its values to give a colour, and the chips on the page wear them", async () => {
  await openBuilder("tables", /^Invoices/);
  await outline().getByRole("button", { name: "Invoices", exact: true }).click();
  await tabOf("Display").click();
  await rowOf("Status").click();
  await choose(columnEditor("Status"), "Badge").click();
  // The values are the ones in the column: Conditions offers them with their counts, and so must this.
  const colours = columnEditor("Status").getByRole("region", { name: "Badge colors" });
  for (const value of ["paid", "unpaid", "void"]) {
    await expect(colours.getByLabel(`Color of ${value}`), `a colour for ${value}`).toBeVisible();
  }
  await colours.getByLabel("Color of unpaid").selectOption({ label: "Attention" });
  await colours.getByLabel("Color of paid").selectOption({ label: "Success" });
  await owner.keyboard.press("Escape");
  const table = await savedWidget("tables", "invoices", (one) => one.id === "list");
  const status = (table.config.columns as Wid[]).find((one) => one.column === "status");
  expect(status.as).toBe("badge");
  expect(status.badges).toMatchObject({ unpaid: "attention", paid: "success" });
  const row = widget("Invoices").getByRole("row", { name: new RegExp(made.a?.number ?? "") });
  await expect(row.getByText("unpaid", { exact: true })).toBeVisible();
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Invoices/ })
    .click();
  await expect(row.getByText("unpaid", { exact: true })).toBeVisible();
});

/** The editor of an action (a row action, a button above the table): the dialog named by what it says. */
const actionEditor = (says: string) => owner.getByRole("dialog", { name: says });

test("POLISH-004: Table: a row action is made in the inspector, run on the rows chosen in the published app, and who may run it is picked from the groups", async () => {
  await openBuilder("tables", /^To pay/);
  await outline().getByRole("button", { name: "To pay", exact: true }).click();
  await tabOf("Actions").click();
  // Several rows may be chosen, so an action can run on all of them.
  await flip("Let people select several rows").check();
  // A row action that marks the invoice paid, when it is unpaid, run only by Practice managers.
  await settings()
    .getByRole("button", { name: /^Row action$/ })
    .click();
  await actionEditor("Action").getByRole("textbox", { name: "Says" }).fill("Mark paid");
  await actionEditor("Mark paid").getByRole("button", { name: "Add a step" }).click();
  await owner.getByRole("menuitem", { name: "Update the record" }).click();
  await actionEditor("Mark paid").getByRole("button", { name: "Set another field" }).click();
  await owner.getByRole("menuitem", { name: "Status", exact: true }).click();
  await expect(
    actionEditor("Mark paid").getByText("Status", { exact: true }).first(),
  ).toBeVisible();
  await actionEditor("Mark paid")
    .getByRole("button", { name: /^Status becomes/ })
    .click();
  await owner.getByRole("textbox").last().fill("paid");
  await owner.keyboard.press("Enter");
  await expect(
    actionEditor("Mark paid").getByRole("button", { name: "Status becomes paid" }),
  ).toBeVisible();
  await expect(actionEditor("Mark paid")).toContainText("The clicked invoice");
  await actionEditor("Mark paid").getByRole("button", { name: "Group" }).click();
  await owner
    .getByRole("dialog", { name: "Groups" })
    .getByText("Practice managers", { exact: true })
    .click();
  await owner.getByRole("dialog", { name: "Groups" }).getByRole("button", { name: "Done" }).click();
  await actionEditor("Mark paid").getByRole("button", { name: "Done" }).click();
  await savedWidget("tables", "bulk", (one) => one.id === "pay");
  const saved = await settle("tables", "bulk", "pay", (one) =>
    (one.config?.rowActions as Wid[] | undefined)?.[0]?.action?.runBy ? one : undefined,
  );
  const rowAction = ((saved as Wid).config.rowActions as Wid[])[0];
  expect(rowAction.label).toBe("Mark paid");
  expect(rowAction.action.runBy.groups).toEqual(["groups/practice-managers"]);
  expect(rowAction.action.steps[0]).toMatchObject({ do: "update" });
});

// ----- 9. Publishing -----

/** The pill that says how many changes the draft has against what people see. */
const draftPill = () => owner.getByRole("button", { name: /^\d+ draft changes?$/ });
/** "Ready to publish", the popover under the Publish button. */
const readyToPublish = () => owner.locator("[data-publish-check]");
const publishButton = () => owner.getByRole("button", { name: "Publish", exact: true });
/** Opens the check, and waits until it has read what publishing does. */
async function openCheck() {
  await publishButton().first().click();
  await expect(readyToPublish().getByRole("heading", { name: "Ready to publish" })).toBeVisible();
  await expect(readyToPublish().getByText("Checking what publishing does…")).toHaveCount(0);
}

test("POLISH-010: the publish check blocks what cannot work, says why, passes once it is fixed, lists the changes, and publishing clears the pill", async () => {
  await openBuilder("publish", /^Blank/);
  await expect(owner.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  await expect(draftPill()).toHaveCount(0);
  await addAndSave("publish", "blank", "Chart", "core/chart");
  await expect(draftPill()).toBeVisible();
  // A chart with nothing to read cannot be saved as it is: Publish is off, and the page says why.
  await expect(publishButton().first()).toBeDisabled();
  await expect(owner.getByText(/To fix before it can be published/)).toBeVisible();
  await expect(owner.getByText(/Chart needs a source to show/)).toBeVisible();
  // Fixed: it reads the invoices. Now every check passes and the changes are listed.
  await chooseSource("Invoices");
  // A row action with no steps is another thing the check stops: its action is not complete.
  await addAndSave("publish", "blank", "Table", "core/table");
  await chooseSource("Invoices");
  await tabOf("Actions").click();
  await settings()
    .getByRole("button", { name: /^Row action$/ })
    .click();
  await actionEditor("Action").getByRole("button", { name: "Done" }).click();
  await openCheck();
  await expect(readyToPublish().getByRole("alert")).toContainText("Publish is off until");
  await expect(readyToPublish().getByRole("button", { name: /^Publish/ })).toBeDisabled();
  await expect(readyToPublish().locator('[data-check="fail"]').first()).toContainText(
    /not complete/,
  );
  await expectNoAxeViolations(owner, "the publish popover with a blocker");
  await owner.keyboard.press("Escape");
  await expect(readyToPublish()).toHaveCount(0);
  await settings()
    .getByRole("button", { name: /^Action No steps/ })
    .click();
  await actionEditor("Action").getByRole("button", { name: "Add a step" }).click();
  await owner.getByRole("menuitem", { name: "Show a message" }).click();
  await actionEditor("Action").getByRole("button", { name: "Done" }).click();
  await openCheck();
  await expect(readyToPublish().locator('[data-check="fail"]')).toHaveCount(0);
  await expect(readyToPublish().getByText("All data sources found")).toBeVisible();
  const changes = readyToPublish().getByRole("region", { name: "Changes" });
  await expect(changes).toContainText("2 changes");
  await expect(changes).toContainText("Added chart");
  await expect(changes).toContainText("Added table");
  const publish = readyToPublish().getByRole("button", { name: "Publish 2 changes" });
  await expect(publish).toBeEnabled();
  await expectNoAxeViolations(owner, "the publish popover that passes");
  await publish.click();
  // Published: the pill is gone, the header says so, and the served app has the chart.
  await expect.soft(draftPill(), "publishing clears the pill").toHaveCount(0);
  await expect(owner.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  const live = (await ok(owner, "GET", `${W}/interfaces/${path("publish")}`)).body;
  expect(live.pages.find((one: { id: string }) => one.id === "blank").widgets).toHaveLength(2);
  await owner.reload();
  await expect(draftPill()).toHaveCount(0);
  await expect(owner.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
  // Nothing is left to publish: the check says the app is as people see it.
  await openCheck();
  await expect(readyToPublish().getByRole("region", { name: "Changes" })).toContainText(
    "The app is as people see it now.",
  );
  await owner.keyboard.press("Escape");
});

/** A member of Fernhill, signed in in a browser of their own. */
async function signedInAs(
  browser: import("./test.ts").Browser,
  email: string,
  size = { width: 1440, height: 1000 },
): Promise<Page> {
  const person = await (await browser.newContext({ viewport: size })).newPage();
  await signInWithPassword(person, email, PASSWORD);
  return person;
}

test("POLISH-010: someone who may not publish is told why, in words, and what they changed is not published", async ({
  browser,
}) => {
  // Amara Okafor is Fernhill's clinical director, a viewer of the workspace: she may look at the
  // builder, not publish.
  // The maker leaves a change unpublished.
  const body = structuredClone(await drafted("publish")) as { title: string; pages: Wid[] };
  body.pages.push({ id: "extra", title: "Extra", widgets: [] });
  await ok(owner, "PUT", `${W}/drafts/${path("publish")}`, {
    kind: "interface",
    schemaVersion: 2,
    body,
  });
  const person = await signedInAs(browser, "amara.okafor@fernhill.example");
  await person.goto(`${L}/screens/${path("publish")}`);
  await expect(person.getByRole("heading", { name: `Publish ${stamp}`, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  const publish = person.getByRole("button", { name: "Publish", exact: true }).first();
  await publish.click();
  const check = person.locator("[data-publish-check]");
  await expect(check.getByRole("button", { name: "Publish 1 change" })).toBeEnabled();
  await check.getByRole("button", { name: "Publish 1 change" }).click();
  await expect(
    person.getByText(
      /You can change this app but not publish it here\. Ask someone who may deploy/,
    ),
    "a person who may not publish is told why",
  ).toBeVisible();
  // Nothing was published by it, and the draft is kept.
  const live = (await ok(owner, "GET", `${W}/interfaces/${path("publish")}`)).body;
  expect(live.pages).toHaveLength(1);
  expect((await drafted("publish")).pages).toHaveLength(2);
  await expectNoAxeViolations(person, "the builder as someone who may not publish");
  await person.context().close();
});

// ----- 4. Conditions in the column's own words -----

/** How many invoices have each status, counted a page at a time from the API. */
async function invoicesByStatus(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let after: string | undefined;
  do {
    const answer = await ok(
      owner,
      "GET",
      `${W}/rows/invoices?limit=200${after ? `&cursor=${encodeURIComponent(after)}` : ""}`,
    );
    for (const row of answer.items as { status: string }[]) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    after = answer.nextCursor ?? undefined;
  } while (after);
  return counts;
}

/** The rows a table draws on the canvas, without its heading. */
const rowsDrawn = async (name: string) => (await widget(name).getByRole("row").count()) - 1;

test('POLISH-004: Conditions: a date is "in the last…" or "between", a choice takes several values, and each time the table on the page has the rows the words say', async () => {
  await openBuilder("tables", /^Blank/);
  await addAndSave("tables", "blank", "Table", "core/table");
  await chooseSource("Invoices");
  await onlyTheWalks();
  await expect.poll(() => rowsDrawn("Table")).toBe(INVOICES.length);
  const within = (days: number) => INVOICES.filter((one) => one.ago <= days).length;

  // A date: "is in the last 30 days" keeps the invoices of the last month.
  await settings()
    .getByRole("button", { name: /^Condition/ })
    .click();
  let open = owner.getByRole("dialog", { name: "Only include rows where" });
  await open.getByLabel("Field").selectOption({ label: "Issued on" });
  await expect(choose(open, "is in the last")).toBeVisible();
  for (const own of ["is after", "is before", "is between", "is empty"]) {
    await expect(choose(open, own), `${own} is offered for a date`).toBeVisible();
  }
  await choose(open, "is in the last").click();
  await open.getByRole("spinbutton", { name: "How many" }).fill("30");
  await open.getByLabel("Unit").selectOption({ label: "days" });
  await open.getByRole("button", { name: "Add" }).click();
  await expect.poll(() => rowsDrawn("Table")).toBe(within(30));
  expect(within(30), "the walk's own data tells the two apart").not.toBe(INVOICES.length);

  // Taken out, all of them are back; then "is between" two days.
  await settings()
    .getByRole("group", { name: "Conditions rows must meet" })
    .getByRole("button", { name: /Remove .*Issued on/i })
    .click();
  await expect.poll(() => rowsDrawn("Table")).toBe(INVOICES.length);
  await settings()
    .getByRole("button", { name: /^Condition/ })
    .click();
  open = owner.getByRole("dialog", { name: "Only include rows where" });
  await open.getByLabel("Field").selectOption({ label: "Issued on" });
  await choose(open, "is between").click();
  await open.getByLabel("From").fill(day(50));
  await open.getByLabel("To").fill(day(5));
  await open.getByRole("button", { name: "Add" }).click();
  const between = INVOICES.filter((one) => one.ago <= 50 && one.ago >= 5).length;
  await expect.poll(() => rowsDrawn("Table")).toBe(between);
  await settings()
    .getByRole("group", { name: "Conditions rows must meet" })
    .getByRole("button", { name: /Remove .*Issued on/i })
    .click();

  // A choice: several values at once, each with how many rows it has.
  await settings()
    .getByRole("button", { name: /^Condition/ })
    .click();
  open = owner.getByRole("dialog", { name: "Only include rows where" });
  await open.getByLabel("Field").selectOption({ label: "Status" });
  const group = open.getByRole("group", { name: "Any of" });
  for (const value of ["paid", "unpaid", "void"]) {
    await expect(
      group.getByRole("checkbox", { name: new RegExp(`^${value} \\d+ rows?$`) }),
    ).toBeVisible();
  }
  // The counts are the table's own: how many invoices have each status.
  const really = await invoicesByStatus();
  for (const value of ["paid", "unpaid", "void"]) {
    await expect(
      group.getByRole("checkbox", { name: `${value} ${really[value]} rows` }),
      `${value} has ${really[value]} rows`,
    ).toBeVisible();
  }
  await group.getByRole("checkbox", { name: /^paid \d+ rows?$/ }).check();
  await group.getByRole("checkbox", { name: /^void \d+ rows?$/ }).check();
  await open.getByRole("button", { name: "Add" }).click();
  const some = INVOICES.filter((one) => one.status === "paid" || one.status === "void").length;
  await expect.poll(() => rowsDrawn("Table")).toBe(some);
  await expect(chip(/paid/)).toBeVisible();
  await expect
    .poll(async () => {
      const saved = await draftWidget("tables", "blank", (one) => one.type === "core/table");
      const filters = (saved?.data?.rows?.source?.visual?.filters ?? []) as Wid[];
      return filters.some((one) => one.column === "status");
    })
    .toBe(true);
  // Kept after a reload.
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await expect.poll(() => rowsDrawn("Table")).toBe(some);
});

// ----- 5. Who can run it -----

/** Where a member of the workspace sees the served app, signed in as themselves. */
async function openServed(person: Page, area: Area, page = "") {
  await person.goto(`${served[area]}${page}`);
  const staff = person
    .getByRole("link", { name: /staff/i })
    .or(person.getByRole("button", { name: /staff/i }));
  if (await staff.count()) await staff.first().click();
}

/** Marks a table of an area with a row action "Mark paid" that only some groups may run. */
async function giveRowAction(area: Area, page: string, widgetId: string, groups: string[]) {
  const body = structuredClone((await ok(owner, "GET", `${W}/interfaces/${path(area)}`)).body);
  const widgetOf = body.pages
    .find((one: Wid) => one.id === page)
    .widgets.find((one: Wid) => one.id === widgetId);
  widgetOf.config = {
    ...widgetOf.config,
    select: true,
    rowActions: [
      {
        id: "pay",
        label: "Mark paid",
        action: {
          runBy: { groups },
          steps: [
            { do: "update", record: "event", set: { status: { value: "paid" } } },
            { do: "message", text: "Marked paid", tone: "success" },
          ],
        },
      },
    ],
  };
  await ok(owner, "PUT", `${W}/drafts/${path(area)}`, {
    kind: "interface",
    schemaVersion: 2,
    body,
  });
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [path(area)],
    message: `Phase 28 walk ${stamp}: who can run it`,
  });
}

const statusOf = async (key: string): Promise<string> =>
  (await ok(owner, "GET", `${W}/row/${made[key]?.id}/invoices`)).status;
const setStatus = (key: string, status: string) =>
  ok(owner, "PATCH", `${W}/row/${made[key]?.id}/invoices`, { status });

test("POLISH-012: a row action limited to a group is greyed with the reason for someone outside, run by someone inside, and refused by the API when called directly", async ({
  browser,
}) => {
  await giveRowAction("tables", "bulk", "pay", ["groups/practice-managers"]);
  const rowFor = (person: Page, key: string) =>
    person
      .getByRole("region", { name: "To pay", exact: true })
      .getByRole("row", { name: new RegExp(made[key]?.number ?? "") });

  // Devi is in Billing, not among the Practice managers: the action is there, and off.
  const outside = await signedInAs(browser, OUTSIDE);
  await openServed(outside, "tables", "bulk");
  await expect(rowFor(outside, "a")).toBeVisible({ timeout: 30_000 });
  const off = rowFor(outside, "a").getByRole("button", { name: "Mark paid" });
  await rowFor(outside, "a").hover();
  await expect(off).toBeVisible();
  await expect(off, "greyed for someone outside the group").toBeDisabled();
  await off.hover({ force: true });
  // The reason is in the group's name, not its key.
  await expect(outside.getByText("Only Practice managers can do this.")).toBeVisible();
  // Called straight to the API, the server refuses too, in the same words.
  const refused = await call(outside, "POST", `${W}/page-actions`, {
    of: "interface",
    path: path("tables"),
    page: "bulk",
    widget: "pay",
    at: "config/rowActions/0/action",
    records: { event: made.a?.id },
  });
  expect(refused.status).toBe(403);
  expect(JSON.stringify(refused.body)).toContain("Only Practice managers can do this");
  expect(await statusOf("a"), "nothing changed").toBe("unpaid");
  await outside.context().close();

  // Rowan is a Practice manager as well as Billing: it runs for her.
  const inside = await signedInAs(browser, BOTH);
  await openServed(inside, "tables", "bulk");
  await expect(rowFor(inside, "a")).toBeVisible({ timeout: 30_000 });
  await rowFor(inside, "a").hover();
  const on = rowFor(inside, "a").getByRole("button", { name: "Mark paid" });
  await expect(on).toBeEnabled();
  await on.click();
  try {
    await expect.poll(() => statusOf("a")).toBe("paid");
  } finally {
    await setStatus("a", "unpaid");
    await inside.context().close();
  }
});

test("POLISH-012: a group whose name is not its key: the reason greyed and the refusal both use the name people know it by", async ({
  browser,
}) => {
  // A group is made as "Zed <stamp>", then renamed: its key stays what it was made as.
  const made1 = await ok(owner, "POST", `/tenants/${TENANT_ID}/groups`, { name: `Zed ${stamp}` });
  const NAME = `Reception ${stamp}`;
  await ok(owner, "PATCH", `/tenants/${TENANT_ID}/groups/${made1.id}`, { name: NAME });
  try {
    expect(made1.key).not.toBe(NAME.toLowerCase().replace(/ /g, "-"));
    await giveRowAction("tables", "bulk", "pay", [`groups/${made1.key}`]);
    const outside = await signedInAs(browser, OUTSIDE);
    await openServed(outside, "tables", "bulk");
    const row = outside
      .getByRole("region", { name: "To pay", exact: true })
      .getByRole("row", { name: new RegExp(made.c?.number ?? "") });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.hover();
    const off = row.getByRole("button", { name: "Mark paid" });
    await expect(off).toBeDisabled();
    await off.hover({ force: true });
    // Greyed, with the reason in the name the group has now.
    await expect(outside.getByText(`Only ${NAME} can do this.`)).toBeVisible();
    // And the server, called directly, says the same.
    const refused = await call(outside, "POST", `${W}/page-actions`, {
      of: "interface",
      path: path("tables"),
      page: "bulk",
      widget: "pay",
      at: "config/rowActions/0/action",
      records: { event: made.c?.id },
    });
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).toContain(`Only ${NAME} can do this.`);
    await outside.context().close();
  } finally {
    await call(owner, "DELETE", `/tenants/${TENANT_ID}/groups/${made1.id}`);
  }
});

test("POLISH-004: Table: with several rows selectable, an action runs on every row chosen and on no other, in one go", async ({
  browser,
}) => {
  await giveRowAction("tables", "bulk", "pay", ["groups/practice-managers"]);
  const person = await signedInAs(browser, BOTH);
  try {
    await openServed(person, "tables", "bulk");
    const table = person.getByRole("region", { name: "To pay", exact: true });
    await expect(table.getByRole("row", { name: new RegExp(made.a?.number ?? "") })).toBeVisible({
      timeout: 30_000,
    });
    // Three of the walk's six: the unpaid ones, by their checkboxes.
    for (const key of ["a", "c", "e"]) {
      await table
        .getByRole("row", { name: new RegExp(made[key]?.number ?? "") })
        .getByRole("checkbox")
        .check();
    }
    const chosen = table.getByRole("region", { name: "Rows chosen" });
    await expect(chosen).toContainText("3 chosen");
    await chosen.getByRole("button", { name: "Mark paid" }).click();
    // The action runs on all three; the others are as they were.
    for (const key of ["a", "c", "e"]) await expect.poll(() => statusOf(key)).toBe("paid");
    expect(await statusOf("b")).toBe("paid");
    expect(await statusOf("f")).toBe("void");
  } finally {
    for (const key of ["a", "c", "e"]) await setStatus(key, "unpaid");
    await person.context().close();
  }
});

// ----- 6. Who can see it, and View as -----

/** Publishes the open app through the check, as a person does. */
async function publishThroughTheCheck() {
  await openCheck();
  await readyToPublish()
    .getByRole("button", { name: /^Publish( \d+ changes?)?$/ })
    .click();
  await expect(owner.getByText(/^Published\./).first()).toBeVisible();
}
test("POLISH-012: a widget limited to a group carries its tag, View as shows it as that group sees it, and a person of that group and one outside see the same in the served app", async ({
  browser,
}) => {
  await openBuilder("rules", /^Blank/);
  await addAndSave("rules", "blank", "Stat", "core/stat");
  await chooseSource("Invoices");
  const limited = await (async () => {
    const second = await addAndSave("rules", "blank", "Stat", "core/stat");
    await chooseSource("Invoices");
    await tabOf("Display").click();
    await rowOf("Title").click();
    await editor().getByRole("textbox").first().fill("Managers only");
    await owner.keyboard.press("Enter");
    return second;
  })();
  await tabOf("Rules").click();
  await settings().getByRole("button", { name: "Limit to a group" }).click();
  await owner
    .getByRole("dialog", { name: "Groups" })
    .getByText("Practice managers", { exact: true })
    .click();
  await owner.keyboard.press("Escape");
  const saved = (await settle("rules", "blank", limited.id, (one) =>
    one.rules?.seenBy?.groups?.length ? one : undefined,
  )) as Wid;
  expect(saved.rules.seenBy.groups).toEqual(["groups/practice-managers"]);
  // On the canvas the widget says who it is shown to.
  await expect(widget("Managers only")).toContainText("Only for Practice managers");

  // View as: the page as a group sees it. Billing is not Practice managers, so the widget is gone.
  const menu = owner.getByRole("button", { name: /^View as/ });
  await menu.click();
  await owner.getByRole("menuitem", { name: "Billing" }).click();
  await expect(owner.getByRole("button", { name: "View as Billing" })).toBeVisible();
  await expect(widget("Stat")).toBeVisible();
  await expect(widget("Managers only")).toContainText("Hidden for Billing");
  await owner.getByRole("button", { name: "View as Billing" }).click();
  await owner.getByRole("menuitem", { name: "Practice managers" }).click();
  await expect(widget("Managers only")).not.toContainText("Hidden for");
  await owner.getByRole("button", { name: "View as Practice managers" }).click();
  await owner.getByRole("menuitem", { name: "Me" }).click();
  await expect(widget("Managers only")).not.toContainText("Hidden for");

  // Published, what each person's session really shows agrees with View as.
  await publishThroughTheCheck();
  const devi = await signedInAs(browser, OUTSIDE);
  await openServed(devi, "rules");
  await expect(devi.getByRole("region", { name: "Stat", exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    devi.getByRole("region", { name: "Managers only" }),
    "Devi is Billing: View as Billing hid it",
  ).toHaveCount(0);
  await devi.context().close();
  const rowan = await signedInAs(browser, BOTH);
  await openServed(rowan, "rules");
  await expect(
    rowan.getByRole("region", { name: "Managers only" }),
    "Rowan is a Practice manager",
  ).toBeVisible({
    timeout: 30_000,
  });
  await rowan.context().close();
});

// ----- 7. Sheet and modal sizes -----

/** The widths a side sheet or modal is made at, by size name (pageKinds.ts). */
const SIZE_PX = { small: 480, medium: 720, large: 960, xlarge: 1200 } as const;

test("POLISH-013: a sheet is sized by dragging its edge and a modal by the select, each snaps to a named size, and both open at that size in the published app after a reload", async () => {
  await openBuilder("sizes", /^A sheet/);
  const handle = owner.getByRole("slider", { name: "Size" });
  await expect(handle).toBeVisible();
  await expect(handle).toHaveAttribute("aria-valuetext", "Medium");
  // The edge dragged left: a sheet is centred in its frame, so the edge goes half as far.
  const at = await handle.boundingBox();
  if (!at) throw new Error("the size handle is not on the page");
  await owner.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await owner.mouse.down();
  await expect(owner.getByRole("status").filter({ hasText: "Medium" }).first()).toBeVisible();
  await owner.mouse.move(at.x - 130, at.y + at.height / 2, { steps: 12 });
  await expect(owner.getByRole("status").filter({ hasText: "Small" }).first()).toBeVisible();
  await owner.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuetext", "Small");
  await expect.poll(async () => (await draftPage("sizes", "sheet")).size).toBe("small");
  // The same size is in the page settings, as the select says it.
  await expect(
    settings().getByRole("region", { name: "Page settings" }).getByLabel("Size"),
  ).toHaveValue("small");
  // The keyboard: the arrows step through the sizes, one undoable step each.
  await handle.focus();
  await owner.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuetext", "Medium");
  await owner.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("aria-valuetext", "Small");

  // The modal's size is chosen in its settings.
  await pages()
    .getByRole("button", { name: /^A modal/ })
    .click();
  await settings()
    .getByRole("region", { name: "Page settings" })
    .getByLabel("Size")
    .selectOption({ label: "Extra large" });
  await expect.poll(async () => (await draftPage("sizes", "modal")).size).toBe("xlarge");
  await expect(owner.getByRole("slider", { name: "Size" })).toHaveAttribute(
    "aria-valuetext",
    "Extra large",
  );
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^A modal/ })
    .click();
  await expect(owner.getByRole("slider", { name: "Size" })).toHaveAttribute(
    "aria-valuetext",
    "Extra large",
  );
  await pages()
    .getByRole("button", { name: /^A sheet/ })
    .click();
  await expect(owner.getByRole("slider", { name: "Size" })).toHaveAttribute(
    "aria-valuetext",
    "Small",
  );

  // Published, each opens at its size, with its widgets laid out on its own grid.
  await publishThroughTheCheck();
  await owner.setViewportSize({ width: 1440, height: 900 });
  await openServed(owner, "sizes");
  await owner.goto(`${served.sizes}?sheet=sheet&record=${made.a?.id}`);
  const sheet = owner.getByRole("dialog", { name: /A sheet/ });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  const sheetBox = await sheet.boundingBox();
  expect(
    sheetBox && Math.abs(sheetBox.width - SIZE_PX.small) <= 24,
    `a small sheet is about ${SIZE_PX.small}px wide`,
  ).toBe(true);
  await owner.goto(`${served.sizes}?modal=modal`);
  const modal = owner.getByRole("dialog", { name: /A modal/ });
  await expect(modal).toBeVisible({ timeout: 30_000 });
  const modalBox = await modal.boundingBox();
  expect(
    modalBox && Math.abs(modalBox.width - SIZE_PX.xlarge) <= 24,
    `an extra large modal is about ${SIZE_PX.xlarge}px wide`,
  ).toBe(true);
  // And on a phone they are as wide as the screen allows, and nothing scrolls sideways.
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.reload();
  await expect(owner.getByRole("dialog", { name: /A modal/ })).toBeVisible({ timeout: 30_000 });
  expect(await noSideways(owner)).toBe(true);
  await owner.setViewportSize({ width: 1440, height: 1000 });
});

// ----- 8. The phone -----

/** "On narrow screens" for a widget, from ⋯ › Layout; then back to the settings. */
async function setNarrow(
  name: string,
  how: "Automatic" | "Keep" | "Full width" | "Stack below" | "Hide",
) {
  await outline().getByRole("button", { name, exact: true }).click();
  await owner.getByRole("button", { name: `More about ${name}` }).click();
  await owner.getByRole("menuitem", { name: "Layout" }).click();
  const narrow = settings().getByRole("group", { name: "On narrow screens" });
  await choose(narrow, how).click();
  await settings().getByRole("button", { name: "Back to settings" }).click();
}

test("POLISH-005: on a phone each widget is automatic or set by hand (hide, full width, keep, stack below); the preview draws it, the publish check warns of what is hidden, and the served page at 390 is the preview", async () => {
  await openBuilder("phone", /^Blank/);
  await setNarrow("Alpha", "Hide");
  await setNarrow("Beta", "Full width");
  await setNarrow("Gamma", "Keep");
  await setNarrow("Delta", "Keep");
  await setNarrow("Rows", "Stack below");
  await expect
    .poll(
      async () =>
        (await draftWidget("phone", "blank", (one) => one.id === "alpha"))?.layout?.narrow,
    )
    .toBe("hide");
  expect((await draftWidget("phone", "blank", (one) => one.id === "beta")).layout.narrow).toBe(
    "full",
  );
  expect((await draftWidget("phone", "blank", (one) => one.id === "gamma")).layout.narrow).toBe(
    "keep",
  );
  expect((await draftWidget("phone", "blank", (one) => one.id === "delta")).layout.narrow).toBe(
    "keep",
  );
  expect((await draftWidget("phone", "blank", (one) => one.id === "rows")).layout.narrow).toBe(
    "stack",
  );
  // The inspector's segments are all reachable: none is clipped off the edge of the pane.
  await outline().getByRole("button", { name: "Alpha", exact: true }).click();
  await owner.getByRole("button", { name: "More about Alpha" }).click();
  await owner.getByRole("menuitem", { name: "Layout" }).click();
  const pane = await settings().boundingBox();
  const hide = await choose(
    settings().getByRole("group", { name: "On narrow screens" }),
    "Hide",
  ).boundingBox();
  expect
    .soft(pane && hide && hide.x + hide.width <= pane.x + pane.width, "Hide is inside the pane")
    .toBe(true);
  await settings().getByRole("button", { name: "Back to settings" }).click();

  // The phone preview: a banner, a placeholder for what is hidden, and the table as a list.
  await owner
    .getByRole("radiogroup", { name: "Screen size" })
    .getByRole("radio", { name: "Phone" })
    .click();
  await expect(owner.getByText("Phone layout is made from the desktop one.")).toBeVisible();
  await expect(owner.getByText(/Alpha is hidden on phones/)).toBeVisible();
  await expect(widget("Alpha")).toHaveCount(0);
  const beta = await widget("Beta").boundingBox();
  const gamma = await widget("Gamma").boundingBox();
  const delta = await widget("Delta").boundingBox();
  const rows = await widget("Rows").boundingBox();
  expect(beta && gamma && delta && rows).toBeTruthy();
  if (!(beta && gamma && delta && rows)) return;
  expect(Math.abs(beta.width - rows.width), "Beta is as wide as the page").toBeLessThan(4);
  expect(gamma.width, "Gamma keeps its half of the row").toBeLessThan(beta.width * 0.6);
  expect(Math.abs(gamma.y - delta.y), "Gamma and Delta share a row").toBeLessThan(4);
  expect(rows.y, "Rows is stacked below Gamma and Delta").toBeGreaterThan(gamma.y);
  await expect(widget("Rows").getByRole("table"), "the table is a list on a phone").toHaveCount(0);
  // Said before it is published: what the phone hides is a warning, and does not stop Publish.
  await openCheck();
  await expect(readyToPublish().locator('[data-check="warn"]').first()).toContainText(
    /Phone layout hides 1 widget/,
  );
  await expect(
    readyToPublish().getByRole("button", { name: /^Publish \d+ changes?$/ }),
  ).toBeEnabled();
  await expectNoAxeViolations(owner, "the publish popover with a warning");
  await readyToPublish()
    .getByRole("button", { name: /^Publish \d+ changes?$/ })
    .click();
  await expect(owner.getByText(/^Published\./).first()).toBeVisible();

  // The published page at 390 is the preview: the same widgets in the same order, as wide.
  const inFrame = {
    names: [] as string[],
    wide: {} as Record<string, number>,
  };
  for (const name of ["Beta", "Gamma", "Delta", "Rows"]) {
    const box = await widget(name).boundingBox();
    if (box) {
      inFrame.names.push(name);
      inFrame.wide[name] = box.width / rows.width;
    }
  }
  const sheet = await browserPage();
  await sheet.setViewportSize({ width: 390, height: 844 });
  await openServed(sheet, "phone");
  await expect(sheet.getByRole("region", { name: "Beta", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    sheet.getByRole("region", { name: "Alpha", exact: true }),
    "Alpha is hidden on phones",
  ).toHaveCount(0);
  const at = async (name: string) =>
    (await sheet.getByRole("region", { name, exact: true }).boundingBox()) ?? undefined;
  // Once the rows have arrived and the page has settled: nothing is drawn over another.
  await expect(sheet.getByRole("region", { name: "Rows", exact: true })).toContainText(
    made.a?.number ?? "",
  );
  await expect
    .poll(async () => {
      const beta = await at("Beta");
      const gamma = await at("Gamma");
      const rows = await at("Rows");
      return Boolean(
        beta && gamma && rows && gamma.y >= beta.y + beta.height - 1 && rows.y >= gamma.y,
      );
    })
    .toBe(true);
  const served = {
    beta: await at("Beta"),
    gamma: await at("Gamma"),
    delta: await at("Delta"),
    rows: await at("Rows"),
  };
  expect(served.beta && served.gamma && served.delta && served.rows).toBeTruthy();
  if (served.beta && served.gamma && served.delta && served.rows) {
    const order = [served.beta, served.gamma, served.rows].map((one) => one.y);
    expect(order, "the same order down the page").toEqual([...order].sort((a, b) => a - b));
    const page = served.beta.width;
    expect(
      Math.abs(served.beta.width / served.rows.width - (inFrame.wide.Beta ?? 1)),
      "Beta as wide as in the preview",
    ).toBeLessThan(0.08);
    expect(
      Math.abs(served.gamma.width / page - (inFrame.wide.Gamma ?? 0.5) / (inFrame.wide.Beta ?? 1)),
      "Gamma as wide as in the preview",
    ).toBeLessThan(0.08);
    expect(
      Math.abs(served.delta.y - served.gamma.y),
      "Delta beside Gamma, as in the preview",
    ).toBeLessThan(4);
  }
  expect(await noSideways(sheet)).toBe(true);
  await expectNoAxeViolations(sheet, "a served page on a phone");
  await sheet.context().close();
});

/** A fresh signed-in page of the owner's, for looking at what is served. */
async function browserPage(): Promise<Page> {
  const next = await owner
    .context()
    .browser()
    ?.newContext({ viewport: { width: 1440, height: 900 } });
  if (!next) throw new Error("no browser");
  const page = await next.newPage();
  await signInWithPassword(page, OWNER, PASSWORD);
  return page;
}

test("POLISH-008: a drag on the phone preview asks once, and writes only the phone layout, never the desktop's", async () => {
  await openBuilder("phone", /^Blank/, { width: 1440, height: 1900 });
  const before = structuredClone(await draftPage("phone", "blank")) as Wid;
  await owner
    .getByRole("radiogroup", { name: "Screen size" })
    .getByRole("radio", { name: "Phone" })
    .click();
  await expect(owner.getByText("Phone layout is made from the desktop one.")).toBeVisible();
  // The rows have arrived, so nothing moves under the pointer.
  await expect(widget("Rows")).toContainText(made.f?.number ?? "");
  const drag = async (name: string, above: string) => {
    const from = await widget(name).boundingBox();
    const to = await widget(above).boundingBox();
    if (!from || !to) throw new Error("not on the page");
    await owner.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await owner.mouse.down();
    await owner.mouse.move(to.x + to.width / 2, to.y + 10, { steps: 14 });
    await owner.mouse.up();
  };
  const sure = owner.getByRole("dialog", { name: /Change the phone layout by hand/ });
  await drag("Gamma", "Beta");
  await expect(sure).toBeVisible();
  await expect(sure).toContainText("made from the desktop one");
  await sure.getByRole("button", { name: "Change the phone layout" }).click();
  await expect(sure).toHaveCount(0);
  const gamma = (await settle("phone", "blank", "gamma", (one) =>
    one.layout?.phone?.at ? one : undefined,
  )) as Wid;
  expect(gamma.layout.phone.at, "Gamma has a place of its own on the phone").toBeTruthy();
  // The desktop is as it was: every widget is where it was, at the size it was.
  const after = await draftPage("phone", "blank");
  for (const one of before.widgets as Wid[]) {
    const now = (after.widgets as Wid[]).find((other) => other.id === one.id);
    expect(now?.at, `${one.id} is where it was on the desktop`).toEqual(one.at);
    expect(now?.layout?.tablet, `${one.id} has no tablet place`).toBeUndefined();
  }
  // Asked once: the next drag goes straight through.
  await drag("Delta", "Beta");
  await expect(sure).toHaveCount(0);
  await expect
    .poll(async () => (await widgetNow("phone", "blank", "delta"))?.layout?.phone?.at !== undefined)
    .toBe(true);
  // And "Go back to automatic" in its Layout is the way back.
  await outline().getByRole("button", { name: "Gamma", exact: true }).click();
  await owner.getByRole("button", { name: "More about Gamma" }).click();
  await owner.getByRole("menuitem", { name: "Layout" }).click();
  await choose(settings().getByRole("group", { name: "Phone" }), "Automatic").click();
  await expect
    .poll(async () => (await widgetNow("phone", "blank", "gamma"))?.layout?.phone)
    .toBeUndefined();
  await owner
    .getByRole("radiogroup", { name: "Screen size" })
    .getByRole("radio", { name: "Desktop" })
    .click();
  await owner.setViewportSize({ width: 1440, height: 1000 });
});

// ----- 9. Draft history -----

test("POLISH-014: an earlier draft is picked from what each save kept, previewed, restored as one step, and one Undo takes it back whole", async () => {
  await openBuilder("appointments", /^Blank/);
  await addAndSave("appointments", "blank", "Stat", "core/stat");
  await chooseSource("Invoices");
  await addAndSave("appointments", "blank", "Chart", "core/chart");
  await chooseSource("Invoices");
  await addAndSave("appointments", "blank", "Table", "core/table");
  await expect(outline().getByRole("button")).toHaveCount(3);
  // The draft saved so far is on the server; the history is what each save put aside.
  await expect
    .poll(async () => ((await draftPage("appointments", "blank")).widgets as Wid[]).length)
    .toBe(3);
  await owner.getByRole("button", { name: "More ways to publish" }).click();
  await owner.getByRole("menuitem", { name: "Restore an earlier draft" }).click();
  const history = owner.getByRole("dialog", { name: "Restore an earlier draft" });
  await expect(history).toBeVisible();
  const kept = history.getByRole("list", { name: "Earlier drafts" }).getByRole("button");
  expect(await kept.count(), "saves kept what they replaced").toBeGreaterThanOrEqual(1);
  await expectNoAxeViolations(owner, "the Restore an earlier draft dialog");
  // The preview names what restoring changes. Each earlier draft has fewer widgets than now.
  const preview = history.getByRole("region", { name: "Preview" });
  await kept.last().click();
  const was = Number(/Blank \((\d+)\)/.exec((await preview.textContent()) ?? "")?.[1]);
  expect(was, "the oldest kept draft has fewer widgets than the three of now").toBeLessThan(3);
  await expect(preview).toContainText("Restoring it changes the draft");
  await history.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(history).toHaveCount(0);
  await expect(owner.getByText(/The draft saved .* is back\./)).toBeVisible();
  await expect(outline().getByRole("button")).toHaveCount(was);
  // It is the draft now, saved like any change.
  await expect
    .poll(async () => ((await draftPage("appointments", "blank")).widgets as Wid[]).length)
    .toBe(was);
  // One step: a single Undo brings back all three widgets.
  await owner.getByRole("button", { name: "Undo restoring an earlier draft" }).click();
  await expect(outline().getByRole("button")).toHaveCount(3);
  await expect
    .poll(async () => ((await draftPage("appointments", "blank")).widgets as Wid[]).length)
    .toBe(3);
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Blank/ })
    .click();
  await expect(outline().getByRole("button")).toHaveCount(3);
});

// ----- 10. The acceptance walk-throughs -----

/** The row of a table in the served app, by the invoice's number. */
const servedRow = (person: Page, table: string, key: string) =>
  person
    .getByRole("region", { name: table, exact: true })
    .getByRole("row", { name: new RegExp(made[key]?.number ?? "") });

test("Acceptance, invoices: a table of invoices, a click that opens the record, editing it in place, a form for a new one, and a row action, made in the builder and used in the published app", async () => {
  await openBuilder("invoices", /^Blank/, { width: 1440, height: 1100 });
  const table = await addAndSave("invoices", "blank", "Table", "core/table");
  await chooseSource("Invoices");
  await onlyTheWalks();
  await tabOf("Display").click();
  await rowOf("Title").click();
  await editor().getByRole("textbox").first().fill("Invoices");
  await owner.keyboard.press("Enter");

  // A click on a row opens the invoice: the builder offers to make its detail.
  await tabOf("Actions").click();
  await settings()
    .getByRole("region", { name: "When a row is clicked" })
    .getByRole("button", { name: /^Do / })
    .click();
  await choose(editor(), /^Open record detail/).click();
  // The sheet it opens is made, as a side sheet of invoices, with the record's detail in it.
  await expect(pages().getByRole("button", { name: /^Invoice detail/ })).toContainText(
    "Side sheet",
  );
  await expect
    .poll(async () => JSON.stringify((await widgetNow("invoices", "blank", table.id))?.on ?? {}))
    .toContain('"open"');
  const sheetPage = (await drafted("invoices")).pages.find((one: Wid) => one.kind === "sheet");
  expect(sheetPage.record).toEqual({ table: "invoices" });
  expect(sheetPage.widgets.some((one: Wid) => one.type === "core/detail")).toBe(true);

  // A row action that marks the invoice paid.
  await settings()
    .getByRole("button", { name: /^Row action$/ })
    .click();
  await actionEditor("Action").getByRole("textbox", { name: "Says" }).fill("Mark paid");
  await actionEditor("Mark paid").getByRole("button", { name: "Add a step" }).click();
  await owner.getByRole("menuitem", { name: "Update the record" }).click();
  await actionEditor("Mark paid").getByRole("button", { name: "Set another field" }).click();
  await owner.getByRole("menuitem", { name: "Status", exact: true }).click();
  await actionEditor("Mark paid")
    .getByRole("button", { name: /^Status becomes/ })
    .click();
  await owner.getByRole("textbox").last().fill("paid");
  await owner.keyboard.press("Enter");
  await actionEditor("Mark paid").getByRole("button", { name: "Done" }).click();

  // A form for a new invoice: its modal, and a button on the table that opens it.
  await owner
    .getByRole("button", { name: /^Add to page/ })
    .first()
    .click();
  await selector()
    .getByRole("button", { name: /^Form\b/ })
    .click();
  const dialog = owner.getByRole("dialog", { name: "Add a form" });
  await dialog.getByLabel("Table").selectOption({ label: "Invoices" });
  await dialog.getByRole("button", { name: /^Create form$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(pages().getByRole("button", { name: /^New invoice/ })).toContainText("Modal");
  // The detail lets people edit in place.
  await pages()
    .getByRole("button", { name: /^Invoice detail/ })
    .click();
  await outline()
    .getByRole("button", { name: /^Record detail/ })
    .click();
  await tabOf("Display").click();
  await flip("Let people edit fields in place").check();
  await expect
    .poll(async () => {
      const page = await draftPage("invoices", "invoice-detail");
      return page?.widgets?.[0]?.config?.edit ? "edit" : "no";
    })
    .toBe("edit");
  await expect
    .poll(async () => (await drafted("invoices")).pages.some((one: Wid) => one.kind === "modal"))
    .toBe(true);
  await publishThroughTheCheck();

  // In the published app, as a person uses it.
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await openServed(owner, "invoices");
  await expect(servedRow(owner, "Invoices", "a")).toBeVisible({ timeout: 30_000 });
  await servedRow(owner, "Invoices", "a").click();
  const sheet = owner.getByRole("dialog", { name: /Invoice detail/ });
  await expect(sheet).toContainText(made.a?.number ?? "");
  // Edit in place: the clinic is changed where it stands, and the invoice has it.
  await sheet.getByRole("button", { name: "Edit Clinic" }).click();
  await sheet.getByRole("textbox").first().fill("hilltop");
  await owner.keyboard.press("Enter");
  await expect
    .configure({ soft: true })
    .poll(async () => (await ok(owner, "GET", `${W}/row/${made.a?.id}/invoices`)).clinic, {
      message: "the clinic edited in place is saved",
    })
    .toBe("hilltop");
  await expect.soft(sheet.getByRole("alert"), "no error is shown").toHaveCount(0);
  // Back to the table, as a person would open it again.
  await openServed(owner, "invoices");

  // The row action marks it paid.
  await servedRow(owner, "Invoices", "c").hover();
  await servedRow(owner, "Invoices", "c").getByRole("button", { name: "Mark paid" }).click();
  await expect.poll(() => statusOf("c")).toBe("paid");

  // A new invoice, from the form its button opens.
  await owner.getByRole("button", { name: "New invoice" }).click();
  const modal = owner.getByRole("dialog", { name: /New invoice/ });
  await expect(modal).toBeVisible();
  const number = `${PREFIX}-NEW`;
  await modal.getByRole("textbox", { name: "Number" }).fill(number);
  await modal.getByRole("textbox", { name: "Client code" }).fill(`CZ${stamp.toUpperCase()}NEW`);
  await modal.getByRole("textbox", { name: "Clinic" }).fill("northside");
  await modal.getByRole("spinbutton", { name: "Total" }).fill("4200");
  await modal.getByRole("textbox", { name: "Status" }).fill("unpaid");
  await modal.getByLabel("Issued on").fill(day(0));
  await modal.getByRole("button", { name: "Create invoice" }).click();
  await expect(modal).toHaveCount(0);
  // The invoice is made, and the table has it without a reload.
  await expect(owner.getByRole("region", { name: "Invoices", exact: true })).toContainText(number);
  const created = await ok(owner, "GET", `${W}/rows/invoices?limit=20&sort=-created_at`);
  const row = (created.items as Wid[]).find((one) => one.number === number);
  expect(row, "the invoice was made").toBeTruthy();
  if (row) made.new = { id: row.id, number };
  expect(row?.total).toBe(4200);
  await setStatus("c", "unpaid");
});

test("Acceptance, appointments: a page started from the appointments table, its search, published and searched by a person", async () => {
  await openBuilder("appointments", /^Blank/, { width: 1440, height: 1100 });
  await owner.getByRole("button", { name: "Add a page" }).click();
  const start = owner.getByRole("dialog", { name: "Add a page" });
  await choose(start, /^A list of /).click();
  await start.getByRole("combobox", { name: "Table" }).selectOption({ label: "Appointments" });
  await start.getByLabel("Name of the page").fill("Schedule");
  await start.getByRole("button", { name: /^Add/ }).last().click();
  await expect(pages().getByRole("button", { name: /^Schedule/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(async () =>
      (await drafted("appointments")).pages.some((one: Wid) => one.title === "Schedule"),
    )
    .toBe(true);
  const made1 = (await drafted("appointments")).pages.find(
    (one: Wid) => one.title === "Schedule",
  ) as Wid;
  const rows = made1.widgets.find(
    (one: Wid) => one.type === "core/table" || one.type === "core/list",
  );
  expect(rows, "the list of appointments is on the new page").toBeTruthy();
  expect(JSON.stringify(rows.data)).toContain("appointments");
  // The start brings a search for appointments, ready, above the list.
  expect(made1.widgets.some((one: Wid) => one.type === "core/filter")).toBe(true);
  await expect(widget("Search and filter")).toBeVisible();
  await publishThroughTheCheck();

  // A person searches for a pet and the page narrows to its visits.
  const some = (await ok(owner, "GET", `${W}/rows/appointments?limit=200`)).items as Wid[];
  const target = some.find((one) => one.pet_name)?.pet_name as string;
  expect(target, "the sandbox has appointments to find").toBeTruthy();
  const howMany = some.filter((one) => one.pet_name === target).length;
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await owner.goto(`${served.appointments}${made1.id}`);
  const search = owner.getByRole("textbox", { name: /^Search/ }).first();
  await expect(search).toBeVisible({ timeout: 30_000 });
  const rowsOf = () => owner.getByRole("row");
  await expect.poll(async () => (await rowsOf().count()) > 5).toBe(true);
  const all = await rowsOf().count();
  await search.fill(target);
  await expect.poll(async () => (await rowsOf().count()) < all).toBe(true);
  await expect(owner.getByText(target).first()).toBeVisible();
  expect(
    await rowsOf().count(),
    "no more rows than the pet has visits, and its header",
  ).toBeLessThanOrEqual(howMany + 1);
  await owner.reload();
  await expect(search).toHaveValue(target);
  await expectNoAxeViolations(owner, "the published appointments page");
});

/** An end user (a pet owner), signed in at the tenant's portal in a browser of their own, on a phone. */
async function endUserOnAPhone(browser: import("./test.ts").Browser, email: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await page.goto(`/portal/${TENANT}/`);
  await page
    .getByRole("link", { name: "Sign in" })
    .or(page.getByRole("button", { name: "Sign in" }))
    .first()
    .click();
  await page.getByLabel(/Email/).first().fill(email);
  const next = page.getByRole("button", { name: "Continue" });
  if (await next.count()) await next.click();
  await page
    .getByLabel(/Password/)
    .first()
    .fill(PASSWORD);
  await page
    .getByRole("button", { name: /Sign in/ })
    .last()
    .click();
  await page
    .getByLabel(/Password/)
    .first()
    .waitFor({ state: "detached", timeout: 20_000 });
  return page;
}

test("Acceptance, the pet owners' portal: an owner signs in on a phone and sees their own details and their own pets, nobody else's, asks for a visit, and nothing scrolls sideways", async ({
  browser,
}) => {
  const OWNER_EMAIL = "george.lewis@example.net";
  const clients = (await ok(owner, "GET", `${W}/rows/clients?limit=200`)).items as Wid[];
  const me = clients.find((one) => one.email === OWNER_EMAIL);
  expect(me, "the sandbox has George Lewis").toBeTruthy();
  const pets = ((await ok(owner, "GET", `${W}/rows/pets?limit=200`)).items as Wid[]).filter(
    (one) => one.client_code === me?.code,
  );
  const others = ((await ok(owner, "GET", `${W}/rows/pets?limit=200`)).items as Wid[]).filter(
    (one) => one.client_code !== me?.code && !pets.some((mine) => mine.name === one.name),
  );
  expect(pets.length, "he has pets").toBeGreaterThan(0);
  expect(others.length, "others have pets too").toBeGreaterThan(0);

  const person = await endUserOnAPhone(browser, OWNER_EMAIL);
  const requested: string[] = [];
  try {
    await person.goto("/apps/fernhill/sandbox/my-account/");
    // Their own details: found by their email, on a phone.
    await expect(person.getByRole("region", { name: "Your details" })).toContainText(me?.code, {
      timeout: 30_000,
    });
    await expect(person.getByRole("region", { name: "Your details" })).toContainText(me?.name);
    expect(await noSideways(person), "My details at 390 px").toBe(true);
    await expectNoAxeViolations(person, "the pet owners' portal on a phone");
    // Their pets: the table's row rule gives them theirs, and nobody else's.
    await person
      .getByRole("link", { name: /My pets/ })
      .or(person.getByRole("tab", { name: /My pets/ }))
      .first()
      .click();
    const mine = person.getByRole("region", { name: "My pets", exact: true });
    for (const pet of pets) await expect(mine).toContainText(pet.name);
    for (const pet of others.slice(0, 5)) {
      await expect(mine, `${pet.name} is someone else's`).not.toContainText(pet.name);
    }
    expect(await noSideways(person), "My pets at 390 px").toBe(true);
    // Asking for a visit is one action on a pet: it adds one row to the visit requests.
    const before = ((await ok(owner, "GET", `${W}/rows/visit_requests?limit=200`)).items as Wid[])
      .length;
    const first = [...pets].sort((a, b) => String(a.name).localeCompare(String(b.name)))[0] as Wid;
    await mine.getByRole("button", { name: "Request an appointment" }).first().click();
    const ask = person.getByRole("dialog", { name: "Request an appointment" });
    await expect(ask).toBeVisible();
    await ask.getByLabel("Why is your pet coming in?").selectOption({ index: 1 });
    await ask.getByRole("button", { name: "Send request" }).click();
    await expect(person.getByText("Asked for. Your clinic will call you.")).toBeVisible();
    const after = (await ok(owner, "GET", `${W}/rows/visit_requests?limit=200`)).items as Wid[];
    expect(after.length).toBe(before + 1);
    for (const one of after) {
      if (one.client_code === me?.code && one.pet_name === first.name) requested.push(one.id);
    }
    expect(requested.length).toBeGreaterThan(0);
  } finally {
    for (const id of requested) await call(owner, "DELETE", `${W}/rows/visit_requests/${id}`);
    await person.context().close();
  }
});

// ----- 11. Accessibility, in light and dark -----

for (const scheme of ["light", "dark"] as const) {
  test(`POLISH-015: the builder, an open drawer, the selector, the publish popover and a served phone page have no serious accessibility violation, in ${scheme}`, async () => {
    await owner.emulateMedia({ colorScheme: scheme });
    try {
      await openBuilder("tables", /^Invoices/);
      await expect(widget("Invoices")).toBeVisible();
      await expectNoAxeViolations(owner, `the builder in ${scheme}`);
      // The widget's drawer: Display, with a column's own editor open.
      await outline().getByRole("button", { name: "Invoices", exact: true }).click();
      await tabOf("Display").click();
      await rowOf("Total").click();
      await expect(columnEditor("Total")).toBeVisible();
      await expectNoAxeViolations(owner, `a column editor in ${scheme}`);
      await owner.keyboard.press("Escape");
      // The selector.
      await owner
        .getByRole("button", { name: /^Add to page/ })
        .first()
        .click();
      await expect(selector()).toBeVisible();
      await expectNoAxeViolations(owner, `the widget selector in ${scheme}`);
      await owner.keyboard.press("Escape");
      // The publish popover (the draft has changes: the earlier journeys left some).
      await openCheck();
      await expectNoAxeViolations(owner, `the publish popover in ${scheme}`);
      await owner.keyboard.press("Escape");
      // The settings as a drawer, at 768.
      await openBuilder("tables", /^Invoices/, { width: 768, height: 900 });
      await pages()
        .getByRole("button", { name: /^Invoices/ })
        .click();
      await expect(owner.getByRole("dialog", { name: "Settings" })).toBeVisible();
      await expectNoAxeViolations(owner, `the settings drawer at 768 in ${scheme}`);
      await owner.keyboard.press("Escape");
      // A served page on a phone.
      const phone = await browserPage();
      try {
        await phone.emulateMedia({ colorScheme: scheme });
        await phone.setViewportSize({ width: 390, height: 844 });
        await openServed(phone, "phone");
        await expect(phone.getByRole("region", { name: "Beta", exact: true })).toBeVisible({
          timeout: 30_000,
        });
        await expectNoAxeViolations(phone, `a served phone page in ${scheme}`);
      } finally {
        await phone.context().close();
      }
    } finally {
      await owner.emulateMedia({ colorScheme: "light" });
      await owner.setViewportSize({ width: 1440, height: 1000 });
    }
  });
}
