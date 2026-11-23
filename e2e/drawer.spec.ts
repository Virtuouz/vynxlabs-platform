import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { readEveryList } from "./visual.ts";

/**
 * Phase 18, M1: the drawer beside a list slides open once and shut once, and
 * does not move when something else is chosen; the runs list has one scroll
 * bar; and a text area is as tall as what it holds, up to twelve lines.
 *
 * Phase 19, M1: every sheet and dialog any spec opens is held to arriving and
 * leaving with motion by the fixture in `test.ts`.
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
      if (response.status >= 300) throw new Error(`${method} ${path}: ${response.status} ${text}`);
      return text ? JSON.parse(text) : null;
    },
    [method, path, body] as const,
  );

let page: Page;
let link: string;
let W: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await (await browser.newContext({ viewport: { width: 1500, height: 700 } })).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  await readEveryList(page);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `drawer-${stamp}`,
    name: "Drawer",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  link = `/t/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/notes/keep`, {
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
  await call(page, "PUT", `${W}/drafts/notes`, {
    kind: "table",
    schemaVersion: 1,
    body: {
      description: "",
      columns: { title: { type: "text", required: true }, detail: { type: "json" } },
      policy: { type: "open" },
    },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  for (let i = 0; i < 40; i++) {
    await call(page, "POST", `${W}/runs`, { script: "notes/keep", input: { i } });
  }
});

test.afterAll(async () => {
  await page.context().close();
});

/** The elements inside `root` that have more to show than fits and scroll to show it. */
const scrollers = (root: string) =>
  page.evaluate((root) => {
    const found: string[] = [];
    for (const node of document.querySelectorAll<HTMLElement>(`${root}, ${root} *`)) {
      const style = getComputedStyle(node);
      if (
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        found.push(node.dataset.table ?? node.tagName.toLowerCase());
      }
    }
    return found;
  }, root);

test("the runs list scrolls in one place, and its header stays", async () => {
  await page.goto(`${link}/runs`);
  const table = page.locator('[data-table="runs"]');
  await expect(table.getByRole("row")).not.toHaveCount(0);
  await expect.poll(async () => (await table.getByRole("row").count()) > 30).toBe(true);
  expect(await scrollers("main")).toEqual(["runs"]);
  // Scrolled to the end, the header is still at the top of the list.
  const header = table.locator("thead");
  const before = (await header.boundingBox())?.y;
  await table.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));
  expect((await header.boundingBox())?.y).toBe(before);
  await table.evaluate((node) => node.scrollTo({ top: 0 }));
});

test("the drawer slides open once, stays still for the next run, and slides shut", async () => {
  await page.goto(`${link}/runs`);
  const table = page.locator('[data-table="runs"]');
  const rows = table.locator("tbody tr");
  await expect.poll(async () => (await rows.count()) > 30).toBe(true);
  const drawer = page.getByRole("complementary", { name: "The chosen run" });
  await expect(drawer).toHaveCount(0);

  // Every width the drawer's room has while it is on the page, frame by frame.
  await page.evaluate(() => {
    const seen: number[] = [];
    (window as unknown as { __room: number[] }).__room = seen;
    const tick = () => {
      const node = document.querySelector('aside[aria-label="The chosen run"]')?.parentElement;
      if (node) seen.push(Math.round(node.getBoundingClientRect().width));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const widths = () =>
    page.evaluate(() => {
      const seen = (window as unknown as { __room: number[] }).__room;
      return seen.splice(0, seen.length);
    });

  await rows.nth(0).click();
  await expect(drawer).toBeVisible();
  await page.waitForTimeout(450);
  const opening = await widths();
  const full = opening.at(-1) as number;
  expect(full).toBeGreaterThan(280);
  // It grew: some frame showed it part of the way.
  expect(opening.some((width) => width > 0 && width < full)).toBe(true);

  // Another run: what it shows changes, and it does not move.
  const first = await drawer.textContent();
  await rows.nth(3).click();
  await expect.poll(async () => (await drawer.textContent()) !== first).toBe(true);
  await page.waitForTimeout(450);
  expect(new Set(await widths())).toEqual(new Set([full]));

  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);
  const closing = await widths();
  expect(closing.some((width) => width > 0 && width < full)).toBe(true);
});

test("with reduced motion the drawer is there or it is not", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${link}/runs`);
  const rows = page.locator('[data-table="runs"] tbody tr');
  await expect.poll(async () => (await rows.count()) > 30).toBe(true);
  await rows.nth(0).click();
  const drawer = page.getByRole("complementary", { name: "The chosen run" });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())?.width).toBeGreaterThan(280);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0, { timeout: 200 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

test("on a narrower screen the same details slide over the list as a sheet, both ways", async () => {
  // The fixture in test.ts fails this if the sheet arrives or leaves in one frame.
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto(`${link}/runs`);
  const rows = page.locator('[data-table="runs"] tbody tr');
  await expect.poll(async () => (await rows.count()) > 30).toBe(true);
  await rows.nth(0).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await page.setViewportSize({ width: 1500, height: 700 });
});

test("a row's JSON is edited in a text area that grows with it and can still be dragged", async () => {
  const short = { a: 1 };
  const long = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`key${i}`, i]));
  await call(page, "POST", `${W}/rows/notes`, { title: "short", detail: short });
  await call(page, "POST", `${W}/rows/notes`, { title: "long", detail: long });
  await page.goto(`${link}/tables/notes`);

  const lines = async () => {
    const area = page.getByRole("complementary").getByLabel("detail");
    await expect(area).toBeVisible();
    return area.evaluate((node: HTMLTextAreaElement) => {
      const style = getComputedStyle(node);
      const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      return Math.round((node.clientHeight - padding) / Number.parseFloat(style.lineHeight));
    });
  };

  await page.getByRole("gridcell", { name: "short", exact: true }).click();
  // Three lines of JSON, in the four rows a text area starts with.
  expect(await lines()).toBe(4);
  await page.getByRole("gridcell", { name: "long", exact: true }).click();
  // Thirty-two lines of JSON: it stops at twelve and scrolls.
  expect(await lines()).toBe(12);

  // Typing more into the short one makes it taller as it goes.
  await page.getByRole("gridcell", { name: "short", exact: true }).click();
  const area = page.getByRole("complementary").getByLabel("detail");
  await area.fill(JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, null, 2));
  expect(await lines()).toBe(8);
  // Its corner still drags.
  expect(await area.evaluate((node) => getComputedStyle(node).resize)).toBe("vertical");
});
