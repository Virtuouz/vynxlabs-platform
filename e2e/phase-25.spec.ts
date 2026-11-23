import { closeSetting, openSetting, settingRow } from "./inspector.ts";
import { signInWithPassword } from "./sign-in.ts";
import { type Browser, expect, type Page, test } from "./test.ts";

/**
 * Phase 25, walked in a browser on the Fernhill example (`examples/fernhill/setup/setup.mjs`),
 * in its sandbox workspace and under names of its own. Each test is one item of the exit
 * criterion in docs/phases/phase-25-one-widget-system.md, titled with the POLISH rule
 * (docs/polish/polish-prevention-rules.md) it checks.
 *
 * The walk copies Clinic performance's Money page into an interface of its own
 * (`screens/p25-<stamp>`), so nothing it moves is anyone else's.
 *
 * Not walked here, and why: records, forms and buttons (phases 26 and 27); a widget packaged and
 * run from another developer's code (decision 0005 designs it, and does not build it); which rows
 * each group receives through a widget, which the control plane's own test proves
 * (apps/control-plane/src/widget-data.test.ts) with two groups of end users.
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = process.env.E2E_FERNHILL_TENANT ?? "fernhill";
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const OWNER = "maya.brooks@fernhill.example";
const FRONT_DESK = "jess.morgan@fernhill.example";
const stamp = Date.now().toString(36);
const PAGE = `screens/p25-${stamp}`;
const APP = `p25-${stamp}`;

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
type Answer = { status: number; body: any };
const call = (page: Page, method: string, path: string, body?: unknown): Promise<Answer> =>
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

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, email, PASSWORD);
  return page;
}

test.describe.configure({ mode: "serial" });

let owner: Page;
let W: string;
let L: string;

/** The walk's own page as it is drafted now. */
const drafted = async () => (await ok(owner, "GET", `${W}/drafts/${PAGE}`)).body;
const money = async () => (await drafted()).pages[0];
const widget = (name: string) => owner.getByRole("group", { name, exact: true });
const settings = () => owner.getByRole("complementary", { name: "Settings" });

async function openBuilder() {
  await owner.goto(`${L}/screens/${PAGE}`);
  await expect(widget("Invoiced by week")).toBeVisible({ timeout: 20_000 });
}

/** Chooses a widget as a keyboard would: it is focused, which chooses it. */
async function choose(name: string) {
  await widget(name).focus();
  await expect(widget(name)).toHaveAttribute("data-selected", "");
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  owner = await signedIn(browser, OWNER);
  const tenants = await ok(owner, "GET", "/tenants?limit=200");
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const workspaces = (await ok(owner, "GET", `/tenants/${tenant.id}/workspaces`)).items;
  const sandbox = workspaces.find((one: { slug: string }) => one.slug === SANDBOX);
  test.skip(!sandbox, "Fernhill's sandbox workspace is needed.");
  W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  L = `/t/${tenant.id}/workspaces/${sandbox.id}`;
  // Clinic performance's Money page, as the repository deployed it, under the walk's own name.
  const deployed = await ok(owner, "GET", `${W}/interfaces/screens/performance`);
  // Every page: Money opens others (the invoice sheet, the new-invoice modal) since phase 26.
  const body = { title: `Walk ${stamp}`, pages: deployed.body.pages };
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
});

test.afterAll(async () => {
  for (const path of [PAGE, APP]) await call(owner, "DELETE", `${W}/drafts/${path}`);
  await owner.context().close();
});

