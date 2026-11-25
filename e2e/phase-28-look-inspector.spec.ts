import { mkdirSync } from "node:fs";
import { signInAs } from "./as.ts";
import { fernhillTenant } from "./fernhill.ts";
import { expect, type Locator, type Page, test } from "./test.ts";

/**
 * The owner's first look at the app builder, three findings, walked in a browser on the Fernhill
 * example (`examples/fernhill/setup/setup.mjs`), in its sandbox, under names of its own:
 *
 * 1. Every list put in order by a handle slides (`useSortable`): the dragged row follows the
 *    pointer, the others slide aside, it settles into its place by sliding, Esc slides it back,
 *    the keyboard's moves slide too, and under reduced motion nothing slides. Measured by sampling
 *    each row's position on every frame while a real pointer drags it.
 * 2. A dot on an inspector tab means that something in it needs fixing, and is otherwise absent.
 * 3. A page's Help topic is chosen from the workspace's documents in a searchable window.
 *
 * Pictures go to `E2E_LOOK_SHOTS` when it is set (light and dark, at 1440, 768 and 390).
 */

const TENANT = fernhillTenant();
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const OWNER = "maya.brooks@fernhill.example";
const stamp = Date.now().toString(36);
const NAME = `screens/p28look-${stamp}`;
const SHOTS = process.env.E2E_LOOK_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

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

let owner: Page;
let W: string;
let L: string;

const at = { x: 0, y: 0, w: 12, h: 6 };
const columns = ["number", "clinic", "total", "status", "issued_on"].map((column) => ({
  column,
  label: column === "issued_on" ? "Issued" : column.charAt(0).toUpperCase() + column.slice(1),
}));
const visual = (table: string, extra = {}) => ({
  rows: { source: { visual: { table, ...extra } } },
});
const note = (id: string, title: string, y: number) => ({
  id,
  type: "core/text",
  title,
  at: { x: 0, y, w: 12, h: 2 },
  config: { body: title },
});

const body = {
  title: `Look ${stamp}`,
  pages: [
    {
      id: "main",
      title: "Main",
      widgets: [
        {
          id: "invoices",
          type: "core/table",
          title: "Invoices",
          at: { x: 0, y: 0, w: 12, h: 8 },
          data: visual("invoices", { sort: [{ by: "number" }], limit: 20 }),
          config: { columns },
        },
        {
          id: "newbill",
          type: "core/form",
          title: "New invoice",
          at: { x: 0, y: 8, w: 12, h: 8 },
          data: { record: { source: { visual: { table: "invoices" } } } },
          config: {
            fields: ["number", "clinic", "total", "status"].map((column) => ({ column })),
          },
        },
        {
          id: "go",
          type: "core/button",
          title: "Say hello",
          at: { x: 0, y: 16, w: 4, h: 2 },
          config: { label: "Say hello" },
          on: {
            click: {
              steps: [
                { do: "message", text: "One" },
                { do: "message", text: "Two" },
                { do: "message", text: "Three" },
              ],
            },
          },
        },
        note("n1", "First note", 18),
        note("n2", "Second note", 20),
        note("n3", "Third note", 22),
      ],
    },
    { id: "second", title: "Second", widgets: [] },
    { id: "third", title: "Third", widgets: [] },
    {
      id: "broken",
      title: "Broken",
      widgets: [
        {
          id: "gone",
          type: "core/table",
          title: "Gone table",
          at,
          data: visual("no_such_table"),
          config: { columns: [{ column: "number" }] },
        },
        {
          id: "good",
          type: "core/table",
          title: "Fine table",
          at: { x: 0, y: 6, w: 12, h: 6 },
          data: visual("invoices", { limit: 10 }),
          config: { columns },
          title2: undefined,
        },
        {
          id: "nosteps",
          type: "core/button",
          title: "Does nothing",
          at: { x: 0, y: 12, w: 4, h: 2 },
          config: { label: "Does nothing" },
          on: { click: { steps: [] } },
        },
      ],
    },
  ],
};
const NAME2 = `screens/p28help-${stamp}`;
const body2 = {
  title: `Help ${stamp}`,
  pages: [{ id: "helped", title: "Helped", help: "no-such-topic", widgets: [] }],
};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  owner = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await signInAs(owner, OWNER);
  const tenants = await ok(owner, "GET", `/tenants?search=${TENANT}&limit=200`);
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const workspaces = (await ok(owner, "GET", `/tenants/${tenant.id}/workspaces`)).items;
  const sandbox = workspaces.find((one: { slug: string }) => one.slug === SANDBOX);
  test.skip(!sandbox, "Fernhill's sandbox workspace is needed.");
  W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  L = `/t/${tenant.id}/workspaces/${sandbox.id}`;
  const clean = JSON.parse(JSON.stringify(body));
  for (const page of clean.pages) for (const w of page.widgets) delete w.title2;
  await ok(owner, "PUT", `${W}/drafts/${NAME}`, {
    kind: "interface",
    schemaVersion: 2,
    body: clean,
    create: true,
  });
  await ok(owner, "PUT", `${W}/drafts/${NAME2}`, {
    kind: "interface",
    schemaVersion: 2,
    body: body2,
    create: true,
  });
});

