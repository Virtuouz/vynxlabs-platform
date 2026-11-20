import { writeFileSync } from "node:fs";
import { firstRowTop, nested, overdraws } from "./measure.ts";
import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { readEveryList } from "./visual.ts";

/**
 * The console's polish (phase 16, P4), measured in a browser:
 * - every workbench's first row of data starts within 160 px of the top at 1440 × 900 (P4-1);
 * - no text draws over what is beside it at 390, 768, 1280 and 1440 px (P4-7);
 * - no bordered box sits inside another bordered box (P4-2).
 *
 * A tenant is seen through operator access, as an operator would, with a long script
 * path, a long error and a flow run waiting for approval among its runs.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);
const LONG = "billing/record-payment-and-reconcile-ledger-entries";

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

test.describe.configure({ mode: "serial" });

let page: Page;
let tenant: { id: string; slug: string };
let ws: string;
let failedRun: string;
let waitingRun: string;
let W: string;
let prodWs: string;

const script = (code: string) => ({
  kind: "script",
  schemaVersion: 1,
  body: {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  tenant = await call(page, "POST", "/tenants", { slug: `polish-${stamp}`, name: "Polish" });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "Measuring the console's polish against the roadmap's targets",
    roleId: TENANT_ADMIN,
  });
  const prod = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "main",
    name: "Main",
    type: "production",
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
    linkedWorkspaceId: prod.id,
  });
  W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  prodWs = `/t/${tenant.id}/workspaces/${prod.id}`;
  ws = `/t/${tenant.id}/workspaces/${dev.id}`;
  await call(
    page,
    "PUT",
    `${W}/drafts/${LONG}`,
    script(
      "export default async () => {\n" +
        '  throw new Error("The SMS gateway refused the message because the sender ID is not registered for this country, so the customer was not told their payment was recorded");\n};\n',
    ),
  );
  await call(
    page,
    "PUT",
    `${W}/drafts/stock/check`,
    script("export default async () => ({ ok: true });\n"),
  );
  await call(page, "PUT", `${W}/drafts/refunds/approve`, {
    kind: "flow",
    schemaVersion: 1,
    body: {
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        ask: { type: "approval", title: "Refund the Brooks family", detail: "trigger" },
        done: { type: "set", values: { refunded: "true" } },
      },
      edges: [
        { from: "start", to: "ask" },
        { from: "ask", to: "done" },
      ],
    },
  });
  // The data screens (A2-31) are measured with something on them: a table with rows, a
  // saved query, a variable and a dashboard, so none is judged while empty.
  const table = (name: string, body: object) =>
    call(page, "PUT", `${W}/resources/${name}`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body,
    });
  await table("patients", {
    columns: { name: { type: "text", required: true }, visits: { type: "integer" } },
    display: "name",
  });
  for (const [name, visits] of [
    ["Amara Brooks", 3],
    ["Joaquin Reyes", 1],
    ["Priya Natarajan-Whitfield", 7],
  ] as const) {
    await call(page, "POST", `${W}/rows/patients`, { name, visits });
  }
  await call(page, "PUT", `${W}/drafts/reports/visits-by-patient`, {
    kind: "query",
    schemaVersion: 1,
    create: true,
    body: { sql: "select name, visits from patients order by visits desc" },
  });
  await call(page, "PUT", `${W}/drafts/billing/late-fee`, {
    kind: "variable",
    schemaVersion: 1,
    body: { description: "What a late payment costs, in cents" },
  });
  const board = await call(page, "POST", `${W}/dashboards`, { title: "Clinic visits" });
  await call(page, "PUT", `${W}/dashboards/${board.id}`, {
    revision: board.revision,
    body: {
      version: 2,
      filters: [],
      widgets: [
        {
          id: "visits",
          title: "Visits",
          type: "figure",
          width: 3,
          source: {
            visual: {
              table: "patients",
              measures: [{ fn: "sum", column: "visits", as: "visits" }],
            },
          },
          options: { value: "visits" },
        },
        {
          id: "by-patient",
          title: "Visits by patient",
          type: "table",
          width: 6,
          source: { visual: { table: "patients", groupBy: [{ column: "name" }] } },
        },
      ],
    },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  const failing = (await call(page, "POST", `${W}/runs`, { script: LONG, input: {} })).id;
  failedRun = failing;
  await call(page, "POST", `${W}/runs`, { script: "stock/check", input: {} });
  const waiting = (
    await call(page, "POST", `${W}/flow-runs`, { flow: "refunds/approve", input: {} })
  ).id;
  waitingRun = waiting;
  await expect
    .poll(async () => (await call(page, "GET", `${W}/runs/${failing}`)).status, { timeout: 90_000 })
    .toBe("failed");
  await expect
    .poll(
      async () =>
        (await call(page, "GET", `${W}/approvals`)).items.some(
          (one: { flowRunId: string }) => one.flowRunId === waiting,
        ),
      { timeout: 90_000 },
    )
    .toBe(true);
});

test.afterAll(async () => {
  await call(page, "DELETE", "/me/preferences/operator.strip").catch(() => {});
  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});

/** The workbenches (`nav.ts`): lists that fill the work area beside an inspector. */
const workbenches = () => [
  ["runs", `${ws}/runs`],
  ["triggers", `${ws}/triggers`],
  ["events", `${ws}/events`],
  ["flows", `${ws}/flows`],
  ["scripts", `${ws}/scripts`],
  ["apps", `${ws}/apps`],
  ["approvals", `/t/${tenant.id}/approvals`],
  ["members", `/t/${tenant.id}/members`],
  ["end-users", `/t/${tenant.id}/end-users`],
  ["end-user-groups", `/t/${tenant.id}/end-user-groups`],
  ["audit", `/t/${tenant.id}/audit`],
  ["tenants", "/"],
  ["instance members", "/instance/members"],
  ["operators", "/instance/operators"],
  ["instance audit", "/instance/audit"],
];

