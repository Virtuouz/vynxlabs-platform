import { expect, type Page, test } from "@playwright/test";
import { signInWithPassword } from "./sign-in.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * The debugging and authoring loop, in a browser (phase 13): the runs list
 * shows twenty runs at a laptop's size, a failed flow run opens on what
 * failed, and a failure in production reaches its fix in dev, is deployed,
 * promoted and run again, in ten presses or fewer and no search.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
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
const BROKEN = `export default async (input: { sku: string }) => {
  throw new Error("No warehouse for " + input.sku);
};
`;
const FIXED = `export default async (input: { sku: string }) => ({ ok: true, sku: input.sku });
`;

/** Waits for a run to end, and gives it. */
async function ended(page: Page, root: string, kind: "runs" | "flow-runs", id: string) {
  // biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
  let run: any;
  await expect
    .poll(
      async () => {
        run = await call(page, "GET", `${root}/${kind}/${id}`);
        return run.status;
      },
      { timeout: 90_000 },
    )
    .not.toMatch(/^(queued|running)$/);
  return run;
}

test.describe.configure({ mode: "serial" });

test("the runs list, a failed flow run, and a production failure fixed in ten presses", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  page.on("dialog", (dialog) => {
    errors.push(`a browser dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await signInWithPassword(page, ADMIN.email, ADMIN.password);

  const tenant = await call(page, "POST", "/tenants", { slug: `loop-${stamp}`, name: "Loop" });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The loop e2e test",
    roleId: TENANT_ADMIN,
  });
  const prod = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "prod",
    name: "Production",
    type: "production",
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
    linkedWorkspaceId: prod.id,
  });
  const D = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const P = `/tenants/${tenant.id}/workspaces/${prod.id}`;
  const devLink = `/t/${tenant.id}/workspaces/${dev.id}`;
  const prodLink = `/t/${tenant.id}/workspaces/${prod.id}`;

  // ----- The runs list holds twenty runs at 1440 × 900, each on one line -----
  await call(page, "PUT", `${D}/drafts/stock/check`, script(BROKEN));
  await call(page, "PUT", `${D}/drafts/stock/quick`, script(FIXED));
  await call(page, "PUT", `${D}/drafts/stock/flow`, {
    kind: "flow",
    schemaVersion: 1,
    body: {
      description: "",
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        first: { type: "script", script: "stock/quick", input: "{'sku': 'A'}" },
        place_order: { type: "script", script: "stock/check", input: "{'sku': 'A'}" },
      },
      edges: [
        { from: "start", to: "first" },
        { from: "first", to: "place_order" },
      ],
    },
  });
  const quick: string[] = [];
  for (let n = 0; n < 24; n += 1) {
    quick.push(
      (
        await call(page, "POST", `${D}/test-runs`, {
          script: "stock/quick",
          input: { sku: `S${n}` },
        })
      ).runId,
    );
  }
  await ended(page, D, "runs", quick.at(-1) as string);
  await page.goto(`${devLink}/runs`);
  const grid = page.getByRole("grid", { name: "Runs" });
  await expect(grid.getByRole("row").nth(20)).toBeAttached({ timeout: 30_000 });
  await expectNoAxeViolations(page, "the runs list");
  const inView = await grid
    .locator("tr[data-row]")
    .evaluateAll(
      (rows) => rows.filter((row) => row.getBoundingClientRect().bottom <= innerHeight).length,
    );
  expect(inView).toBeGreaterThanOrEqual(20);
  // No cell's content spills into the next.
  const spilled = await grid
    .locator("td")
    .evaluateAll(
      (cells) =>
        cells.filter(
          (cell) => cell.scrollWidth > cell.clientWidth + 1 && !cell.classList.contains("truncate"),
        ).length,
    );
  expect(spilled).toBe(0);

  // ----- A failed flow run opens on its failed step, with no click -----
  const flowRun = (await call(page, "POST", `${D}/test-runs`, { flow: "stock/flow", input: {} }))
    .runId;
  await ended(page, D, "flow-runs", flowRun);
  await page.goto(`${devLink}/runs/${flowRun}`);
  await expect(page.getByText(/Failed at/)).toContainText("place_order", { timeout: 30_000 });
  await expectNoAxeViolations(page, "a failed flow run");
  const step = page.getByRole("region", { name: "Step place_order" });
  await expect(step.getByText("No warehouse for A").first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/runs/${flowRun}`));

  // ----- A failure in production, fixed in dev and run again -----
  await call(page, "POST", `${D}/changes/deploy`, { paths: ["stock/check"] });
  await call(page, "POST", `${D}/promotions`, {});
  const failed = await call(page, "POST", `${P}/runs`, {
    script: "stock/check",
    input: { sku: "B-7" },
  });
  await ended(page, P, "runs", failed.id);

  let presses = 0;
  const press = async (action: () => Promise<void>) => {
    presses += 1;
    await action();
  };
  await page.goto(`${prodLink}/runs/${failed.id}`);
  await expect(page.getByText("No warehouse for B-7").first()).toBeVisible({ timeout: 30_000 });
  // 1: from the failure to its code in dev, the failed input loaded.
  await press(() => page.getByRole("button", { name: "Edit in Dev" }).click());
  await expect(page).toHaveURL(new RegExp(`${devLink}/scripts/edit/stock/check\\?fromRun=`));
  await expect(page.getByText(/is in the test pane/)).toContainText("Production runs version");
  const editor = page.locator(".monaco-editor").first();
  await editor.locator(".view-lines").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(FIXED);
  // 2: saved.
  await press(() => page.keyboard.press("Control+s"));
  await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  // 3 and 4: this change, deployed from the editor.
  await press(() => page.getByRole("button", { name: "Deploy" }).click());
  await press(() => page.getByRole("menuitem", { name: "This change only" }).click());
  // 5: the toast leads to promoting it.
  await press(() => page.getByRole("button", { name: "Promote to Production" }).click());
  await expect(page).toHaveURL(/release\?step=promote&fromRun=/);
  // 6 and 7: promoted.
  const promote = page.getByRole("button", { name: /Promote to production/ });
  await expect(promote).toBeEnabled({ timeout: 30_000 });
  await press(() => promote.click());
  await press(() =>
    page.getByRole("dialog").getByRole("button", { name: "Promote to production" }).click(),
  );
  // 8: the failed run, again, on the fix.
  await press(() => page.getByRole("button", { name: /Run the failed run again on v\d+/ }).click());
  await expect(page).toHaveURL(new RegExp(`${prodLink}/runs/`));
  await expect(page.getByText("Succeeded").first()).toBeVisible({ timeout: 90_000 });
  expect(presses).toBeLessThanOrEqual(10);

  expect(errors).toEqual([]);
});
