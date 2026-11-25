import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { signInAs } from "./as.ts";
import { expect, type FrameLocator, type Page, test } from "./test.ts";

/**
 * Phase 34, B4: a widget a tenant wrote runs in a sandboxed frame, and what it does there
 * cannot reach the page. The widget in `widget-frame-fixture/` behaves as hostile code would:
 * its view tries the instance's API and another site, the cookies, the page that holds it, the
 * address bar, new windows, events it did not declare and payloads that do not fit, and a box
 * far bigger than its cell. It is built and deployed as a repository is, with the CLI, and
 * placed on an app's page and on a dashboard.
 *
 * Each attempt is written down by the view itself (`#report`, JSON) and checked here, beside
 * what the page saw: the address did not change, no request left for the API, the console
 * said the policy refused, and the host counted what it dropped. What the view is allowed to
 * do is checked too: a declared event arrives, and the data it shows is what the server gave.
 */

const stamp = Date.now().toString(36);
const SLUG = `frame-${stamp}`;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

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
let L: string;
let board: string;
let appsAt: string | null = null;
let dir = "";

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signInAs(page, "operator");
  const instance = await call(page, "GET", "/instance");
  appsAt = instance.appsUrl;
  const tenant = await call(page, "POST", "/tenants", {
    slug: SLUG,
    name: "Frame",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  L = `/t/${tenant.id}/workspaces/${dev.id}`;

  // The repository: the fixture, with the SDK, the frame package and React to build it with.
  dir = await mkdtemp(join(tmpdir(), "widget-frame-"));
  await cp(join(here, "widget-frame-fixture"), dir, { recursive: true });
  await mkdir(join(dir, "node_modules", "@volvel"), { recursive: true });
  for (const name of ["sdk", "widget-frame"])
    await symlink(join(root, "packages", name), join(dir, "node_modules", "@volvel", name));
  for (const name of ["react", "react-dom"])
    await symlink(
      join(root, "packages", "widget-frame", "node_modules", name),
      join(dir, "node_modules", name),
    );
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  const key = await call(page, "POST", "/api-keys", { name: `frame-${stamp}` });
  execFileSync(
    "node",
    [
      join(root, "packages", "cli", "dist", "bin.js"),
      "deploy",
      "--tenant",
      SLUG,
      "--workspace",
      "dev",
    ],
    {
      cwd: dir,
      env: {
        ...process.env,
        VOLVEL_URL: baseURL ?? "http://localhost:8080",
        VOLVEL_TOKEN: key.token,
      },
      stdio: "pipe",
    },
  );
  await call(page, "POST", `${W}/rows/notes`, { note: "server-said-42" });

  // A dashboard of the member's own, placing the same widget.
  const made = await call(page, "POST", `${W}/dashboards`, { title: "Frame board" });
  board = made.id;
  await call(page, "PUT", `${W}/dashboards/${board}`, {
    revision: made.revision,
    body: {
      title: "Frame board",
      widgets: [
        {
          id: "hostile",
          type: "x/hostile",
          version: "1.0.0",
          title: "Hostile",
          at: { x: 0, y: 0, w: 6, h: 4 },
          data: { rows: { source: { visual: { table: "notes", columns: ["note"] } } } },
        },
      ],
    },
  });
});

