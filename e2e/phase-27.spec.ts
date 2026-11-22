import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * Phase 27, walked in a browser on the Fernhill example (`examples/fernhill/setup/setup.mjs`),
 * in its sandbox workspace and under names of its own. Each test is one journey of the exit
 * criterion in docs/phases/phase-27-composition.md, titled with the POLISH rule
 * (docs/polish/polish-prevention-rules.md) it checks: Money's search bar, Visits' section and
 * tabs, Stock's search, folding section and action group, the invoice sheet's action group, the
 * builder (drag and keyboard moves into a Section and a tab, the nesting outline, duplicate and
 * remove with undo, suggestions, grouping buttons, "+ Page" from a table), and a dashboard.
 *
 * The walk copies Clinic performance's pages, as the repository deployed them, into an
 * interface of its own (`screens/p27-<stamp>`) and publishes it as an app of its own, so what
 * it changes is no one else's. Its Invoices table reads only the invoices the walk made
 * (numbers that start with `P27-<stamp>`), so they are always on the first page whatever else
 * the sandbox holds. Two more pages are added to the copy for the builder to move things on:
 * "Play" (two stats) and "Tools" (two buttons). A second, unpublished copy has Money's search
 * taken out, so that "Add to page" has something to suggest.
 *
 * The locators of what the build draws are small functions near the top, so one that the build
 * named a little differently is changed in one place. A `// GUESS:` says what it assumes.
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = process.env.E2E_FERNHILL_TENANT ?? "fernhill";
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const OWNER = "maya.brooks@fernhill.example";
const stamp = Date.now().toString(36);
const PAGE = `screens/p27-${stamp}`;
const SUGGEST = `screens/p27s-${stamp}`;
const APP = `p27-${stamp}`;
const PREFIX = `P27-${stamp.toUpperCase()}`;
const today = new Date().toISOString().slice(0, 10);

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
/** Where the served app is, with the closing slash. */
let base: string;
let board = "";

type Made = { id: string; number: string; code: string };
const invoice: Record<"a" | "b" | "sheet", Made> = {
  a: { id: "", number: `${PREFIX}-A`, code: `CZ${stamp.toUpperCase()}A` },
  b: { id: "", number: `${PREFIX}-B`, code: `CZ${stamp.toUpperCase()}B` },
  sheet: { id: "", number: `${PREFIX}-S`, code: `CZ${stamp.toUpperCase()}S` },
};

// ----- What the build draws, in one place -----

/** The served app's Invoices table (the region a labelled card makes). */
const invoices = (page: Page) => page.getByRole("region", { name: "Invoices", exact: true });
const rowOf = (page: Page, number: string) =>
  invoices(page).getByRole("row", { name: new RegExp(number) });
const sheetOf = (page: Page) => page.getByRole("dialog", { name: /Invoice detail/ });
/** A stat, as a card with its title. */
const stat = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
/**
 * The filter widget's search box on Money.
 * GUESS: a text box labelled "Search invoices" (a textbox or a searchbox, found by its label).
 */
const searchInvoices = (page: Page) => page.getByLabel("Search invoices", { exact: true });
/** A labelled control of the filter bar ("Clinic", "Issued", "Status"). GUESS: found by its label. */
const filterControl = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).first();
/** The filter widget's button that puts everything back. GUESS: "Clear" (the config says "Offer Clear"), or "Reset". */
const clearFilters = (page: Page) => page.getByRole("button", { name: /^(Clear|Reset)$/ });
/** A Section as the served app draws it: a card with its title. GUESS: a region named by the title. */
const section = (page: Page, title: string) =>
  page.getByRole("region", { name: title, exact: true }).first();
/**
 * A Section's fold button. GUESS: a button with aria-expanded inside the section's own card
 * (nothing else in a Section carries aria-expanded).
 */
const foldButton = (inside: ReturnType<typeof section>, open: boolean) =>
  inside.getByRole("button", { expanded: open }).first();
/** The tab strip of a Tabs widget (role tablist) and one of its tabs. */
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
/**
 * The Action group's own card or toolbar, found from a button only it holds.
 * GUESS: its buttons share their nearest section or toolbar or group.
 */
const toolbarOf = (button: ReturnType<Page["getByRole"]>) =>
  button.locator("xpath=ancestor::*[self::section or @role='toolbar' or @role='group'][1]");

/** The builder's widget on the canvas, the outline and the inspector. */
/** A widget on the canvas, by its name: a cell of a grid (the inspector has groups of its own). */
const widget = (name: string) =>
  owner.locator("[data-widget-cell]").and(owner.getByRole("group", { name, exact: true }));