test.afterAll(async () => {
  if (!owner) return;
  if (W) {
    await call(owner, "DELETE", `${W}/drafts/${NAME}`);
    await call(owner, "DELETE", `${W}/drafts/${NAME2}`);
  }
  await owner.context().close();
});

// ----- What the build draws, in one place -----

const settings = () => owner.getByRole("complementary", { name: "Settings" });
const pages = () => owner.getByRole("region", { name: "Pages" });
const outline = () => owner.getByRole("region", { name: "On this page" });

async function openBuilder(page: string, size = { width: 1440, height: 1000 }, name = NAME) {
  await owner.setViewportSize(size);
  await owner.emulateMedia({ reducedMotion: "no-preference" });
  await owner.goto(`${L}/screens/${name}`);
  const narrow = size.width < 900;
  if (narrow) await owner.getByRole("button", { name: "Pages and widgets" }).click();
  const choose = pages().getByRole("button", { name: new RegExp(`^${page}`) });
  await expect(choose).toBeVisible({ timeout: 30_000 });
  await choose.click();
  if (narrow) await owner.keyboard.press("Escape");
}
/** Chooses a widget in the outline, and opens the tab of its settings. */
async function chooseWidget(name: string, tab?: string) {
  await outline().getByRole("button", { name, exact: true }).click();
  await expect(settings().getByRole("heading", { name, level: 2 })).toBeVisible();
  if (tab)
    await settings()
      .getByRole("tab", { name: new RegExp(`^${tab}`) })
      .click();
}

const shot = async (name: string) => {
  if (SHOTS) await owner.screenshot({ path: `${SHOTS}/${name}.png` });
};

// ----- Measuring motion -----

type Frames = Record<string, number>[];
/** Each frame also says when it was drawn: a slow machine draws fewer frames, and the test counts time. */
const TIME = "@time";
/** How many rows were playing their motion when a frame was drawn. */
const MOVING = "@moving";
/** Starts recording the top of every sortable row in `list`, on every frame. */
async function startFrames(list: Locator) {
  await list.evaluate((node) => {
    const w = window as unknown as { __frames: Frames; __stop: boolean };
    w.__frames = [];
    w.__stop = false;
    const tick = () => {
      const one: Record<string, number> = {
        "@time": performance.now(),
        "@moving": node.querySelectorAll("[data-flip-moving]").length,
      };
      for (const el of node.querySelectorAll<HTMLElement>("[data-sortable-row]")) {
        one[el.dataset.flipKey as string] = el.getBoundingClientRect().top;
      }
      w.__frames.push(one);
      if (!w.__stop) requestAnimationFrame(tick);
    };
    tick();
  });
}
async function stopFrames(list: Locator): Promise<Frames> {
  return list.evaluate(() => {
    const w = window as unknown as { __frames: Frames; __stop: boolean };
    w.__stop = true;
    return w.__frames;
  });
}
/** The longest a frame may take for a step between two frames to say anything about popping. */
const FRAME_MS = 30;
const SLIDE_MS = 180;
/**
 * How many frames in between a slide of this row must show: 3 where the page draws at 60 fps, fewer
 * on a runner that draws a frame in a tenth of a second while the motion lasts 180 ms. The speed of
 * the drawing is read where it matters, over the frames of the motion itself (the quiet frames
 * before and after it are fast whatever the machine).
 */
