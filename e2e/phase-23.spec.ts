import { overdraws } from "./measure.ts";
import { signInWithPassword } from "./sign-in.ts";
import { type Browser, expect, type Page, test } from "./test.ts";

/**
 * Phase 23, walked in a browser on the Fernhill example (`examples/fernhill/setup/setup.mjs`),
 * in its sandbox workspace and under table and resource names of its own. It walks the phase's
 * exit criterion (docs/phases/phase-23-owner-decisions.md), each test titled with the POLISH
 * rule (docs/polish/polish-prevention-rules.md) it checks:
 *
 * - M1 (004, 005): a table's rows scroll in one place at 1440, 768 and 390 px;
 * - M2 (001): a reference is chosen by typing, past the first 200;
 * - M2 (010): a file is replaced and removed after asking, and the old one stays;
 * - M3 (002, 010): Release is one list of deploys, and rolls back from it;
 * - M4 (010): going back to an access release lists what it removes;
 * - M4 (003): a doc writer deploys a site's feedback table and no other, and a query and an
 *   app's title are renamed where they are listed;
 * - M4 (006): a viewer's tenant overview counts what the tenant's queue lists;
 * - M5 (004): the audit log's filters are never beside its title.
 *
 * Going back to an access release changes a tenant's access, so that is walked in a tenant of
 * its own, made by the instance's operator.
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = process.env.E2E_FERNHILL_TENANT ?? "fernhill";
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const OWNER = "maya.brooks@fernhill.example";
const VIEWER = "amara.okafor@fernhill.example";
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);
const SUPPLIERS = `suppliers_${stamp}`;
const INVOICES = `invoices_${stamp}`;
const VENDORS = `vendors_${stamp}`;
const PURCHASES = `purchases_${stamp}`;
const ROOT = `p23-${stamp}`;

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
type Answer = { status: number; body: any };
const call = (page: Page, method: string, path: string, body?: unknown): Promise<Answer> =>
  page.evaluate(
    async ([method, path, body]) => {
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

async function signedIn(browser: Browser, email: string, password = PASSWORD): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, email, password);
  return page;
}

test.describe.configure({ mode: "serial" });

let owner: Page;
let TID: string;
let W: string;
let L: string;
let invoice: string;
let purchase: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  owner = await signedIn(browser, OWNER);
  const tenants = await ok(owner, "GET", "/tenants?limit=200");
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const workspaces = (await ok(owner, "GET", `/tenants/${tenant.id}/workspaces`)).items;
  const sandbox = workspaces.find((one: { slug: string }) => one.slug === SANDBOX);
  test.skip(!sandbox, "Fernhill's sandbox workspace is needed.");
  TID = tenant.id;
  W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  L = `/t/${tenant.id}/workspaces/${sandbox.id}`;
  const table = (name: string, body: object) =>
    ok(owner, "PUT", `${W}/resources/${name}`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body,
    });
  await table(SUPPLIERS, { columns: { name: { type: "text", required: true } }, display: "name" });
  await table(INVOICES, {
    columns: {
      number: { type: "text", required: true },
      supplier: { type: "reference", references: SUPPLIERS },
      scan: { type: "file" },
    },
  });
  // More than the first 50, with the one to be found last.
  for (let start = 0; start < 60; start += 10) {
    await Promise.all(
      Array.from({ length: 10 }, (_, n) =>
        ok(owner, "POST", `${W}/rows/${SUPPLIERS}`, {
          name:
            start + n === 59 ? "Zephyr Linens" : `Supplier ${String(start + n).padStart(2, "0")}`,
        }),
      ),
    );
  }
  invoice = (await ok(owner, "POST", `${W}/rows/${INVOICES}`, { number: "INV-1" })).items[0].id;
  // More than the first 200, so that the one to be found is past what a page of rows holds.
  await table(VENDORS, { columns: { name: { type: "text", required: true } }, display: "name" });
  await table(PURCHASES, {
    columns: {
      number: { type: "text", required: true },
      vendor: { type: "reference", references: VENDORS },
    },
  });
  await ok(owner, "POST", `${W}/rows/${VENDORS}`, {
    rows: Array.from({ length: 230 }, (_, n) => ({
      name: `Vendor ${String(n + 1).padStart(3, "0")}`,
    })),
  });
  purchase = (await ok(owner, "POST", `${W}/rows/${PURCHASES}`, { number: "PO-1" })).items[0].id;
});

test.afterAll(async () => {
  // What the walk drafted and did not deploy.
  const drafts = await call(owner, "GET", `${W}/drafts`).catch(() => null);
  for (const one of drafts?.body?.items ?? []) {
    if (one.path.startsWith(ROOT)) await call(owner, "DELETE", `${W}/drafts/${one.path}`);
  }
  // A table is retired, not dropped, when its resource is removed: its rows are kept as the
  // platform keeps them, under names no one else uses.
  await owner.context().close();
});

/** What scrolls inside the work area, and whether the page does. */
const scrolling = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector("main") as HTMLElement;
    const scrollers = [...main.querySelectorAll<HTMLElement>("*")].filter((el) => {
      const y = getComputedStyle(el).overflowY;
      return (y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight + 1;
    });
    return {
      pageScrolls: main.scrollHeight > main.clientHeight + 1,
      sideways: document.documentElement.scrollWidth > innerWidth,
      scrollers: scrollers.length,
    };
  });

