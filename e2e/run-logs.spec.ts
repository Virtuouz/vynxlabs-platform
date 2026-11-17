import { expect, type Page, test } from "@playwright/test";
import { signInWithPassword } from "./sign-in.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * A run's log, in a browser (phase 12, milestone 4): a run that logs more than
 * one page of lines shows all of them on its page, read while the event stream
 * is connected, and a run link opens from the runs list after a reload.
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

const CHATTY = `import type { ScriptContext } from "@vynxlabs/sdk";

export default async function (_given: unknown, ctx: ScriptContext) {
  for (let line = 1; line <= 1200; line += 1) ctx.log.info(\`line \${line}\`);
  return { lines: 1200 };
}
`;

test("a run that logs 1,200 lines shows them all, and opens from a link to the list", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  await signInWithPassword(page, ADMIN.email, ADMIN.password);

  const tenant = await call(page, "POST", "/tenants", { slug: `rl-${stamp}`, name: "Run logs" });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The run logs e2e test",
    roleId: TENANT_ADMIN,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/logs/chatty`, {
    kind: "script",
    schemaVersion: 1,
    body: {
      description: "Logs a great deal",
      input: { type: "object" },
      output: { type: "object" },
      timeoutSeconds: 60,
      retries: { limit: 0, delaySeconds: 0, backoff: false },
      uses: { connections: [], secrets: [], variables: [] },
      source: { language: "typescript", code: CHATTY },
    },
  });

  // Opened once the run has finished, with the event stream connected: the page asks once, and must read every page of the log.
  const started = await call(page, "POST", `${W}/test-runs`, { script: "logs/chatty", input: {} });
  const link = `/t/${tenant.id}/workspaces/${dev.id}`;
  await page.goto(`${link}/runs/${started.runId}`);
  await expect(page.getByText("Succeeded").first()).toBeVisible({ timeout: 60_000 });
  const log = page.getByRole("region", { name: "Log" });
  await expect(log.getByText("1200 lines")).toBeVisible({ timeout: 15_000 });
  await expectNoAxeViolations(page, "a run's log");
  // Past 500 lines only those in view are drawn: the viewer's own search finds the last one.
  await log.getByLabel("Search the log").fill("line 1200");
  await expect(log.getByText("1 of 1 match")).toBeVisible();
  await expect(log.locator("mark", { hasText: "line 1200" })).toBeVisible();

  // A link to the run in the list opens it after a reload.
  await page.goto(`${link}/runs?run=${started.runId}`);
  await page.reload();
  const inspector = page.getByRole("complementary", { name: "The chosen run" });
  await expect(inspector.getByText("1200 lines")).toBeVisible({ timeout: 15_000 });

  // By keyboard alone: Esc closes it and focus goes back to the run's row; Enter opens it again.
  // The list is one tab stop: a cell of a row.
  const row = page.getByRole("row").filter({ hasText: "logs/chatty" });
  const cell = row.getByRole("gridcell").first();
  await cell.focus();
  await page.keyboard.press("Enter");
  await expect(inspector.getByRole("heading", { level: 2 })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
  await expect(cell).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(inspector).toBeVisible();

  expect(errors).toEqual([]);
});