const settings = () => owner.getByRole("complementary", { name: "Settings" });
/** GUESS: the outline keeps `aria-labelledby="on-the-page"` and nests children in a list inside their container's item. */
const outline = () => owner.locator('[aria-labelledby="on-the-page"]');
const groups = () => owner.locator("section[role=group]");
/** The inspector's ⋯ menu button ("More about <widget>", as the inspector names it). */
const moreAbout = (name: string) => owner.getByRole("button", { name: `More about ${name}` });
/**
 * What a menu or list that has just opened holds.
 * GUESS: "Move to…" opens a menu (or a list in a popover) of "The page" and each Section and tab,
 * whose items are menu items, options or buttons.
 */
const popup = () => owner.locator("[role=menu],[role=listbox],[role=dialog]").last();
const destination = (name: string | RegExp) =>
  popup()
    .getByRole("menuitem", { name })
    .or(popup().getByRole("option", { name }))
    .or(popup().getByRole("button", { name }))
    .first();

async function moveTo(name: string, to: string | RegExp) {
  await widget(name).focus();
  await moreAbout(name).click();
  await owner.getByRole("menuitem", { name: /^Move to/ }).click();
  await destination(to).click();
}

/** What the page's address says. */
/** The address as words: its path, and each search parameter as `name=value` (a space is written `+`). */
const decoded = (page: Page) => {
  const url = new URL(page.url());
  const params = [...url.searchParams.entries()].map(([name, value]) => `${name}=${value}`);
  return `${decodeURIComponent(url.pathname)}?${params.join("&")}`;
};

/** The walk's own app as it is drafted now, and one page of it. */
const drafted = async (path = PAGE) => (await ok(owner, "GET", `${W}/drafts/${path}`)).body;
/** A page of the draft; none while the builder hasn't saved its first change (a save waits a moment). */
const draftPage = async (id: string, path = PAGE) => {
  const answer = await call(owner, "GET", `${W}/drafts/${path}`);
  if (answer.status === 404) return undefined;
  return answer.body.body.pages.find((one: { id: string }) => one.id === id);
};
// biome-ignore lint/suspicious/noExplicitAny: widgets are inspected freely
type Wid = any;
const draftWidget = async (page: string, match: (one: Wid) => boolean) =>
  (await draftPage(page))?.widgets.find(match);
/** The id of the first widget of a type on Play, once the builder has saved it. */
async function savedId(type: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(async () => {
      id = (await draftWidget("play", (one) => one.type === type))?.id;
      return id;
    })
    .toBeTruthy();
  return id as string;
}

async function openApp(page: Page, path = "") {
  await page.goto(`${base}${path}`);
  // A member lands on the signed-in staff view first, where the app is the same address.
  const staff = page
    .getByRole("link", { name: /staff/i })
    .or(page.getByRole("button", { name: /staff/i }));
  if (await staff.count()) await staff.first().click();
}

async function openBuilder(path: string, pageTitle: RegExp) {
  await owner.setViewportSize({ width: 1440, height: 1500 });
  await owner.goto(`${L}/${path}`);
  const choose = owner.getByRole("button", { name: pageTitle });
  await expect(choose).toBeVisible({ timeout: 30_000 });
  await choose.click();
  await expect(choose).toHaveAttribute("aria-pressed", "true");
}

async function addToPage(item: RegExp) {
  await owner
    .getByRole("button", { name: /Add to page/ })
    .first()
    .click();
  await owner.getByRole("dialog").getByRole("button", { name: item }).click();
}

/** Adds a container to the open page when it is not there, and says which of the page's it is. */
async function ensure(title: string, item: RegExp) {
  if ((await widget(title).count()) === 0) await addToPage(item);
  await expect(widget(title)).toBeVisible();
}

/** A pointer drag from the middle of one widget to the middle of a box. */
async function dragTo(name: string, to: { x: number; y: number }) {
  await widget(name).scrollIntoViewIfNeeded();
  const from = await widget(name).boundingBox();
  if (!from) throw new Error(`${name} is not on the page`);
  await owner.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await owner.mouse.down();
  await owner.mouse.move(to.x, to.y, { steps: 14 });
  await owner.mouse.up();
}
const middle = async (locator: ReturnType<typeof widget>) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not on the page");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
};

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