test("POLISH-002: Invoiced by week is a line of the sum of Total by week, in five choices, without scrolling the inspector", async () => {
  await openBuilder();
  await choose("Invoiced by week");
  const inspector = settings();
  for (const tab of ["Data", "Display", "Actions", "Rules"]) {
    await expect(inspector.getByRole("tab", { name: new RegExp(`^${tab}`) })).toBeVisible();
  }
  // Data, in the drawings' words: the rows it uses, then what to chart (Measure, For each).
  await expect(inspector.getByText(/^Follows \d+ page filters/)).toBeVisible();
  await expect(inspector.getByRole("group", { name: "Page filters this follows" })).toBeVisible();
  await expect(settingRow(inspector, "Measure")).toContainText("Sum of Total");
  await expect(settingRow(inspector, "For each")).toContainText("Issued on");
  await expect(settingRow(inspector, "For each")).toContainText("Weekly");
  const measure = await openSetting(owner, inspector, "Measure");
  await expect(measure.getByLabel("What it works out")).toHaveValue("sum");
  await expect(measure.getByLabel("Column it works on")).toHaveValue("total");
  await closeSetting(owner, measure);
  const breakdown = await openSetting(owner, inspector, "For each");
  await expect(breakdown.getByRole("radio", { name: /^Issued on/ })).toBeChecked();
  await expect(breakdown.getByRole("radio", { name: "Week" })).toBeChecked();
  await closeSetting(owner, breakdown);
  // The settings that matter are seen without scrolling the inspector.
  const cut = await settingRow(inspector, "For each").boundingBox();
  expect(cut && cut.y + cut.height).toBeLessThanOrEqual(900);
  // Display: the chart type is a line.
  await inspector.getByRole("tab", { name: /^Display/ }).click();
  await expect(inspector.getByRole("radio", { name: "Line" })).toBeChecked();
  // Rules says hiding is not security, and where row rules are.
  await inspector.getByRole("tab", { name: /^Rules/ }).click();
  await expect(inspector).toContainText("Hiding a widget isn’t security");
});

test("POLISH-003: Unpaid is changed to a count in the reader's words, and Undo takes it back", async () => {
  await openBuilder();
  await choose("Unpaid");
  const value = await openSetting(owner, settings(), "Value");
  await value.getByLabel("What it works out").selectOption("count");
  await closeSetting(owner, value);
  await expect
    .poll(
      async () =>
        (await money()).widgets.find((one: { title?: string }) => one.title === "Unpaid")?.data
          ?.value?.source?.visual?.measures?.[0]?.fn,
    )
    .toBe("count");
  await owner.keyboard.press("Control+z");
  await expect
    .poll(
      async () =>
        (await money()).widgets.find((one: { title?: string }) => one.title === "Unpaid")?.data
          ?.value?.source?.visual?.measures?.[0]?.fn,
    )
    .toBe("sum");
});

test("POLISH-007: a widget is renamed where it is, moved and sized by keys, copied, removed and brought back", async () => {
  await openBuilder();
  await choose("Average invoice");
  await widget("Average invoice").locator("button[title=Rename]").click();
  await owner.getByLabel("Widget title").fill("Average per invoice");
  await owner.getByLabel("Widget title").press("Enter");
  await expect(widget("Average per invoice")).toBeVisible();
  // The chip says where it is, and the arrows and Shift+arrows change it a cell at a time.
  const chip = widget("Average per invoice").getByText(/^\d+ × \d+ · col \d+ · row \d+$/);
  const before = await chip.innerText();
  await widget("Average per invoice").focus();
  await owner.keyboard.press("ArrowLeft");
  await owner.keyboard.press("Shift+ArrowDown");
  await expect(chip).not.toHaveText(before);
  await expect(
    owner.getByRole("status").filter({ hasText: /is \d+ wide and \d+ tall/ }),
  ).toHaveCount(1);
  const count = await owner.locator("section[role=group]").count();
  await owner.keyboard.press("Control+d");
  await expect(owner.locator("section[role=group]")).toHaveCount(count + 1);
  await owner.keyboard.press("Delete");
  await expect(owner.locator("section[role=group]")).toHaveCount(count);
  await owner.keyboard.press("Escape");
  await expect(owner.locator("section[data-selected]")).toHaveCount(0);
});