test.afterAll(async () => {
  await page?.context().close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

const appUrl = () => `/apps/${SLUG}/dev/hostile/`;
const frameOf = (on: Page): FrameLocator => on.frameLocator('iframe[title="Hostile"]');
const report = async (on: Page) => {
  const text = await frameOf(on).locator("#report").textContent();
  return JSON.parse(text ?? "{}") as Record<
    string,
    { ok: boolean; error?: string; value?: string }
  >;
};
/** The frame has drawn and finished its attempts. */
const attempted = async (on: Page) => {
  await expect(on.locator("[data-tenant-widget]")).toHaveAttribute("data-frame-phase", "ready");
  await expect.poll(async () => (await report(on)).done as unknown).toBeTruthy();
};

test("the frame is a sandbox with scripts only, and what its view tries from inside it fails @builder @access", async () => {
  test.skip(
    appsAt !== null,
    "this instance serves apps at an address of their own, where the operator is not signed in",
  );
  const answered: string[] = [];
  const refusals: string[] = [];
  page.on("console", (message) => refusals.push(message.text()));
  // What the frame asked for and was answered: its own two files, and nothing else.
  page.on("response", (response) => {
    if (response.frame()?.url().includes("/_widgets/")) answered.push(response.url());
  });
  await page.goto(appUrl());
  await attempted(page);

  const iframe = page.locator('iframe[title="Hostile"]');
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  const src = (await iframe.getAttribute("src")) ?? "";
  expect(src).toContain(`/_widgets/${SLUG}/x/hostile@1.0.0/frame.html`);

  const tried = await report(page);
  // No network: not this instance's API (relative or absolute), not another address, not a beacon's or a request object's.
  for (const name of ["fetchInstance", "fetchAbsolute", "fetchOther", "xhr"])
    expect(tried[name]?.ok, name).toBe(false);
  expect(answered.filter((url) => !url.includes("/_widgets/"))).toEqual([]);
  expect(refusals.some((text) => text.includes("Content Security Policy"))).toBe(true);
  // No cookies, no storage, no reach into the page that holds it.
  for (const name of ["cookie", "parentDocument", "parentCookie", "localStorage"]) {
    expect(tried[name]?.ok, name).toBe(false);
    expect(tried[name]?.error, name).toBe("SecurityError");
  }
  // No navigation of the page, and no new window.
  for (const name of ["topNavigation", "parentNavigation"]) {
    expect(tried[name]?.ok, name).toBe(false);
    expect(tried[name]?.error, name).toBe("SecurityError");
  }
  expect(tried.windowOpen).toEqual({ ok: true, value: "null" });
  expect(new URL(page.url()).pathname).toBe(appUrl());
  expect(page.context().pages()).toHaveLength(1);
  page.removeAllListeners("console");
  page.removeAllListeners("response");
});

/** Every request to the outside address is counted, and answered as if nobody were there. */
async function watchOutside(on: Page) {
  const hits: string[] = [];
  await on.context().route("http://outside.example/**", (route) => {
    hits.push(route.request().url());
    return route.abort();
  });
  return hits;
}

const LEAKS = ["href", "meta", "form", "anchorSelf", "anchorBlank", "anchorTop"] as const;
for (const where of ["the console's canvas", "a served app"] as const) {
  test(`what the view was given cannot leave by sending the frame to another site, on ${where}: address, refresh, form, links @builder @access`, async () => {
    if (where === "a served app")
      test.skip(appsAt !== null, "this instance serves apps at an address of their own");
    const hits = await watchOutside(page);
    const popups: string[] = [];
    page.on("popup", (popup) => popups.push(popup.url()));
    const address = where === "a served app" ? appUrl() : `${L}/screens/screens/hostile`;
    for (const how of LEAKS) {
      // A way that works replaces the frame, so each is tried in a frame of its own.
      await page.goto(address);
      await attempted(page);
      await frameOf(page).locator(`#leak-${how}`).click();
      await page.waitForTimeout(1200);
      expect(hits, how).toEqual([]);
      expect(popups, how).toEqual([]);
      expect(new URL(page.url()).pathname, how).toBe(new URL(address, page.url()).pathname);
    }
    page.removeAllListeners("popup");
    await page.context().unroute("http://outside.example/**");
  });
}

test("a message that is not a declared event, or does not fit it, is dropped; a declared one arrives; the data is the server's @builder @access", async () => {
  test.skip(appsAt !== null, "this instance serves apps at an address of their own");
  await page.goto(appUrl());
  await attempted(page);
  const host = page.locator("[data-tenant-widget]");
  // An event it did not declare, three that do not fit the one it did (wrong type, an extra
  // field, 70 KB), one with no protocol and a bare string: six, all dropped, none acted on.
  await expect(host).toHaveAttribute("data-frame-dropped", "6");
  await expect(page.getByText("The widget said hello")).toHaveCount(0);
  // What the view shows is what the server read for the viewer.
  await expect(frameOf(page).locator("#shown")).toContainText("server-said-42");
  // The one it declared, with a payload that fits, reaches the page, which does what the page says.
  await frameOf(page).getByRole("button", { name: "Say hello" }).click();
  await expect(page.getByText("The widget said hello")).toBeVisible();
  await expect(host).toHaveAttribute("data-frame-dropped", "6");
});

test("it cannot draw outside its cell: a huge box and a request for a huge height stay inside it @builder", async () => {
  test.skip(appsAt !== null, "this instance serves apps at an address of their own");
  await page.goto(appUrl());
  await attempted(page);
  const cell = await page.locator("[data-tenant-widget]").boundingBox();
  const frame = await page.locator('iframe[title="Hostile"]').boundingBox();
  if (!cell || !frame) throw new Error("the cell or the frame is not drawn");
  expect(frame.x).toBeGreaterThanOrEqual(cell.x - 1);
  expect(frame.y).toBeGreaterThanOrEqual(cell.y - 1);
  expect(frame.x + frame.width).toBeLessThanOrEqual(cell.x + cell.width + 1);
  expect(frame.y + frame.height).toBeLessThanOrEqual(cell.y + cell.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("on a dashboard and in the builder's canvas it is the same frame, and it follows light and dark @builder", async () => {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${L}/dashboards/${board}`);
    await attempted(page);
    await expect(frameOf(page).locator("#shown")).toContainText("server-said-42");
    await expect(frameOf(page).locator("#scheme")).toContainText(scheme);
    // The dashboard's frame is as locked down as the app's.
    await expect(page.locator('iframe[title="Hostile"]')).toHaveAttribute(
      "sandbox",
      "allow-scripts",
    );
  }
  // The builder draws the same host on its canvas.
  await page.goto(`${L}/screens/screens/hostile`);
  await attempted(page);
  await expect(frameOf(page).locator("#shown")).toContainText("server-said-42");
  // A reload draws it again.
  await page.reload();
  await attempted(page);
  await page.emulateMedia({ colorScheme: null });
});

test("the keyboard goes into the frame and out of it, and a reload draws it again @builder", async () => {
  test.skip(appsAt !== null, "this instance serves apps at an address of their own");
  await page.goto(appUrl());
  await attempted(page);
  await page.reload();
  await attempted(page);
  const say = frameOf(page).getByRole("button", { name: "Say hello" });
  await page.getByRole("heading", { level: 1 }).click();
  for (
    let step = 0;
    step < 12 &&
    !(await say.evaluate((node) => node === node.ownerDocument.activeElement).catch(() => false));
    step++
  )
    await page.keyboard.press("Tab");
  await expect(say).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("The widget said hello")).toBeVisible();
  // Tab leaves it: focus is no longer on the button in the frame.
  await page.keyboard.press("Tab");
  await expect(say).not.toBeFocused();
});

test("a widget given more than one page of rows draws, asks for the next page and an order, and is not blank @builder", async () => {
  const W = L.replace("/t/", "/tenants/");
  await page.evaluate(async (path) => {
    const rows = Array.from({ length: 130 }, (_, i) => `bulk-${String(i).padStart(3, "0")}`);
    for (let at = 0; at < rows.length; at += 10)
      await Promise.all(
        rows.slice(at, at + 10).map((note) =>
          fetch(`/api/v1${path}/rows/notes`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ note }),
          }),
        ),
      );
  }, W);
  await page.goto(`${L}/dashboards/${board}`);
  await attempted(page);
  const paging = frameOf(page).locator("#paging");
  // The first page, with how many there are in all, and the page's own state.
  await expect(paging).toContainText("100/131");
  await expect(paging).toContainText("state=ready");
  // An order read over all of the rows, not the page's: the first is the smallest of the 131.
  await frameOf(page).getByRole("button", { name: "Sort notes" }).click();
  await expect(paging).toContainText("sorted=note");
  await expect(paging).toContainText("first=bulk-000");
  await frameOf(page).getByRole("button", { name: "More rows" }).click();
  await expect(paging).toContainText("131/131");
  // The widget's own six hostile messages are dropped, and not one of its requests for rows.
  await expect(page.locator("[data-tenant-widget]")).toHaveAttribute("data-frame-dropped", "6");
  await expect(page.getByText("could not be given its data")).toHaveCount(0);
});

test("an event a frame raises with no click, wired to a write, is confirmed on the page first: nothing runs until Confirm, and Cancel leaves the data @builder @access", async () => {
  test.skip(appsAt !== null, "this instance serves apps at an address of their own");
  const W = L.replace("/t/", "/tenants/");
  const written = async () => {
    const rows = await call(page, "GET", `${W}/rows/notes?limit=500`);
    return (rows.rows ?? rows.items ?? rows).filter(
      (row: { note: string }) => row.note === "frame-wrote",
    ).length;
  };
  const writer = `/apps/${SLUG}/dev/writer/`;
  expect(await written()).toBe(0);

  // The frame raised the event on its own. The page asks, outside the frame, and has not run it.
  await page.goto(writer);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Hostile");
  await expect(dialog).toContainText("wipe");
  await expect(dialog).toContainText("add a note");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(await written()).toBe(0);

  // Cancel (here by Escape): the data is unchanged, and the dialog is gone.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await written()).toBe(0);

  // The frame asks again by a real press; a second event while the first is open is dropped.
  await frameOf(page).getByRole("button", { name: "Write a note" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(written).toBe(1);

  // A reload raises it again, and asks again: it was not remembered as agreed.
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await written()).toBe(1);
});
