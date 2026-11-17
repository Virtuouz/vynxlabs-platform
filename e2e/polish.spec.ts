import { writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { firstRowTop, nested, overdraws } from "./measure.ts";
import { signInWithPassword } from "./sign-in.ts";

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
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
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
  await call(page, "POST", `${W}/changes/deploy`, {});
  const failing = (await call(page, "POST", `${W}/runs`, { script: LONG, input: {} })).id;
  failedRun = failing;
  await call(page, "POST", `${W}/runs`, { script: "stock/check", input: {} });
  const waiting = (
    await call(page, "POST", `${W}/flow-runs`, { flow: "refunds/approve", input: {} })
  ).id;
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
];

async function open(path: string) {
  await page.goto(path);
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
  writeFileSync(test.info().outputPath("polish.json"), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record, null, 2));
});

test.fixme("every workbench's first row starts within 160 px of the top", async () => {
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

test.fixme("no bordered box sits inside another", async () => {
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
