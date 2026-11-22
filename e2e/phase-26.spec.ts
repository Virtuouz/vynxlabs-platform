import { signInWithPassword } from "./sign-in.ts";
import { type Browser, expect, type Page, test } from "./test.ts";

/**
 * Phase 26, walked in a browser on the Fernhill example (`examples/fernhill/setup/setup.mjs`),
 * in its sandbox workspace and under names of its own. Each test is one journey of the exit
 * criterion in docs/phases/phase-26-records-and-actions.md: a row opens a record in a side sheet,
 * "Mark paid" and "Edit" and "New invoice" change the table and say so, a person who may only
 * read presses the button because the button is the grant, and a widget is shown only to who it
 * is for.
 *
 * The walk copies Clinic performance's pages into an interface of its own (`screens/p26-<stamp>`)
 * and publishes it as an app of its own, so nothing it changes is anyone else's. Its Invoices table
 * reads only the invoices the walk made (numbers that start with `P26-<stamp>`), so they are
 * always on the first page whatever else the sandbox holds.
 *
 * The person who presses the button is an end user of the Northside clinic's group, given the app
 * and its tables to read and nothing else: no `data:write`, no `flow_run:write`. Clinic
 * performance's own tables let staff of a clinic read that clinic's invoices and not change them,
 * so only the action's grant lets this person mark one paid.
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = process.env.E2E_FERNHILL_TENANT ?? "fernhill";
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const OWNER = "maya.brooks@fernhill.example";
const stamp = Date.now().toString(36);
const PAGE = `screens/p26-${stamp}`;
const APP = `p26-${stamp}`;
const PREFIX = `P26-${stamp.toUpperCase()}`;
const STAFF = `staff-${stamp}@fernhill.example`;
const today = new Date().toISOString().slice(0, 10);

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

test.describe.configure({ mode: "serial" });

let owner: Page;
let T: string;
let W: string;
/** Where the app is served, with the closing slash. */
let base: string;
const invoice: Record<
  "open" | "paid" | "edit" | "grant" | "other",
  { id: string; number: string }
> = {
  open: { id: "", number: `${PREFIX}-OPEN` },
  paid: { id: "", number: `${PREFIX}-PAID` },
  edit: { id: "", number: `${PREFIX}-EDIT` },
  grant: { id: "", number: `${PREFIX}-GRANT` },
  other: { id: "", number: `${PREFIX}-OTHER` },
};

const row = (number: string) =>
  `${W}/rows/invoices?filter=${encodeURIComponent(JSON.stringify({ column: "number", value: number }))}&limit=1`;
const stored = async (number: string) => (await ok(owner, "GET", row(number))).items[0];

/** A member's or an end user's view of the app's Money page. */
const invoices = (page: Page) => page.getByRole("region", { name: "Invoices", exact: true });
const rowOf = (page: Page, number: string) =>
  invoices(page).getByRole("row", { name: new RegExp(number) });
const sheet = (page: Page) => page.getByRole("dialog", { name: /Invoice detail/ });
/** The table as it is drawn, whether or not a sheet over it has the reader's focus (a modal sheet takes the page out of the accessibility tree). */
const invoicesDrawn = (page: Page) => page.locator('section[aria-label="Invoices"]');
const modal = (page: Page, name: string) => page.getByRole("dialog", { name });
/** The question an action asks first: a dialog over the sheet, with the button that goes ahead. */
const asks = (page: Page, text: RegExp | string) =>
  page.locator("[role=dialog],[role=alertdialog]").filter({ hasText: text });

async function openApp(page: Page) {
  await page.goto(base);
  // A member lands on the signed-in staff view first, where the app is the same address.
  const staff = page
    .getByRole("link", { name: /staff/i })
    .or(page.getByRole("button", { name: /staff/i }));
  if (await staff.count()) await staff.first().click();
  await expect(invoices(page)).toBeVisible({ timeout: 30_000 });
}