test("POLISH-004: a table's rows scroll in one place, with the header pinned, at 1440, 768 and 390 px", async () => {
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
  ] as const) {
    await owner.setViewportSize({ width, height });
    for (const view of ["rows", "definition"]) {
      await owner.goto(`${L}/tables/${VENDORS}?view=${view}`);
      await expect(owner.getByRole("heading", { level: 1 })).toBeVisible();
      const found = await scrolling(owner);
      expect(found.pageScrolls, `${view} at ${width}: the page scrolls`).toBe(false);
      expect(found.sideways, `${view} at ${width}: the page scrolls sideways`).toBe(false);
      expect(found.scrollers, `${view} at ${width}: scrollers`).toBeLessThanOrEqual(1);
    }
    // Scrolled to the last of its rows, the grid still shows its column headers.
    await owner.goto(`${L}/tables/${VENDORS}?view=rows`);
    const header = owner.getByRole("columnheader").first();
    await expect(header).toBeVisible();
    await owner.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>("main *")) {
        const y = getComputedStyle(el).overflowY;
        if ((y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight + 1) {
          el.scrollTop = el.scrollHeight;
        }
      }
    });
    await expect(header, `the header at ${width}`).toBeInViewport();
  }
  await owner.setViewportSize({ width: 1440, height: 900 });
});

test("POLISH-001: a supplier past the first 50 is found by typing, and chosen, and the picker says there are more", async () => {
  await owner.goto(`${L}/tables/${INVOICES}?row=${invoice}`);
  const panel = owner.getByRole("complementary", { name: "The chosen row" });
  const box = panel.getByRole("combobox");
  await box.click();
  // The server is asked for what is typed, not the page filtered where it is.
  const asked = owner.waitForRequest(
    (request) =>
      request.url().includes(`/rows/${SUPPLIERS}`) &&
      decodeURIComponent(request.url()).includes('"op":"contains"') &&
      decodeURIComponent(request.url()).includes("Zephyr"),
  );
  await box.fill("Zephyr");
  await asked;
  await owner.getByRole("option", { name: "Zephyr Linens" }).click();
  await panel.getByRole("button", { name: "Save row" }).click();
  await expect(owner.getByText("Row saved.")).toBeVisible();
  // Reopened, the chosen supplier shows by its name though it is past the first page.
  await owner.goto(`${L}/tables/${INVOICES}?row=${invoice}`);
  await expect(panel.getByRole("combobox")).toHaveValue("Zephyr Linens");
  await expect(panel.getByText(/Type to find more/)).toBeVisible();
});

test("POLISH-001: a vendor past the first 200 of 230 is chosen by typing its name", async () => {
  await owner.goto(`${L}/tables/${PURCHASES}?row=${purchase}`);
  const panel = owner.getByRole("complementary", { name: "The chosen row" });
  const box = panel.getByRole("combobox");
  await box.click();
  await box.fill("Vendor 228");
  await owner.getByRole("option", { name: "Vendor 228" }).click();
  await panel.getByRole("button", { name: "Save row" }).click();
  await expect(owner.getByText("Row saved.")).toBeVisible();
  const chosen = (
    await ok(
      owner,
      "GET",
      `${W}/rows/${VENDORS}?filter=${encodeURIComponent(
        JSON.stringify({ column: "name", value: "Vendor 228" }),
      )}&limit=1`,
    )
  ).items[0];
  expect((await ok(owner, "GET", `${W}/row/${purchase}/${PURCHASES}`)).vendor).toBe(chosen.id);
});

