import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CLOCK, fileName, missing, SHOTS, writeIndex } from "../packages/docs/screenshots.mjs";
import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * Takes the pictures the product's documentation shows, from a running
 * instance seeded with Fernhill, into `packages/docs/assets/screenshots/`.
 * Run when a version is released, with `pnpm docs:screenshots`, before the
 * documentation is built: the build then ships them. It is skipped in an
 * ordinary run of the browser tests, which have nothing to say about what a
 * picture looks like.
 *
 * What is taken is listed in `packages/docs/screenshots.mjs`: each picture
 * once for every look (light and dark), with the clock fixed so that a time on
 * a screen is the same in each run. A file is named by a hash of its bytes,
 * and `index.json` beside them says which file is which name in which look.
 * A picture of the list that was not taken fails the run.
 *
 * A page names a picture with `::screenshot{name=console/table-help alt="…"}`.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const OUT = new URL("../packages/docs/assets/screenshots/", import.meta.url).pathname;

type Look = {
  role?: string;
  name?: string;
  level?: number;
  text?: string;
  css?: string;
  within?: { role: string; name: string };
};
type Step = Look & { press?: string; focus?: string; click?: { role: string; name: string } };

/** What a shot waits for before it is taken. */
const ready = async (page: Page, looks: Look[]) => {
  for (const look of looks) {
    const scope = look.within
      ? page.getByRole(look.within.role as never, { name: look.within.name })
      : page;
    const found = look.css
      ? scope.locator(look.css).first()
      : look.role
        ? scope.getByRole(look.role as never, {
            ...(look.name ? { name: look.name } : {}),
            ...(look.level ? { level: look.level } : {}),
          })
        : look.text
          ? scope.getByText(look.text)
          : scope;
    await expect(found).toBeVisible({ timeout: 30_000 });
    if (look.text && (look.role || look.css))
      await expect(scope.getByText(look.text)).toBeVisible();
  }
};

/** One thing a person does before the picture. */
const act = async (page: Page, step: Step) => {
  if (step.focus) await page.locator(step.focus).focus();
  else if (step.press) await page.keyboard.press(step.press);
  else if (step.click)
    await page.getByRole(step.click.role as never, { name: step.click.name }).click();
  else await ready(page, [step]);
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

test("the pictures the documentation shows are taken", async ({ browser }) => {
  test.skip(process.env.SCREENSHOTS !== "1", "Taken only when asked: pnpm docs:screenshots.");
  test.setTimeout(240_000);
  const first = await (await browser.newContext()).newPage();
  const page = first;
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `pictures-${stamp}`,
    name: "Fernhill",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const source = (frontmatter: string, body: string) => `---\n${frontmatter}\n---\n\n${body}`;
  await call(page, "PUT", `${W}/drafts/orders`, {
    kind: "table",
    schemaVersion: 1,
    body: {
      description: "What customers bought.",
      columns: {
        number: { type: "text", required: true, description: "The number printed on the order." },
        status: { type: "text", description: "Where the order is in its life." },
        total: { type: "number", description: "What was charged." },
      },
    },
  });
  const pages: Record<string, string> = {
    "handbook/index": source("title: Shop handbook", "Start with [refunds](support/refunds).\n"),
    "handbook/support/index": source(
      "title: Customer support\npages: [refunds, returns]",
      "When a customer writes in.\n",
    ),
    "handbook/support/refunds": source(
      "title: Refund an order\ndescription: Full and partial refunds.\nextends: [data-tables]\nabout:\n  - table: orders",
      "# Before you start\n\nCheck the order's :term[status]{table=orders column=status}.\n\n:::alert[Mind the limit]{type=warning}\nA refund over 500 needs a second person.\n:::\n\n:::steps\n1. Find the order.\n2. Refund it to the card it was paid with.\n:::\n",
    ),
    "handbook/support/returns": source("title: Returns", "Parcels come back on Tuesdays.\n"),
  };
  for (const [path, text] of Object.entries(pages)) {
    await call(page, "PUT", `${W}/drafts/${path}`, {
      kind: "doc",
      schemaVersion: 1,
      body: { source: text },
    });
  }
  await call(page, "PUT", `${W}/drafts/help`, {
    kind: "app",
    schemaVersion: 1,
    body: { title: "Shop handbook", docs: "handbook" },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  await call(page, "POST", `${W}/rows/orders`, {
    rows: [
      { number: "A-1041", status: "open", total: 40 },
      { number: "A-1042", status: "refunded", total: 12 },
      { number: "A-1043", status: "shipped", total: 86 },
    ],
  });
  const at = `/t/${tenant.id}/workspaces/${dev.id}`;
  await first.context().close();

  // The scenes the list's `setup` names. Each is built above, once, before any is taken.
  const scenes = new Set(["handbook"]);
  for (const shot of SHOTS)
    expect(scenes.has(shot.setup), `${shot.name}: unknown setup`).toBe(true);

  // A clean folder: a file left from an earlier run is never mistaken for one of this.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const taken: Record<string, Record<string, string>> = {};

  for (const theme of ["light", "dark"] as const) {
    const context = await browser.newContext({ colorScheme: theme, reducedMotion: "reduce" });
    // The clock stands still on one day; timers still run, so the console loads as it does.
    await context.clock.setFixedTime(new Date(CLOCK));
    const shown = await context.newPage();
    await signInWithPassword(shown, ADMIN.email, ADMIN.password);
    for (const shot of SHOTS.filter((one) => one.themes.includes(theme))) {
      await shown.setViewportSize(shot.viewport);
      await shown.goto(`${at}/${shot.address}`);
      await shown.reload();
      await ready(shown, shot.ready);
      for (const step of shot.steps as Step[]) await act(shown, step);
      await shown.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
      const bytes = await shown.screenshot({
        animations: "disabled",
        caret: "hide",
        maskColor: "#c9ced6",
        mask: shot.mask.map((one) =>
          typeof one === "string"
            ? shown.locator(one)
            : shown.getByRole(one.role as never).filter({ hasText: new RegExp(one.hasText) }),
        ),
      });
      const file = fileName(shot.name, theme, bytes);
      mkdirSync(dirname(`${OUT}${file}`), { recursive: true });
      writeFileSync(`${OUT}${file}`, bytes);
      taken[shot.name] = { ...taken[shot.name], [theme]: file };
    }
    await context.close();
  }

  writeIndex(OUT, taken);
  // A picture the list asks for that was not taken fails the run, and so the release.
  expect(missing(taken), "pictures of the list that were not taken").toEqual([]);
  const files = readdirSync(OUT, { recursive: true }).filter(
    (one) => String(one).endsWith(".png") && statSync(`${OUT}${one}`).size > 0,
  );
  expect(files.length).toBe(SHOTS.reduce((sum, shot) => sum + shot.themes.length, 0));
});