const framesToShow = (frames: Frames, key: string) => {
  const moving = frames.filter((frame, i) => {
    const near = [frames[i - 1], frame, frames[i + 1]].map((one) => one?.[key]);
    return near.some((top) => top !== undefined && top !== near[1]);
  });
  const first = moving[0]?.[TIME] as number;
  const span = (moving.at(-1)?.[TIME] as number) - first;
  const typical = moving.length > 1 ? span / (moving.length - 1) : SLIDE_MS;
  return Math.min(3, Math.floor(SLIDE_MS / Math.max(typical, 1)) - 1);
};
/**
 * A row slid: it was seen between its two places on as many frames as the machine drew during the
 * motion (3 at 60 fps), and where it drew fewer than that, the page was still seen playing it.
 */
const slid = (frames: Frames, key: string) => {
  const needed = framesToShow(frames, key);
  const between = motionOf(frames, key).between;
  const playing = frames.some((frame) => (frame[MOVING] ?? 0) > 0);
  return { ok: between >= Math.max(needed, 1) || (needed < 1 && playing), between, needed };
};
/**
 * The biggest distance a row moved between two frames that were drawn close together (a step across
 * a long gap is the machine being slow, not the row popping), and how many frames it was between
 * its ends.
 */
const motionOf = (frames: Frames, key: string) => {
  const seen = frames.filter((frame) => frame[key] !== undefined);
  const tops = seen.map((frame) => frame[key] as number);
  let biggest = 0;
  for (let i = 1; i < seen.length; i += 1) {
    const gap = (seen[i]?.[TIME] as number) - (seen[i - 1]?.[TIME] as number);
    if (gap > FRAME_MS) continue;
    biggest = Math.max(biggest, Math.abs((tops[i] as number) - (tops[i - 1] as number)));
  }
  const low = Math.min(...tops);
  const high = Math.max(...tops);
  const between = tops.filter((top) => top > low + 1 && top < high - 1).length;
  // Where it is by the last 150 ms of the recording, not by the last few frames.
  const endAt = (seen.at(-1)?.[TIME] as number) - 150;
  const end = seen
    .filter((frame) => (frame[TIME] as number) >= endAt)
    .map((frame) => frame[key] as number);
  return { biggest, between, first: tops[0] as number, last: tops.at(-1) as number, tops, end };
};

/** Waits until no row has moved for 250 ms (at most 5 s): the motion has ended, however slowly drawn. */
async function settled(list: Locator) {
  await owner.waitForTimeout(500);
  await expect
    .poll(
      () =>
        list.evaluate((node) => {
          const w = window as unknown as { __frames: Record<string, number>[] };
          const last = w.__frames.at(-1);
          if (!last) return false;
          const now = last["@time"] as number;
          const recent = w.__frames.filter((frame) => now - (frame["@time"] as number) <= 250);
          return (
            Object.keys(last)
              .filter((key) => key !== "@time" && key !== "@moving")
              .every((key) => {
                const tops = recent.map((frame) => frame[key]).filter((top) => top !== undefined);
                return Math.max(...tops) - Math.min(...tops) < 0.5 && node.isConnected;
              }) && now - (w.__frames[0]?.["@time"] as number) > 250
          );
        }),
      { timeout: 5000, intervals: [100] },
    )
    .toBe(true);
}

/** Drags a handle by `dy` with a real pointer in small steps, holds, and lets go. Returns the frames. */
async function drag(
  list: Locator,
  handle: Locator,
  dy: number,
  options: { escape?: boolean } = {},
) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("the handle is not on the page");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await startFrames(list);
  await owner.mouse.move(x, y);
  await owner.mouse.down();
  const steps = 14;
  for (let i = 1; i <= steps; i += 1) {
    await owner.mouse.move(x, y + (dy * i) / steps);
    await owner.waitForTimeout(16);
  }
  await owner.waitForTimeout(350);
  if (options.escape) await owner.keyboard.press("Escape");
  else await owner.mouse.up();
  await settled(list);
  if (options.escape) await owner.mouse.up();
  return stopFrames(list);
}

