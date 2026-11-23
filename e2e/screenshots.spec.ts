import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { CLOCK, fileName, missing, SHOTS, writeIndex } from "../packages/docs/screenshots.mjs";
import { scenes as access } from "./scenes/access.ts";
import { scenes as appBuilder } from "./scenes/app-builder.ts";
import { scenes as apps } from "./scenes/apps.ts";
import { scenes as basics } from "./scenes/basics.ts";
import { scenes as configure } from "./scenes/configure.ts";
import { scenes as docs } from "./scenes/docs.ts";
import { scenes as extensions } from "./scenes/extensions.ts";
import { scenes as flows } from "./scenes/flows.ts";
import { scenes as instance } from "./scenes/instance.ts";
import { scenes as operate } from "./scenes/operate.ts";
import { scenes as queries } from "./scenes/queries.ts";
import { scenes as releases } from "./scenes/releases.ts";
import type { Built, Given, Scene } from "./scenes/scene.ts";
import { scenes as scripts } from "./scenes/scripts.ts";
import { scenes as sso } from "./scenes/sso.ts";
import { scenes as widgets } from "./scenes/widgets.ts";
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
 *
 * Each area's shots are in `packages/docs/shots/<area>.mjs` and their scenes in
 * `e2e/scenes/<area>.ts`. Only the scenes the shots taken need are built.
 * `SCREENSHOTS_ONLY=console/queries-,console/flow` takes only the shots whose names start so,
 * into `SCREENSHOTS_OUT` (a folder of your own; the shipped folder is left alone), and does
 * not fail on the others: to see an area's pictures while writing it.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const SHIPPED = new URL("../packages/docs/assets/screenshots/", import.meta.url).pathname;
const ONLY = (process.env.SCREENSHOTS_ONLY ?? "").split(",").filter(Boolean);
const OUT = ONLY.length
  ? `${(process.env.SCREENSHOTS_OUT ?? "/tmp/volvel-screenshots").replace(/\/$/, "")}/`
  : SHIPPED;
