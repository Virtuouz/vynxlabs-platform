import { signInAs } from "./as.ts";
import { type Browser, expect, type Page, test } from "./test.ts";

/**
 * Phase 24, walked in a browser on the Fernhill example (`examples/fernhill/setup/setup.mjs`),
 * in its sandbox workspace and under names of its own. Each test is titled with the item of
 * docs/phases/phase-24-follow-through.md it checks.
 *
 * It walks the phase's exit criterion (docs/phases/phase-24-follow-through.md), each test titled
 * with the POLISH rule (docs/polish/polish-prevention-rules.md) it checks:
 *
 * - M1 (003, 010): a query used by a console dashboard is renamed, the dialog lists the dashboard,
 *   it is drafted with the new path, and runs once deployed; a widget whose path was not updated
 *   still runs;
 * - M2 (002, 003): two sites with feedback share one `docs-feedback` table; a doc writer turns it
 *   on for a site by themselves;
 * - M4 (004, 005): a data source's page has one scroller (when E2E_SOURCE_URL names a Postgres);
 * - M4 (002, 013): a reference is shown by name in the grid when its table names no display column.
 *
 * Not walked here, and why:
 * - a widget running through its recorded key after the old path's alias has expired: the alias
 *   lasts 90 days and a browser has no way to age it, so only the control plane's test
 *   (apps/control-plane/src/dashboard-follow.test.ts) expires it. Here the alias answers, and
 *   its listing is checked;
 * - a repository dashboard's "change it in the repository" notice, for the same reason, and
 *   because Fernhill's repository has no dashboard over a query;
 * - a file replaced by a worker script is kept until retention ends: a kernel test of
 *   `updateRowKeepingFiles` covers it, since retention is days long.
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = process.env.E2E_FERNHILL_TENANT ?? "fernhill";
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const OWNER = "maya.brooks@fernhill.example";
const stamp = Date.now().toString(36);
const ROOT = `p24-${stamp}`;
const TABLE = "docs-feedback";

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

async function signedIn(browser: Browser, email: string, password = PASSWORD): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInAs(page, email, password);
  return page;
}

test.describe.configure({ mode: "serial" });

let owner: Page;
let TID: string;
let W: string;
let L: string;

/** A folder of one page and the site that serves it, deployed, so that the site is listed. */
async function site(name: string) {
  const put = (path: string, kind: string, body: unknown) =>
    ok(owner, "PUT", `${W}/drafts/${path}`, { kind, schemaVersion: 1, body, create: true });
  await put(`${ROOT}-${name}/index`, "doc", {
    source: `---\ntitle: Notes ${name} ${ROOT}\n---\n\nWords.\n`,
  });
  await put(`${ROOT}-${name}-site`, "app", {
    title: `Notes ${name} ${ROOT}`,
    docs: `${ROOT}-${name}`,
  });
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [`${ROOT}-${name}/index`, `${ROOT}-${name}-site`],
    message: `Phase 24 walk: ${name}`,
  });
}

/** Opens the site's menu in the Documentation section and chooses to turn page feedback on. */
async function openFeedback(page: Page, name: string) {
  await page.goto(`${L}/docs`);
  await page
    .getByRole("button", { name: `More for Notes ${name} ${ROOT}`, exact: true })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Turn on page feedback/ }).click();
  return page.getByRole("dialog");
}

const draftPaths = async (page: Page) =>
  ((await ok(page, "GET", `${W}/drafts`)).items as { path: string }[]).map((one) => one.path);

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
  await site("a");
  await site("b");
  await site("c");
});

test.afterAll(async () => {
  // What the walk drafted and did not deploy.
  for (const path of await draftPaths(owner).catch(() => [] as string[])) {
    if (path.startsWith(ROOT)) await call(owner, "DELETE", `${W}/drafts/${path}`);
  }
  await owner.context().close();
});

test("POLISH-002: two sites turn page feedback on, and the workspace has one table for both @fernhill @docs", async () => {
  test.setTimeout(180_000);
  const had = (await call(owner, "GET", `${W}/resources/${TABLE}`)).status === 200;
  // The first says what it makes, or that the table is there already.
  const first = await openFeedback(owner, "a");
  await expect(first).toContainText(had ? "already keeps the answers" : "A table, docs-feedback");
  await first
    .getByRole("button", { name: had ? "Turn it on" : "Make the table and turn it on" })
    .click();
  await expect
    .poll(async () => (await call(owner, "GET", `${W}/drafts/${ROOT}-a-site`)).body?.body?.feedback)
    .toEqual({ table: TABLE });
  // The second finds the table the first drafted, and only changes its site.
  const second = await openFeedback(owner, "b");
  await expect(second).toContainText("already keeps the answers");
  await expect(second).toContainText("only the site changes");
  await second.getByRole("button", { name: "Turn it on" }).click();
  await expect
    .poll(async () => (await call(owner, "GET", `${W}/drafts/${ROOT}-b-site`)).body?.body?.feedback)
    .toEqual({ table: TABLE });
  // One table, and no table of either site's own.
  const drafts = await draftPaths(owner);
  expect(drafts.filter((path) => path.endsWith("-feedback"))).toEqual(had ? [] : [TABLE]);
  expect(
    drafts.some((path) => path.startsWith(`${ROOT}-`) && path.endsWith("-site-feedback")),
  ).toBe(false);
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [`${ROOT}-a-site`, `${ROOT}-b-site`, ...(had ? [] : [TABLE])],
    message: "Phase 24 walk: two sites, one table",
  });
  expect((await call(owner, "GET", `${W}/resources/${TABLE}`)).status).toBe(200);
});