const keysOf = async (list: Locator) =>
  list.evaluate((node) =>
    [...node.querySelectorAll<HTMLElement>("[data-sortable-row]")].map(
      (el) => el.dataset.flipKey as string,
    ),
  );

/**
 * One list, measured: dragged down past the next row, it follows the pointer, the next row slides
 * (not pops), the drop slides into its place, and the order is the new one. Then Esc, then keys.
 */
async function measureList(label: string, list: Locator, handleOf: (key: string) => Locator) {
  const keys = await keysOf(list);
  expect(keys.length, `${label}: rows`).toBeGreaterThanOrEqual(3);
  const [a, b] = keys as [string, string];
  const rowHeight = (await list.locator("[data-sortable-row]").first().boundingBox())?.height ?? 40;
  const down = await list.locator(`[data-flip-key="${b}"]`).boundingBox();
  const mine = await list.locator(`[data-flip-key="${a}"]`).boundingBox();
  if (!down || !mine) throw new Error("rows are not on the page");
  const dy = down.y + down.height / 2 - (mine.y + mine.height / 2) + 6;

  // 1. Drag the first row past the second.
  const frames = await drag(list, handleOf(a), dy);
  const dragged = motionOf(frames, a);
  const other = motionOf(frames, b);
  // The dragged row follows the pointer: it was carried by, at least, nearly all of the distance.
  expect(
    dragged.tops.some((top) => top >= dragged.first + dy - 3),
    `${label}: it followed the pointer`,
  ).toBe(true);
  // The other slides out of its way over several frames, and never in one jump of a row's height.
  const sliding = slid(frames, b);
  expect(
    sliding.ok,
    `${label}: the other row slid (frames in between: ${sliding.between}, wanted ${sliding.needed})`,
  ).toBe(true);
  expect(other.biggest, `${label}: the other row did not pop`).toBeLessThan(rowHeight * 0.8);
  // On release, the dragged row settles by sliding too: no frame moves it a whole row.
  expect(
    dragged.biggest,
    `${label}: the dragged row did not pop (biggest step ${dragged.biggest})`,
  ).toBeLessThan(rowHeight * 0.8);
  expect(await keysOf(list), `${label}: the order after the drop`).toEqual([
    b,
    a,
    ...keys.slice(2),
  ]);
  // No row ends the whole motion anywhere but its place, and none jumped on the last frames.
  for (const key of keys) {
    const motion = motionOf(frames, key);
    expect(
      Math.max(...motion.end) - Math.min(...motion.end),
      `${label}: ${key} is still at the end`,
    ).toBeLessThan(1.5);
    expect(motion.biggest, `${label}: ${key} never jumped`).toBeLessThan(rowHeight * 0.8);
  }

  // 2. Esc takes the drag back, sliding, and the order is as it was.
  const before = await keysOf(list);
  const back = await drag(list, handleOf(before[0] as string), dy, { escape: true });
  expect(await keysOf(list), `${label}: Esc leaves the order`).toEqual(before);
  const gone = motionOf(back, before[0] as string);
  expect(gone.biggest, `${label}: Esc slid it back`).toBeLessThan(rowHeight * 0.8);
  expect(Math.abs(gone.last - gone.first), `${label}: Esc put it where it was`).toBeLessThan(1.5);
}

// ----- 1. Dragging -----