async function endUserSignedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await page.goto(`/portal/${TENANT}/`);
  await page
    .getByRole("link", { name: "Sign in" })
    .or(page.getByRole("button", { name: "Sign in" }))
    .first()
    .click();
  await page.getByLabel(/Email/).first().fill(email);
  const next = page.getByRole("button", { name: "Continue" });
  if (await next.count()) await next.click();
  await page
    .getByLabel(/Password/)
    .first()
    .fill(PASSWORD);
  await page
    .getByRole("button", { name: /Sign in/ })
    .last()
    .click();
  await page
    .getByLabel(/Password/)
    .first()
    .waitFor({ state: "detached", timeout: 20_000 });
  return page;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  owner = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signInWithPassword(owner, OWNER, PASSWORD);
  const tenants = await ok(owner, "GET", "/tenants?limit=200");
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  T = `/tenants/${tenant.id}`;
  const workspaces = (await ok(owner, "GET", `${T}/workspaces`)).items;
  const sandbox = workspaces.find((one: { slug: string }) => one.slug === SANDBOX);
  test.skip(!sandbox, "Fernhill's sandbox workspace is needed.");
  W = `${T}/workspaces/${sandbox.id}`;

  // The invoices the walk works on: four of Northside's, and one of Riverside's.
  const make = async (
    which: keyof typeof invoice,
    clinic: string,
    status = "unpaid",
    total = 12345,
  ) => {
    const made = await ok(owner, "POST", `${W}/rows/invoices`, {
      number: invoice[which].number,
      client_code: "C-1001",
      clinic,
      total,
      status,
      issued_on: today,
    });
    invoice[which].id = made.items[0].id;
  };
  await make("open", "northside");
  await make("paid", "northside");
  await make("edit", "northside");
  await make("grant", "northside");
  await make("other", "riverside");

  // Clinic performance as the repository deployed it, every page of it, under the walk's own name,
  // with its Invoices table reading only the walk's invoices.
  const deployed = await ok(owner, "GET", `${W}/interfaces/screens/performance`);
  const pages = structuredClone(deployed.body.pages);
  const money = pages.find((one: { id: string }) => one.id === "money");
  const list = money.widgets.find((one: { id: string }) => one.id === "list");
  list.data.rows.source.visual.filters = [{ column: "number", op: "contains", value: PREFIX }];
  // The example lets only Practice managers and Billing, who are team members, run Mark paid
  // (`runBy`, checked on the server), so a read-only end user could never press it. What this walk
  // proves is that a button is its own grant, so the walk's copy of the action runs for anyone who
  // may press it; who may run it is proven by the control plane's own test (page-actions.test.ts).
  const mark = pages
    .find((one: { id: string }) => one.id === "invoice")
    .widgets.find((one: { id: string }) => one.id === "invoice-actions").config.actions[0];
  expect(mark.action.runBy).toBeTruthy();
  delete mark.action.runBy;
  await ok(owner, "PUT", `${W}/drafts/${PAGE}`, {
    kind: "interface",
    schemaVersion: 2,
    body: { title: `Walk ${stamp}`, pages },
    create: true,
  });
  await ok(owner, "PUT", `${W}/drafts/${APP}`, {
    kind: "app",
    schemaVersion: 1,
    body: { title: `Walk ${stamp}`, interface: PAGE },
    create: true,
  });
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [PAGE, APP],
    message: `Phase 26 walk ${stamp}`,
  });

  // An account of Northside's staff that may read the app and its tables, and nothing more.
  const groups = (await ok(owner, "GET", `${T}/end-user-groups?limit=200`)).items as {
    id: string;
    name: string;
  }[];
  const northside = groups.find((one) => one.name === "northside");
  test.skip(!northside, "Northside's end-user group is needed.");
  const made = await ok(owner, "POST", `${T}/end-users`, { email: STAFF, name: "Walk staff" });
  const anonymous = await browser.newContext();
  const set = await anonymous.request.post(`/api/v1${T}/end-user-auth/passwords`, {
    data: {
      token: new URL(made.invitation.url).searchParams.get("token"),
      password: PASSWORD,
    },
  });
  expect(set.ok()).toBe(true);
  await anonymous.close();
  await ok(owner, "PUT", `${T}/end-user-groups/${northside?.id}/members/${made.endUser.id}`);
  const resources = (await ok(owner, "GET", `${W}/resources`)).items as {
    id: string;
    kind: string;
    path: string;
  }[];
  const roles = (await ok(owner, "GET", `${T}/roles?limit=200`)).items as {
    id: string;
    name: string;
  }[];
  const reader = roles.find((one) => one.name === "portal_reader")?.id;
  const shared = ["invoices", "appointments", "inventory", "purchase_orders", "clinics"];
  for (const one of resources.filter(
    (resource) =>
      (resource.kind === "app" && resource.path === APP) ||
      (resource.kind === "table" && shared.includes(resource.path)),
  )) {
    // A table shared with Northside by an earlier walk is shared already: that is what is wanted.
    const shared = await call(owner, "POST", `${T}/bindings`, {
      workspaceId: W.split("/").pop(),
      resourceId: one.id,
      principalType: "end_user_group",
      principalId: northside?.id,
      roleId: reader,
    });
    if (shared.status >= 300 && shared.status !== 409) {
      throw new Error(
        `Sharing ${one.id} with Northside: ${shared.status} ${JSON.stringify(shared.body)}`,
      );
    }
  }
  const apps = (await ok(owner, "GET", `${W}/apps`)).items as { url: string; path?: string }[];
  const app = apps.find((one) => one.url.includes(APP)) ?? apps[0];
  base = `${new URL(app?.url as string).pathname.replace(/\/$/, "")}/`;
});

