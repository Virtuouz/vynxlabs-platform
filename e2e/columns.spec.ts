import { signInAs } from "./as.ts";
import { expect, type Page, test } from "./test.ts";
import { readEveryList } from "./visual.ts";

/**
 * Phase 18, M2: a table's columns are put in order by dragging one between two
 * others, or from the keyboard; any column can be first; and the first column
 * is locked in view or not.
 */

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
// The first two columns as the table has them, and the one that is moved to the front.
let top: string;
let second: string;
let moved: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await (await browser.newContext({ viewport: { width: 1100, height: 800 } })).newPage();
  await signInAs(page, "operator");
  await readEveryList(page);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `columns-${stamp}`,
    name: "Columns",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  link = `/t/${tenant.id}/workspaces/${dev.id}`;
  // Wide enough to scroll sideways at this window's width.
  const names = ["title", "owner", "city", "country", "status", "notes", "phone", "email"];
  await call(page, "PUT", `${W}/drafts/people`, {
    kind: "table",
    schemaVersion: 1,
    body: {
      description: "",
      columns: Object.fromEntries(names.map((name) => [name, { type: "text" }])),
      policy: { type: "open" },
    },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  await call(
    page,
    "POST",
    `${W}/rows/people`,
    Object.fromEntries(names.map((name) => [name, `${name} that is long enough to take room`])),
  );
});

test.afterAll(async () => {
  await page.context().close();
});

const headers = async () =>
  (await page.getByRole("grid").getByRole("columnheader").allTextContents())
    .map((text) => text.trim())
    .filter(Boolean);

test("a column is dragged between two others, which part for it @data", async () => {
  await page.goto(`${link}/tables/people`);
  await expect(page.getByRole("grid")).toBeVisible();
  // The columns come as the table keeps them, which is not the order they were written in.
  const before = await headers();
  [top, second, , , moved] = before as [string, string, string, string, string];

  await page.getByRole("button", { name: "Columns" }).click();
  const dialog = page.getByRole("dialog", { name: "Columns" });
  const list = dialog.getByRole("list", { name: "Shown, in order" });
  // The first column is in the list here: any column can be put first.
  await expect(list.getByRole("listitem").first()).toContainText(top);

  const handle = dialog.getByRole("button", { name: `Move ${moved}: drag it` });
  const from = await handle.boundingBox();
  const row = (name: string) =>
    list.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
  const owner = await row(second).boundingBox();
  const title = await row(top).boundingBox();
  if (!from || !owner || !title) throw new Error("the list is not laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Held over the first row: the rows it passed have moved down to leave a gap.
  await page.mouse.move(from.x + 4, title.y + title.height / 2, { steps: 12 });
  await expect.poll(async () => (await row(second).boundingBox())?.y).toBeGreaterThan(owner.y + 10);
  await page.mouse.up();
  // The library swallows a click in the 50 ms after a drag ends, so the drop itself clicks nothing.
  await page.waitForTimeout(150);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  expect((await headers()).slice(0, 3)).toEqual([moved, top, second]);
  expect(new URL(page.url()).searchParams.getAll("cols")[0]).toBe(moved);
});

test("the same from the keyboard, with the handle or the arrows @data", async () => {
  await page.getByRole("button", { name: "Columns" }).click();
  const dialog = page.getByRole("dialog", { name: "Columns" });
  // On a column's handle the arrows move it one place, and say where it is now.
  await dialog.getByRole("button", { name: `Move ${moved}: drag it` }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("status").filter({ hasText: "is now 2 of" })).toHaveCount(1);
  await expect(
    dialog.getByRole("list", { name: "Shown, in order" }).getByRole("listitem").nth(1),
  ).toContainText(moved);
  // Moved by its button it is seen to move: it and the column it passes are played from
  // where they were, part of the way there in some frame, and not redrawn in place.
  await page.evaluate(() => {
    const seen: number[] = [];
    (window as unknown as { __moving: number[] }).__moving = seen;
    const tick = () => {
      for (const row of document.querySelectorAll<HTMLElement>("[data-flip-moving]")) {
        const shift = new DOMMatrixReadOnly(getComputedStyle(row).transform).m42;
        if (shift !== 0) seen.push(Math.round(shift));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await dialog.getByRole("button", { name: `Move ${moved} up` }).click();
  await expect(
    dialog.getByRole("list", { name: "Shown, in order" }).getByRole("listitem").first(),
  ).toContainText(moved);
  await page.waitForTimeout(300);
  const shifts = await page.evaluate(() => (window as unknown as { __moving: number[] }).__moving);
  // One came from below and one from above.
  expect(shifts.some((shift) => shift > 0)).toBe(true);
  expect(shifts.some((shift) => shift < 0)).toBe(true);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  expect((await headers())[0]).toBe(moved);
});

test("the first column is locked in view, or not, and a link from before still hides @data", async () => {
  const grid = page.getByRole("grid");
  const first = grid.getByRole("columnheader", { name: moved });
  const scroller = grid.locator("xpath=..");
  const scroll = (left: number) => scroller.evaluate((node, left) => node.scrollTo({ left }), left);
  await scroll(400);
  // Locked: still where it was.
  await expect(first).toBeInViewport();

  await scroll(0);
  await page.getByRole("button", { name: "Columns" }).click();
  const dialog = page.getByRole("dialog", { name: "Columns" });
  await dialog.getByLabel("Lock the first column").uncheck();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).searchParams.get("unlock")).toBe("1");
  await scroll(400);
  await expect(first).not.toBeInViewport();

  // What a saved view or a link said before this phase: the columns left out.
  await page.goto(`${link}/tables/people?hide=owner&hide=city`);
  await expect(page.getByRole("grid")).toBeVisible();
  const left = await headers();
  expect(left).not.toContain("owner");
  expect(left).not.toContain("city");
  expect(left).toContain("title");
});