// ----- Setup -----

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  owner = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signInWithPassword(owner, OWNER, PASSWORD);
  const tenants = await ok(owner, "GET", "/tenants?limit=200");
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const workspaces = (await ok(owner, "GET", `/tenants/${tenant.id}/workspaces`)).items;
  const sandbox = workspaces.find((one: { slug: string }) => one.slug === SANDBOX);
  test.skip(!sandbox, "Fernhill's sandbox workspace is needed.");
  W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  L = `/t/${tenant.id}/workspaces/${sandbox.id}`;

  // Three invoices of the walk's, each with a client code of its own to search for.
  for (const [which, total] of [
    ["a", 12345],
    ["b", 20000],
    ["sheet", 5500],
  ] as const) {
    const made = await ok(owner, "POST", `${W}/rows/invoices`, {
      number: invoice[which].number,
      client_code: invoice[which].code,
      clinic: "northside",
      total,
      status: "unpaid",
      issued_on: today,
    });
    invoice[which].id = made.items[0].id;
  }

  // Clinic performance as the repository deployed it, every page, with its Invoices table
  // reading only the walk's invoices.
  const deployed = await ok(owner, "GET", `${W}/interfaces/screens/performance`);
  const pages = structuredClone(deployed.body.pages);
  const money = pages.find((one: { id: string }) => one.id === "money");
  const list = money.widgets.find((one: { id: string }) => one.id === "list");
  list.data.rows.source.visual.filters = [{ column: "number", op: "contains", value: PREFIX }];

  // Two pages for the builder to move things on: a pair of stats, and a pair of buttons.
  const model = structuredClone(
    pages
      .flatMap((one: { widgets: Wid[] }) => one.widgets)
      .find((one: Wid) => one.type === "core/stat" && !one.in),
  );
  delete model.on;
  for (const input of Object.values<Wid>(model.data ?? {})) delete input.filters;
  const statOf = (id: string, title: string, x: number) => ({
    ...structuredClone(model),
    id,
    title,
    at: { x, y: 0, w: 4, h: 3 },
  });
  const buttonOf = (id: string, label: string, x: number) => ({
    id,
    type: "core/button",
    title: label,
    at: { x, y: 0, w: 3, h: 1 },
    config: { label },
    on: { click: { steps: [{ do: "message", text: `${label} done` }] } },
  });
  pages.push(
    {
      id: "play",
      title: "Play",
      widgets: [statOf("alpha", "Alpha", 0), statOf("beta", "Beta", 4)],
    },
    {
      id: "tools",
      title: "Tools",
      widgets: [buttonOf("print", "Print", 0), buttonOf("email", "Email", 3)],
    },
  );
  const body = { title: `Walk ${stamp}`, pages };
  await ok(owner, "PUT", `${W}/drafts/${PAGE}`, {
    kind: "interface",
    schemaVersion: 2,
    body,
    create: true,
  });
  await ok(owner, "PUT", `${W}/drafts/${APP}`, {
    kind: "app",
    schemaVersion: 1,
    body: { title: `Walk ${stamp}`, interface: PAGE },
    create: true,
  });
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [PAGE, APP],
    message: `Phase 27 walk ${stamp}`,
  });

  // The second copy, never published: Money without its search, so that "Add to page" offers one.
  const bare = structuredClone(pages);
  const bareMoney = bare.find((one: { id: string }) => one.id === "money");
  const names = new Set<string>();
  for (const one of bareMoney.widgets.filter((one: Wid) => one.type === "core/filter")) {
    const kept = one.config.filters.filter((filter: Wid) => {
      if (filter.type === "search") names.add(filter.name);
      return filter.type !== "search";
    });
    one.config.filters = kept;
  }
  bareMoney.widgets = bareMoney.widgets.filter(
    (one: Wid) => one.type !== "core/filter" || one.config.filters.length > 0,
  );
  for (const one of bareMoney.widgets) {
    for (const input of Object.values<Wid>(one.data ?? {})) {
      if (Array.isArray(input.filters)) {
        input.filters = input.filters.filter((bound: Wid) => !names.has(bound.filter));
      }
    }
  }
  await ok(owner, "PUT", `${W}/drafts/${SUGGEST}`, {
    kind: "interface",
    schemaVersion: 2,
    body: { title: `Walk ${stamp} without a search`, pages: bare },
    create: true,
  });

  const apps = (await ok(owner, "GET", `${W}/apps`)).items as { url: string }[];
  const app = apps.find((one) => one.url.includes(APP)) ?? apps[0];
  base = `${new URL(app?.url as string).pathname.replace(/\/$/, "")}/`;
});

test.afterAll(async () => {
  if (!owner) return;
  if (!W) {
    await owner.context().close();
    return;
  }
  for (const one of Object.values(invoice)) {
    if (one.id) await call(owner, "DELETE", `${W}/rows/invoices/${one.id}`);
  }
  if (board) await call(owner, "DELETE", `${W}/dashboards/${board}`);
  for (const path of [PAGE, SUGGEST, APP]) await call(owner, "DELETE", `${W}/drafts/${path}`);
  await owner.context().close();
});

// ----- The served app -----