/** Every screen whose layout is judged: the workbenches, and the screens the audit named. */
const screens = () => [
  ...workbenches(),
  ["overview", `${ws}/overview`],
  ["release", `${ws}/release`],
  ["tables", `${ws}/tables`],
  ["connections", `${ws}/connections`],
  ["settings", `${ws}/settings`],
  ["a flow", `${ws}/flows/refunds/approve`],
  ["tenant", `/t/${tenant.id}`],
  ["sso", `/t/${tenant.id}/single-sign-on`],
  ["domains", `/t/${tenant.id}/domains`],
  ["account", "/account/api-keys"],
  // The data screens (A2-31), with a table, a saved query, a variable and a dashboard to hold.
  ["queries", `${ws}/queries`],
  ["sources", `${ws}/sources`],
  ["dashboards", `${ws}/dashboards`],
  ["variables", `${ws}/variables`],
  ["alerts", `${ws}/alerts`],
  ["retention", `/t/${tenant.id}/retention`],
  // The rest of the navigation, which had no finding against it but was never looked at.
  ["app builder", `${ws}/screens`],
  ["extensions", `${ws}/extensions`],
  ["documentation", `${ws}/docs`],
  ["resources", `${ws}/resources`],
  ["workspace approvals", `${ws}/approvals`],
  ["git sync", `${ws}/git`],
  ["secrets", `${ws}/secrets`],
  ["workspaces", `/t/${tenant.id}/workspaces`],
  ["service accounts", `/t/${tenant.id}/service-accounts`],
  ["operator access", `/t/${tenant.id}/operator-access`],
  ["tenant branding", `/t/${tenant.id}/branding`],
  ["repository", `/t/${tenant.id}/repository`],
  ["workers", `/t/${tenant.id}/workers`],
  ["export", `/t/${tenant.id}/export`],
  ["instance sso", "/instance/single-sign-on"],
  ["databases", "/instance/databases"],
  ["import", "/instance/import"],
  ["instance triggers", "/instance/triggers"],
  ["instance branding", "/instance/branding"],
  ["kit", "/instance/kit"],
  // A flow run, whose timeline is judged again at 390 px below.
  ["a flow run", `${ws}/runs/${waitingRun}`],
];

/**
 * The sections of `nav.ts` that the measures above do not reach yet. A section is
 * either measured in `screens()` or listed here; `apps/console/src/enforce.test.ts`
 * fails on one that is neither, so a new section is measured or its absence is said
 * (the polish gate, step 6). Phase 22 M7 emptied this list: the data screens were
 * found by the polish audit to be outside every layout measure (A2-31). A section that
 * cannot be measured yet goes back here with the reason on the line above it.
 */
const NOT_MEASURED: string[] = [];

