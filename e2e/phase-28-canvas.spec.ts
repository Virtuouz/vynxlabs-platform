import { signInAs } from "./as.ts";
import { fernhillTenant } from "./fernhill.ts";
import { expect, type Page, test } from "./test.ts";

const TENANT = fernhillTenant();

/**
 * The owner's first look at phase 28, its canvas findings, walked on the Fernhill example in its
 * sandbox, on a draft of the walk's own that it removes: what is dragged follows the pointer and
 * nothing blinks, a Section takes what is dropped on it, a move reads nothing again, a Text's
 * height can be set, and a Full sheet is drawn at its true size.
 */

const stamp = Date.now().toString(36);
const PATH = `screens/canvas-${stamp}`;

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

const summary = (groupBy: unknown[] = []) => ({
  source: {
    visual: { table: "invoices", groupBy, measures: [{ fn: "count", as: "invoices" }] },
  },
});
const stat = (id: string, title: string, at: object, inside?: object) => ({
  id,
  type: "core/stat",
  title,
  at,
  data: { value: summary() },
  ...(inside ? { in: inside } : {}),
});

const body = {
  title: `Canvas ${stamp}`,
  pages: [
    {
      id: "main",
      title: "Main",
      widgets: [
        stat("alone", "Alone", { x: 0, y: 0, w: 3, h: 3 }),
        {
          id: "chart",
          type: "core/chart",
          title: "By clinic",
          at: { x: 4, y: 0, w: 8, h: 7 },
          data: { rows: summary([{ column: "clinic" }]) },
          config: { chart: "bar" },
        },
        {
          id: "sec",
          type: "core/section",
          title: "The section",
          at: { x: 0, y: 7, w: 12, h: 4 },
        },
        stat("held", "Held", { x: 0, y: 0, w: 3, h: 3 }, { widget: "sec" }),
      ],
    },
    {
      id: "words",
      title: "Words",
      widgets: [
        {
          id: "text",
          type: "core/text",
          at: { x: 0, y: 0, w: 6, h: 2 },
          config: {
            text: Array.from({ length: 20 }, (_, at) => `Paragraph ${at + 1}.`).join("\n\n"),
          },
        },
      ],
    },
    {
      id: "sheet",
      title: "A sheet",
      kind: "sheet",
      record: { table: "invoices" },
      size: "full",
      widgets: [stat("inside", "Inside", { x: 0, y: 0, w: 6, h: 3 })],
    },
  ],
};

const cell = (id: string) => owner.locator(`[data-canvas] [data-widget-cell="${id}"]`);
const open = async (page: string) => {
  await owner.goto(`${L}/screens/${PATH}?page=${page}`);
  await expect(owner.locator("[data-canvas] [data-widget-cell]").first()).toBeVisible();
};
/** Puts back the draft as the walk made it. */
const put = async () => {
  await call(owner, "DELETE", `${W}/drafts/${PATH}`).catch(() => {});
  await call(owner, "PUT", `${W}/drafts/${PATH}`, {
    kind: "interface",
    schemaVersion: 2,
    body,
    create: true,
  });
};
const widgets = async () =>
  (await call(owner, "GET", `${W}/drafts/${PATH}`)).body.pages.flatMap(
    (one: { widgets: unknown[] }) => one.widgets,
  );
/** A drag by a widget's heading, a step a frame, held at the end until `let go`. */
const drag = async (id: string, to: { x: number; y: number }, from = { x: 40, y: 18 }) => {
  const box = await cell(id).boundingBox();
  if (!box) throw new Error(`no ${id}`);
  const start = { x: box.x + from.x, y: box.y + from.y };
  await owner.mouse.move(start.x, start.y);
  await owner.mouse.down();
  for (let step = 1; step <= 30; step++) {
    await owner.mouse.move(
      start.x + ((to.x - start.x) * step) / 30,
      start.y + ((to.y - start.y) * step) / 30,
    );
    await owner.waitForTimeout(16);
  }
};

test.beforeAll(async ({ browser }) => {
  owner = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signInAs(owner, "maya.brooks@fernhill.example");
  const tenants = await call(owner, "GET", `/tenants?search=${TENANT}&limit=200`);
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const { items } = await call(owner, "GET", `/tenants/${tenant.id}/workspaces`);
  const sandbox = items.find((one: { slug: string }) => one.slug === "sandbox");
  W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  L = `/t/${tenant.id}/workspaces/${sandbox.id}`;
});
test.beforeEach(put);
test.afterAll(async () => {
  if (W) await call(owner, "DELETE", `${W}/drafts/${PATH}`).catch(() => {});
  await owner?.context().close();
});