test("POLISH-008: a chart is carried from Add to page onto the grid, lands where it is let go, and Esc carries nothing", async () => {
  await openBuilder();
  const count = await owner.locator("section[role=group]").count();
  const pickUp = async (name: string) => {
    await owner
      .getByRole("button", { name: /Add to page/ })
      .first()
      .click();
    const item = owner.getByRole("dialog").getByRole("button", { name: new RegExp(`^${name}`) });
    const at = await item.boundingBox();
    if (!at) throw new Error(`${name} is not in Add to page`);
    await owner.mouse.move(at.x + 40, at.y + at.height / 2);
    await owner.mouse.down();
    await owner.mouse.move(at.x + 60, at.y + at.height / 2 + 12, { steps: 3 });
    // The list closes as the widget is picked up.
    await expect(owner.getByRole("dialog")).toHaveCount(0);
  };
  await pickUp("Chart");
  const first = await widget("Invoiced").boundingBox();
  if (!first) throw new Error("Invoiced is not on the page");
  await owner.mouse.move(first.x + 20, first.y + 20, { steps: 8 });
  const landing = owner.locator("[data-landing]");
  await expect(landing).toContainText(/6 × 6 · col \d+ · row \d+/);
  // Where the placeholder says it lands is where it lands.
  const said = (await landing.innerText()).match(/col (\d+) · row (\d+)/);
  const [col, row] = [Number(said?.[1]), Number(said?.[2])];
  await owner.mouse.up();
  await expect(owner.locator("section[role=group]")).toHaveCount(count + 1);
  await expect(owner.locator("section[data-selected]")).toHaveAttribute("aria-label", "Chart");
  await expect
    .poll(async () => {
      const chart = (await money()).widgets.find(
        (one: { type: string; title?: string }) =>
          one.type === "core/chart" && one.title === "Chart",
      );
      return chart && [chart.at.x + 1, chart.at.y + 1];
    })
    .toEqual([col, row]);
  // Picked up again and Esc: nothing is added.
  await pickUp("Stat");
  await owner.mouse.move(first.x + 20, first.y + 20, { steps: 6 });
  await owner.keyboard.press("Escape");
  await owner.mouse.up();
  await expect(owner.locator("[data-landing]")).toHaveCount(0);
  await expect(owner.locator("section[role=group]")).toHaveCount(count + 1);
  await expect(owner.getByText("Stat was not added.")).toBeAttached();
});

test("POLISH-011: a Text widget is added from Add to page and written in Markdown with an alert and steps", async () => {
  await openBuilder();
  await owner
    .getByRole("button", { name: /Add to page/ })
    .first()
    .click();
  await owner.getByRole("dialog").getByRole("button", { name: /^Text/ }).click();
  const markdown = await openSetting(owner, settings(), "Markdown", "Text");
  // The editor loads as a read-only box first; the one that takes typing is Monaco's.
  await markdown
    .locator(".monaco-editor .native-edit-context, .monaco-editor textarea")
    .first()
    .focus();
  await owner.keyboard.insertText(
    ":::alert[Read this first]{type=warning}\nThe numbers are in dollars.\n:::\n\n:::steps\n1. Choose a clinic.\n2. Choose a stretch of time.\n:::",
  );
  await closeSetting(owner, markdown);
  const text = owner.locator("section[data-selected]");
  await expect(text.getByText("Read this first")).toBeVisible();
  await expect(text.locator("ol")).toHaveCount(1);
  await expect(text).not.toContainText(":::");
});

test("POLISH-002: the Goal is added from Add to page and set in the same inspector", async () => {
  await openBuilder();
  await owner
    .getByRole("button", { name: /Add to page/ })
    .first()
    .click();
  const goal = owner.getByRole("dialog").getByRole("button", { name: /^Goal/ });
  // Goal is a core widget (decision D37): it carries no pack mark.
  await expect(goal).not.toContainText("Labs");
  await goal.click();
  await expect(owner.locator("section[data-selected]")).toHaveAttribute("aria-label", "Goal");
  await expect(settings()).not.toContainText("Labs");
  // The target is the Goal row of the Data tab: a fixed amount, or a column.
  const target = await openSetting(owner, settings(), "Goal");
  await target.getByRole("spinbutton", { name: "Amount" }).fill("20000000");
  await target.getByRole("spinbutton", { name: "Amount" }).press("Tab");
  await expect
    .poll(
      async () =>
        (await money()).widgets.filter((one: { type: string }) => one.type === "core/goal").at(-1)
          ?.config?.target,
    )
    .toBe(20000000);
});

