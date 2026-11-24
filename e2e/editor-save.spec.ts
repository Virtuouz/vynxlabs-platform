import { signInAs } from "./as.ts";
import { expect, type Page, type Request, test } from "./test.ts";

/**
 * One way for an editor to save (phase 22, M2), in a browser. ⌘S right after typing saves
 * what was just typed, not what was there a render before, and what is typed while a save is
 * on its way is saved after it, on the revision the first one made. The docs editor and the
 * script editor are the two that are walked here.
 */

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

const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const saves = (page: Page, at: string) => {
  const found: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes(`/drafts/${at}`)) {
      found.push(request);
    }
  });
  return found;
};

let page: Page;
let tenant: string;
let dev: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  await signInAs(page, "operator");
  const made = await call(page, "POST", "/tenants", {
    slug: `save-${stamp}`,
    name: "Saving",
  });
  await call(page, "POST", `/tenants/${made.id}/access-grants`, {
    reason: "The editors' saving e2e test",
    roleId: TENANT_ADMIN,
  });
  const workspace = await call(page, "POST", `/tenants/${made.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  tenant = made.id;
  dev = workspace.id;
});

test.afterAll(async () => {
  await page.context().close();
});

test("in the docs editor, ⌘S right after typing saves what was typed, and typing during a save is saved after it @builder", async () => {
  test.setTimeout(120_000);
  const W = `/tenants/${tenant}/workspaces/${dev}`;
  const source = (words: string) => `---\ntitle: Notes\n---\n\n${words}\n`;
  await call(page, "PUT", `${W}/drafts/handbook/notes`, {
    kind: "doc",
    schemaVersion: 1,
    body: { source: source("First.") },
  });
  const puts = saves(page, "handbook/notes");
  await page.goto(`/t/${tenant}/workspaces/${dev}/docs/edit/handbook/notes`);
  const editor = page.locator(".monaco-editor").first();
  await expect(editor).toBeVisible({ timeout: 30_000 });

  // Typed, and the key pressed at once: no pause for the screen to catch up.
  await editor.locator(".view-lines").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Typed just now.");
  await page.keyboard.press("Control+s");
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.postDataJSON().body.source).toContain("Typed just now.");
  await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 15_000 });

  // With the save held for two seconds, what is typed meanwhile is saved after it.
  let held = false;
  await page.route(`**/drafts/handbook/notes`, async (route) => {
    if (route.request().method() === "PUT" && !held) {
      held = true;
      await new Promise((done) => setTimeout(done, 2000));
    }
    await route.continue();
  });
  await page.keyboard.type(" Before.");
  await page.keyboard.press("Control+s");
  await expect.poll(() => puts.length).toBe(2);
  await page.keyboard.type(" During.");
  await expect.poll(() => puts.length, { timeout: 20_000 }).toBe(3);
  await page.unrouteAll({ behavior: "wait" });
  const last = puts[2]?.postDataJSON();
  expect(last.body.source).toContain("Before. During.");
  // The second goes on the revision the first one made.
  expect(last.revision).toBeGreaterThan(puts[1]?.postDataJSON().revision);
  await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 15_000 });
  const stored = await call(page, "GET", `${W}/docs/page/handbook/notes`);
  expect(stored.source).toContain("Before. During.");
});

test("in the script editor, ⌘S right after typing saves what was typed, and typing during a save is saved after it @builder", async () => {
  test.setTimeout(120_000);
  const W = `/tenants/${tenant}/workspaces/${dev}`;
  const puts = saves(page, "hello/saving");
  await page.goto(`/t/${tenant}/workspaces/${dev}/scripts/new`);
  const editor = page.locator(".monaco-editor").first();
  await editor.getByText("z.object").first().waitFor();
  await page.getByLabel("Path").fill("hello/saving");
  // A new script is saved by its first ⌘S.
  await editor.locator(".view-lines").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("//first");
  await page.keyboard.press("Control+s");
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.postDataJSON().body.source.code).toContain("//first");
  await expect(page).toHaveURL(/\/scripts\/edit\/hello\/saving$/);
  await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 15_000 });

  // Typed and saved at once.
  await editor.locator(".view-lines").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("//second");
  await page.keyboard.press("Control+s");
  await expect.poll(() => puts.length).toBe(2);
  expect(puts[1]?.postDataJSON().body.source.code).toContain("//second");

  // With the save held for two seconds, what is typed meanwhile is saved after it.
  await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 15_000 });
  let held = false;
  await page.route(`**/drafts/hello/saving`, async (route) => {
    if (route.request().method() === "PUT" && !held) {
      held = true;
      await new Promise((done) => setTimeout(done, 2000));
    }
    await route.continue();
  });
  await page.keyboard.type("//third");
  await page.keyboard.press("Control+s");
  await expect.poll(() => puts.length).toBe(3);
  await page.keyboard.type("//fourth");
  await expect.poll(() => puts.length, { timeout: 20_000 }).toBe(4);
  await page.unrouteAll({ behavior: "wait" });
  expect(puts[3]?.postDataJSON().body.source.code).toContain("//third//fourth");
  expect(puts[3]?.postDataJSON().revision).toBeGreaterThan(puts[2]?.postDataJSON().revision);
  await expect(page.getByText("Unsaved changes")).toHaveCount(0, { timeout: 15_000 });
  const stored = await call(page, "GET", `${W}/drafts/hello/saving`);
  expect(stored.body.source.code).toContain("//third//fourth");
});