test("POLISH-006: Money's bar reads Search invoices, Clinic, Issued and Status; a client code narrows the table and the stats, and a reload and a shared link keep it", async () => {
  await owner.setViewportSize({ width: 1440, height: 900 });
  await openApp(owner);
  await expect(invoices(owner)).toBeVisible({ timeout: 30_000 });
  await expect(searchInvoices(owner)).toBeVisible();
  for (const label of ["Clinic", "Issued", "Status"]) {
    await expect(filterControl(owner, label), `${label} is in the bar`).toBeVisible();
  }
  await expect(rowOf(owner, invoice.a.number)).toBeVisible();
  await expect(rowOf(owner, invoice.b.number)).toBeVisible();
  // A client code narrows the table to that client's invoice, and the stats follow it.
  await searchInvoices(owner).fill(invoice.a.code);
  await expect(rowOf(owner, invoice.a.number)).toBeVisible();
  await expect(rowOf(owner, invoice.b.number)).toHaveCount(0);
  await expect(stat(owner, "Invoiced")).toContainText("$123.45");
  // What was typed is in the address, as `f.<name>=<JSON>`.
  await expect
    .poll(() => decoded(owner))
    .toMatch(new RegExp(`[?&]f\\.[a-z_]+="${invoice.a.code}"`));
  const link = owner.url();
  // A reload keeps it.
  await owner.reload();
  await expect(searchInvoices(owner)).toHaveValue(invoice.a.code);
  await expect(rowOf(owner, invoice.a.number)).toBeVisible();
  await expect(rowOf(owner, invoice.b.number)).toHaveCount(0);
  // And so does the link, sent to someone: opened fresh, in a page of its own.
  const shared = await owner.context().newPage();
  await shared.goto(link);
  await expect(searchInvoices(shared)).toHaveValue(invoice.a.code, { timeout: 30_000 });
  await expect(rowOf(shared, invoice.b.number)).toHaveCount(0);
  await expect(rowOf(shared, invoice.a.number)).toBeVisible();
  await shared.close();
  // Clearing puts every invoice back, and the address with it.
  await clearFilters(owner).click();
  await expect(searchInvoices(owner)).toHaveValue("");
  await expect(rowOf(owner, invoice.b.number)).toBeVisible();
  await expect.poll(() => decoded(owner)).not.toContain(invoice.a.code);
  await expectNoAxeViolations(owner, "Money with its search bar");
});

test("POLISH-005: Money's bar fits a phone: the search box is whole and the page does not scroll sideways", async () => {
  await owner.setViewportSize({ width: 390, height: 844 });
  await openApp(owner);
  await expect(searchInvoices(owner)).toBeVisible({ timeout: 30_000 });
  const box = await searchInvoices(owner).boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390, "the search box is inside 390 px").toBe(
    true,
  );
  expect(await noSideways(owner)).toBe(true);
  await owner.setViewportSize({ width: 1440, height: 900 });
});

test("POLISH-006: Visits is a Section of stats and Tabs; the open tab is in the address and survives a reload, and the arrow keys change it", async () => {
  await openApp(owner, "visits");
  const clinics = section(owner, "Today at the clinics");
  await expect(clinics).toBeVisible({ timeout: 30_000 });
  // The stats are in the section.
  await expect(clinics.getByRole("region").first()).toBeVisible();
  await expect(owner.getByRole("tablist", { name: "Visits" })).toBeVisible();
  for (const name of ["By status", "By reason", "Every visit"]) {
    await expect(tab(owner, name)).toBeVisible();
  }
  await expect(tab(owner, "By status")).toHaveAttribute("aria-selected", "true");
  const first = await owner.getByRole("tabpanel").first().textContent();
  await tab(owner, "By reason").click();
  await expect(tab(owner, "By reason")).toHaveAttribute("aria-selected", "true");
  // The open tab is in the address as `tab.<widgetId>=<tabId>`.
  await expect.poll(() => new URL(owner.url()).search).toMatch(/[?&]tab\.[^=&]+=[^&]+/);
  expect(await owner.getByRole("tabpanel").first().textContent()).not.toBe(first);
  const link = owner.url();
  await owner.reload();
  await expect(tab(owner, "By reason")).toHaveAttribute("aria-selected", "true");
  // A link sent to someone opens on the same tab.
  await owner.goto(`${base}visits`);
  await owner.goto(link);
  await expect(tab(owner, "By reason")).toHaveAttribute("aria-selected", "true");
  // The keyboard: the arrow moves to the next tab and Enter opens it, as the kit's tab strips do
  // (the app's own pages too): a tab that reads its widgets isn't opened by passing over it.
  await tab(owner, "By reason").focus();
  await owner.keyboard.press("ArrowRight");
  await expect(tab(owner, "Every visit")).toBeFocused();
  await owner.keyboard.press("Enter");
  await expect(tab(owner, "Every visit")).toHaveAttribute("aria-selected", "true");
  await expectNoAxeViolations(owner, "Visits with its tabs");
});

test("POLISH-005: on a phone Visits' tabs and what its Section holds are stacked, and nothing scrolls sideways", async () => {
  await owner.setViewportSize({ width: 390, height: 844 });
  await openApp(owner, "visits");
  const clinics = section(owner, "Today at the clinics");
  await expect(clinics).toBeVisible({ timeout: 30_000 });
  await expect(owner.getByRole("tablist", { name: "Visits" })).toBeVisible();
  expect(await noSideways(owner)).toBe(true);
  // What the section holds is one under another, not side by side.
  const inside = clinics.getByRole("region");
  if ((await inside.count()) > 1) {
    const one = await inside.nth(0).boundingBox();
    const two = await inside.nth(1).boundingBox();
    expect(one && two && Math.abs(one.x - two.x) < 2 && two.y >= one.y + one.height - 2).toBe(true);
  }
  await owner.setViewportSize({ width: 1440, height: 900 });
});