test("POLISH-003: a doc writer turns page feedback on for a site by themselves @fernhill @docs", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const email = `docs24-${stamp}@fernhill.example`;
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
  const writer = await signedIn(browser, email);
  try {
    // The table is there now, so only the site changes; whatever it needs, they may draft and deploy.
    const dialog = await openFeedback(writer, "c");
    await expect(dialog).toContainText("already keeps the answers");
    await dialog.getByRole("button", { name: "Turn it on" }).click();
    await expect
      .poll(
        async () => (await call(writer, "GET", `${W}/drafts/${ROOT}-c-site`)).body?.body?.feedback,
      )
      .toEqual({ table: TABLE });
    // They may draft the table itself, as the console makes it, and no other.
    const columns = {
      site_key: { type: "text", required: true },
      site: { type: "text" },
      page: { type: "text", required: true },
      helpful: { type: "boolean", required: true },
      version: { type: "text" },
      at: { type: "timestamp" },
    };
    const draft = (path: string, body: unknown) =>
      call(writer, "PUT", `${W}/drafts/${path}`, { kind: "table", schemaVersion: 1, body });
    expect((await draft(`${ROOT}-other`, { columns: { note: { type: "text" } } })).status).toBe(
      403,
    );
    expect((await draft(TABLE, { columns: { ...columns, who: { type: "text" } } })).status).toBe(
      403,
    );
    expect((await draft(TABLE, { columns })).status).toBeLessThan(300);
    const deployed = await call(writer, "POST", `${W}/changes/deploy`, {
      paths: [`${ROOT}-c-site`, TABLE],
      message: "Phase 24 walk: a doc writer",
    });
    expect(deployed.status, JSON.stringify(deployed.body)).toBeLessThan(300);
    expect((await call(owner, "GET", `${W}/resources/${ROOT}-c-site`)).body.body.feedback).toEqual({
      table: TABLE,
    });
  } finally {
    await writer.context().close();
  }
});

/** Counts what scrolls inside the console's main area, and whether the page itself does. */
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

test("POLISH-003: a query used by a console dashboard is renamed, and the dashboard is drafted and still runs @fernhill @docs", async () => {
  test.setTimeout(180_000);
  const query = `${ROOT}/count`;
  const renamed = `${ROOT}/tally`;
  const board = `${ROOT}/board`;
  const put = (path: string, kind: string, body: unknown) =>
    ok(owner, "PUT", `${W}/drafts/${path}`, {
      kind,
      // A dashboard is at schema version 3, since it is a page of widgets (phase 25).
      schemaVersion: kind === "dashboard" ? 3 : 1,
      body,
      create: true,
    });
  const tableOver = (path: string) => ({
    id: "n",
    type: "core/table",
    at: { x: 0, y: 0, w: 6, h: 6 },
    data: { rows: { source: { query: path } } },
  });
  await put(query, "query", { sql: "select 1 as n" });
  await put(board, "dashboard", { title: `Counts ${ROOT}`, widgets: [tableOver(query)] });
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [query, board],
    message: "Phase 24 walk: a query and a dashboard over it",
  });
  const boardId = (await ok(owner, "GET", `${W}/resources/${board}`)).id as string;

  // The dialog names the dashboard before anything is saved.
  await owner.goto(`${L}/queries?query=${query}`);
  await owner.getByRole("button", { name: "Name and path" }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByLabel("Path").fill(renamed);
  await expect(dialog.getByTestId("naming")).toContainText(`Counts ${ROOT}`);
  await expect(dialog.getByTestId("naming")).toContainText("saved as a draft with the new path");
  await dialog.getByRole("button", { name: "Save as a draft" }).click();

  // The dashboard is a draft with the new path, and what is deployed is as it was.
  await expect
    .poll(async () => (await call(owner, "GET", `${W}/drafts/${renamed}`)).status)
    .toBe(200);
  await expect
    .poll(
      async () =>
        (await call(owner, "GET", `${W}/drafts/${board}`)).body?.body?.widgets?.[0]?.data?.rows
          ?.source?.query,
    )
    .toBe(renamed);
  expect(
    (await ok(owner, "GET", `${W}/resources/${board}`)).body.widgets[0].data.rows.source.query,
  ).toBe(query);

  // Deployed together, the widget names the new path and runs.
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [renamed, board],
    message: "Phase 24 walk: the rename",
  });
  const widgetData = (id: string) =>
    call(owner, "GET", `${W}/widget-data?of=dashboard&path=${id}&widget=n`);
  const shown = await widgetData(boardId);
  expect(shown.status, JSON.stringify(shown.body)).toBe(200);
  expect(shown.body.inputs.rows.rows).toEqual([{ n: 1 }]);

  // A widget whose path was not updated: the query is renamed and deployed alone.
  const other = `${ROOT}/other`;
  const stale = `${ROOT}/stale`;
  await put(other, "query", { sql: "select 2 as n" });
  await put(stale, "dashboard", { title: `Stale ${ROOT}`, widgets: [tableOver(other)] });
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [other, stale],
    message: "Phase 24 walk: a dashboard to leave alone",
  });
  const staleId = (await ok(owner, "GET", `${W}/resources/${stale}`)).id as string;
  await ok(owner, "PUT", `${W}/drafts/${other}`, {
    kind: "query",
    schemaVersion: 1,
    body: { sql: "select 2 as n" },
    path: `${ROOT}/other-renamed`,
  });
  // Set the dashboard's draft aside, so that the deploy leaves its widget naming the old path.
  await ok(owner, "DELETE", `${W}/drafts/${stale}`);
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [`${ROOT}/other-renamed`],
    message: "Phase 24 walk: a rename the dashboard did not follow",
  });
  const still = await widgetData(staleId);
  expect(still.status, JSON.stringify(still.body)).toBe(200);
  expect(still.body.inputs.rows.rows).toEqual([{ n: 2 }]);
  // The old path still answers, through its alias, for 90 days. Its expiry is not reachable from
  // a browser, so the key that takes over then is covered by dashboard-follow.test.ts.
  const aliases = (await ok(owner, "GET", `${W}/aliases`)).items as {
    path: string;
    now: string;
    expiresAt: string;
  }[];
  const alias = aliases.find((one) => one.path === other);
  expect(alias?.now).toBe(`${ROOT}/other-renamed`);
  expect(Date.parse(alias?.expiresAt ?? "")).toBeGreaterThan(Date.now());
});

