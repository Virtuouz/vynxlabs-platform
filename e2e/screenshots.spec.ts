import { mkdirSync } from "node:fs";
import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * Takes the pictures the product's documentation shows, from a running
 * instance, into `packages/docs/assets/screenshots/`. Run when a version is
 * released, with `pnpm docs:screenshots`, before the documentation is built:
 * the build then ships them. It is skipped in an ordinary run of the browser
 * tests, which have nothing to say about what a picture looks like.
 *
 * A page names a picture with `::screenshot{name=console/table-help alt="…"}`.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const OUT = new URL("../packages/docs/assets/screenshots/", import.meta.url).pathname;
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

const take = async (page: Page, name: string) => {
  mkdirSync(`${OUT}${name.split("/").slice(0, -1).join("/")}`, { recursive: true });
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}${name}.png`, animations: "disabled", caret: "hide" });
};

test("the pictures the documentation shows are taken", async ({ browser }) => {
  test.skip(process.env.SCREENSHOTS !== "1", "Taken only when asked: pnpm docs:screenshots.");
  test.setTimeout(240_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `pictures-${stamp}`,
    name: "Fernhill",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const source = (frontmatter: string, body: string) => `---\n${frontmatter}\n---\n\n${body}`;
  await call(page, "PUT", `${W}/drafts/orders`, {
    kind: "table",
    schemaVersion: 1,
    body: {
      description: "What customers bought.",
      columns: {
        number: { type: "text", required: true, description: "The number printed on the order." },
        status: { type: "text", description: "Where the order is in its life." },
        total: { type: "number", description: "What was charged." },
      },
    },
  });
  const pages: Record<string, string> = {
    "handbook/index": source("title: Shop handbook", "Start with [refunds](support/refunds).\n"),
    "handbook/support/index": source(
      "title: Customer support\npages: [refunds, returns]",
      "When a customer writes in.\n",
    ),
    "handbook/support/refunds": source(
      "title: Refund an order\ndescription: Full and partial refunds.\nextends: [data-tables]\nabout:\n  - table: orders",
      "# Before you start\n\nCheck the order's :term[status]{table=orders column=status}.\n\n:::alert[Mind the limit]{type=warning}\nA refund over 500 needs a second person.\n:::\n\n:::steps\n1. Find the order.\n2. Refund it to the card it was paid with.\n:::\n",
    ),
    "handbook/support/returns": source("title: Returns", "Parcels come back on Tuesdays.\n"),
  };
  for (const [path, text] of Object.entries(pages)) {
    await call(page, "PUT", `${W}/drafts/${path}`, {
      kind: "doc",
      schemaVersion: 1,
      body: { source: text },
    });
  }
  await call(page, "PUT", `${W}/drafts/help`, {
    kind: "app",
    schemaVersion: 1,
    body: { title: "Shop handbook", docs: "handbook" },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  await call(page, "POST", `${W}/rows/orders`, {
    rows: [
      { number: "A-1041", status: "open", total: 40 },
      { number: "A-1042", status: "refunded", total: 12 },
      { number: "A-1043", status: "shipped", total: 86 },
    ],
  });
  const at = `/t/${tenant.id}/workspaces/${dev.id}`;

  await page.goto(`${at}/tables/orders`);
  await expect(page.getByRole("grid", { name: "Rows of orders" }).getByText("A-1043")).toBeVisible({
    timeout: 30_000,
  });
  await page.locator("#main").focus();
  await page.keyboard.press("F1");
  await expect(
    page.getByRole("complementary", { name: "Help" }).getByRole("heading", { name: "Tables" }),
  ).toBeVisible();
  await take(page, "console/table-help");
  await page.getByRole("button", { name: "Close help" }).click();

  await page.goto(`${at}/docs/handbook/support/refunds`);
  await expect(page.getByRole("heading", { level: 2, name: "Refund an order" })).toBeVisible();
  await take(page, "console/documentation");

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".monaco-editor").first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("region", { name: "The page as it will be served" }).getByText("Mind the limit"),
  ).toBeVisible();
  await take(page, "console/page-editor");
  await page.context().close();
});