test("POLISH-010: a file is replaced and then removed from the inspector, after asking and saying the old one stays", async () => {
  await owner.goto(`${L}/tables/${INVOICES}?row=${invoice}`);
  const panel = owner.getByRole("complementary", { name: "The chosen row" });
  const first = await owner.evaluate(
    async ([path]) => {
      const response = await fetch(`/api/v1${path}/files?name=first.txt`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "first",
      });
      return (await response.json()).id as string;
    },
    [W] as const,
  );
  await ok(owner, "PATCH", `${W}/row/${invoice}/${INVOICES}`, { scan: first });
  await owner.reload();

  // Replace asks first, and says the old file is kept.
  await panel.getByLabel("New file for scan").setInputFiles({
    name: "second.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("second"),
  });
  const dialog = owner.getByRole("dialog").filter({ hasText: "Replace the file in scan" });
  await expect(dialog).toContainText("stays in this row's history");
  await dialog.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(owner.getByText("File replaced.")).toBeVisible();
  const replaced = await ok(owner, "GET", `${W}/row/${invoice}/${INVOICES}`);
  expect(replaced.scan).not.toBe(first);
  // The one it replaced is still stored.
  expect((await call(owner, "GET", `${W}/files/${first}`)).status).toBe(200);

  await panel.getByRole("button", { name: "Remove", exact: true }).click();
  const sure = owner.getByRole("dialog").filter({ hasText: "Remove the file from scan" });
  await expect(sure).toContainText("stays in this row's history");
  await sure.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(owner.getByText("File removed.")).toBeVisible();
  expect((await ok(owner, "GET", `${W}/row/${invoice}/${INVOICES}`)).scan).toBeNull();
  expect((await call(owner, "GET", `${W}/files/${replaced.scan}`)).status).toBe(200);
});

test("POLISH-003: a query is renamed where it is listed, and an app's title is changed with its address unchanged", async () => {
  test.setTimeout(180_000);
  const put = (path: string, kind: string, body: unknown) =>
    ok(owner, "PUT", `${W}/drafts/${path}`, { kind, schemaVersion: 1, body, create: true });
  const TITLE = `Orders ${ROOT}`;
  await put(`${ROOT}/query`, "query", { sql: "select 1" });
  await put(`screens/${ROOT}-app`, "interface", {
    title: TITLE,
    pages: [{ id: "main", title: TITLE, widgets: [] }],
  });
  await put(`${ROOT}-app`, "app", { title: TITLE, interface: `screens/${ROOT}-app` });
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [`${ROOT}/query`, `screens/${ROOT}-app`, `${ROOT}-app`],
    message: "Phase 23 walk",
  });

  // A query: "Name and path", beside Remove.
  await owner.goto(`${L}/queries?query=${ROOT}/query`);
  await owner.getByRole("button", { name: "Name and path" }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByLabel("Path").fill(`${ROOT}/query-renamed`);
  await dialog.getByRole("button", { name: "Save as a draft" }).click();
  await expect
    .poll(async () => (await call(owner, "GET", `${W}/drafts/${ROOT}/query-renamed`)).status)
    .toBe(200);

  // An app: Rename in the list of apps, which says the address stays.
  await owner.goto(`${L}/screens`);
  await owner
    .locator("tr, li, [data-row]")
    .filter({ hasText: TITLE })
    .getByRole("button", { name: "Rename" })
    .first()
    .click();
  const renaming = owner.getByRole("dialog");
  await expect(renaming).toContainText("address does not");
  await renaming.getByLabel("Name").fill(`Revenue ${ROOT}`);
  await renaming.getByRole("button", { name: "Save as a draft" }).click();
  await expect
    .poll(async () => (await call(owner, "GET", `${W}/drafts/${ROOT}-app`)).body?.body?.title)
    .toBe(`Revenue ${ROOT}`);
  // Same address: the draft is at the path the app has, and nothing was moved.
  const drafts = (await ok(owner, "GET", `${W}/drafts`)).items as { path: string }[];
  expect(drafts.some((one) => one.path === `${ROOT}-app`)).toBe(true);
  expect(drafts.some((one) => one.path.startsWith(`${ROOT}-app-`))).toBe(false);
});