test("POLISH-006: a Section that folds is folded by a press, stays folded after a reload, and opens again", async () => {
  await openApp(owner, "visits");
  const clinics = section(owner, "Today at the clinics");
  await expect(foldButton(clinics, true)).toBeVisible({ timeout: 30_000 });
  await expect(clinics.getByRole("region").first()).toBeVisible();
  await foldButton(clinics, true).click();
  await expect(foldButton(clinics, false)).toBeVisible();
  await expect(clinics.getByRole("region")).toHaveCount(0);
  // Folded stays folded after a reload (kept in this browser).
  await owner.reload();
  await expect(foldButton(section(owner, "Today at the clinics"), false)).toBeVisible({
    timeout: 30_000,
  });
  await expect(section(owner, "Today at the clinics").getByRole("region")).toHaveCount(0);
  // By keyboard: Enter on the fold button opens it, and the stats are back.
  await foldButton(section(owner, "Today at the clinics"), false).focus();
  await owner.keyboard.press("Enter");
  await expect(foldButton(section(owner, "Today at the clinics"), true)).toBeVisible();
  await owner.reload();
  await expect(foldButton(section(owner, "Today at the clinics"), true)).toBeVisible({
    timeout: 30_000,
  });
});

test("POLISH-006: Stock has a search that finds an item, a folding Orders to VetSupply, and an Action group of Reorder and Count stock", async () => {
  await openApp(owner, "stock");
  const stock = owner.getByRole("region", { name: "Stock", exact: true }).first();
  await expect(stock).toBeVisible({ timeout: 30_000 });
  const lines = (await ok(owner, "GET", `${W}/rows/inventory?limit=200`)).items as {
    item: string;
  }[];
  const target = lines.find((one) => one.item)?.item as string;
  expect(target, "the sandbox has stock to find").toBeTruthy();
  const others = lines.some((one) => one.item !== target);
  // GUESS: the page's search is a text box whose label begins "Search".
  const search = owner.getByRole("textbox", { name: /^Search/ }).first();
  await expect(search).toBeVisible();
  const before = await stock.getByRole("row").count();
  await search.fill(target);
  await expect(stock).toContainText(target);
  if (others) await expect.poll(() => stock.getByRole("row").count()).toBeLessThan(before);
  await expect.poll(() => decoded(owner)).toContain(target);
  await clearFilters(owner).click();
  await expect(search).toHaveValue("");
  // Orders to VetSupply is in a Section that folds, and says whether it is open.
  const orders = section(owner, "Orders to VetSupply");
  await expect(foldButton(orders, true)).toBeVisible();
  await foldButton(orders, true).click();
  await expect(foldButton(orders, false)).toBeVisible();
  await foldButton(orders, false).click();
  await expect(foldButton(orders, true)).toBeVisible();
  // The Action group over the table: Reorder and Count stock, together.
  const count = owner.getByRole("button", { name: "Count stock", exact: true });
  await expect(count).toBeVisible();
  await expect(
    toolbarOf(count).getByRole("button", { name: "Reorder", exact: true }),
  ).toBeVisible();
});

test("POLISH-005: the invoice sheet's Action group holds Mark paid, Edit and Void; at 390 px what does not fit is under More", async () => {
  const link = `${base}?sheet=invoice&record=${invoice.sheet.id}`;
  const names = ["Mark paid", "Edit", "Void"];
  // At a desktop width all three are buttons, and there is nothing to put under More.
  await owner.setViewportSize({ width: 1440, height: 900 });
  await openApp(owner);
  await owner.goto(link);
  await expect(sheetOf(owner)).toContainText(invoice.sheet.number, { timeout: 30_000 });
  for (const name of names) {
    await expect(sheetOf(owner).getByRole("button", { name, exact: true }), name).toBeVisible();
  }
  await expect(sheetOf(owner).getByRole("button", { name: "More", exact: true })).toHaveCount(0);
  // On a phone each is a button or is under More; none is lost, and nothing runs off the screen.
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.reload();
  await expect(sheetOf(owner)).toContainText(invoice.sheet.number, { timeout: 30_000 });
  expect(await noSideways(owner)).toBe(true);
  const more = sheetOf(owner).getByRole("button", { name: "More", exact: true });
  const hidden: string[] = [];
  for (const name of names) {
    const button = sheetOf(owner).getByRole("button", { name, exact: true });
    if (await button.count()) {
      const box = await button.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= 390, `${name} is inside 390 px`).toBe(true);
    } else hidden.push(name);
  }
  if (hidden.length > 0) {
    // GUESS: "More" is a menu button, and what it holds are menu items.
    await expect(more).toBeVisible();
    await more.focus();
    await owner.keyboard.press("Enter");
    for (const name of hidden) {
      await expect(owner.getByRole("menuitem", { name }), `${name} is under More`).toBeVisible();
    }
    await owner.keyboard.press("Escape");
    await expect(owner.getByRole("menuitem")).toHaveCount(0);
  } else {
    await expect(more).toHaveCount(0);
  }
  await owner.setViewportSize({ width: 1440, height: 900 });
});