async function open(path: string) {
  if (path === "/") {
    // Opened fresh, "/" reopens the last place a member was: the list is reached from inside.
    await page.goto("/instance/members");
    await page.locator("main").first().waitFor();
    await page.evaluate(() => {
      history.pushState(null, "", "/");
      dispatchEvent(new PopStateEvent("popstate"));
    });
  } else await page.goto(path);
  await page.locator("main").first().waitFor();
  await expect(page.getByText(/^Loading/).first()).toBeHidden({ timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(250);
}

const WIDTHS = [390, 768, 1280, 1440];

/** The numbers as they stand, written beside the results for the phase's record. */
test("the measures are recorded", async () => {
  test.setTimeout(300_000);
  const record: Record<string, unknown> = {};
  await page.setViewportSize({ width: 1440, height: 900 });
  const tops: Record<string, number | null> = {};
  for (const [name, path] of workbenches()) {
    await open(path as string);
    tops[name as string] = await firstRowTop(page);
  }
  record.firstRowTop = tops;
  const drawn: Record<string, string[]> = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path] of screens()) {
      await open(path as string);
      const found = await overdraws(page);
      if (found.length > 0) drawn[`${name} at ${width}`] = found;
    }
  }
  record.overdraws = drawn;
  await page.setViewportSize({ width: 1440, height: 900 });
  const boxes: Record<string, string[]> = {};
  for (const [name, path] of screens()) {
    await open(path as string);
    const found = await nested(page);
    if (found.length > 0) boxes[name as string] = found;
  }
  record.nested = boxes;
  record.notMeasured = NOT_MEASURED;
  writeFileSync(test.info().outputPath("polish.json"), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));
});

test("a flow run's timeline puts each label above its bar and keeps its ticks apart at 390 px", async () => {
  await page.setViewportSize({ width: 390, height: 900 });
  await open(`${ws}/runs/${waitingRun}`);
  const timeline = page.locator("main .\\@container", { has: page.locator("ol") }).first();
  await expect(timeline).toBeVisible();
  const labels = await page.evaluate(() => {
    const root = document.querySelector("main .\\@container ol") as HTMLElement;
    const rows = [...root.querySelectorAll<HTMLElement>("li > button, li > div")].map((row) => {
      const parts = [...row.children].map((part) => part.getBoundingClientRect());
      return { label: parts[0], bar: parts[1] };
    });
    const axis = root.parentElement?.querySelector('[aria-hidden="true"].flex.gap-3');
    const ticks = [...(axis?.querySelectorAll<HTMLElement>("span.absolute") ?? [])]
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0);
    return {
      rows: rows.map((row) => ({ label: row.label?.bottom ?? 0, bar: row.bar?.top ?? 0 })),
      ticks: ticks.map((box) => ({ left: box.left, right: box.right })),
    };
  });
  expect(labels.rows.length).toBeGreaterThan(0);
  // Each label ends where its bar begins: above it, not beside it.
  for (const row of labels.rows) expect(row.label).toBeLessThanOrEqual(row.bar + 1);
  // Only the first and last ticks are named, and they do not touch.
  expect(labels.ticks).toHaveLength(2);
  const [first, last] = labels.ticks as { left: number; right: number }[];
  expect(first?.right as number).toBeLessThan(last?.left as number);
});

test("every workbench's first row starts within 160 px of the top", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [name, path] of workbenches()) {
    await open(path as string);
    const top = await firstRowTop(page);
    expect(top, `${name} shows a first row`).not.toBeNull();
    expect(top as number, `${name}'s first row`).toBeLessThanOrEqual(160);
  }
});

test("no text draws over what is beside it, at any width", async () => {
  test.setTimeout(300_000);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path] of screens()) {
      await open(path as string);
      expect(await overdraws(page), `${name} at ${width}px`).toEqual([]);
    }
  }
});

test("no bordered box sits inside another", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [name, path] of screens()) {
    await open(path as string);
    expect(await nested(page), name as string).toEqual([]);
  }
});

/** P4-6: a time is one line, wherever it stands, from 1280 px up. */
test("no time wraps onto a second line at 1280 px or wider", async () => {
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [`${ws}/runs`, `${ws}/runs/${failedRun}`, `/t/${tenant.id}/audit`]) {
      await open(path);
      const wrapped = await page.evaluate(() =>
        [...document.querySelectorAll("main time")]
          .filter((time) => {
            const box = time.getBoundingClientRect();
            const line = Number.parseFloat(getComputedStyle(time).lineHeight) || 20;
            return box.width > 0 && box.height > line * 1.5;
          })
          .map((time) => time.textContent),
      );
      expect(wrapped, `${path} at ${width}px`).toEqual([]);
    }
  }
});

