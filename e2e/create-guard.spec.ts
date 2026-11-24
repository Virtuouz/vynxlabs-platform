import { signInAs } from "./as.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * A create never overwrites (phase 22, M3): "Make an app" with the name of an app that
 * is already there is refused on the address, and the existing app is as it was.
 */

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

test("making an app at an address that is taken is refused, and the existing app is unchanged @builder", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInAs(page, "operator");
  const tenant = await call(page, "POST", "/tenants", {
    slug: `guard-${stamp}`,
    name: "Guard",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const body = {
    title: "Sales",
    pages: [
      { id: "main", title: "Sales", widgets: [] },
      { id: "second", title: "Second", widgets: [] },
    ],
  };
  await call(page, "PUT", `${W}/drafts/screens/sales`, {
    kind: "interface",
    schemaVersion: 2,
    body,
  });
  await call(page, "PUT", `${W}/drafts/sales`, {
    kind: "app",
    schemaVersion: 1,
    body: { title: "Sales", interface: "screens/sales" },
  });
  const before = await call(page, "GET", `${W}/drafts/screens/sales`);

  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/screens`);
  await page.getByRole("button", { name: "Make an app" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Sales");
  await expect(dialog.getByLabel("Address")).toHaveValue("sales");
  await dialog.getByRole("button", { name: "Make the app" }).click();

  await expect(dialog.getByText("Something already exists at this path.")).toBeVisible();
  // What was typed is kept, and no app was opened.
  await expect(dialog.getByLabel("Name")).toHaveValue("Sales");
  await expect(page).toHaveURL(/\/screens$/);

  const after = await call(page, "GET", `${W}/drafts/screens/sales`);
  expect(after.revision).toBe(before.revision);
  expect(after.body.pages).toHaveLength(2);

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