test.afterAll(async () => {
  if (!owner) return;
  if (!W) {
    await owner.context().close();
    return;
  }
  for (const one of Object.values(invoice)) {
    if (one.id) await call(owner, "DELETE", `${W}/rows/invoices/${one.id}`);
  }
  const created = await call(owner, "GET", row(`${PREFIX}-NEW`));
  for (const one of created.body?.items ?? []) {
    await call(owner, "DELETE", `${W}/rows/invoices/${one.id}`);
  }
  for (const path of [PAGE, APP]) await call(owner, "DELETE", `${W}/drafts/${path}`);
  await owner.context().close();
});

test("pressing an invoice opens Invoice detail in a side sheet, Back closes it, and a shared link opens it again", async () => {
  await openApp(owner);
  await rowOf(owner, invoice.open.number).click();
  // The sheet is over the page, which stays in view, and its address names it.
  await expect(sheet(owner)).toBeVisible();
  await expect(sheet(owner)).toContainText(invoice.open.number);
  await expect(sheet(owner)).toContainText("$123.45");
  await expect(sheet(owner).getByRole("button", { name: "Mark paid" })).toBeVisible();
  await expect(sheet(owner).getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(invoicesDrawn(owner)).toBeVisible();
  const link = owner.url();
  expect(link).toContain("sheet=invoice");
  expect(link).toContain(`record=${invoice.open.id}`);
  // Back closes the sheet and the page is where it was.
  await owner.goBack();
  await expect(sheet(owner)).toHaveCount(0);
  await expect(invoices(owner)).toBeVisible();
  // The link, sent to someone or kept, opens the same invoice in the same sheet.
  await owner.goto(link);
  await expect(sheet(owner)).toContainText(invoice.open.number);
  // And a reload keeps it.
  await owner.reload();
  await expect(sheet(owner)).toContainText(invoice.open.number);
  // Esc closes it too.
  await owner.keyboard.press("Escape");
  await expect(sheet(owner)).toHaveCount(0);
});

test("Mark paid asks first, changes the row, says so, and the table shows it", async () => {
  await openApp(owner);
  await rowOf(owner, invoice.paid.number).click();
  await sheet(owner).getByRole("button", { name: "Mark paid" }).click();
  // The question names the invoice, and nothing has changed yet.
  const question = asks(owner, `Mark ${invoice.paid.number} as paid?`);
  await expect(question).toBeVisible();
  expect((await stored(invoice.paid.number)).status).toBe("unpaid");
  // Cancel leaves it as it was.
  await question.getByRole("button", { name: "Cancel" }).click();
  await expect(question).toHaveCount(0);
  expect((await stored(invoice.paid.number)).status).toBe("unpaid");
  await sheet(owner).getByRole("button", { name: "Mark paid" }).click();
  await asks(owner, `Mark ${invoice.paid.number} as paid?`)
    .getByRole("button", { name: "Mark paid" })
    .click();
  await expect(owner.getByText("Invoice marked paid")).toBeVisible();
  // The record says so, and its button can't be pressed again: it is not unpaid now.
  await expect(sheet(owner).getByText("paid", { exact: true })).toBeVisible();
  await expect(sheet(owner).getByRole("button", { name: "Mark paid" })).toBeDisabled();
  // Closed, the row in the table behind shows it too.
  await owner.keyboard.press("Escape");
  await expect(sheet(owner)).toHaveCount(0);
  await expect(rowOf(owner, invoice.paid.number)).toContainText(/paid/i);
  await expect(rowOf(owner, invoice.paid.number)).not.toContainText(/unpaid/i);
  const after = await stored(invoice.paid.number);
  expect(after.status).toBe("paid");
  expect(after.paid_at).toBeTruthy();
  // What the action didn't name is as it was.
  expect(after.total).toBe(12345);
  // A reload shows the same.
  await owner.reload();
  await expect(rowOf(owner, invoice.paid.number)).not.toContainText(/unpaid/i);
});

test("Edit saves through the form, and a required field is refused before anything is saved", async () => {
  await openApp(owner);
  await rowOf(owner, invoice.edit.number).click();
  await sheet(owner).getByRole("button", { name: "Edit" }).click();
  const form = modal(owner, "Edit invoice");
  await expect(form).toBeVisible();
  // The form starts as the record is.
  // Money kept in cents is typed as dollars.
  await expect(form.getByLabel("Total")).toHaveValue("123.45");
  // Total is required: emptied, it is refused beside the field, and nothing is saved.
  await form.getByLabel("Total").fill("");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Total")).toHaveAttribute("aria-invalid", "true");
  expect((await stored(invoice.edit.number)).total).toBe(12345);
  // Written again, it saves, closes, and says so.
  await form.getByLabel("Total").fill("43.21");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("Invoice saved")).toBeVisible();
  await expect(form).toHaveCount(0);
  await expect(sheet(owner)).toContainText("$43.21");
  await owner.keyboard.press("Escape");
  await expect(rowOf(owner, invoice.edit.number)).toContainText("$43.21");
  expect((await stored(invoice.edit.number)).total).toBe(4321);
});