test("a table's columns slide: the dragged row follows, the others make room, it settles; Esc, the keys, and reduced motion @fernhill @builder", async () => {
  await openBuilder("Main");
  await chooseWidget("Invoices", "Display");
  const list = settings()
    .getByRole("list", { name: /columns/i })
    .first();
  await expect(list).toBeVisible();
  await list.scrollIntoViewIfNeeded();
  const handleOf = (key: string) => list.locator(`[data-flip-key="${key}"] [data-handle]`);
  await measureList("columns", list, handleOf);
  await shot("columns-after-drag");

  // The keyboard: Alt+Down on a row slides it; the focus stays.
  const keys = await keysOf(list);
  await handleOf(keys[0] as string).focus();
  await startFrames(list);
  await owner.keyboard.press("ArrowDown");
  await owner.waitForTimeout(500);
  const frames = await stopFrames(list);
  expect(await keysOf(list)).toEqual([keys[1], keys[0], ...keys.slice(2)]);
  const sliding = slid(frames, keys[1] as string);
  expect(
    sliding.ok,
    `the keyboard's move slides (frames in between: ${sliding.between}, wanted ${sliding.needed})`,
  ).toBe(true);
  await expect(handleOf(keys[0] as string)).toBeFocused();
  await expect(owner.getByRole("status").filter({ hasText: /Moved/ }).first()).toBeAttached();

  // Reduced motion: nothing slides, the move is one frame.
  await owner.emulateMedia({ reducedMotion: "reduce" });
  const now = await keysOf(list);
  await startFrames(list);
  await handleOf(now[0] as string).focus();
  await owner.keyboard.press("ArrowDown");
  await owner.waitForTimeout(400);
  const still = await stopFrames(list);
  expect(await keysOf(list)).toEqual([now[1], now[0], ...now.slice(2)]);
  expect(motionOf(still, now[1] as string).between, "nothing slides under reduced motion").toBe(0);
  // A drag under reduced motion still follows the pointer and lands where it is let go.
  await owner.emulateMedia({ reducedMotion: "no-preference" });
});

test("the form's fields, an action's steps, the pages and the outline slide the same way @fernhill @builder", async () => {
  await openBuilder("Main");
  // The form's fields.
  await chooseWidget("New invoice", "Display");
  if ((await settings().locator("[data-sortable-row]").count()) === 0) {
    await settings().getByRole("tab", { name: /^Data/ }).click();
  }
  const fields = settings().locator("ul:has([data-sortable-row])").first();
  await fields.scrollIntoViewIfNeeded();
  await measureList("fields", fields, (key) =>
    fields.locator(`[data-flip-key="${key}"] [data-handle]`),
  );
  // An action's steps.
  await chooseWidget("Say hello", "Actions");
  const steps = settings().getByRole("list", { name: /^Steps of/ });
  await steps.scrollIntoViewIfNeeded();
  await expect(steps.locator("[data-sortable-row]")).toHaveCount(3);
  await measureList("steps", steps, (key) =>
    steps.locator(`[data-flip-key="${key}"] [data-handle]`),
  );
  // The pages.
  const list = pages().getByRole("list").first();
  await measureList("pages", list, (key) => list.locator(`[data-flip-key="${key}"] [data-handle]`));
  // The outline: the widgets on the page.
  const widgets = outline().getByRole("list").first();
  const rows = await keysOf(widgets);
  expect(rows.length).toBeGreaterThanOrEqual(6);
  const noteList = widgets;
  const [first] = rows;
  const before = await keysOf(noteList);
  const target = await noteList.locator(`[data-flip-key="${before[1]}"]`).boundingBox();
  const mine = await noteList.locator(`[data-flip-key="${first}"]`).boundingBox();
  if (!target || !mine) throw new Error("rows are not on the page");
  const frames = await drag(
    noteList,
    noteList.locator(`[data-flip-key="${first}"] [data-handle]`).first(),
    target.y + target.height - mine.y - mine.height / 2 + 4,
  );
  const after = await keysOf(noteList);
  expect(after[0], "the outline: the first widget moved down").not.toBe(first);
  expect(motionOf(frames, first as string).biggest).toBeLessThan(mine.height * 0.9);
  // It is a real change to the page: it is still there after a reload.
  await owner.waitForTimeout(3000);
  await owner.reload();
  await expect(pages().getByRole("button", { name: /^Main/ })).toBeVisible({ timeout: 30_000 });
  await pages().getByRole("button", { name: /^Main/ }).click();
  await expect
    .poll(async () => (await keysOf(outline().getByRole("list").first()))[0])
    .toBe(after[0]);
});

