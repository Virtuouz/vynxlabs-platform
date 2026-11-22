import type { Browser } from "@playwright/test";
import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * Phase 28, the Approvals widget (decision 0007), walked in a browser on the Fernhill example
 * (`examples/fernhill/setup/setup.mjs`), in its sandbox workspace and under names of its own.
 *
 * The walk deploys a workflow of its own (`orders/f3-<stamp>`, one approval step that the
 * Practice managers decide), an interface with one page holding an Approvals widget, and an app
 * that serves it, then starts six runs. Everything it asks of the widget is in these names, so
 * it is no one else's. Rowan Ellis (a practice manager) decides; Devi Shah may read and not
 * decide; a member with a role that only opens the app, and an end user, are given nothing.
 *
 * Only the console's own address is walked: an apps address apart from it answers "decide in the
 * console", which the control plane's own tests cover (`page-approvals.test.ts`).
 */

const PASSWORD = process.env.E2E_FERNHILL_PASSWORD ?? "fernhill-demo-2026";
const TENANT = process.env.E2E_FERNHILL_TENANT ?? "fernhill";
const SANDBOX = process.env.E2E_FERNHILL_SANDBOX ?? "sandbox";
const OWNER = "maya.brooks@fernhill.example";
const MANAGER = "rowan.ellis@fernhill.example";
const stamp = Date.now().toString(36);
const FLOW = `orders/f3-${stamp}`;
const SCREEN = `screens/f3-${stamp}`;
const APP = `f3-${stamp}`;

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
let W: string;
let L: string;
let base: string;
let tenantId: string;
const made: string[] = [];
let manager: Page;
let endUsersBinding = "";
const ITEM = `F3 ${stamp} item`;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  owner = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signInWithPassword(owner, OWNER, PASSWORD);
  const tenants = await ok(owner, "GET", "/tenants?limit=200");
  const tenant = tenants.items.find((one: { slug: string }) => one.slug === TENANT);
  test.skip(!tenant, `No tenant ${TENANT}: set up the Fernhill example first.`);
  tenantId = tenant.id;
  const workspaces = (await ok(owner, "GET", `/tenants/${tenant.id}/workspaces`)).items;
  const sandbox = workspaces.find((one: { slug: string }) => one.slug === SANDBOX);
  test.skip(!sandbox, "Fernhill's sandbox workspace is needed.");
  W = `/tenants/${tenant.id}/workspaces/${sandbox.id}`;
  L = `/t/${tenant.id}/workspaces/${sandbox.id}`;

  // A workflow of the walk's own: one approval step that practice managers decide.
  await ok(owner, "PUT", `${W}/drafts/${FLOW}`, {
    kind: "flow",
    schemaVersion: 1,
    body: {
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        ask: {
          type: "approval",
          title: "Sign off a stock order",
          detail:
            "{'item': trigger.item, 'clinic': trigger.clinic, 'total': trigger.total, 'notes': trigger.notes}",
          approvers: { groups: ["practice-managers"] },
        },
        done: { type: "set", values: { finished: "true" } },
      },
      edges: [
        { from: "start", to: "ask" },
        { from: "ask", to: "done" },
      ],
    },
    create: true,
  });
  await ok(owner, "PUT", `${W}/drafts/${SCREEN}`, {
    kind: "interface",
    schemaVersion: 2,
    body: {
      title: `Walk ${stamp}`,
      pages: [
        {
          id: "orders",
          title: "Orders",
          widgets: [
            {
              id: "queue",
              type: "core/approvals",
              title: "Orders to sign off",
              at: { x: 0, y: 0, w: 12, h: 9 },
              data: { requests: { source: { approvals: { flows: [FLOW], whose: "all" } } } },
              config: {
                look: "queue",
                fields: [
                  { name: "item" },
                  { name: "clinic" },
                  { name: "total", label: "Order total" },
                ],
                decided: true,
                askWhy: "rejecting",
                approveLabel: "Approve order",
                rejectLabel: "Reject",
                empty: "No orders are waiting.",
              },
            },
          ],
        },
      ],
    },
    create: true,
  });
  await ok(owner, "PUT", `${W}/drafts/${APP}`, {
    kind: "app",
    schemaVersion: 1,
    body: { title: `Walk ${stamp}`, interface: SCREEN },
    create: true,
  });
  await ok(owner, "POST", `${W}/changes/deploy`, {
    paths: [FLOW, SCREEN, APP],
    message: `Phase 28 approvals walk ${stamp}`,
  });
  const apps = (await ok(owner, "GET", `${W}/apps`)).items as { url: string }[];
  const app = apps.find((one) => one.url.includes(APP)) ?? apps[0];
  base = `${new URL(app?.url as string).pathname.replace(/\/$/, "")}/`;
  for (let n = 1; n <= 6; n++) {
    await ok(owner, "POST", `${W}/flow-runs`, {
      flow: FLOW,
      input: { item: `${ITEM} ${n}`, clinic: "northside", total: 1000 * n, notes: "" },
    });
  }
});