// ----- The builder -----

test("POLISH-002: Add to page's Organize group offers Section, Tabs and Search and filter, and the Action group is there for an app", async () => {
  await openBuilder(`screens/${PAGE}`, /^Play/);
  await owner
    .getByRole("button", { name: /Add to page/ })
    .first()
    .click();
  const dialog = owner.getByRole("dialog");
  // GUESS: the group is headed "Organize".
  await expect(dialog.getByText("Organize", { exact: true })).toBeVisible();
  for (const name of [/^Section/, /^Tabs/, /^Search and filter/, /^Action group/]) {
    await expect(dialog.getByRole("button", { name })).toBeVisible();
  }
  await owner.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("POLISH-008: a widget is dragged into a Section and out again, and the page keeps it where it was let go", async () => {
  await openBuilder(`screens/${PAGE}`, /^Play/);
  await addToPage(/^Section/);
  await expect(widget("Section")).toBeVisible();
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.type === "core/section"))?.id)
    .toBeTruthy();
  const container = await savedId("core/section");
  // Dragged into the section: the widget is in it, on the section's own grid.
  const target = await middle(widget("Section"));
  await dragTo("Alpha", { x: target.x, y: target.y });
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.id === "alpha"))?.in?.widget)
    .toBe(container);
  // The outline says so, and the section holds it: Alpha is inside the section's box.
  const inside = await widget("Alpha").boundingBox();
  const frame = await widget("Section").boundingBox();
  expect(
    inside &&
      frame &&
      inside.y >= frame.y &&
      inside.y + inside.height <= frame.y + frame.height + 2,
  ).toBe(true);
  // Dragged out, to where it was above the section: it is on the page again.
  const beta = await middle(widget("Beta"));
  const left = (await widget("Section").boundingBox())?.x ?? 0;
  await dragTo("Alpha", { x: left + (inside?.width ?? 200) / 2 + 4, y: beta.y });
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.id === "alpha"))?.in)
    .toBeUndefined();
});

test("POLISH-007: the same moves from the keyboard: ⋯ › Move to lists The page, the Section and each tab, and moves the widget there and back", async () => {
  await openBuilder(`screens/${PAGE}`, /^Play/);
  await ensure("Section", /^Section/);
  await ensure("Tabs", /^Tabs/);
  const container = await savedId("core/section");
  const tabs = await savedId("core/tabs");
  // The destinations are the section and each of the tabs; not the page, where it already is.
  await widget("Beta").focus();
  await moreAbout("Beta").click();
  await owner.getByRole("menuitem", { name: /^Move to/ }).click();
  for (const name of [/Section/, /First/, /Second/]) {
    await expect(destination(name), String(name)).toBeVisible();
  }
  await expect(destination(/The page/)).toHaveCount(0);
  await destination(/Section/).click();
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.id === "beta"))?.in?.widget)
    .toBe(container);
  // Onto a tab: it names the tab.
  await moveTo("Beta", /Second/);
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.id === "beta"))?.in)
    .toEqual({ widget: tabs, tab: "second" });
  // And out again, to the page.
  await moveTo("Beta", /The page/);
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.id === "beta"))?.in)
    .toBeUndefined();
});

test("POLISH-008: a widget is dragged onto a tab of Tabs, and out of it", async () => {
  await openBuilder(`screens/${PAGE}`, /^Play/);
  await ensure("Tabs", /^Tabs/);
  const tabs = await savedId("core/tabs");
  // GUESS: while building, Tabs draws its strip, and a tab is a `tab` that a widget can be let go on.
  const second = widget("Tabs").getByRole("tab", { name: "Second", exact: true });
  await expect(second).toBeVisible();
  const at = await second.boundingBox();
  if (!at) throw new Error("the Second tab is not on the page");
  await dragTo("Alpha", { x: at.x + at.width / 2, y: at.y + at.height / 2 });
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.id === "alpha"))?.in)
    .toEqual({ widget: tabs, tab: "second" });
  await moveTo("Alpha", /The page/);
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.id === "alpha"))?.in)
    .toBeUndefined();
});