test("POLISH-004: a data source's page is one scroller at desktop and phone widths @fernhill @docs", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  test.skip(
    !process.env.E2E_SOURCE_URL,
    "A data source is somebody else's database: set E2E_SOURCE_URL to a Postgres to read.",
  );
  const url = new URL(process.env.E2E_SOURCE_URL as string);
  const name = `src-${ROOT}`;
  await ok(owner, "PUT", `${W}/drafts/${name}`, {
    kind: "data_source",
    schemaVersion: 1,
    create: true,
    body: { connector: "postgres" },
  });
  await ok(owner, "PUT", `${W}/data-source-bindings/${name}`, {
    config: {
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.slice(1),
      user: decodeURIComponent(url.username),
    },
    password: decodeURIComponent(url.password),
  });
  expect(await ok(owner, "GET", `${W}/data-source-tables/${name}`)).toBeTruthy();
  for (const width of [1440, 390]) {
    const page = await (
      await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } })
    ).newPage();
    try {
      await signInAs(page, OWNER);
      await page.goto(`${L}/sources/${name}`);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      const found = await scrolling(page);
      expect(found.pageScrolls, `at ${width}: the page scrolls`).toBe(false);
      expect(found.sideways, `at ${width}: the page scrolls sideways`).toBe(false);
      // The list of tables scrolls on its own beside the rows, so it may be the second.
      expect(found.scrollers, `at ${width}: scrollers`).toBeLessThanOrEqual(2);
    } finally {
      await page.context().close();
    }
  }
});

test("POLISH-002: a reference to a table with no display column is shown by name in the grid @fernhill @docs", async () => {
  test.setTimeout(120_000);
  const PEOPLE = `people_${stamp}`;
  const VISITS = `visits_${stamp}`;
  const table = (name: string, body: unknown) =>
    ok(owner, "PUT", `${W}/resources/${name}`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body,
    });
  // No `display`: the server names a row by `name`, else `title`, else its first text column.
  await table(PEOPLE, { columns: { name: { type: "text", required: true } } });
  await table(VISITS, {
    columns: {
      reason: { type: "text", required: true },
      person: { type: "reference", references: PEOPLE },
    },
  });
  const person = (await ok(owner, "POST", `${W}/rows/${PEOPLE}`, { name: "Ada Lovelace" })).items[0]
    .id as string;
  await ok(owner, "POST", `${W}/rows/${VISITS}`, { reason: "Checkup", person });
  const asked = await ok(owner, "GET", `${W}/rows/${VISITS}?expand=person`);
  expect(asked.expanded).toEqual({ person: { [person]: "Ada Lovelace" } });
  await owner.goto(`${L}/tables/${VISITS}`);
  await expect(owner.getByText("Ada Lovelace").first()).toBeVisible();
  await expect(owner.getByText(person)).toHaveCount(0);
});