// ----- What the build draws, in one place -----

const widgetOf = (page: Page) =>
  page.getByRole("region", { name: "Orders to sign off", exact: true });
const rows = (page: Page) => widgetOf(page).locator("[data-approval-row]");
const rowOf = (page: Page, n: number) =>
  widgetOf(page)
    .locator("[data-approval-row]")
    .filter({ hasText: new RegExp(`${ITEM} ${n}\\b`) });
const detailOf = (page: Page) => widgetOf(page).locator("[data-approval-detail]");
const approveButton = (page: Page) => detailOf(page).getByRole("button", { name: "Approve order" });
const rejectButton = (page: Page) => detailOf(page).getByRole("button", { name: "Reject" });
/** The Waiting and Decided switch: a segmented control whose radios are hidden, so its label is pressed. */
const showTab = (page: Page, name: "Waiting" | "Decided") =>
  widgetOf(page).locator("label").filter({ hasText: name }).click();
const notice = (page: Page) =>
  widgetOf(page)
    .getByRole("status")
    .filter({ hasText: /^(Approved|Rejected) / });

/** A signed-in browser of a person, at a width and in a theme. */
async function as(
  browser: Browser,
  email: string,
  size = { width: 1440, height: 900 },
  scheme: "light" | "dark" = "light",
) {
  const context = await browser.newContext({ viewport: size, colorScheme: scheme });
  const page = await context.newPage();
  await signInWithPassword(page, email, PASSWORD);
  return page;
}

async function openApp(page: Page) {
  await page.goto(base);
  // A member lands on the signed-in staff view first, where the app is the same address.
  const staff = page
    .getByRole("link", { name: /staff/i })
    .or(page.getByRole("button", { name: /staff/i }));
  if (await staff.count()) await staff.first().click();
  await expect(widgetOf(page)).toBeVisible({ timeout: 30_000 });
}

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

/** The requests of the walk's flow that wait, by the id the widget names a step by. */
async function waitingIds(page: Page): Promise<{ id: string; item: string }[]> {
  const answer = await ok(page, "GET", `${W}/approvals?limit=200`);
  return (
    answer.items as { flowRunId: string; node: string; flow: string; detail: { item: string } }[]
  )
    .filter((one) => one.flow === FLOW)
    .map((one) => ({ id: `${one.flowRunId}/${one.node}`, item: one.detail.item }))
    .sort((a, b) => a.item.localeCompare(b.item, undefined, { numeric: true }));
}
const decideApi = (page: Page, id: string, decision: "approve" | "reject", comment?: string) =>
  call(page, "POST", `${W}/page-approvals`, {
    path: SCREEN,
    page: "orders",
    widget: "queue",
    id,
    decision,
    ...(comment ? { comment } : {}),
  });

// ----- The manager -----