test("POLISH-003: the outline nests what a Section holds, the Section grows with it, and duplicating or removing it takes what it holds, and Undo brings it back", async () => {
  await openBuilder(`screens/${PAGE}`, /^Play/);
  await ensure("Section", /^Section/);
  const container = await savedId("core/section");
  await moveTo("Alpha", /Section/);
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.id === "alpha"))?.in?.widget)
    .toBe(container);
  // The outline: Alpha is under the Section's own item, and Beta (on the page) is not.
  const item = outline()
    .getByRole("listitem")
    .filter({ has: outline().getByRole("button", { name: "Section", exact: true }) });
  await expect(item.getByRole("button", { name: "Alpha", exact: true })).toBeVisible();
  await expect(item.getByRole("button", { name: "Beta", exact: true })).toHaveCount(0);
  // The Section grows with what it holds: Alpha made much taller, and the Section follows.
  const before = (await widget("Section").boundingBox())?.height ?? 0;
  await widget("Alpha").focus();
  for (let press = 0; press < 10; press += 1) await owner.keyboard.press("Shift+ArrowDown");
  await expect
    .poll(async () => (await widget("Section").boundingBox())?.height ?? 0)
    .toBeGreaterThan(before);
  // Duplicating the Section copies Alpha too.
  const count = await groups().count();
  await widget("Section").focus();
  await owner.keyboard.press("Control+d");
  await expect(groups()).toHaveCount(count + 2);
  const whole = async () => {
    const all = (await draftPage("play")).widgets as Wid[];
    return all.every((one) => !one.in || all.some((other) => other.id === one.in.widget));
  };
  await expect.poll(whole).toBe(true);
  // Undo takes the copy back, with what it held.
  await owner.keyboard.press("Control+z");
  await expect(groups()).toHaveCount(count);
  // Removing the Section takes Alpha with it, and Undo brings both back.
  await widget("Section").focus();
  await owner.keyboard.press("Delete");
  await expect(groups()).toHaveCount(count - 2);
  await expect(widget("Alpha")).toHaveCount(0);
  await expect.poll(whole).toBe(true);
  await owner.keyboard.press("Control+z");
  await expect(groups()).toHaveCount(count);
  await expect(widget("Alpha")).toBeVisible();
  await expect
    .poll(async () => (await draftWidget("play", (one) => one.id === "alpha"))?.in?.widget)
    .toBe(container);
});

test("POLISH-003: Add to page suggests Search invoices where a page of Invoices has none, and adds it to the page's bar", async () => {
  await openBuilder(`screens/${SUGGEST}`, /^Money/);
  const open = () =>
    owner
      .getByRole("button", { name: /Add to page/ })
      .first()
      .click();
  await open();
  const dialog = owner.getByRole("dialog");
  // GUESS: the group is headed "Suggested for Invoices", and comes before the others.
  await expect(dialog.getByText("Suggested for Invoices")).toBeVisible();
  const suggestion = dialog.getByRole("button", { name: /^Search invoices/ });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(dialog).toHaveCount(0);
  // The page now has a search among its filters.
  const hasSearch = async () => {
    const money = await draftPage("money", SUGGEST);
    return (money.widgets as Wid[]).some(
      (one) =>
        one.type === "core/filter" &&
        (one.config.filters as Wid[]).some((filter) => filter.type === "search"),
    );
  };
  await expect.poll(hasSearch).toBe(true);
  // What is there is no longer suggested.
  await open();
  await expect(
    owner.getByRole("dialog").getByRole("button", { name: /^Search invoices/ }),
  ).toHaveCount(0);
  await owner.keyboard.press("Escape");
});

test("POLISH-003: a button offers to be grouped with the one beside it, and the two become one Action group", async () => {
  await openBuilder(`screens/${PAGE}`, /^Tools/);
  await widget("Print").focus();
  // GUESS: the offer is a button in the inspector whose name says "group".
  const offer = settings().getByRole("button", { name: /group/i }).first();
  await expect(offer).toBeVisible();
  await offer.click();
  await expect
    .poll(async () => {
      const tools = await draftPage("tools");
      const widgets = tools.widgets as Wid[];
      const made = widgets.find((one) => one.type === "core/actions");
      const labels = (made?.config?.actions ?? []).map((one: Wid) => one.label);
      return (
        labels.includes("Print") &&
        labels.includes("Email") &&
        widgets.filter((one) => one.type === "core/button").length === 0
      );
    })
    .toBe(true);
  await expect(widget("Action group")).toBeVisible();
  // One step back, and the two buttons are separate again.
  await owner.keyboard.press("Control+z");
  await expect(widget("Print")).toBeVisible();
  await expect(widget("Email")).toBeVisible();
});

