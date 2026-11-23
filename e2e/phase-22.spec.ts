import { signInWithPassword } from "./sign-in.ts";
import { type Browser, expect, type Page, type Request, test } from "./test.ts";

/**
 * The exit criterion of phase 22, walked in a browser on the Fernhill example
 * (`examples/fernhill/setup/setup.mjs`), each step named for the POLISH rule it checks
 * (docs/polish):
 *
 * - the text sent is the text typed, whether by ⌘S pressed at once or by an autosave that a
 *   keystroke overtook (POLISH-012);
 * - "New script" and "Make an app" at a path that is taken are refused on the path field, and
 *   a create of a flow or a schedule there is refused by the server, and nothing is
 *   overwritten (POLISH-002, POLISH-010);
 * - a script, a flow, a query and a docs site can each be removed where it is listed, and the
 *   removal taken back before it is deployed (POLISH-003);
 * - as Fernhill's viewer, developer and practice owner, the overview's approvals count matches
 *   the queue "Decide" opens, and a viewer is offered no way to decide (POLISH-001, POLISH-006);
 * - a list that holds more than a page is searched and paged, not cut off (POLISH-001);
 * - a shorter retention period asks first (POLISH-010).
 *
 * It works in the sandbox workspace under paths of its own and removes what it made. The people,
 * the sixty locums and the workspaces come from the setup script.
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = process.env.E2E_FERNHILL_TENANT ?? "fernhill";
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const WORKSPACE = process.env.E2E_FERNHILL_WORKSPACE ?? "clinics";
const OWNER = "maya.brooks@fernhill.example";
const stamp = Date.now().toString(36);
/** Everything this walk makes is under this folder, and is removed at the end. */
const ROOT = `walk-${stamp}`;

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

/** The drafts a page sends to one path. */
const saves = (page: Page, at: string) => {
  const found: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes(`/drafts/${at}`)) {
      found.push(request);
    }
  });
  return found;
};

async function signedIn(browser: Browser, email: string, width = 1440): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  await signInWithPassword(page, email, PASSWORD);
  return page;
}

/** Whether a path has a draft that removes it, one that changes it, or none. */
async function draftOf(page: Page, W: string, path: string) {
  const drafts = await ok(page, "GET", `${W}/drafts`);
  const found = drafts.items.find((one: { path: string }) => one.path === path);
  return found ? (found.deleted ? "removed" : "changed") : "none";
}

/** Answers the dialog that is open. */
const say = (page: Page, action: string) =>
  page.getByRole("dialog").getByRole("button", { name: action, exact: true }).click();

test.describe.configure({ mode: "serial" });

let owner: Page;
let tenant: { id: string };
let sandbox: { id: string };
let clinics: { id: string };
let W: string;
let L: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  owner = await signedIn(browser, OWNER);
  const tenants = await ok(owner, "GET", "/tenants?limit=200");
  tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const workspaces = (await ok(owner, "GET", `/tenants/${tenant.id}/workspaces`)).items;
  sandbox = workspaces.find((one: { slug: string }) => one.slug === SANDBOX);
  clinics = workspaces.find((one: { slug: string }) => one.slug === WORKSPACE);
  test.skip(!sandbox || !clinics, "Fernhill's sandbox and clinics workspaces are needed.");
  W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  L = `/t/${tenant.id}/workspaces/${sandbox.id}`;
});

test.afterAll(async () => {
  // What the walk made: drafts dropped, deployed removals are already deployed.
  const drafts = await call(owner, "GET", `${W}/drafts`).catch(() => null);
  for (const one of drafts?.body?.items ?? []) {
    if (one.path.startsWith(ROOT)) await call(owner, "DELETE", `${W}/drafts/${one.path}`);
  }
  await owner.context().close();
});

test("POLISH-012: ⌘S right after typing in the script editor sends what was typed", async () => {
  test.setTimeout(120_000);
  const path = `${ROOT}/saving`;
  const puts = saves(owner, path);
  await owner.goto(`${L}/scripts/new`);
  const editor = owner.locator(".monaco-editor").first();
  await editor.getByText("z.object").first().waitFor();
  await owner.getByLabel("Path").fill(path);
  await editor.locator(".view-lines").click();
  await owner.keyboard.press("Control+End");
  await owner.keyboard.type("//first");
  await owner.keyboard.press("Control+s");
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.postDataJSON().body.source.code).toContain("//first");
  // A new script's first save is a create.
  expect(puts[0]?.postDataJSON().create).toBe(true);
  await expect(owner).toHaveURL(new RegExp(`/scripts/edit/${path}$`));
  await expect(owner.getByText("Unsaved changes")).toHaveCount(0, { timeout: 15_000 });

  await editor.locator(".view-lines").click();
  await owner.keyboard.press("Control+End");
  await owner.keyboard.type("//second");
  await owner.keyboard.press("Control+s");
  await expect.poll(() => puts.length).toBe(2);
  expect(puts[1]?.postDataJSON().body.source.code).toContain("//second");
});

