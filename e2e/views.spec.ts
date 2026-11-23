import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * Saved views (phase 15, P3-4): a list's filters, sort and columns are saved
 * by name, chosen again from the menu, and their link opens the same list for
 * another member.
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

test("a view is saved, chosen again, and its link shows another member the same list", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `views-${stamp}`,
    name: "Views",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const runs = `/t/${tenant.id}/workspaces/${dev.id}/runs`;
  // A failed run, so the list has rows and its columns show.
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/stock/check`, {
    kind: "script",
    schemaVersion: 1,
    body: {
      description: "",
      input: { type: "object" },
      output: { type: "object" },
      timeoutSeconds: 60,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      source: {
        language: "typescript",
        code: 'export default async () => { throw new Error("No stock"); };\n',
      },
    },
  });
  const failed = (await call(page, "POST", `${W}/test-runs`, { script: "stock/check", input: {} }))
    .runId as string;
  await expect
    .poll(async () => (await call(page, "GET", `${W}/runs/${failed}`)).status, { timeout: 90_000 })
    .toBe("failed");

  // Failed runs, by duration, without the trigger and attempt columns.
  await page.goto(`${runs}?status=failed&sort=duration&dir=desc`);
  const grid = page.getByRole("grid", { name: "Runs" });
  await expect(grid.getByRole("columnheader", { name: "Trigger" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /Columns/ }).click();
  const columns = page.getByRole("dialog", { name: "Columns" });
  await columns.getByRole("checkbox", { name: "Trigger" }).uncheck();
  await columns.getByRole("checkbox", { name: "Attempt" }).uncheck();
  await columns.getByRole("button", { name: "Done" }).click();
  await expect(grid.getByRole("columnheader", { name: "Trigger" })).toHaveCount(0);
  const wanted = new URL(page.url()).search;

  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByRole("menuitem", { name: "Save this view…" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Slow failures");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved views" })).toContainText("Slow failures");

  // Elsewhere, the view is one choice away.
  await page.goto(runs);
  await expect(grid.getByRole("columnheader", { name: "Trigger" })).toBeVisible();
  await page.getByRole("button", { name: "Saved views" }).click();
  await page.getByRole("menuitem", { name: "Slow failures" }).click();
  const params = (search: string) => {
    const query = new URLSearchParams(search);
    return { status: query.get("status"), sort: query.get("sort"), cols: query.getAll("cols") };
  };
  await expect.poll(() => params(new URL(page.url()).search)).toEqual(params(wanted));
  await expect(grid.getByRole("columnheader", { name: "Trigger" })).toHaveCount(0);
  const link = page.url();

  // Another member opens the link and sees the same list; the view stays the saver's own.
  await call(page, "POST", `/tenants/${tenant.id}/members`, {
    email: `ben-${stamp}@views.example`,
    name: "Ben",
    password: "a-good-long-password",
    bindings: [{ roleId: "00000000-0000-7000-8000-000000000002" }],
  });
  const ben = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(ben, `ben-${stamp}@views.example`, "a-good-long-password");
  await ben.goto(link);
  const bens = ben.getByRole("grid", { name: "Runs" });
  await expect(bens.getByRole("columnheader", { name: "Started" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(bens.getByRole("columnheader", { name: "Trigger" })).toHaveCount(0);
  await expect(ben.getByRole("radio", { name: /^Failed/ })).toBeChecked();
  await ben.getByRole("button", { name: "Saved views" }).click();
  await expect(ben.getByRole("menuitem", { name: "Slow failures" })).toHaveCount(0);

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