test("New invoice makes a row with the same form, and the table shows it", async () => {
  await openApp(owner);
  await owner.getByRole("button", { name: "New invoice" }).click();
  const form = modal(owner, "New invoice");
  await expect(form).toBeVisible();
  // Nothing is made until the required fields are there.
  await form.getByRole("button", { name: "Create invoice" }).click();
  await expect(form).toBeVisible();
  expect((await call(owner, "GET", row(`${PREFIX}-NEW`))).body.items).toHaveLength(0);
  await form.getByLabel("Number").fill(`${PREFIX}-NEW`);
  await form.getByLabel("Client").fill("C-1002");
  await form.getByLabel("Clinic").fill("northside");
  // In dollars: the invoice keeps 5500 cents.
  await form.getByLabel("Total").fill("55.00");
  await form.getByLabel("Issued").fill(today);
  await form.getByRole("button", { name: "Create invoice" }).click();
  await expect(owner.getByText("Invoice created")).toBeVisible();
  await expect(form).toHaveCount(0);
  await expect(rowOf(owner, `${PREFIX}-NEW`)).toBeVisible();
  await expect(rowOf(owner, `${PREFIX}-NEW`)).toContainText("$55.00");
  const made = await stored(`${PREFIX}-NEW`);
  expect(made.status).toBe("unpaid");
  expect(made.clinic).toBe("northside");
});

test("staff who may only read press Mark paid, because the button is the grant, and can't reach another clinic's invoice", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const staff = await endUserSignedIn(browser, STAFF);
  await staff.goto(base);
  await expect(invoices(staff)).toBeVisible({ timeout: 30_000 });
  // They see their clinic's invoices and not Riverside's.
  await expect(rowOf(staff, invoice.grant.number)).toBeVisible();
  await expect(rowOf(staff, invoice.other.number)).toHaveCount(0);
  // And they may not change a row the ordinary way.
  const direct = await call(staff, "PATCH", `${W}/rows/invoices/${invoice.grant.id}`, {
    status: "paid",
  });
  expect(direct.status).toBeGreaterThanOrEqual(400);
  expect((await stored(invoice.grant.number)).status).toBe("unpaid");
  // The button does it.
  await rowOf(staff, invoice.grant.number).click();
  await sheet(staff).getByRole("button", { name: "Mark paid" }).click();
  await asks(staff, `Mark ${invoice.grant.number} as paid?`)
    .getByRole("button", { name: "Mark paid" })
    .click();
  await expect(staff.getByText("Invoice marked paid")).toBeVisible();
  await staff.keyboard.press("Escape");
  await expect(rowOf(staff, invoice.grant.number)).not.toContainText(/unpaid/i);
  const after = await stored(invoice.grant.number);
  expect(after.status).toBe("paid");
  expect(after.total).toBe(12345);
  // The same action (the sheet's Action group's first, Mark paid) aimed at Riverside's invoice
  // is not found: they may not read it.
  const there = await call(staff, "POST", `${W}/page-actions`, {
    of: "interface",
    path: PAGE,
    page: "invoice",
    widget: "invoice-actions",
    at: "config/actions/0/action",
    records: { this: invoice.other.id },
  });
  expect(there.status).toBe(404);
  expect((await stored(invoice.other.number)).status).toBe("unpaid");
  // And an invoice already paid can't be paid again: the server checks the sentence again.
  const twice = await call(staff, "POST", `${W}/page-actions`, {
    of: "interface",
    path: PAGE,
    page: "invoice",
    widget: "invoice-actions",
    at: "config/actions/0/action",
    records: { this: invoice.grant.id },
  });
  expect(twice.status).toBe(403);
  expect(JSON.stringify(twice.body)).toContain("It can't be done now");
  await staff.context().close();
});

test("a widget shown only to Practice managers is drawn for a manager and not for the front desk", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  await openApp(owner);
  await expect(owner.getByText("For practice managers")).toBeVisible();
  const staff = await endUserSignedIn(browser, STAFF);
  await staff.goto(base);
  await expect(invoices(staff)).toBeVisible({ timeout: 30_000 });
  await expect(staff.getByText("For practice managers")).toHaveCount(0);
  // Hiding is not security: the page's other widgets are drawn as they were.
  await expect(staff.getByRole("region", { name: "Invoiced", exact: true })).toBeVisible();
  await staff.context().close();
});
