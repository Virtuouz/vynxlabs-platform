import { signInWithPassword } from "./sign-in.ts";
import { type Browser, expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * Releasing as a team, in a browser (phase 10, milestone 6): a developer who may
 * not promote asks; the operator, as tenant admin, decides it from the tenant's
 * overview; the drift view shows what dev changed since; and a member's access
 * page links each permission to the binding that gives it.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);
const DEV_PASSWORD = "a-developer-password-1";

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

const errors: string[] = [];
async function signIn(browser: Browser, email: string, password: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  page.on("dialog", (dialog) => {
    errors.push(`a browser dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await signInWithPassword(page, email, password);
  return page;
}

test("a developer asks, a promoter decides from the overview, drift shows the change, access shows why", async ({
  browser,
}) => {
  const admin = await signIn(browser, ADMIN.email, ADMIN.password);
  const tenant = await call(admin, "POST", "/tenants", { slug: `rel-${stamp}`, name: "Releasing" });
  await call(admin, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The release e2e test",
    roleId: TENANT_ADMIN,
  });
  const roles = (await call(admin, "GET", `/tenants/${tenant.id}/roles`)).items as {
    id: string;
    name: string;
  }[];
  const developerRole = roles.find((role) => role.name === "developer")?.id;
  const dave = await call(admin, "POST", `/tenants/${tenant.id}/members`, {
    email: `dave-${stamp}@acme.example`,
    name: "Dave",
    password: DEV_PASSWORD,
  });
  const binding = await call(admin, "POST", `/tenants/${tenant.id}/bindings`, {
    principalType: "member",
    principalId: dave.id,
    roleId: developerRole,
  });
  const dev = await call(admin, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const prod = await call(admin, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "prod",
    name: "Production",
    type: "production",
  });
  await call(admin, "PATCH", `/tenants/${tenant.id}/workspaces/${dev.id}`, {
    linkedWorkspaceId: prod.id,
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const saveVariable = (description: string) =>
    call(admin, "PUT", `${W}/drafts/orders/size`, {
      kind: "variable",
      schemaVersion: 1,
      body: { description },
    });
  await saveVariable("How many");
  await call(admin, "POST", `${W}/changes/deploy`, {});
  await call(admin, "POST", `${W}/promotions`, {});
  await saveVariable("How many, at most");
  await call(admin, "POST", `${W}/changes/deploy`, {});

  // The developer asks, from the release screen's promote step.
  const developer = await signIn(browser, dave.email, DEV_PASSWORD);
  await developer.goto(`/t/${tenant.id}/workspaces/${dev.id}/release`);
  await developer
    .getByRole("button", { name: /03 Promote/ })
    .first()
    .click();
  const ask = developer.getByRole("region", { name: "Request promotion" });
  await ask.getByLabel("A note for whoever decides (optional)").fill("The new size limit");
  await ask.getByRole("button", { name: /Request promotion of v/ }).click();
  await expect(ask.getByText("Waiting")).toBeVisible();

  // Drift shows the one resource dev changed, with what differs.
  const drift = developer.getByRole("region", { name: "Drift" });
  await drift.getByText("orders/size").click();
  const sheet = developer.getByRole("dialog");
  await expect(sheet.getByTestId("drift-diff")).toContainText('"description": "How many, at most"');
  await sheet.getByRole("button", { name: "Close" }).first().click();

  // The promoter sees it on the overview and promotes it in place.
  await admin.goto(`/t/${tenant.id}`);
  const requests = admin.getByRole("region", { name: "Promotion requests" });
  await expect(requests).toContainText("Dave asks to promote");
  await requests.getByRole("button", { name: "Review" }).click();
  const review = admin.getByRole("dialog");
  await expect(review).toContainText("orders/size");
  await review.getByRole("button", { name: "Promote", exact: true }).click();
  await admin
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Promote", exact: true })
    .click();
  await expect(admin.getByText(/Production now runs v\d+\./)).toBeVisible({ timeout: 15_000 });
  await expectNoAxeViolations(admin, "a release, promoted");
  await expect(admin.getByRole("region", { name: "Promotion requests" })).toHaveCount(0);
  const shipped = await call(
    admin,
    "GET",
    `/tenants/${tenant.id}/workspaces/${prod.id}/resources/orders/size`,
  );
  expect(shipped.body.description).toBe("How many, at most");

  // The developer sees it promoted.
  await developer.reload();
  await developer
    .getByRole("button", { name: /03 Promote/ })
    .first()
    .click();
  await expect(developer.getByRole("region", { name: "Request promotion" })).toContainText(
    "Promoted",
  );

  // A member's access links each permission to the binding that gives it.
  await admin.goto(`/t/${tenant.id}/members/${dave.id}`);
  await admin.getByLabel("Find or check a permission").fill("secret:read");
  await admin.getByRole("link", { name: "developer" }).first().click();
  await admin.waitForURL(/\/access\?binding=/);
  await expect(admin.locator(`[data-row="${binding.id}"]`)).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // Production's one list of versions rolls back from a row of its history.
  await admin.goto(`/t/${tenant.id}/workspaces/${prod.id}/release`);
  await expect(admin.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(admin.getByText("Bundles and rollback")).toHaveCount(0);
  const bundlesOf = async () =>
    (
      (await call(admin, "GET", `/tenants/${tenant.id}/workspaces/${prod.id}/bundles`)).items as {
        id: string;
        active: boolean;
      }[]
    ).find((one) => one.active)?.id;
  const before = await bundlesOf();
  const back = admin.getByRole("button", { name: "Activate this version" }).first();
  await back.click();
  await admin.getByRole("dialog").getByRole("button", { name: "Activate in production" }).click();
  await expect(admin.getByText(/is what runs here now/)).toBeVisible();
  expect(await bundlesOf()).not.toBe(before);
  expect(errors).toEqual([]);
});
