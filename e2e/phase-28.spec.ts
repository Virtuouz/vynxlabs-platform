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

test.describe.configure({ mode: "serial" });

let owner: Page;
/** The workspace's address in the API, and in the console. */
let W: string;
let L: string;
let TENANT_ID: string;
let WORKSPACE_ID: string;

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
const saved = () => owner.getByRole("status").filter({ hasText: /Saved|Published/ }).first();

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
  WORKSPACE_ID = sandbox.id;
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
    phone: { title: `Phone ${stamp}`, pages: [{ id: "blank", title: "Blank", widgets: [] }] },
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
    for (const one of Object.values(made)) await call(owner, "DELETE", `${W}/rows/invoices/${one.id}`);
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
    expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) / 2 - (top + 12)), "on the header's row").toBeLessThan(40);
  }
  // The panes: pages and the outline on the left, the settings on the right, the canvas between.
  await expect(pages()).toBeVisible();
  await expect(outline()).toBeVisible();
  await expect(owner.getByRole("button", { name: /^Add to page/ }).first()).toBeVisible();
  await expect(settings()).toBeVisible();
  // Edge to edge: the settings reach the right edge of the window, and the page does not scroll.
  const right = await settings().boundingBox();
  expect(right && Math.abs(right.x + right.width - 1440) <= 1, "the settings end at 1440").toBe(true);
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
  expect(tablet, "the canvas is narrower on a tablet").toBeLessThan(wide);
  await owner.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Phone" })).toBeChecked();
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
  await expect(outline().getByRole("button", { name: "Stat 8" })).toHaveAttribute("aria-current", "true");
  await expect(settings().getByRole("heading", { name: "Stat 8" })).toBeVisible();
  await outline().getByRole("button", { name: "Stat 1" }).click();
  await expect(widget("Stat 1")).toBeInViewport();
  await owner.setViewportSize({ width: 1440, height: 1000 });
});

test("POLISH-003: a page's icon, its size and its title are chosen in the settings, saved, and kept after a reload", async () => {
  await openBuilder("frame", /^Blank/);
  const form = settings().getByRole("region", { name: "Page settings" });
  await expect(form).toBeVisible();
  await form.getByLabel(/^Title in the app menu/).fill("Front page");
  await form.getByLabel("Icon").selectOption({ label: "Wallet" });
  await expect
    .poll(async () => {
      const page = await draftPage("frame", "blank");
      return `${page.title}|${page.icon}`;
    })
    .toBe("Front page|wallet");
  await expect(pages().getByRole("button", { name: /^Front page/ })).toBeVisible();
  // The size is a modal's: open the dialog page, and choose a size by its name.
  await pages().getByRole("button", { name: /^A dialog/ }).click();
  const dialog = settings().getByRole("region", { name: "Page settings" });
  await dialog.getByLabel("Size").selectOption({ label: "Large" });
  await expect.poll(async () => (await draftPage("frame", "dialog")).size).toBe("large");
  await owner.reload();
  await pages().getByRole("button", { name: /^Front page/ }).click();
  await expect(
    settings().getByRole("region", { name: "Page settings" }).getByLabel(/^Title in the app menu/),
  ).toHaveValue("Front page");
  await expect(settings().getByRole("region", { name: "Page settings" }).getByLabel("Icon")).toHaveValue("wallet");
  await pages().getByRole("button", { name: /^A dialog/ }).click();
  await expect(settings().getByRole("region", { name: "Page settings" }).getByLabel("Size")).toHaveValue("large");
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