test("POLISH-003: a doc writer deploys a docs site with its feedback table, and no other table", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const email = `docs-${stamp}@fernhill.example`;
  const roles = (await ok(owner, "GET", `/tenants/${TID}/roles`)).items as {
    id: string;
    name: string;
  }[];
  const writerRole = roles.find((one) => one.name === "doc_writer")?.id;
  test.skip(!writerRole, "The doc_writer role is needed.");
  const member = await ok(owner, "POST", `/tenants/${TID}/members`, {
    email,
    name: "Docs writer",
    password: PASSWORD,
  });
  await ok(owner, "POST", `/tenants/${TID}/bindings`, {
    principalType: "member",
    principalId: member.id,
    roleId: writerRole,
    workspaceId: W.split("/").pop(),
  });

  // A developer leaves a site, its pages and the table of its answers as drafts, and another table.
  const put = (path: string, kind: string, body: unknown) =>
    ok(owner, "PUT", `${W}/drafts/${path}`, { kind, schemaVersion: 1, body, create: true });
  const FEEDBACK = `${ROOT}-answers`;
  await put(FEEDBACK, "table", {
    columns: {
      page: { type: "text", required: true },
      helpful: { type: "boolean", required: true },
      version: { type: "text" },
      at: { type: "timestamp" },
    },
  });
  await put(`${ROOT}-notes/index`, "doc", {
    source: `---\ntitle: Notes ${ROOT}\n---\n\nWords.\n`,
  });
  await put(`${ROOT}-site`, "app", {
    title: `Notes ${ROOT}`,
    docs: `${ROOT}-notes`,
    feedback: { table: FEEDBACK },
  });
  await put(`${ROOT}-other`, "table", { columns: { note: { type: "text" } } });

  const writer = await signedIn(browser, email);
  try {
    // Another table is refused, as it has always been.
    const refused = await call(writer, "POST", `${W}/changes/deploy`, {
      paths: [`${ROOT}-other`],
      message: "Not theirs",
    });
    expect(refused.status).toBe(403);
    // The site with the table it names is deployed, in one deploy.
    const deployed = await call(writer, "POST", `${W}/changes/deploy`, {
      paths: [`${ROOT}-notes/index`, `${ROOT}-site`, FEEDBACK],
      message: "Phase 23 walk",
    });
    expect(deployed.status, JSON.stringify(deployed.body)).toBeLessThan(300);
    expect((await call(owner, "GET", `${W}/resources/${FEEDBACK}`)).status).toBe(200);
    // Only that table: the other is still a draft.
    expect((await call(owner, "GET", `${W}/resources/${ROOT}-other`)).status).toBe(404);
  } finally {
    await writer.context().close();
  }
});