test("POLISH-007: what is dragged follows the pointer, nothing blinks or scrolls, and the move reads nothing again @fernhill @builder", async () => {
  await open("main");
  await expect(cell("chart").locator("canvas, svg").first()).toBeVisible();
  await owner.evaluate(() => {
    const seen = { blank: 0, bars: new Set<number>(), widths: new Set<number>(), on: true };
    Object.assign(window, { __seen: seen });
    const pane = document.querySelector<HTMLElement>("[data-canvas]");
    const look = () => {
      if (!seen.on || !pane) return;
      const chart = pane.querySelector('[data-widget-cell="chart"]');
      if (chart && !chart.querySelector("canvas, svg")) seen.blank += 1;
      seen.widths.add(pane.clientWidth);
      const bars = [...pane.querySelectorAll<HTMLElement>("*")].filter(
        (one) =>
          !one.closest("[data-widget-cell]") &&
          /auto|scroll/.test(getComputedStyle(one).overflowY) &&
          one.scrollHeight > one.clientHeight + 1,
      );
      seen.bars.add(bars.length);
      requestAnimationFrame(look);
    };
    look();
  });
  const box = await cell("chart").boundingBox();
  if (!box) throw new Error("no chart");
  await drag("chart", { x: box.x - 60, y: box.y + 130 });
  // Under the pointer, as it was taken: 40 across and 18 down.
  const now = await cell("chart").boundingBox();
  expect(Math.abs((now?.x ?? 0) - (box.x - 100))).toBeLessThan(3);
  expect(Math.abs((now?.y ?? 0) - (box.y + 112))).toBeLessThan(3);
  await expect(owner.locator("[data-landing]")).toHaveCount(1);
  let reads = 0;
  const count = (request: { url(): string }) => {
    if (request.url().includes("/widget-data")) reads += 1;
  };
  owner.on("request", count);
  const saved = owner.waitForResponse(
    (one) => one.request().method() === "PUT" && one.url().includes(`/drafts/${PATH}`),
  );
  await owner.mouse.up();
  await saved;
  await owner.waitForTimeout(800);
  owner.off("request", count);
  expect(reads).toBe(0);
  const seen = await owner.evaluate(() => {
    const found = (window as unknown as { __seen: Record<string, unknown> }).__seen;
    found.on = false;
    return {
      blank: found.blank as number,
      bars: [...(found.bars as Set<number>)],
      widths: [...(found.widths as Set<number>)],
    };
  });
  expect(seen.blank).toBe(0);
  expect(Math.max(...seen.bars)).toBeLessThanOrEqual(1);
  expect(seen.widths).toHaveLength(1);
});

test("POLISH-008: a Section takes what is dragged on it, from above and held by its middle, and from Add to page @fernhill @builder", async () => {
  await open("main");
  const section = await cell("sec").boundingBox();
  if (!section) throw new Error("no section");
  // Held by its middle, so that it lies on the Section well before the pointer is over it.
  await drag("alone", { x: section.x + 500, y: section.y + 110 }, { x: 60, y: 90 });
  await expect(owner.locator('[data-grid-in="sec"] [data-landing]')).toHaveCount(1);
  await owner.mouse.up();
  await expect(owner.locator('[data-grid-in="sec"] [data-widget-cell="alone"]')).toBeVisible();
  await expect
    .poll(async () => (await widgets()).find((one: { id: string }) => one.id === "alone").in)
    .toEqual({ widget: "sec" });

  await owner.getByRole("button", { name: "Add to page" }).click();
  const card = owner.getByRole("dialog").getByRole("button", { name: /^Stat/ }).first();
  await expect(card).toBeVisible();
  await owner.waitForTimeout(400);
  const from = await card.boundingBox();
  const to = await cell("sec").boundingBox();
  if (!from || !to) throw new Error("no card");
  await owner.mouse.move(from.x + 30, from.y + 20);
  await owner.mouse.down();
  for (let step = 1; step <= 25; step++) {
    await owner.mouse.move(
      from.x + 30 + ((to.x + to.width - 160 - from.x) * step) / 25,
      from.y + 20 + ((to.y + 90 - from.y) * step) / 25,
    );
    await owner.waitForTimeout(16);
  }
  await expect(owner.locator('[data-grid-in="sec"] [data-landing]')).toHaveCount(1);
  await owner.mouse.up();
  await expect
    .poll(
      async () =>
        (await widgets()).filter(
          (one: { type: string; in?: { widget: string } }) =>
            one.type === "core/stat" && one.in?.widget === "sec",
        ).length,
    )
    .toBe(3);
});

test("POLISH-002: a Text is as tall as its words until its height is set, and then keeps it @fernhill @builder", async () => {
  await open("words");
  const tall = async () => (await cell("text").boundingBox())?.height ?? 0;
  const natural = await tall();
  expect(natural).toBeGreaterThan(400);
  await cell("text").focus();
  // One row a press, and a row is as tall as the type scale makes it: press until it is well short
  // of what its words need, not for a count of rows that was true of one size of type.
  for (let step = 0; step < 14; step++) await owner.keyboard.press("Shift+ArrowUp");
  await expect.poll(tall).toBeLessThan(natural / 2);
  await expect
    .poll(
      async () => (await widgets()).find((one: { id: string }) => one.id === "text").config.height,
    )
    .toBe("set");
  const set = await tall();
  await owner.reload();
  await expect.poll(tall).toBe(set);
  await cell("text").click();
  const drawer = owner.getByRole("complementary", { name: "Settings" });
  await drawer.getByText("Fits the text").click();
  await expect.poll(tall).toBeGreaterThan(set);
});

test("POLISH-004: a Full sheet is drawn at its true size in the room there is @fernhill @builder", async () => {
  await open("sheet");
  const frame = owner.locator("[data-scaled-frame]");
  await expect(frame).toHaveAttribute("data-scaled-frame", "100");
  await expect(owner.locator("[data-scale-said]")).toHaveCount(0);
});