const CHOSEN = SHOTS.filter(
  (shot) => !ONLY.length || ONLY.some((one) => shot.name.startsWith(one)),
);
/** The scenes of every area, by name. */
const SCENES: Record<string, Scene> = {
  ...access,
  ...appBuilder,
  ...apps,
  ...basics,
  ...configure,
  ...docs,
  ...extensions,
  ...flows,
  ...instance,
  ...operate,
  ...queries,
  ...releases,
  ...scripts,
  ...sso,
  ...widgets,
};
/** Fernhill's people sign in with the seed's password (examples/fernhill/setup/setup.mjs). */
const FERNHILL_PASSWORD = "fernhill-demo-2026";

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
            // Exactly: "Tables" is not "The Tables list".
            ...(look.name ? { name: look.name, exact: true } : {}),
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
  test.setTimeout(Math.max(240_000, CHOSEN.length * 2 * 15_000 + 120_000));
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
  // A table made in the console, as a person makes it (not deployed from a repository): its
  // Definition shows the actions on its columns, which a repository's table does not.
  await call(page, "PUT", `${W}/resources/customers`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    create: true,
    body: {
      description: "The people who buy from the shop.",
      columns: {
        name: { type: "text", required: true, description: "What they are called." },
        email: { type: "text", unique: true, description: "Where their receipts go." },
        tier: { type: "enum", values: ["standard", "member"], default: "standard" },
        joined: { type: "date" },
      },
      display: "name",
      indexes: [["tier"]],
    },
  });
  await call(page, "POST", `${W}/rows/customers`, {
    rows: [
      { name: "Ada Okafor", email: "ada@example.com", tier: "member", joined: "2026-01-12" },
      { name: "Ben Ito", email: "ben@example.com", tier: "standard", joined: "2026-02-03" },
    ],
  });

  // The scene of the tutorial "Your first table": a table made in the console in the Sandbox,
  // as the tutorial builds it: three columns, two rules, five rows, and a saved view.
  const sandbox = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "sandbox",
    name: "Sandbox",
    type: "dev",
  });
  const S = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  await call(page, "PUT", `${S}/resources/visit-notes`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    create: true,
    body: {
      description: "What the vet wrote down after a visit.",
      columns: {
        summary: { type: "text", required: true },
        minutes: { type: "integer" },
        clinic: {
          type: "enum",
          values: ["Northside", "Riverside", "Hilltop"],
          required: true,
          default: "Northside",
        },
      },
    },
  });
  await call(page, "POST", `${S}/rows/visit-notes`, {
    rows: [
      { summary: "Biscuit: ear check, drops sent home", minutes: 15, clinic: "Northside" },
      { summary: "Juniper: booster shot", minutes: 10, clinic: "Riverside" },
      { summary: "Pepper: limping on the left hind leg", minutes: 40, clinic: "Hilltop" },
      { summary: "Moss: dental clean", minutes: 55, clinic: "Riverside" },
      { summary: "Olive: annual check", minutes: 25, clinic: "Northside" },
    ],
  });
  // The saved view "Long visits": the filter and the sort, kept under a name, for the person who is signed in.
  const notes = await call(page, "GET", `${S}/tables/visit-notes`);
  const list = `rows-${String(notes.id)
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(-20)}`;
  await call(page, "POST", "/me/views", {
    tenantId: tenant.id,
    workspaceId: sandbox.id,
    list,
    name: "Long visits",
    state: {
      query: new URLSearchParams([
        ["filter", JSON.stringify({ minutes: ">=20" })],
        ["sort", "-minutes"],
      ]).toString(),
    },
  });
  const built: Record<string, Built> = {
    handbook: { at: `/t/${tenant.id}/workspaces/${dev.id}` },
    "visit-notes": { at: `/t/${tenant.id}/workspaces/${sandbox.id}` },
  };
  // Fernhill as the release seeds it, when it is there. The administrator is not one of its
  // members, so what is built in it is built as Maya Brooks, its tenant admin.
  const found = (await call(page, "GET", "/tenants?limit=200")).items.find(
    (one: { slug: string }) => one.slug === "fernhill",
  );
  let fernhill: Given["fernhill"];
  let maya: Page | undefined;
  if (found) {
    const as = await (await browser.newContext()).newPage();
    maya = as;
    await signInWithPassword(as, "maya.brooks@fernhill.example", FERNHILL_PASSWORD);
    fernhill = {
      id: found.id as string,
      workspaces: Object.fromEntries(
        (await call(as, "GET", `/tenants/${found.id}/workspaces?limit=200`)).items.map(
          (one: { slug: string; id: string }) => [one.slug, one.id],
        ),
      ),
      call: (method, path, body) => call(as, method, path, body),
    };
  }
  if (fernhill)
    built.fernhill = { at: `/t/${fernhill.id}/workspaces/${fernhill.workspaces.sandbox}` };
  const given: Given = {
    page,
    call: (method, path, body) => call(page, method, path, body),
    stamp,
    tenant: { id: tenant.id },
    workspaces: { dev: dev.id, sandbox: sandbox.id },
    fernhill,
  };
  // The scenes the chosen shots name, each built once, before any is taken.
  for (const name of new Set(CHOSEN.map((shot) => shot.setup))) {
    if (built[name]) continue;
    expect(SCENES[name], `the scene "${name}" is not in e2e/scenes/*.ts`).toBeTruthy();
    built[name] = await SCENES[name](given);
  }
  await first.context().close();
  await maya?.context().close();

  // A clean folder: a file left from an earlier run is never mistaken for one of this.
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const taken: Record<string, Record<string, string>> = {};

  /** Who a shot's `as` names: the administrator, one of Fernhill's people, or one a scene made. */
  const who = (shot: (typeof SHOTS)[number]) => {
    const as = String(shot.as ?? "admin");
    if (as === "admin") return ADMIN;
    if (as.startsWith("fernhill:")) return { email: as.slice(9), password: FERNHILL_PASSWORD };
    const person = built[shot.setup]?.people?.[as];
    expect(person, `${shot.name}: "${as}" is not someone its scene made`).toBeTruthy();
    return person as { email: string; password: string };
  };

  for (const theme of ["light", "dark"] as const) {
    for (const as of new Set(CHOSEN.map((shot) => `${who(shot).email}`))) {
      const context = await browser.newContext({ colorScheme: theme, reducedMotion: "reduce" });
      // The clock stands still on one day; timers still run, so the console loads as it does.
      await context.clock.setFixedTime(new Date(CLOCK));
      const shown = await context.newPage();
      const person = CHOSEN.map(who).find((one) => one.email === as) as {
        email: string;
        password: string;
      };
      await signInWithPassword(shown, person.email, person.password);
      for (const shot of CHOSEN.filter(
        (one) => one.themes.includes(theme) && who(one).email === as,
      )) {
        await shown.setViewportSize(shot.viewport);
        await shown.goto(
          shot.address.startsWith("/") ? shot.address : `${built[shot.setup].at}/${shot.address}`,
        );
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
  }

  writeIndex(OUT, taken);
  // A picture the list asks for that was not taken fails the run, and so the release.
  if (!ONLY.length) expect(missing(taken), "pictures of the list that were not taken").toEqual([]);
  const files = readdirSync(OUT, { recursive: true }).filter(
    (one) => String(one).endsWith(".png") && statSync(`${OUT}${one}`).size > 0,
  );
  expect(files.length).toBe(CHOSEN.reduce((sum, shot) => sum + shot.themes.length, 0));
});