test("POLISH-002: Release is one list of deploys, and goes back from a row of it", async () => {
  test.setTimeout(180_000);
  const bundles = (await ok(owner, "GET", `${W}/bundles`)).items as {
    id: string;
    active: boolean;
  }[];
  const running = bundles.find((one) => one.active)?.id as string;
  test.skip(bundles.length < 2, "A workspace with a second version is needed.");
  // In a dev workspace the versions are Release's second step, "Deploy to dev".
  await owner.goto(`${L}/release?step=deploy`);
  await expect(owner.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(owner.getByText("Bundles and rollback")).toHaveCount(0);
  await expect(owner.getByText(/^Versions of /)).toBeVisible();
  // A bundle never activated here is under the list, not in a second one.
  const ledger = (await ok(owner, "GET", `${W}/deployments`)).items as { bundleId: string }[];
  const ran = new Set(ledger.map((one) => one.bundleId));
  if (bundles.some((one) => !ran.has(one.id))) {
    await expect(owner.getByText("Not yet run here")).toBeVisible();
  }

  // POLISH-010: going back asks first, and names the workspace.
  await owner.getByRole("button", { name: "Activate this version" }).first().click();
  const dialog = owner.getByRole("dialog");
  await expect(dialog).toContainText(/Activate version \d+ in Sandbox\?/);
  await dialog.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(owner.getByText(/is what runs here now/)).toBeVisible();
  const now = (
    (await ok(owner, "GET", `${W}/bundles`)).items as { id: string; active: boolean }[]
  ).find((one) => one.active)?.id;
  expect(now).not.toBe(running);
  // What the sandbox ran before is what it runs again.
  await ok(owner, "POST", `${W}/deployments`, { bundleId: running });
});

test("POLISH-006: a viewer's tenant overview counts what the tenant's queue lists", async ({
  browser,
}) => {
  const viewer = await signedIn(browser, VIEWER);
  try {
    const summary = (await ok(viewer, "GET", `/tenants/${TID}/summary`)) as {
      approvalsWaiting: number;
      approvalsWaitingMine?: number;
    };
    test.skip(!summary.approvalsWaiting, "Nothing waits for a decision in this tenant.");
    const queue = (await ok(viewer, "GET", `/tenants/${TID}/approvals`)).items as unknown[];
    expect(summary.approvalsWaitingMine).toBe(queue.length);
    await viewer.goto(`/t/${TID}`);
    if (queue.length === 0) {
      // Nothing is the viewer's to decide: the overview says so, and offers no Decide.
      await expect(viewer.getByText(/waiting for someone else to decide/)).toBeVisible();
      await expect(viewer.getByRole("button", { name: "Decide" })).toHaveCount(0);
      await viewer.goto(`/t/${TID}/approvals?show=others`);
      await expect(viewer.getByRole("button", { name: "Approve" })).toHaveCount(0);
    } else {
      await expect(viewer.getByText(/waiting for you/).first()).toBeVisible();
    }
  } finally {
    await viewer.context().close();
  }
});

test("POLISH-004: the audit log's filters sit under its title, at 1440 and 390 px", async () => {
  for (const width of [1440, 390]) {
    await owner.setViewportSize({ width, height: 900 });
    await owner.goto(`/t/${TID}/audit`);
    const title = owner.getByRole("heading", { level: 1, name: "Audit log" });
    await expect(title).toBeVisible();
    const titleBox = await title.boundingBox();
    const header = owner.locator("main header").first();
    const controls = header.locator("select, input");
    expect(await controls.count(), "the filters are in the header").toBeGreaterThan(0);
    const tops = await controls.evaluateAll((all) =>
      all
        .filter((el) => (el as HTMLElement).getBoundingClientRect().width > 0)
        .map((el) => el.getBoundingClientRect().top),
    );
    const bottom = (titleBox?.y ?? 0) + (titleBox?.height ?? 0);
    for (const top of tops) expect(top, `a filter at ${width}px`).toBeGreaterThanOrEqual(bottom);
    expect(await overdraws(owner), `text over text at ${width}px`).toEqual([]);
  }
  await owner.setViewportSize({ width: 1440, height: 900 });
});

test("POLISH-010: going back to an access release lists what it removes, and is a danger confirm", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const admin = await signedIn(browser, ADMIN.email, ADMIN.password);
  try {
    const tenant = await ok(admin, "POST", "/tenants", {
      slug: `p23-${stamp}`,
      name: "Going back",
    });
    await ok(admin, "POST", `/tenants/${tenant.id}/access-grants`, {
      reason: "The phase 23 walk",
      roleId: TENANT_ADMIN,
    });
    const students = {
      kind: "end_user_group",
      key: "students",
      body: { title: "Students" },
    };
    const desk = {
      kind: "group",
      key: "tech-desk",
      body: {
        title: "Tech Desk",
        description: "Lends and repairs devices.",
        membership: { sso: { values: ["it-tech-desk"] } },
      },
    };
    const release = (resources: object[]) =>
      ok(admin, "POST", `/tenants/${tenant.id}/access/releases`, { resources });
    await release([students]);
    await release([students, desk]);
    const listed = async () =>
      (await ok(admin, "GET", `/tenants/${tenant.id}/access/releases`)).items as unknown[];
    expect(await listed()).toHaveLength(2);

    await admin.goto(`/t/${tenant.id}/releases`);
    // The oldest release is the last of the list.
    await admin.getByRole("button", { name: "Go back to this" }).last().click();
    const dialog = admin.getByRole("dialog");
    await expect(dialog).toContainText("These are removed");
    await expect(dialog).toContainText(/Tech Desk|tech-desk/);
    // Nothing is done until it is confirmed.
    await admin.keyboard.press("Escape");
    expect(await listed()).toHaveLength(2);

    await admin.getByRole("button", { name: "Go back to this" }).last().click();
    await admin.getByRole("dialog").getByRole("button", { name: "Go back", exact: true }).click();
    await expect.poll(async () => (await listed()).length).toBe(3);
  } finally {
    await admin.context().close();
  }
});
