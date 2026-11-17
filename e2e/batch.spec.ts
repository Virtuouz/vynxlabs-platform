import { expect, type Page, test } from "@playwright/test";
import { signInWithPassword } from "./sign-in.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * Batch actions (phase 15, P3-3): twenty-five runs run again in three
 * interactions, with a result for each.
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

test("twenty-five runs are run again in three interactions, and each is accounted for", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `batch-${stamp}`,
    name: "Batch",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/orders/sync`, {
    kind: "script",
    schemaVersion: 1,
    body: {
      description: "",
      input: { type: "object" },
      output: { type: "object" },
      timeoutSeconds: 60,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      source: { language: "typescript", code: "export default async () => ({ ok: true });\n" },
    },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  for (let i = 0; i < 25; i++) {
    await call(page, "POST", `${W}/runs`, { script: "orders/sync", input: { n: i } });
  }

  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/runs`);
  const grid = page.getByRole("grid", { name: "Runs" });
  await expect(grid.getByRole("row")).toHaveCount(26, { timeout: 30_000 });

  let presses = 0;
  const press = async (action: () => Promise<void>) => {
    presses += 1;
    await action();
  };
  await press(() => grid.getByRole("checkbox", { name: "Select all shown" }).check());
  const bar = page.getByRole("toolbar", { name: "Batch actions" });
  await expect(bar.getByText("25 selected")).toBeVisible();
  await expectNoAxeViolations(page, "the runs list with rows checked");
  await press(() => bar.getByRole("button", { name: "Run again" }).click());
  await press(() =>
    page.getByRole("dialog").getByRole("button", { name: "Run again", exact: true }).click(),
  );
  await expect(page.getByText("25 runs started again.")).toBeVisible({ timeout: 60_000 });
  expect(presses).toBeLessThanOrEqual(3);
  const runs = await call(page, "GET", `${W}/runs?limit=100`);
  expect(runs.items.length).toBe(50);

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
