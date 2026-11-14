import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * The console of phase 8, checked in a browser on a running instance: every
 * top-level screen at a phone's, a tablet's and a desktop's width, in light and
 * in dark, without the page scrolling sideways. The navigation opens as a
 * drawer on a phone. The instance's branding names and colours the console, and
 * a tenant's branding does not reach it.
 *
 * Screenshots are kept beside each test's results, in `e2e/results/`, to look over by eye.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);
const PRODUCT = `Northwind Console ${stamp}`;
/** The instance's accent, and a tenant's, chosen to be told apart. */
const INSTANCE_ACCENT = "#0f766e";
const TENANT_ACCENT = "#c026d3";

const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 960 },
] as const;
const THEMES = ["light", "dark"] as const;

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
type Api = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
const apiOf =
  (page: Page): Api =>
  (method, path, body) =>
    page.evaluate(
      async ([method, path, body]) => {
        const response = await fetch(`/api/v1${path}`, {
          method: method as string,
          headers: body ? { "content-type": "application/json" } : {},
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, body: await response.json().catch(() => null) };
      },
      [method, path, body] as const,
    );
const ok = <T extends { status: number; body: unknown }>(response: T, what: string): T => {
  if (response.status >= 300) {
    throw new Error(`${what}: ${response.status} ${JSON.stringify(response.body).slice(0, 600)}`);
  }
  return response;
};

test.describe.configure({ mode: "serial" });

let admin: Page;
let api: Api;
let tenant: { id: string; slug: string };
let workspace: string;
let before: { productName: string | null };
const errors: string[] = [];

async function signIn(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  page.on("dialog", (dialog) => {
    errors.push(`a browser dialog appeared: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await page.goto("/");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("All tenants").first().waitFor();
  return page;
}

test.beforeAll(async ({ browser }) => {
  admin = await signIn(browser);
  api = apiOf(admin);
  before = ok(await api("GET", "/instance/branding"), "read the branding").body;
  ok(
    await api("PUT", "/instance/branding", {
      productName: PRODUCT,
      theme: { tokens: { action: INSTANCE_ACCENT }, dark: { action: INSTANCE_ACCENT } },
    }),
    "brand the console",
  );
  tenant = ok(
    await api("POST", "/tenants", { slug: `look-${stamp}`, name: `Look ${stamp}` }),
    "make a tenant",
  ).body;
  // An operator sees inside a tenant through a grant, as the console asks them to.
  ok(
    await api("POST", `/tenants/${tenant.id}/access-grants`, {
      reason: "Checking the console's layout",
      roleId: TENANT_ADMIN,
    }),
    "open operator access",
  );
  ok(
    await api("PUT", `/tenants/${tenant.id}/portal`, {
      theme: { tokens: { action: TENANT_ACCENT }, dark: { action: TENANT_ACCENT } },
    }),
    "brand the tenant",
  );
  const prod = ok(
    await api("POST", `/tenants/${tenant.id}/workspaces`, {
      slug: "main",
      name: "Main",
      type: "production",
    }),
    "make production",
  ).body.id;
  workspace = ok(
    await api("POST", `/tenants/${tenant.id}/workspaces`, {
      slug: "sandbox",
      name: "Sandbox",
      type: "dev",
      linkedWorkspaceId: prod,
    }),
    "make the dev workspace",
  ).body.id;
});

test.afterAll(async () => {
  await api("PUT", "/instance/branding", {
    productName: before.productName,
    theme: { tokens: {}, dark: {} },
  });
  await api("POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug });
});

/** The screens a person reaches from the rail, by address. */
const screens = () => {
  const ws = `/t/${tenant.id}/workspaces/${workspace}`;
  return [
    ["tenants", "/"],
    ["overview", `${ws}/overview`],
    ["flows", `${ws}/flows`],
    ["scripts", `${ws}/scripts`],
    ["apps", `${ws}/apps`],
    ["runs", `${ws}/runs`],
    ["events", `${ws}/events`],
    ["triggers", `${ws}/triggers`],
    ["release", `${ws}/release`],
    ["data", `${ws}/data`],
    ["connections", `${ws}/connections`],
    ["tenant", `/t/${tenant.id}`],
    ["members", `/t/${tenant.id}/members`],
    ["sso", `/t/${tenant.id}/single-sign-on`],
    ["domains", `/t/${tenant.id}/domains`],
    ["workers", `/t/${tenant.id}/workers`],
    ["audit", `/t/${tenant.id}/audit`],
    ["instance-branding", "/instance/branding"],
    ["account", "/account/api-keys"],
  ] as const;
};

for (const theme of THEMES) {
  for (const size of WIDTHS) {
    test(`every screen fits a ${size.name} in ${theme}`, async () => {
      await admin.setViewportSize({ width: size.width, height: size.height });
      await admin.evaluate((choice) => localStorage.setItem("vx-theme", choice), theme);
      for (const [name, path] of screens()) {
        await admin.goto(path);
        await admin.locator("main").first().waitFor();
        // Let the screen's own requests answer before it is measured. Some screens keep
        // polling, so the network never goes quiet: wait for what they show instead.
        await expect(admin.getByText(/^Loading/).first()).toBeHidden({ timeout: 15_000 });
        await admin.waitForTimeout(250);
        expect(
          await admin.evaluate(() => document.documentElement.dataset.theme),
          `${name} is in ${theme}`,
        ).toBe(theme);
        const overflow = await admin.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${name} scrolls sideways at ${size.width}px`).toBeLessThanOrEqual(0);
        await admin.screenshot({
          path: test.info().outputPath(`${theme}-${size.name}-${name}.png`),
          fullPage: false,
        });
      }
    });
  }
}

test("on a phone the navigation is a drawer that opens and closes", async () => {
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto(`/t/${tenant.id}/workspaces/${workspace}/overview`);
  await expect(admin.getByRole("navigation", { name: "Main" })).toBeHidden();
  await admin.getByRole("button", { name: "Open the menu" }).click();
  const drawer = admin.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAccessibleName(PRODUCT);
  await expect(drawer.getByRole("link", { name: "Operate" })).toBeVisible();
  await admin.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  // Choosing a screen in the drawer goes there and closes it.
  await admin.getByRole("button", { name: "Open the menu" }).click();
  await drawer.getByRole("link", { name: "Operate" }).click();
  await expect(drawer).toBeHidden();
  await expect(admin).toHaveURL(/\/runs$/);
});

test("the console carries the instance's name and colour, and not the tenant's", async ({
  browser,
}) => {
  // A browser that has not seen the instance before, so no stylesheet is kept from
  // before the branding was saved: the instance's is cached for a minute.
  const fresh = await signIn(browser);
  for (const theme of THEMES) {
    await fresh.evaluate((choice) => localStorage.setItem("vx-theme", choice), theme);
    await fresh.goto(`/t/${tenant.id}/workspaces/${workspace}/overview`);
    await fresh.locator("main").first().waitFor();
    await expect(fresh).toHaveTitle(new RegExp(PRODUCT));
    const accent = await fresh.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--vx-action").trim(),
    );
    expect(accent.toLowerCase(), `the accent in ${theme}`).toBe(INSTANCE_ACCENT);
  }
  await fresh.context().close();

  // The sign-in page names the instance too.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/");
  await expect(visitor.getByText(PRODUCT).first()).toBeVisible();
  await visitor.context().close();
});

test("no screen threw, and no browser dialog appeared", () => {
  expect(errors).toEqual([]);
});
