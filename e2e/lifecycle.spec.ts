import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * Everything listed can be removed and brought back (phase 22, M4): a script, a
 * flow, a query and a docs site each are removed from the console, taken back,
 * removed again, and the removal is deployed. A docs site is also switched off,
 * which keeps its pages and its app.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const stamp = Date.now().toString(36);

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

/** Whether a path has a draft that removes it, one that changes it, or none. */
async function draftOf(page: Page, W: string, path: string) {
  const drafts = await call(page, "GET", `${W}/drafts`);
  const found = drafts.items.find((one: { path: string }) => one.path === path);
  return found ? (found.deleted ? "removed" : "changed") : "none";
}

/** Answers the dialog that is open. */
async function say(page: Page, action: string) {
  await page.getByRole("dialog").getByRole("button", { name: action, exact: true }).click();
}

test("a script, a flow, a query and a docs site are removed, taken back, removed and deployed", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `life-${stamp}`,
    name: "Lifecycle",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const L = `/t/${tenant.id}/workspaces/${dev.id}`;

  // What is there to remove, deployed.
  const put = (path: string, kind: string, body: unknown) =>
    call(page, "PUT", `${W}/drafts/${path}`, { kind, schemaVersion: 1, body, create: true });
  await put("life/script", "script", {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code: "export default async () => ({});\n" },
  });
  await put("life/flow", "flow", {
    nodes: { start: { type: "trigger", trigger: { type: "manual" } } },
    edges: [],
  });
  await put("life/query", "query", { sql: "select 1" });
  await put("handbook/index", "doc", { source: "---\ntitle: Handbook\n---\n\nWords.\n" });
  await put("handbook-site", "app", { title: "Handbook", docs: "handbook" });
  const deploy = (paths: string[]) =>
    call(page, "POST", `${W}/changes/deploy`, { paths, message: "Lifecycle" });
  await deploy(["life/script", "life/flow", "life/query", "handbook/index", "handbook-site"]);

  // A script: removed from its editor, taken back from the Changes screen's draft, removed, deployed.
  await page.goto(`${L}/scripts/edit/life/script`);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Nothing changes until that draft is deployed",
  );
  await say(page, "Remove");
  await expect(page).toHaveURL(/\/changes$/);
  expect(await draftOf(page, W, "life/script")).toBe("removed");
  await call(page, "DELETE", `${W}/drafts/life/script`);
  expect(await draftOf(page, W, "life/script")).toBe("none");
  await page.goto(`${L}/scripts/edit/life/script`);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await say(page, "Remove");
  await expect(page).toHaveURL(/\/changes$/);

  // A flow: removed and kept from the list's inspector, then removed again.
  await page.goto(`${L}/flows?item=life/flow`);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await say(page, "Remove");
  await expect(page.getByRole("button", { name: "Keep this flow" })).toBeVisible();
  expect(await draftOf(page, W, "life/flow")).toBe("removed");
  await page.getByRole("button", { name: "Keep this flow" }).click();
  await say(page, "Keep");
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  expect(await draftOf(page, W, "life/flow")).toBe("none");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await say(page, "Remove");
  await expect(page.getByRole("button", { name: "Keep this flow" })).toBeVisible();

  // A query: the same, from the Queries screen.
  await page.goto(`${L}/queries?query=life/query`);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await say(page, "Remove");
  await expect(page.getByRole("button", { name: "Keep this query" })).toBeVisible();
  await page.getByRole("button", { name: "Keep this query" }).click();
  await say(page, "Keep");
  expect(await draftOf(page, W, "life/query")).toBe("none");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await say(page, "Remove");
  await expect(page.getByRole("button", { name: "Keep this query" })).toBeVisible();

  // A docs site: switched off and back on, keeping its pages and its app.
  await page.goto(`${L}/docs`);
  await page.getByRole("button", { name: "More for Handbook" }).click();
  await page.getByRole("menuitem", { name: /Stop publishing/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Its pages and its app are kept");
  await say(page, "Stop publishing");
  await expect(page.getByText("Site, not published")).toBeVisible();
  await page.getByRole("button", { name: "More for Handbook" }).click();
  await page.getByRole("menuitem", { name: /Publish again/ }).click();
  await say(page, "Publish again");
  await expect(page.getByText("Site, not published")).toHaveCount(0);
  // And removing its app says first that the site stops being served.
  await page.getByRole("button", { name: "More for Handbook" }).click();
  await page.getByRole("menuitem", { name: /Remove the site's app/ }).click();
  await expect(page.getByRole("dialog")).toContainText("The site stops being served");
  await say(page, "Remove");
  expect(await draftOf(page, W, "handbook-site")).toBe("removed");
  await expect(page.getByText("Words.").first()).toBeVisible();

  // The removals are deployed: what was removed is gone, and the pages of the site are not.
  await deploy(["life/script", "life/flow", "life/query", "handbook-site"]);
  const left = await call(page, "GET", `${W}/resources`);
  const paths = left.items.map((one: { path: string }) => one.path);
  for (const gone of ["life/script", "life/flow", "life/query", "handbook-site"]) {
    expect(paths).not.toContain(gone);
  }
  expect(paths).toContain("handbook/index");
});