test("POLISH-001: a manager opens the queue in the app and reads the request's fields", async ({
  browser,
}) => {
  manager = await as(browser, MANAGER);
  await openApp(manager);
  await expect(rows(manager)).toHaveCount(6);
  // The first is open beside the list, with the fields the widget names, labelled as it says.
  const open = detailOf(manager);
  await expect(open).toContainText(`${ITEM} 1`);
  await expect(open).toContainText("Order total");
  await expect(open).toContainText("$1,000.00");
  await expect(open).toContainText("northside");
  await expect(open.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(approveButton(manager)).toBeEnabled();
  await expect(rejectButton(manager)).toBeEnabled();
  // Choosing another reads it.
  await rowOf(manager, 3).click();
  await expect(detailOf(manager)).toContainText(`${ITEM} 3`);
  await expect(detailOf(manager)).toContainText("$3,000.00");
  await rowOf(manager, 1).click();
  await expect(detailOf(manager)).toContainText(`${ITEM} 1`);
});

test("POLISH-001: approving one runs the flow on, says so, opens the next, and keeps the focus in the list", async () => {
  const [first] = await waitingIds(owner);
  const before = await rows(manager).count();
  await approveButton(manager).click();
  // The notice says who and what.
  await expect(notice(manager)).toContainText("Approved");
  await expect(notice(manager)).toContainText("as Rowan Ellis");
  // The request leaves, and the next opens, with the focus on it: not at the top of the page.
  await expect(rows(manager)).toHaveCount(before - 1);
  await expect(rowOf(manager, 1)).toHaveCount(0);
  await expect(detailOf(manager)).toContainText(`${ITEM} 2`);
  await expect(rowOf(manager, 2)).toBeFocused();
  // The flow it belongs to ran on and finished.
  await expect
    .poll(async () => (await ok(owner, "GET", `${W}/flow-runs/${first?.id.split("/")[0]}`)).state)
    .toBe("succeeded");
});

test("POLISH-001: rejecting asks why in the box, says so when it is empty, and the server asks too", async () => {
  // The next is open (item 2). Reject opens a box with the cursor in it.
  await rejectButton(manager).click();
  const why = detailOf(manager).getByRole("textbox", { name: /Why are you rejecting this/ });
  await expect(why).toBeFocused();
  // Rejecting with nothing written is said, and nothing was sent.
  const waiting = (await waitingIds(owner)).length;
  await detailOf(manager).getByRole("button", { name: "Reject" }).last().click();
  await expect(detailOf(manager)).toContainText("Say why it is rejected.");
  expect((await waitingIds(owner)).length).toBe(waiting);
  // The server holds to it, for a call made straight to the API.
  const [second] = await waitingIds(owner);
  const refused = await decideApi(manager, second?.id as string, "reject");
  expect(refused.status).toBe(400);
  expect(JSON.stringify(refused.body)).toContain("Say why it is rejected");
  expect((await waitingIds(owner)).length).toBe(waiting);
  // Esc leaves the box, and the buttons are back.
  await owner.waitForTimeout(0);
  await manager.keyboard.press("Escape");
  await expect(why).toHaveCount(0);
  await expect(rejectButton(manager)).toBeVisible();
  // With the reason written, it is rejected, and the notice says so.
  await rejectButton(manager).click();
  await why.fill("Too much stock for this clinic");
  await detailOf(manager).getByRole("button", { name: "Reject" }).last().click();
  await expect(notice(manager)).toContainText("Rejected");
  await expect(notice(manager)).toContainText("as Rowan Ellis");
  await expect(rowOf(manager, 2)).toHaveCount(0);
  await expect(detailOf(manager)).toContainText(`${ITEM} 3`);
  // The flow stopped: it no longer waits.
  await expect
    .poll(async () => (await ok(owner, "GET", `${W}/flow-runs/${second?.id.split("/")[0]}`)).state)
    .not.toBe("waiting_approval");
});

test("POLISH-006: the Decided tab lists both with who, what and why, and a reload keeps them", async () => {
  await showTab(manager, "Decided");
  const decided = widgetOf(manager).getByRole("list", { name: "Decided requests" });
  await expect(decided.getByRole("listitem")).toHaveCount(2);
  await expect(decided).toContainText("Approved by Rowan Ellis");
  await expect(decided).toContainText("Rejected by Rowan Ellis");
  await expect(decided).toContainText("Too much stock for this clinic");
  await expect(widgetOf(manager).locator("label").filter({ hasText: "Decided" })).toContainText(
    "2",
  );
  // A reload: what was decided stays decided, and the queue is what is left.
  await manager.reload();
  await expect(widgetOf(manager)).toBeVisible({ timeout: 30_000 });
  await expect(rows(manager)).toHaveCount(4);
  await expect(rowOf(manager, 1)).toHaveCount(0);
  await expect(rowOf(manager, 2)).toHaveCount(0);
  await showTab(manager, "Decided");
  await expect(decided.getByRole("listitem")).toHaveCount(2);
});

// ----- Someone who may read and not decide -----

test("POLISH-001: someone who may read approvals and not decide sees the requests, the buttons greyed with why, and the API refuses", async ({
  browser,
}) => {
  const reader = await as(browser, "devi.shah@fernhill.example");
  await openApp(reader);
  await expect(rows(reader)).not.toHaveCount(0);
  const reason = "Only the Practice managers group can decide this.";
  await expect(approveButton(reader)).toBeDisabled();
  await expect(rejectButton(reader)).toBeDisabled();
  // The reason is written beside them, and is what each button is described by.
  await expect(detailOf(reader)).toContainText(reason);
  await expect(approveButton(reader)).toHaveAccessibleDescription(reason);
  // The server says no to a call made straight to it, and nothing changed.
  const [one] = await waitingIds(owner);
  const refused = await decideApi(reader, one?.id as string, "approve");
  expect(refused.status).toBe(403);
  // Devi has no approval:write, so it is a plain refusal; a manager outside the group would be told who may.
  expect(["forbidden", "not_an_approver"]).toContain(refused.body.code);
  expect((await waitingIds(owner)).map((it) => it.id)).toContain(one?.id);
  await reader.context().close();
});

// ----- Someone with no approval standing, and an end user -----

test("POLISH-001: someone with no approval standing, and an end user, see nothing: no list, no counts, no titles", async ({
  browser,
}) => {
  // A role that opens an app and nothing more, for a member made for the walk and for end users.
  const role = await ok(owner, "POST", `/tenants/${tenantId}/roles`, {
    name: `f3_plain_${stamp}`,
    permissions: ["app:read", "interface:read"],
  });
  const email = `f3.plain.${stamp}@fernhill.example`;
  const member = await ok(owner, "POST", `/tenants/${tenantId}/members`, {
    email,
    name: "Plain Walker",
    password: PASSWORD,
  });
  made.push(member.id);
  await ok(owner, "POST", `/tenants/${tenantId}/bindings`, {
    principalType: "member",
    principalId: member.id,
    roleId: role.id,
  });
  const everyone = await ok(owner, "POST", `/tenants/${tenantId}/bindings`, {
    principalType: "end_users",
    workspaceId: W.split("/").pop(),
    roleId: role.id,
  });
  endUsersBinding = everyone.id;

  const plain = await as(browser, email);
  await plain.goto(base);
  const staff = plain
    .getByRole("link", { name: /staff/i })
    .or(plain.getByRole("button", { name: /staff/i }));
  if (await staff.count()) await staff.first().click();
  await expect(widgetOf(plain)).toBeVisible({ timeout: 30_000 });
  await expect(plain.locator("[data-approval-row]")).toHaveCount(0);
  await expect(widgetOf(plain)).toContainText("No orders are waiting.");
  await expect(plain.getByText(ITEM)).toHaveCount(0);
  await expect(plain.getByText("Sign off a stock order")).toHaveCount(0);
  // Nothing in the answer either: no titles, no counts.
  const read = await call(
    plain,
    "GET",
    `${W}/widget-data?of=interface&path=${SCREEN}&page=orders&widget=queue`,
  );
  expect(read.status).toBe(200);
  expect(read.body.inputs.requests.waiting).toEqual([]);
  expect(read.body.inputs.requests.decided).toEqual([]);
  expect(JSON.stringify(read.body)).not.toContain(ITEM);
  const [one] = await waitingIds(owner);
  const refused = await decideApi(plain, one?.id as string, "approve");
  expect(refused.status).toBe(403);
  await plain.context().close();

  // An end user of the front desk, signed in at the portal.
  const desk = await (await browser.newContext()).newPage();
  await desk.goto("/portal/fernhill/");
  await desk
    .getByRole("link", { name: "Sign in" })
    .or(desk.getByRole("button", { name: "Sign in" }))
    .first()
    .click();
  await desk.getByLabel(/Email/).first().fill("jess.morgan@fernhill.example");
  const next = desk.getByRole("button", { name: "Continue" });
  if (await next.count()) await next.click();
  await desk
    .getByLabel(/Password/)
    .first()
    .fill(PASSWORD);
  await desk
    .getByRole("button", { name: /Sign in/ })
    .last()
    .click();
  await expect(desk.getByText("Front desk").first()).toBeVisible({ timeout: 20_000 });
  await desk.goto(base);
  await expect(widgetOf(desk)).toBeVisible({ timeout: 30_000 });
  await expect(desk.locator("[data-approval-row]")).toHaveCount(0);
  await expect(widgetOf(desk)).toContainText("No orders are waiting.");
  await expect(desk.getByText(ITEM)).toHaveCount(0);
  const endRead = await call(
    desk,
    "GET",
    `${W}/widget-data?of=interface&path=${SCREEN}&page=orders&widget=queue`,
  );
  expect(JSON.stringify(endRead.body)).not.toContain(ITEM);
  const endRefused = await decideApi(desk, one?.id as string, "approve");
  expect(endRefused.status).toBeGreaterThanOrEqual(400);
  await desk.context().close();
});

// ----- Two people at once -----

test("POLISH-009: two managers decide the same request: the second is told who got there first, and what they decided", async ({
  browser,
}) => {
  const other = await as(browser, OWNER);
  await manager.reload();
  await expect(widgetOf(manager)).toBeVisible({ timeout: 30_000 });
  await openApp(other);
  await rowOf(manager, 4).click();
  await rowOf(other, 4).click();
  await expect(detailOf(manager)).toContainText(`${ITEM} 4`);
  await expect(detailOf(other)).toContainText(`${ITEM} 4`);
  await approveButton(other).click();
  await expect(notice(other)).toContainText("as Maya Brooks");
  // The second one presses the button on a request that has been decided.
  await approveButton(manager).click();
  const told = detailOf(manager).getByRole("status");
  await expect(told).toContainText("Maya Brooks approved this");
  await expect(told).toContainText("as you meant to");
  // It stays to be read, with the buttons gone, until it is put away.
  await expect(approveButton(manager)).toHaveCount(0);
  await told.getByRole("button", { name: "Done" }).click();
  await expect(rowOf(manager, 4)).toHaveCount(0);
  // Putting it away moves on as deciding does: the next request opens, with the focus on it.
  await expect(detailOf(manager)).toContainText(`${ITEM} 5`);
  await expect(rowOf(manager, 5)).toBeFocused();
  // Through the API as well: a 409, naming who and what.
  const five = (await waitingIds(owner)).find((one) => one.item === `${ITEM} 5`);
  const first = await decideApi(other, five?.id as string, "approve");
  expect(first.status).toBe(200);
  const second = await decideApi(manager, five?.id as string, "reject", "Late");
  expect(second.status).toBe(409);
  expect(JSON.stringify(second.body)).toContain("Maya Brooks approved this");
  await other.context().close();
});

// ----- Phone width, the keyboard, and the themes -----

test("POLISH-005: at 390 the queue is a list and the request's page, not a cut-off pair; nothing scrolls sideways", async ({
  browser,
}) => {
  const phone = await as(browser, MANAGER, { width: 390, height: 844 });
  await openApp(phone);
  await expect(rows(phone)).not.toHaveCount(0);
  expect(await noSideways(phone)).toBe(true);
  // The buttons take the width, and are whole.
  const box = await approveButton(phone).boundingBox();
  const card = await widgetOf(phone).boundingBox();
  expect(box && card && box.x >= card.x && box.x + box.width <= card.x + card.width + 1).toBe(true);
  // The reason box opens under them, whole.
  await rejectButton(phone).click();
  const why = detailOf(phone).getByRole("textbox", { name: /Why are you rejecting this/ });
  await expect(why).toBeVisible();
  const inBox = await why.boundingBox();
  expect(inBox && inBox.x >= 0 && inBox.x + inBox.width <= 390).toBe(true);
  expect(await noSideways(phone)).toBe(true);
  await phone.keyboard.press("Escape");
  await phone.context().close();
});

test("POLISH-007: by keyboard alone: the list takes the arrows, Enter reaches the buttons, a reason is typed, and Esc leaves it", async ({
  browser,
}) => {
  const keys = await as(browser, MANAGER);
  await openApp(keys);
  const before = await rows(keys).count();
  // Into the list, and down it.
  await rows(keys).first().focus();
  await keys.keyboard.press("ArrowDown");
  const second = rows(keys).nth(1);
  await expect(second).toBeFocused();
  await expect(detailOf(keys)).toContainText(`${ITEM} 6`);
  await keys.keyboard.press("ArrowUp");
  await expect(rows(keys).first()).toBeFocused();
  // Enter takes the focus to the request's buttons.
  await keys.keyboard.press("Enter");
  await expect(approveButton(keys)).toBeFocused();
  // Tab to Reject, Space opens the box with the cursor in it, and Esc closes it.
  await keys.keyboard.press("Tab");
  await expect(rejectButton(keys)).toBeFocused();
  await keys.keyboard.press("Space");
  const why = detailOf(keys).getByRole("textbox", { name: /Why are you rejecting this/ });
  await expect(why).toBeFocused();
  await keys.keyboard.press("Escape");
  await expect(why).toHaveCount(0);
  // Approving by the keyboard: Shift+Tab to Approve, Enter. The focus lands on the next row.
  await approveButton(keys).focus();
  await keys.keyboard.press("Enter");
  await expect(notice(keys)).toContainText("Approved");
  await expect(rows(keys)).toHaveCount(before - 1);
  await expect(rows(keys).first()).toBeFocused();
  await keys.context().close();
});

for (const scheme of ["light", "dark"] as const) {
  test(`POLISH-010: no accessibility violation in the queue, ${scheme}: waiting, the reason box, and decided`, async ({
    browser,
  }) => {
    const page = await as(browser, MANAGER, { width: 1440, height: 900 }, scheme);
    await openApp(page);
    await expectNoAxeViolations(page, `the queue, ${scheme}`);
    await rejectButton(page).click();
    await expect(
      detailOf(page).getByRole("textbox", { name: /Why are you rejecting this/ }),
    ).toBeVisible();
    await expectNoAxeViolations(page, `the reason box, ${scheme}`);
    await page.keyboard.press("Escape");
    await showTab(page, "Decided");
    await expect(widgetOf(page).getByRole("list", { name: "Decided requests" })).toBeVisible();
    await expectNoAxeViolations(page, `decided, ${scheme}`);
    await page.context().close();
  });
}

// ----- The builder -----

const settings = () => owner.getByRole("complementary", { name: "Settings" });
/** The walk's widget as the draft holds it now, or as it was published when nothing is drafted. */
const queueNow = async () => {
  const answer = await call(owner, "GET", `${W}/drafts/${SCREEN}`);
  const body =
    answer.status === 404
      ? (await ok(owner, "GET", `${W}/interfaces/${SCREEN}`)).body
      : answer.body.body;
  // biome-ignore lint/suspicious/noExplicitAny: widgets are inspected freely
  return body.pages[0].widgets.find((one: any) => one.id === "queue");
};

test("POLISH-002: Add to page finds Approvals by the words 'sign off', and the widget is placed", async () => {
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await owner.goto(`${L}/screens/${SCREEN}`);
  await owner
    .getByRole("button", { name: /Add to page/ })
    .first()
    .click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill("sign off");
  const found = dialog.getByRole("button", { name: /^Approvals/ });
  await expect(found).toBeVisible();
  // The preview says what it is, and what it is good for.
  await expect(dialog).toContainText("Requests waiting for a decision");
  await expect(dialog).toContainText("Time off to sign off");
  // Esc leaves without placing anything.
  await owner.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(owner.getByRole("group", { name: "Orders to sign off", exact: true })).toHaveCount(
    1,
  );
});

test("POLISH-003: the drawer writes what each shows, the buttons' words and Ask why, and a reload keeps them", async () => {
  await owner.setViewportSize({ width: 1440, height: 1000 });
  await owner.goto(`${L}/screens/${SCREEN}`);
  await owner.getByRole("button", { name: "Orders to sign off" }).first().click();
  const side = settings();
  await expect(side).toContainText("Approvals");
  // Display: Clinic is hidden by its eye, and the list says so.
  await side.getByRole("tab", { name: /^Display/ }).click();
  await expect(side).toContainText("3 of 3 shown");
  await side.getByRole("button", { name: "Hide Clinic" }).click();
  await expect(side).toContainText("2 of 3 shown");
  await expect
    .poll(
      async () =>
        (await queueNow())?.config.fields.find((one: { name: string }) => one.name === "clinic")
          ?.hidden,
    )
    .toBe(true);
  // The canvas draws one field fewer.
  await expect(detailOnCanvas().getByText("Clinic", { exact: true })).toHaveCount(0);
  // Actions: the words of the buttons, and Ask why: Always.
  await side.getByRole("tab", { name: /^Actions/ }).click();
  await side.getByLabel("Approve says").fill("Sign off");
  await side.getByRole("radio", { name: "Always" }).check({ force: true });
  await expect
    .poll(async () => {
      const config = (await queueNow())?.config;
      return [config?.approveLabel, config?.askWhy];
    })
    .toEqual(["Sign off", "always"]);
  await expect(detailOnCanvas().getByRole("button", { name: "Sign off" })).toBeVisible();
  // A reload keeps what was written: in the drawer, and on the canvas.
  await owner.reload();
  await owner.getByRole("button", { name: "Orders to sign off" }).first().click();
  await settings()
    .getByRole("tab", { name: /^Actions/ })
    .click();
  await expect(settings().getByLabel("Approve says")).toHaveValue("Sign off");
  await expect(settings().getByRole("radio", { name: "Always" })).toBeChecked();
  await settings()
    .getByRole("tab", { name: /^Display/ })
    .click();
  await expect(settings()).toContainText("2 of 3 shown");
  await expect(settings().getByRole("button", { name: "Show Clinic" })).toBeVisible();
  await expect(detailOnCanvas().getByRole("button", { name: "Sign off" })).toBeVisible();
});

const detailOnCanvas = () => owner.locator("[data-approval-detail]").first();

test.afterAll(async () => {
  if (!owner || !W) return;
  // What still waits is cancelled, so the next walk starts from its own requests; the draft
  // files are taken away. The deployed copy of the walk's workflow and app stays, as the other
  // walk-throughs' do.
  for (const one of await waitingIds(owner).catch(() => [])) {
    await call(owner, "POST", `${W}/flow-runs/${one.id.split("/")[0]}/cancel`);
  }
  for (const path of [SCREEN, APP, FLOW]) await call(owner, "DELETE", `${W}/drafts/${path}`);
  if (endUsersBinding) {
    await call(owner, "DELETE", `/tenants/${tenantId}/bindings/${endUsersBinding}`);
  }
  for (const id of made) await call(owner, "DELETE", `/tenants/${tenantId}/members/${id}`);
  await owner.context().close();
});
