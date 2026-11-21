import { signInWithPassword } from "./sign-in.ts";
import { type Browser, expect, type Page, test } from "./test.ts";

/**
 * Phase 24, walked in a browser on the Fernhill example (`examples/fernhill/setup/setup.mjs`),
 * in its sandbox workspace and under names of its own. Each test is titled with the item of
 * docs/phases/phase-24-follow-through.md it checks.
 *
 * - M2 (decision 3): two sites turn page feedback on and share one table, `docs-feedback`; a doc
 *   writer turns it on for a site by themselves.
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

test("M2: two sites turn page feedback on, and the workspace has one table for both", async () => {
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

test("M2: a doc writer turns page feedback on for a site by themselves", async ({ browser }) => {
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
