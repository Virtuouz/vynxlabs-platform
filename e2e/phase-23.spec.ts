import { signInWithPassword } from "./sign-in.ts";
import { type Browser, expect, type Page, test } from "./test.ts";

/**
 * Phase 23, walked in a browser on the Fernhill example (`examples/fernhill/setup/setup.mjs`),
 * in its sandbox workspace and under table names of its own.
 *
 * M2: a reference is found by typing, and a row's file is replaced and removed.
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = process.env.E2E_FERNHILL_TENANT ?? "fernhill";
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const OWNER = "maya.brooks@fernhill.example";
const stamp = Date.now().toString(36);
const SUPPLIERS = `suppliers_${stamp}`;
const INVOICES = `invoices_${stamp}`;

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

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, email, PASSWORD);
  return page;
}

test.describe.configure({ mode: "serial" });

let owner: Page;
let W: string;
let L: string;
let invoice: string;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  owner = await signedIn(browser, OWNER);
  const tenants = await ok(owner, "GET", "/tenants?limit=200");
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  const workspaces = (await ok(owner, "GET", `/tenants/${tenant.id}/workspaces`)).items;
  const sandbox = workspaces.find((one: { slug: string }) => one.slug === SANDBOX);
  test.skip(!sandbox, "Fernhill's sandbox workspace is needed.");
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
});

test.afterAll(async () => {
  // A table is retired, not dropped, when its resource is removed: its rows are kept as the
  // platform keeps them, under names no one else uses.
  await owner.context().close();
});

test("A2-06: a supplier past the first 50 is found by typing, and chosen", async () => {
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

test("A2-06: a file is replaced and then removed from the inspector, after asking, and the old one stays", async () => {
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