test("POLISH-012: what is typed while a save is on its way is saved after it, on the newer revision", async () => {
  test.setTimeout(120_000);
  const path = `${ROOT}/saving`;
  const puts = saves(owner, path);
  await owner.goto(`${L}/scripts/edit/${path}`);
  const editor = owner.locator(".monaco-editor").first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  let held = false;
  await owner.route(`**/drafts/${path}`, async (route) => {
    if (route.request().method() === "PUT" && !held) {
      held = true;
      await new Promise((done) => setTimeout(done, 2000));
    }
    await route.continue();
  });
  await editor.locator(".view-lines").click();
  await owner.keyboard.press("Control+End");
  await owner.keyboard.type("//third");
  await owner.keyboard.press("Control+s");
  await expect.poll(() => puts.length).toBe(1);
  await owner.keyboard.type("//fourth");
  await expect.poll(() => puts.length, { timeout: 20_000 }).toBe(2);
  await owner.unrouteAll({ behavior: "wait" });
  expect(puts[1]?.postDataJSON().body.source.code).toContain("//third//fourth");
  expect(puts[1]?.postDataJSON().revision).toBeGreaterThan(puts[0]?.postDataJSON().revision);
  await expect(owner.getByText("Unsaved changes")).toHaveCount(0, { timeout: 15_000 });
  const stored = await ok(owner, "GET", `${W}/drafts/${path}`);
  expect(stored.body.source.code).toContain("//third//fourth");
});

test("POLISH-002: a new script at a path that is taken is refused on the path field and overwrites nothing", async () => {
  test.setTimeout(120_000);
  const taken = (await ok(owner, "GET", `${W}/resources?kind=script&limit=200`)).items[0]?.path;
  test.skip(!taken, "The sandbox has no deployed script.");
  const before = await ok(owner, "GET", `${W}/resources/${taken}`);
  await owner.goto(`${L}/scripts/new`);
  const editor = owner.locator(".monaco-editor").first();
  await editor.getByText("z.object").first().waitFor();
  await owner.getByLabel("Path").fill(taken);
  await editor.locator(".view-lines").click();
  await owner.keyboard.press("Control+End");
  await owner.keyboard.type("//must not land");
  await owner.keyboard.press("Control+s");
  await expect(owner.getByText("Something already exists at this path.")).toBeVisible();
  // Still the new-script screen, with what was typed.
  await expect(owner).toHaveURL(/\/scripts\/new$/);
  const after = await ok(owner, "GET", `${W}/resources/${taken}`);
  expect(after.revision).toBe(before.revision);
  await expect.poll(() => draftOf(owner, W, taken)).toBe("none");
});