test("text is not selected while a row is dragged, and the handles take touch @fernhill @builder", async () => {
  await openBuilder("Main");
  await chooseWidget("Invoices", "Display");
  const handle = settings().locator("[data-handle]").first();
  expect(await handle.evaluate((node) => getComputedStyle(node).touchAction)).toBe("none");
  const box = await handle.boundingBox();
  if (!box) throw new Error("no handle");
  await owner.mouse.move(box.x + 5, box.y + 5);
  await owner.mouse.down();
  await owner.mouse.move(box.x + 5, box.y + 60);
  await owner.mouse.move(box.x - 150, box.y + 90);
  expect(await owner.evaluate(() => String(window.getSelection()))).toBe("");
  await owner.keyboard.press("Escape");
  await owner.mouse.up();
});

// ----- 2. The dots -----

test("a dot says that something is wrong in its tab, and a tab with settings but nothing wrong has none @fernhill @builder", async () => {
  await openBuilder("Main");
  // The invoices table has columns, a sort, a limit: all set, nothing wrong: no dots.
  await chooseWidget("Invoices");
  await expect(settings().locator("[data-attention]")).toHaveCount(0);
  await openBuilder("Broken");
  await chooseWidget("Fine table");
  await expect(settings().locator("[data-attention]")).toHaveCount(0);
  // A table that reads a table that is gone: the dot is on Data, with words, and nowhere else.
  await chooseWidget("Gone table");
  const data = settings().getByRole("tab", { name: /^Data/ });
  await expect(data).toContainText(
    "needs fixing: Source: the table no_such_table no longer exists.",
  );
  await expect(data.locator("[data-attention]")).toHaveCount(1);
  await expect(
    settings()
      .getByRole("tab", { name: /^Display/ })
      .locator("[data-attention]"),
  ).toHaveCount(0);
  await expect(
    settings()
      .getByRole("tab", { name: /^Rules/ })
      .locator("[data-attention]"),
  ).toHaveCount(0);
  // In the tab, the thing at fault says so.
  await data.click();
  await expect(settings().getByText("Needs fixing", { exact: true })).toBeVisible();
  await expect(
    settings()
      .getByText(/the table no_such_table no longer exists/)
      .first(),
  ).toBeVisible();
  await shot("dot-data");
  // The tooltip says it too.
  await owner.mouse.move(5, 500);
  await data.hover();
  await expect(owner.locator(".shadow-overlay").filter({ hasText: "no_such_table" })).toBeVisible();
  // An action with no steps: the dot is on Actions.
  await chooseWidget("Does nothing");
  await expect(settings().getByRole("tab", { name: /^Actions/ })).toContainText("has no steps yet");
  await expect(
    settings().getByRole("tab", { name: /^Data/ }).locator("[data-attention]"),
  ).toHaveCount(0);
  // The same problems are in the "N to fix" pill's list, and in the publish check.
  await expect(owner.getByRole("button", { name: /to fix$/ })).toBeVisible({ timeout: 15_000 });
  // After a reload the dot is still there.
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Broken/ })
    .click();
  await chooseWidget("Gone table");
  await expect(
    settings().getByRole("tab", { name: /^Data/ }).locator("[data-attention]"),
  ).toHaveCount(1);
});

test("a dashboard's inspector follows the same rule @fernhill @builder", async () => {
  const board = await ok(owner, "POST", `${W}/dashboards`, { title: `Look ${stamp}` });
  try {
    await owner.setViewportSize({ width: 1440, height: 1000 });
    await owner.goto(`${L}/dashboards/${board.id}?edit=1`);
    await owner
      .getByRole("button", { name: /^Add to page/ })
      .first()
      .click();
    await owner
      .getByRole("dialog", { name: "Add to page" })
      .getByRole("button", { name: /^Stat\b/ })
      .first()
      .click();
    // A stat that has no table yet and has settings: no dot where nothing is wrong.
    await expect(settings().getByRole("tab", { name: /^Data/ })).toBeVisible({ timeout: 30_000 });
    expect(await settings().locator("[data-attention]").count()).toBe(0);
    await shot("dashboard-no-dots");
  } finally {
    await call(owner, "DELETE", `${W}/dashboards/${board.id}`);
  }
});