/** P4-1: what a list is for is said once, then kept behind help; operator access is one line. */
test("a list says what it is for once, and operator access hides to a mark and comes back", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await call(page, "DELETE", "/me/preferences/seen:flows").catch(() => {});
  await page.evaluate(() => localStorage.removeItem("vx-pref:seen:flows"));
  await open(`${ws}/flows`);
  const sentence = page.getByText(/A flow is a graph of steps/);
  await expect(sentence).toBeVisible();
  await open(`${ws}/flows`);
  await expect(sentence).toBeHidden();
  await page.getByRole("button", { name: "About Flows" }).click();
  await expect(page.getByRole("dialog").getByText(/A flow is a graph of steps/)).toBeVisible();
  await page.keyboard.press("Escape");
  await readEveryList(page);

  const strip = page.getByRole("region", { name: "Operator access" });
  await expect(strip).toContainText("Operator access as tenant_admin until");
  expect((await strip.boundingBox())?.height ?? 99).toBeLessThanOrEqual(40);
  await strip.getByRole("button", { name: "Hide" }).click();
  await expect(strip).toBeHidden();
  await open(`${ws}/runs`);
  await expect(strip).toBeHidden();
  await page.getByRole("button", { name: /^Operator access as tenant_admin/ }).click();
  await page.getByRole("menuitem", { name: "Show the notice" }).click();
  await expect(strip).toBeVisible();
});

/** P4-4: a run that starts while rows are checked waits at the top, and nothing moves under reduced motion. */
test("a run that arrives while rows are checked waits behind a control, and reduced motion moves nothing", async ({
  browser,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(`${ws}/runs`);
  const grid = page.getByRole("grid", { name: "Runs" });
  await grid.getByRole("checkbox").nth(1).check();
  await call(page, "POST", `${W}/runs`, { script: "stock/check", input: {} });
  const pill = page.getByRole("button", { name: /^1 new run$/ });
  await expect(pill).toBeVisible({ timeout: 20_000 });
  const before = await grid.locator("tbody tr[data-row]").count();
  await pill.click();
  await expect(pill).toBeHidden();
  await expect(grid.locator("tbody tr[data-row]")).toHaveCount(before + 1);

  const still = await (
    await browser.newContext({
      reducedMotion: "reduce",
      storageState: await page.context().storageState(),
    })
  ).newPage();
  await still.goto(`${ws}/runs`);
  await still.getByRole("grid", { name: "Runs" }).waitFor();
  const moving = async () =>
    still.evaluate(
      () =>
        [...document.querySelectorAll("*")]
          .map((element) => getComputedStyle(element))
          .filter(
            (style) =>
              style.transitionDuration.split(",").some((one) => one.trim() !== "0s") ||
              (style.animationName !== "none" && style.animationDuration !== "0s"),
          ).length,
    );
  await still.getByRole("button", { name: "Row density" }).click();
  await still.getByRole("menu").waitFor();
  expect(await moving(), "with a menu open").toBe(0);
  await still.keyboard.press("Escape");
  await still.getByRole("button", { name: "Search or jump to" }).click();
  await still.getByRole("dialog").waitFor();
  expect(await moving(), "with the palette open").toBe(0);
  await still.context().close();
});

/**
 * P4-5: in production three marks agree, seen without scrolling at every width: the header's
 * filled tag, the switcher's entry, and the amber rule under the header. In dev, none of them.
 * (The roadmap's acceptance is a usability test; this checks what that test would rely on.)
 */
test("production carries three marks that agree, and dev carries none", async () => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, production] of [
      [`${prodWs}/overview`, true],
      [`${ws}/overview`, false],
    ] as const) {
      await open(path);
      const header = page.locator("header").first();
      const tag = header
        .locator(".text-tag")
        .filter({ hasText: production ? /^Production$/ : /^Dev$/ })
        .first();
      await expect(tag, `the header's tag at ${width}px`).toBeInViewport();
      const filled = await tag.evaluate((element) => getComputedStyle(element).backgroundColor);
      if (production) expect(filled, "production's tag is filled").not.toBe("rgba(0, 0, 0, 0)");
      else expect(filled, "dev's tag is outlined").toBe("rgba(0, 0, 0, 0)");
      const rule = page.locator("[data-production-rule]");
      if (production) await expect(rule, `the rule at ${width}px`).toBeInViewport();
      else await expect(rule).toHaveCount(0);
      await page.getByRole("button", { name: "Switch workspace" }).click();
      const entry = page.getByRole("menuitem", { name: /^Main/ });
      await expect(entry).toContainText("Production");
      await expect(page.getByRole("menuitem", { name: /^Dev/ })).toContainText("Dev");
      await page.keyboard.press("Escape");
    }
  }
});