test("POLISH-003: + Page offers A list of Invoices, which makes a page with a search, a table, a detail sheet and a New invoice form", async () => {
  await openBuilder(`screens/${PAGE}`, /^Play/);
  const known = new Set(((await drafted()).pages as Wid[]).map((one) => one.id));
  await owner.getByRole("button", { name: "Page", exact: true }).click();
  const dialog = owner.getByRole("dialog");
  // GUESS: the offers are listed in a dialog, with their words as the exit criterion has them.
  await expect(dialog.getByText("An Invoice record page")).toBeVisible();
  await dialog.getByText("A list of Invoices").click();
  const confirm = dialog.getByRole("button", { name: /^(Add the page|Add page|Create|Add)/ });
  if (await confirm.count()) await confirm.first().click();
  await expect
    .poll(async () => ((await drafted()).pages as Wid[]).filter((one) => !known.has(one.id)).length)
    .toBeGreaterThanOrEqual(3);
  const added = ((await drafted()).pages as Wid[]).filter((one) => !known.has(one.id));
  const types = (kind: string | undefined) =>
    added
      .filter((one) => (one.kind ?? "page") === (kind ?? "page"))
      .flatMap((one) => (one.widgets as Wid[]).map((made) => made.type));
  // The list: a search, and the table.
  const list = added.find((one) => !one.kind);
  const bar = ((list?.widgets ?? []) as Wid[]).find((one) => one.type === "core/filter");
  expect(((bar?.config.filters ?? []) as Wid[]).some((one) => one.type === "search")).toBe(true);
  expect(types(undefined)).toContain("core/table");
  // The sheet a row opens, and the New invoice form.
  expect(types("sheet")).toContain("core/detail");
  expect(types("modal")).toContain("core/form");
  // The table is drawn on the canvas of the page that was added.
  await expect(owner.getByRole("button", { name: new RegExp(`^${list?.title}`) })).toBeVisible();
});

// ----- A dashboard -----

test("POLISH-002: a dashboard's filters are a Search and filter widget that is edited in the inspector, and Action group is not offered", async () => {
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await owner.goto(`${L}/dashboards`);
  const made = await ok(owner, "POST", `${W}/dashboards`, { title: `Walk ${stamp}` });
  board = made.id;
  await ok(owner, "PUT", `${W}/dashboards/${board}`, {
    revision: made.revision,
    body: {
      title: `Walk ${stamp}`,
      widgets: [
        {
          id: "filters",
          type: "core/filter",
          at: { x: 0, y: 0, w: 12, h: 2 },
          config: {
            filters: [
              { name: "issued", label: "Issued", type: "date_range", default: "last_30_days" },
            ],
            reset: true,
          },
        },
        {
          id: "total",
          type: "core/stat",
          title: "Invoiced",
          at: { x: 0, y: 2, w: 3, h: 3 },
          data: {
            value: {
              source: {
                visual: {
                  table: "invoices",
                  measures: [{ fn: "sum", column: "total", as: "total" }],
                },
              },
              filters: [{ filter: "issued", column: "issued_on" }],
            },
          },
        },
      ],
    },
  });
  // Read, the filter is the same labelled control as ever, in the bar, and the address keeps it.
  await owner.goto(`${L}/dashboards/${board}`);
  await expect(stat(owner, "Invoiced")).toBeVisible({ timeout: 30_000 });
  await owner.getByRole("combobox", { name: "Issued" }).selectOption({ label: "Last 90 days" });
  await expect.poll(() => new URL(owner.url()).search).toMatch(/[?&]f(\.|=)/);
  await owner.reload();
  await expect(owner.getByRole("combobox", { name: "Issued" })).toBeVisible({ timeout: 30_000 });
  // Edited: a Section, Tabs and Search and filter are offered; an Action group and a Button are not.
  await owner.goto(`${L}/dashboards/${board}?edit=1`);
  await owner
    .getByRole("button", { name: /Add to page/ })
    .first()
    .click();
  const dialog = owner.getByRole("dialog");
  for (const name of [/^Section/, /^Tabs/, /^Search and filter/]) {
    await expect(dialog.getByRole("button", { name })).toBeVisible();
  }
  await expect(dialog.getByRole("button", { name: /^Action group/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^Button/ })).toHaveCount(0);
  await owner.keyboard.press("Escape");
  // The filters are edited by choosing the widget: Data has them in a list, with "Add a filter".
  await widget("Search and filter").focus();
  await settings().getByRole("tab", { name: /^Data/ }).click();
  await expect(settings().getByRole("button", { name: /Add a filter/ })).toBeVisible();
  // GUESS: each filter's name is a text box labelled "Called", as page filters had it.
  await settings().getByLabel("Called").first().fill("Issued on");
  await settings().getByLabel("Called").first().press("Tab");
  await expect
    .poll(async () => {
      const stored = await ok(owner, "GET", `${W}/dashboards/${board}`);
      const bar = (stored.body.widgets as Wid[]).find((one) => one.type === "core/filter");
      return bar?.config.filters[0].label;
    })
    .toBe("Issued on");
  await expect(owner.getByRole("combobox", { name: "Issued on" })).toBeVisible();
});
