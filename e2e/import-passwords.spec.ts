import { createRequire } from "node:module";
import { signInAs } from "./as.ts";
import { expect, type Page, test } from "./test.ts";

/**
 * Importing a tenant through the console, with and without the box that brings the members'
 * passwords in with the file (phase 35). Two small tenants are exported and deleted, and their
 * files uploaded: the first is imported with the box as it comes (off), the second with it
 * ticked. A member of the first cannot sign in afterwards, and a member of the second can.
 */

// The `pg` of the database package: no route of the API removes an account, and the import creates
// only the accounts that are not on the instance.
// biome-ignore lint/suspicious/noExplicitAny: a client used for one statement
const pg: any = createRequire(new URL("../packages/db/package.json", import.meta.url).pathname)(
  "pg",
);

const stamp = Date.now().toString(36);
const PASSPHRASE = "import-passwords-2026";
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const PASSWORD = "an-imported-member-pw-1";
const LABEL = "Bring the members' passwords in with the file";

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

/** A tenant with one member who has a password, exported, and then deleted. Returns the file and who was in it. */
async function exported(page: Page, name: string) {
  const slug = `imp-${name}-${stamp}`;
  const email = `${slug}@e2e.example`;
  const tenant = await call(page, "POST", "/tenants", {
    slug,
    name: `Import ${name}`,
    addCreator: true,
  });
  await call(page, "POST", `/tenants/${tenant.id}/members`, {
    email,
    name: `Member ${name}`,
    password: PASSWORD,
    bindings: [{ roleId: TENANT_ADMIN }],
  });
  const base64 = await page.evaluate(
    async ([id, passphrase]) => {
      const made = await fetch(`/api/v1/tenants/${id}/exports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!made.ok) throw new Error(`export: ${made.status} ${await made.text()}`);
      const bytes = new Uint8Array(await made.arrayBuffer());
      let text = "";
      for (let at = 0; at < bytes.length; at += 8192) {
        text += String.fromCharCode(...bytes.subarray(at, at + 8192));
      }
      return btoa(text);
    },
    [tenant.id, PASSPHRASE] as const,
  );
  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: slug });
  // The account outlives the tenant, and an import links to an account that is here. So that this
  // import creates it, it is removed from the instance's own database (what it holds goes with it).
  const client = new pg.Client({ connectionString: process.env.E2E_SOURCE_URL });
  await client.connect();
  await client.query("delete from member where email = $1", [email]);
  await client.end();
  return { slug, email, file: Buffer.from(base64, "base64") };
}

/** Uploads the file on Import a tenant, checks it with its passphrase, and waits until it can be imported. */
async function inspect(page: Page, slug: string, file: Buffer) {
  await page.goto("/instance/import");
  await page
    .getByLabel("Export file")
    .setInputFiles({ name: `${slug}.tar`, mimeType: "application/x-tar", buffer: file });
  await page.getByRole("button", { name: "Upload and check" }).click();
  await page.getByText("Can it come in").waitFor();
  await page.getByLabel("Its passphrase").fill(PASSPHRASE);
  await page.getByText("The passphrase opens it").waitFor();
  await expect(page.getByRole("button", { name: "Import tenant" })).toBeEnabled();
}

async function signsIn(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  try {
    await page
      .getByRole("heading", { name: "Sign in" })
      .waitFor({ state: "detached", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

test("an import brings no passwords unless the box is ticked, and says which it did @instance @access", async ({
  browser,
}) => {
  test.skip(
    !process.env.E2E_SOURCE_URL,
    "An import creates only accounts the instance does not have: set E2E_SOURCE_URL to its own database.",
  );
  test.setTimeout(240_000);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInAs(page, "operator");
  const without = await exported(page, "a");
  const withIt = await exported(page, "b");

  // The first: the box as it comes.
  await inspect(page, without.slug, without.file);
  const box = page.getByRole("checkbox", { name: LABEL });
  await expect(box).not.toBeChecked();
  await expect(box).toBeEnabled();
  await expect(page.getByText("The import will create 1 account")).toBeVisible();
  // A reload mid-way brings the waiting upload back, and the box is off again, even when it was ticked.
  await box.check();
  await page.reload();
  await page
    .getByRole("listitem")
    .filter({ hasText: `${without.slug}.tar` })
    .getByRole("button", { name: "Open" })
    .click();
  await page.getByLabel("Its passphrase").fill(PASSPHRASE);
  await page.getByText("The passphrase opens it").waitFor();
  await expect(page.getByRole("checkbox", { name: LABEL })).not.toBeChecked();
  await page.getByRole("button", { name: "Import tenant" }).click();
  await expect(page.getByText(/was imported/)).toBeVisible();
  await expect(page.getByText("has no password yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Members", exact: true })).toHaveAttribute(
    "href",
    /^\/t\/[^/]+\/members$/,
  );

  // The second: ticked.
  await inspect(page, withIt.slug, withIt.file);
  await page.getByRole("checkbox", { name: LABEL }).check();
  await page.getByRole("button", { name: "Import tenant" }).click();
  await expect(page.getByText(/was imported/)).toBeVisible();
  await expect(page.getByText("can sign in with the password they had")).toBeVisible();

  // What the notices said is what happened.
  const fresh = async () => (await browser.newContext()).newPage();
  expect(await signsIn(await fresh(), without.email)).toBe(false);
  expect(await signsIn(await fresh(), withIt.email)).toBe(true);
});