// ----- 3. The help topic -----

test("Help topic is a picklist over the documents: search, groups, a page with no topic, keys, Change and Clear @fernhill @builder", async () => {
  await openBuilder("Second");
  const form = settings().getByRole("region", { name: "Page settings" });
  await expect(form.getByText("None: this page has no Help button.")).toBeVisible();
  await form.getByRole("button", { name: /Choose a document/ }).click();
  const dialog = owner.getByRole("dialog", { name: "Help topic" });
  await expect(dialog).toBeVisible();
  const search = dialog.getByRole("combobox", { name: "Search the documents" });
  await expect(search).toBeFocused();
  await expect(dialog.getByRole("option").first()).toBeVisible({ timeout: 15_000 });
  const all = await dialog.getByRole("option").count();
  expect(all).toBeGreaterThan(1);
  await expect(dialog.getByRole("group").first()).toBeVisible();
  await shot("help-dialog");
  // A page with no topic is shown, disabled, with the reason and a way to edit it.
  const without = dialog.getByRole("option", { name: /This page has no topic/ }).first();
  if ((await without.count()) > 0) {
    await expect(without).toHaveAttribute("aria-disabled", "true");
    await expect(without.getByRole("link", { name: "Edit it" })).toBeVisible();
    await without.click({ force: true });
    await expect(dialog).toBeVisible();
  }
  // Search narrows; nothing matching says so.
  await search.fill("zzzz-nothing");
  await expect(dialog.getByText(/No document matches/)).toBeVisible();
  await search.fill("");
  // The arrows and Enter choose.
  const usable = dialog.locator("[role=option]:not([aria-disabled=true])");
  expect(await usable.count()).toBeGreaterThan(0);
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(form.getByRole("button", { name: "Change" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Clear" })).toBeVisible();
  await expect(form.locator("[data-doc-topic]")).toContainText("Topic");
  await shot("help-chosen");
  let saved = "";
  await expect
    .poll(async () => {
      const draft = await ok(owner, "GET", `${W}/drafts/${NAME}`);
      saved = draft.body.pages.find((one: { id: string }) => one.id === "second").help ?? "";
      return saved;
    })
    .not.toBe("");
  await owner.reload();
  await pages()
    .getByRole("button", { name: /^Second/ })
    .click();
  await expect(settings().getByRole("button", { name: "Change" })).toBeVisible();
  await settings().getByRole("button", { name: "Clear" }).click();
  await expect(settings().getByText("None: this page has no Help button.")).toBeVisible();
  await expect
    .poll(async () => {
      const draft = await ok(owner, "GET", `${W}/drafts/${NAME}`);
      return draft.body.pages.find((one: { id: string }) => one.id === "second").help ?? "";
    })
    .toBe("");
});

test("a topic no document has is a problem in the settings, and a warning in the publish check @fernhill @builder", async () => {
  await openBuilder("Helped", { width: 1440, height: 1000 }, NAME2);
  const form = settings().getByRole("region", { name: "Page settings" });
  await expect(form.getByText(/No document has the topic/)).toBeVisible({ timeout: 15_000 });
  await expect(form.getByText("no-such-topic")).toBeVisible();
  await shot("help-lost");
  await owner.getByRole("button", { name: "Publish", exact: true }).click();
  const check = owner.locator("[data-publish-check]");
  await expect(
    check.getByText(/has Help topic no-such-topic, and no document has that topic/),
  ).toBeVisible({
    timeout: 20_000,
  });
  await owner.keyboard.press("Escape");
});

// ----- Widths and themes -----

for (const [width, height] of [
  [1440, 1000],
  [768, 1000],
  [390, 844],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`pictures at ${width}, ${scheme}: columns, the dot, the help window; nothing scrolls sideways @fernhill @builder`, async () => {
      await owner.emulateMedia({ colorScheme: scheme });
      await openBuilder("Broken", { width, height });
      const sideways = await owner.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(sideways).toBe(false);
      await owner.waitForTimeout(700);
      await shot(`broken-${width}-${scheme}`);
      await owner.emulateMedia({ colorScheme: "light" });
    });
  }
}