test("POLISH-002: Make an app with the name of the Fernhill handbook is refused on the address", async () => {
  const handbook = await call(owner, "GET", `${W}/resources/handbook`);
  test.skip(handbook.status !== 200, "The sandbox has no handbook app.");
  await owner.goto(`${L}/screens`);
  await owner.getByRole("button", { name: "Make an app" }).first().click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByLabel("Name").fill("handbook");
  await expect(dialog.getByLabel("Address")).toHaveValue("handbook");
  await dialog.getByRole("button", { name: "Make the app" }).click();
  await expect(dialog.getByText("Something already exists at this path.")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveValue("handbook");
  expect((await ok(owner, "GET", `${W}/resources/handbook`)).revision).toBe(handbook.body.revision);
});

test("POLISH-010: a create of a flow or a schedule at a taken path is refused by the server, and A1-03's schedule is unchanged", async () => {
  for (const path of ["inventory/half-hourly", "appointments/after-visit"]) {
    const there = await call(owner, "GET", `${W}/resources/${path}`);
    test.skip(there.status !== 200, `${path} is not deployed in the sandbox.`);
    const refused = await call(owner, "PUT", `${W}/drafts/${path}`, {
      kind: there.body.kind,
      schemaVersion: there.body.schemaVersion ?? 1,
      body: there.body.body,
      create: true,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code ?? refused.body.error?.code ?? JSON.stringify(refused.body)).toMatch(
      /path_taken/,
    );
    await expect.poll(() => draftOf(owner, W, path)).toBe("none");
  }
});

test("POLISH-003: a script, a flow, a query and a docs site are removed, taken back, removed and deployed", async () => {
  test.setTimeout(240_000);
  const put = (path: string, kind: string, body: unknown) =>
    ok(owner, "PUT", `${W}/drafts/${path}`, { kind, schemaVersion: 1, body, create: true });
  await put(`${ROOT}/script`, "script", {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code: "export default async () => ({});\n" },
  });
  await put(`${ROOT}/flow`, "flow", {
    nodes: { start: { type: "trigger", trigger: { type: "manual" } } },
    edges: [],
  });
  await put(`${ROOT}/query`, "query", { sql: "select 1" });
  // Its own title, so a site left by an earlier walk is not the one found.
  await put(`${ROOT}-notes/index`, "doc", { source: `---\ntitle: Notes ${ROOT}\n---\n\nWords.\n` });
  await put(`${ROOT}-site`, "app", { title: `Notes ${ROOT}`, docs: `${ROOT}-notes` });
  const deploy = (paths: string[]) =>
    ok(owner, "POST", `${W}/changes/deploy`, { paths, message: "Phase 22 walk" });
  await deploy([
    `${ROOT}/script`,
    `${ROOT}/flow`,
    `${ROOT}/query`,
    `${ROOT}-notes/index`,
    `${ROOT}-site`,
  ]);

  // A script: removed from its editor, the draft dropped, removed again.
  await owner.goto(`${L}/scripts/edit/${ROOT}/script`);
  await owner.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(owner.getByRole("dialog")).toContainText(
    "Nothing changes until that draft is deployed",
  );
  await say(owner, "Remove");
  await expect(owner).toHaveURL(/\/changes$/);
  await expect.poll(() => draftOf(owner, W, `${ROOT}/script`)).toBe("removed");
  await ok(owner, "DELETE", `${W}/drafts/${ROOT}/script`);
  await expect.poll(() => draftOf(owner, W, `${ROOT}/script`)).toBe("none");
  await owner.goto(`${L}/scripts/edit/${ROOT}/script`);
  await owner.getByRole("button", { name: "Remove", exact: true }).click();
  await say(owner, "Remove");
  await expect(owner).toHaveURL(/\/changes$/);

  // A flow: removed, kept, removed again.
  await owner.goto(`${L}/flows?item=${ROOT}/flow`);
  await owner.getByRole("button", { name: "Remove", exact: true }).click();
  await say(owner, "Remove");
  await expect(owner.getByRole("button", { name: "Keep this flow" })).toBeVisible();
  await owner.getByRole("button", { name: "Keep this flow" }).click();
  await say(owner, "Keep");
  await expect.poll(() => draftOf(owner, W, `${ROOT}/flow`)).toBe("none");
  await owner.getByRole("button", { name: "Remove", exact: true }).click();
  await say(owner, "Remove");
  await expect(owner.getByRole("button", { name: "Keep this flow" })).toBeVisible();

  // A query: the same.
  await owner.goto(`${L}/queries?query=${ROOT}/query`);
  await owner.getByRole("button", { name: "Remove", exact: true }).click();
  await say(owner, "Remove");
  await expect(owner.getByRole("button", { name: "Keep this query" })).toBeVisible();
  await owner.getByRole("button", { name: "Keep this query" }).click();
  await say(owner, "Keep");
  await expect.poll(() => draftOf(owner, W, `${ROOT}/query`)).toBe("none");
  await owner.getByRole("button", { name: "Remove", exact: true }).click();
  await say(owner, "Remove");
  await expect(owner.getByRole("button", { name: "Keep this query" })).toBeVisible();

  // A docs site: switched off and on, keeping its pages and its app; removing its app says so first.
  await owner.goto(`${L}/docs`);
  await owner
    .getByRole("button", { name: `More for Notes ${ROOT}`, exact: true })
    .first()
    .click();
  await owner.getByRole("menuitem", { name: /Stop publishing/ }).click();
  await expect(owner.getByRole("dialog")).toContainText("Its pages and its app are kept");
  await say(owner, "Stop publishing");
  await owner
    .getByRole("button", { name: `More for Notes ${ROOT}`, exact: true })
    .first()
    .click();
  await owner.getByRole("menuitem", { name: /Publish again/ }).click();
  await say(owner, "Publish again");
  await owner
    .getByRole("button", { name: `More for Notes ${ROOT}`, exact: true })
    .first()
    .click();
  await owner.getByRole("menuitem", { name: /Remove the site's app/ }).click();
  await expect(owner.getByRole("dialog")).toContainText("The site stops being served");
  await say(owner, "Remove");
  await expect.poll(() => draftOf(owner, W, `${ROOT}-site`)).toBe("removed");

  // The removals are deployed.
  await deploy([`${ROOT}/script`, `${ROOT}/flow`, `${ROOT}/query`, `${ROOT}-site`]);
  const paths = (await ok(owner, "GET", `${W}/resources?limit=500`)).items.map(
    (one: { path: string }) => one.path,
  );
  for (const gone of [`${ROOT}/script`, `${ROOT}/flow`, `${ROOT}/query`, `${ROOT}-site`]) {
    expect(paths).not.toContain(gone);
  }
  expect(paths).toContain(`${ROOT}-notes/index`);
  await call(owner, "DELETE", `${W}/drafts/${ROOT}-notes/index`);
});

for (const person of [
  { email: "amara.okafor@fernhill.example", who: "the viewer", decides: false },
  { email: "devi.shah@fernhill.example", who: "the developer", decides: false },
  { email: OWNER, who: "the practice owner", decides: true },
]) {
  test(`POLISH-001: as ${person.who}, the overview's approvals count is the queue Decide opens`, async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const page = await signedIn(browser, person.email);
    const base = `/tenants/${tenant.id}/workspaces/${clinics.id}`;
    const summary = await ok(page, "GET", `${base}/summary`);
    test.skip(!summary.approvalsWaiting, "Nothing waits for a decision in Clinics.");
    const mine = (await ok(page, "GET", `${base}/approvals?mine=true`)).items.length;
    expect(summary.approvalsWaitingMine).toBe(mine);
    if (!person.decides) expect(mine).toBe(0);

    await page.goto(`/t/${tenant.id}/workspaces/${clinics.id}/overview`);
    if (mine > 0) {
      await expect(page.getByText("waiting for you").first()).toBeVisible();
      await page.getByRole("button", { name: "Decide" }).click();
      await expect(page).toHaveURL(new RegExp(`/workspaces/${clinics.id}/approvals`));
      await expect(page.getByRole("radio", { name: /Waiting for you/ })).toContainText(
        String(mine),
      );
    } else {
      await expect(page.getByText("waiting for someone else to decide")).toBeVisible();
      await expect(page.getByRole("button", { name: "Decide" })).toHaveCount(0);
      await page.getByRole("button", { name: "See who" }).click();
      await expect(page).toHaveURL(/show=others/);
      // POLISH-006: said before they try, so no button that would be refused.
      await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    }
    await page.context().close();
  });
}

test("POLISH-001: the 60 locums are past the first page of members, and are found by searching and by loading more", async () => {
  test.setTimeout(120_000);
  const last = "locum.60@fernhill.example";
  await owner.goto(`/t/${tenant.id}/members`);
  const search = owner.getByRole("textbox", { name: /Search by email or name/ });
  await search.fill(last);
  await expect(owner.getByRole("gridcell", { name: last }).first()).toBeVisible({
    timeout: 30_000,
  });
  await search.fill("");
  const more = owner.getByRole("button", { name: "Load more" });
  for (let pages = 0; pages < 5 && (await more.isVisible().catch(() => false)); pages++) {
    await more.click();
    await expect(more).toBeEnabled({ timeout: 30_000 });
  }
  await expect(owner.getByRole("gridcell", { name: last }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("POLISH-010: a shorter retention period asks first, naming its old and new days, and a longer one does not", async () => {
  test.setTimeout(120_000);
  const retention = await ok(owner, "GET", `/tenants/${tenant.id}/retention`);
  const now: number = retention.effective.runsDays;
  const { min, max } = retention.bounds.runsDays;
  test.skip(now - 1 < min || now + 1 > max, "Runs' retention has no room to move by a day.");
  await owner.goto(`/t/${tenant.id}/retention`);
  const field = owner.getByLabel("Runs (days)");
  await field.fill(String(now - 1));
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner.getByRole("dialog")).toContainText("Keep runs for less time?");
  await expect(owner.getByRole("dialog")).toContainText(`from ${now} days`);
  await owner.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  // Nothing was saved, and a longer period saves with no question.
  expect((await ok(owner, "GET", `/tenants/${tenant.id}/retention`)).effective).toEqual(
    retention.effective,
  );
  await field.fill(String(now + 1));
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner.getByText("Retention saved.")).toBeVisible();
  await expect(owner.getByRole("dialog")).toHaveCount(0);
  // Put back what Fernhill had: its own number, or none.
  await ok(owner, "PUT", `/tenants/${tenant.id}/retention`, { runsDays: retention.runsDays });
});
