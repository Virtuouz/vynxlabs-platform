import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations, snap } from "./visual.ts";

/**
 * What a tenant's own people see: an app made in the console and served by the
 * platform, drawn by the kit and the screens renderer. Its pictures are the
 * baseline that shows when a change to the kit reaches tenant apps.
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

const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 960 },
] as const;

test("an app served to a tenant's people looks as reviewed, at each width and in each theme", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", { slug: `show-${stamp}`, name: "Showcase" });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The tenant apps e2e test",
    roleId: TENANT_ADMIN,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "shop",
    name: "Shop",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/resources/stock`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    body: {
      columns: { item: { type: "text" }, held: { type: "integer" }, aisle: { type: "text" } },
    },
  });
  await call(page, "POST", `${W}/rows/stock`, {
    rows: [
      { item: "Bolts", held: 120, aisle: "A" },
      { item: "Nuts", held: 340, aisle: "A" },
      { item: "Washers", held: 75, aisle: "B" },
      { item: "Hinges", held: 12, aisle: "C" },
    ],
  });
  const widgets = [
    {
      id: "list",
      type: "core/table",
      title: "Stock",
      at: { x: 0, y: 0, w: 8, h: 6 },
      data: { rows: { source: { visual: { table: "stock" } } } },
      config: { columns: [{ column: "item" }, { column: "held" }, { column: "aisle" }] },
    },
    {
      id: "by_aisle",
      type: "core/chart",
      title: "Held by aisle",
      at: { x: 8, y: 0, w: 4, h: 6 },
      data: {
        rows: {
          source: {
            visual: {
              table: "stock",
              groupBy: [{ column: "aisle" }],
              measures: [{ fn: "sum", column: "held", as: "held" }],
            },
          },
        },
      },
      config: { mark: "bar" },
    },
  ];
  await call(page, "PUT", `${W}/drafts/screens/stock`, {
    kind: "interface",
    schemaVersion: 2,
    body: { title: "Stock", pages: [{ id: "main", title: "Stock", widgets }] },
  });
  await call(page, "PUT", `${W}/drafts/stock-app`, {
    kind: "app",
    schemaVersion: 1,
    body: { title: "Stock", interface: "screens/stock" },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  // Shared with anyone, so the picture needs nobody to sign in.
  const resources = (await call(page, "GET", `${W}/resources`)).items as {
    id: string;
    kind: string;
    path: string;
  }[];
  const roles = (await call(page, "GET", `/tenants/${tenant.id}/roles?limit=200`)).items as {
    id: string;
    name: string;
  }[];
  const reader = roles.find((role) => role.name === "portal_reader")?.id;
  for (const resource of resources.filter((one) => ["app", "table"].includes(one.kind))) {
    await call(page, "POST", `/tenants/${tenant.id}/bindings`, {
      workspaceId: dev.id,
      resourceId: resource.id,
      principalType: "anonymous",
      roleId: reader,
    });
  }
  const app = ((await call(page, "GET", `${W}/apps`)).items as { url: string }[])[0];
  expect(app).toBeTruthy();

  for (const colorScheme of ["light", "dark"] as const) {
    const visitor = await (await browser.newContext({ colorScheme })).newPage();
    for (const size of WIDTHS) {
      await visitor.setViewportSize({ width: size.width, height: size.height });
      await visitor.goto(new URL(app?.url as string).pathname);
      const list = visitor.getByRole("region", { name: "Stock" }).first();
      await expect(list.getByText("Hinges")).toBeVisible({ timeout: 30_000 });
      await visitor.waitForTimeout(400);
      await snap(visitor, `app-${colorScheme}-${size.name}`);
      if (colorScheme === "light" && size.name === "desktop") {
        await expectNoAxeViolations(visitor, "the served app");
      }
    }
    await visitor.context().close();
  }
  // In the builder, the page has the room: at a laptop's size the canvas takes 60% of the work
  // area or more. A phone's preview lays the page out as a phone does: one column.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/screens/screens/stock`);
  const canvas = page.locator("[data-canvas]");
  // While building, a widget is a group that can be chosen, moved and sized.
  await expect(canvas.getByRole("group", { name: "Stock" }).first()).toBeVisible({
    timeout: 30_000,
  });
  const share = await page.evaluate(() => {
    const main = document.querySelector("main")?.getBoundingClientRect().width ?? 1;
    return (document.querySelector("[data-canvas]")?.getBoundingClientRect().width ?? 0) / main;
  });
  // Soft: the rest of the builder is still walked when the canvas is short of its room.
  expect.soft(share, "the canvas share of the work area at 1440").toBeGreaterThanOrEqual(0.6);
  await page.getByRole("radio", { name: /Phone/ }).click();
  const stacked = async () => {
    const list = await canvas.getByRole("group", { name: "Stock" }).first().boundingBox();
    const chart = await canvas.getByRole("group", { name: "Held by aisle" }).boundingBox();
    return Boolean(list && chart && chart.y >= list.y + list.height - 1);
  };
  await expect.poll(stacked).toBe(true);
  await expectNoAxeViolations(page, "the App Builder");

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