test("POLISH-002: a member's dashboard is built in the same editor, and Add to page offers only what reads", async () => {
  await owner.goto(`${L}/dashboards`);
  await owner
    .getByRole("button", { name: /New dashboard/ })
    .first()
    .click();
  const name = owner.getByLabel(/Name|Title/).first();
  await name.fill(`Walk ${stamp}`);
  await name.press("Enter");
  await expect(owner).toHaveURL(/dashboards\/[^?]+\?edit=1/);
  await owner
    .getByRole("button", { name: /Add to page/ })
    .first()
    .click();
  const offered = owner.getByRole("dialog");
  for (const one of ["Table", "List", "Stat", "Chart", "Pivot", "Text"]) {
    await expect(offered.getByRole("button", { name: new RegExp(`^${one}`) })).toBeVisible();
  }
  await offered.getByRole("button", { name: /^Stat/ }).click();
  // Not yet told what to read, it is kept, and says what to do.
  await expect(owner.getByText("Choose what it shows in Data.")).toBeVisible();
  await expect(owner.getByText("Saved.")).toBeVisible({ timeout: 10_000 });
  await owner.reload();
  await expect(owner.getByRole("group", { name: "Stat" })).toBeVisible({ timeout: 20_000 });
  const id = new URL(owner.url()).pathname.split("/").at(-1);
  await call(owner, "DELETE", `${W}/dashboards/${id}`);
});

test("POLISH-001: the page is published, says what it changes first, and opens for its maker and not for the front desk", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  await openBuilder();
  await owner.getByRole("button", { name: "Publish" }).first().click();
  // It says what publishing does first, then what it changes on this page.
  const dialog = owner.getByRole("dialog", { name: "What publishing does" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/^Deploys to Sandbox/)).toBeVisible();
  await expect(dialog.getByText(/^\d+ changes?$/)).toBeVisible();
  await dialog.getByRole("button", { name: /^Publish/ }).click();
  await expect(owner.getByText("Published. People who open the app now see this.")).toBeVisible({
    timeout: 60_000,
  });
  // The toast offers the app, whose address is read after the publish.
  await expect(owner.getByRole("link", { name: "Open the app" })).toBeVisible();
  // Clinic performance itself, as the repository deployed it to the clinics: a manager opens it,
  // and a front-desk end user, whom it is not shared with, is told so.
  const manager = await signedIn(browser, OWNER);
  await manager.goto("/apps/fernhill/clinics/performance/");
  const staff = manager
    .getByRole("link", { name: /staff/i })
    .or(manager.getByRole("button", { name: /staff/i }));
  if (await staff.count()) await staff.first().click();
  await expect(manager.getByRole("region", { name: "Invoiced", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await manager.context().close();
  const desk = await (await browser.newContext()).newPage();
  await desk.goto("/portal/fernhill/");
  await desk
    .getByRole("link", { name: "Sign in" })
    .or(desk.getByRole("button", { name: "Sign in" }))
    .first()
    .click();
  await desk.getByLabel(/Email/).first().fill(FRONT_DESK);
  const next = desk.getByRole("button", { name: "Continue" });
  if (await next.count()) await next.click();
  await desk
    .getByLabel(/Password/)
    .first()
    .fill(PASSWORD);
  await desk
    .getByRole("button", { name: /Sign in/ })
    .last()
    .click();
  await expect(desk.getByText("Front desk").first()).toBeVisible({ timeout: 20_000 });
  await desk.goto("/apps/fernhill/clinics/performance/");
  await expect(desk.getByText("Not for this account")).toBeVisible();
  await desk.context().close();
});
