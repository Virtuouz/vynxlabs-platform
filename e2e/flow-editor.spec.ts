import { signInWithPassword } from "./sign-in.ts";
import { expect, type Page, test } from "./test.ts";
import { expectNoAxeViolations } from "./visual.ts";

/**
 * The flow editor, in a browser (phase 10, milestone 4): a draft is tested
 * from its editor, each step's state shows on its own graph, a step's output
 * is read beside it, an expression shows what it gives against the test, and
 * a removed step comes back with ⌘Z, kept by autosave.
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

const flow = {
  description: "Counts a customer's name",
  nodes: {
    start: {
      type: "trigger",
      trigger: {
        type: "manual",
        input: {
          type: "object",
          properties: { customer: { type: "string", title: "Customer" } },
          required: ["customer"],
        },
      },
    },
    totals: { type: "set", values: { count: "size(trigger.customer)" } },
    check: { type: "set", values: { double: "steps.totals.output.count * 2.0" } },
  },
  edges: [
    { from: "start", to: "totals" },
    { from: "totals", to: "check" },
  ],
};

test("a draft flow is tested, read, previewed and undone without leaving its editor", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  page.on("dialog", (dialog) => {
    errors.push(`a browser dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await signInWithPassword(page, ADMIN.email, ADMIN.password);

  const tenant = await call(page, "POST", "/tenants", {
    slug: `fe-${stamp}`,
    name: "Flow editing",
  });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The flow editor's e2e test",
    roleId: TENANT_ADMIN,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/orders/count`, {
    kind: "flow",
    schemaVersion: 1,
    body: flow,
  });

  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/flows/edit/orders/count`);
  const canvas = page.getByTestId("flow-canvas");
  await canvas.getByText("totals", { exact: true }).waitFor();
  await expectNoAxeViolations(page, "the flow editor");

  // Tested from the editor: the steps' states fill in on its own graph.
  await page.getByRole("button", { name: "Test", exact: true }).click();
  const panel = page.getByRole("region", { name: "The test run" });
  await panel.getByLabel("Customer").fill("ada");
  await panel.getByRole("button", { name: "Run a test" }).click();
  const steps = panel.getByRole("list", { name: "Steps of the test" });
  await expect(steps.getByRole("button", { name: /^check/ })).toContainText("Succeeded", {
    timeout: 30_000,
  });
  await expect(canvas.getByText("Succeeded")).toHaveCount(3);
  expect(page.url()).toContain("/flows/edit/orders/count");

  // A step's output, beside its settings; and what an expression gives against the test.
  await steps.getByRole("button", { name: /^totals/ }).click();
  const aside = page.getByRole("complementary", { name: "The chosen step" });
  const last = aside.getByRole("region", { name: "Last test" });
  await expect(last).toContainText("Succeeded");
  await expect(last).toContainText('"count"');
  await expect(aside.getByText("Gives 3", { exact: true })).toBeVisible();
  await aside.getByLabel("Expression").fill("size(trigger.customr)");
  await expect(aside.getByText(/customr/).last()).toBeVisible();
  await aside.getByLabel("Expression").fill("size(trigger.customer) * 10");
  await expect(aside.getByText("Gives 30", { exact: true })).toBeVisible();
  // Undone and redone from outside the field: the step stays chosen, its settings in view.
  await page.getByRole("heading", { name: "Test the draft" }).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(aside.getByLabel("Expression")).not.toHaveValue("size(trigger.customer) * 10");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(aside.getByLabel("Expression")).toHaveValue("size(trigger.customer) * 10");

  // A step removed by mistake comes back with ⌘Z, and the draft keeps it.
  await steps.getByRole("button", { name: /^check/ }).click();
  await aside.getByRole("button", { name: "Remove this step" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(canvas.getByText("check", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("heading", { name: "About this flow" }).click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvas.getByText("check", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({
    timeout: 10_000,
  });
  const saved = await call(page, "GET", `${W}/drafts/orders/count`);
  expect(Object.keys(saved.body.nodes).sort()).toEqual(["check", "start", "totals"]);
  expect(saved.body.nodes.totals.values.count).toBe("size(trigger.customer) * 10");

  // With the connection lost, saving says so and tries again, and leaving asks first.
  const draftAddress = `**/api/v1${W}/drafts/orders/count`;
  await page.route(draftAddress, (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(canvas.getByText("check", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Could not save. Trying again…" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("link", { name: "Flows", exact: true }).first().click();
  const leaving = page.getByRole("dialog");
  await expect(leaving).toContainText("Leave without saving?");
  await leaving.getByRole("button", { name: "Stay" }).click();
  expect(page.url()).toContain("/flows/edit/orders/count");
  // Back online, it catches up by itself.
  await page.unroute(draftAddress);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvas.getByText("check", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({
    timeout: 20_000,
  });

  await page.reload();
  await canvas.getByText("check", { exact: true }).waitFor();
  expect(errors).toEqual([]);
});

test("a flow is built, saved and tested from the keyboard, without dragging", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  page.on("dialog", (dialog) => {
    errors.push(`a browser dialog: ${dialog.message()}`);
    void dialog.dismiss();
  });
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `fk-${stamp}`,
    name: "Flow by keyboard",
  });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "The flow editor's keyboard e2e test",
    roleId: TENANT_ADMIN,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  await page.goto(`/t/${tenant.id}/workspaces/${dev.id}/flows/new`);

  /** Presses a control by giving it focus and pressing Enter, as a keyboard does. */
  const press = async (control: ReturnType<Page["getByRole"]>) => {
    await control.focus();
    await page.keyboard.press("Enter");
  };
  await page.getByLabel("Path").fill("orders/route");
  const addStep = async (label: string) => {
    await press(page.getByRole("button", { name: "Add step" }));
    await press(
      page
        .getByRole("complementary", { name: "Steps to add" })
        .getByRole("button", { name: new RegExp(`^${label}`) }),
    );
  };
  await addStep("Branch");
  await addStep("Set values");
  await addStep("Approval");
  await addStep("Fail");

  const steps = page.getByRole("navigation", { name: "Steps in order" });
  const aside = page.getByRole("complementary", { name: "The chosen step" });
  const pick = async (step: string, field: string, target: string) => {
    await press(steps.getByRole("button", { name: new RegExp(`^${step}`) }));
    await aside.getByLabel(field).selectOption(target);
  };
  await pick("start", "Then go to", "branch");
  await pick("branch", "When yes, go to", "set");
  await pick("branch", "Otherwise, go to", "approve");
  await pick("approve", "On failure, go to", "fail");
  // The outline follows the runs' order: from the start along each connection.
  await expect(steps.getByRole("button")).toHaveText([
    /^start/,
    /^branch/,
    /^set/,
    /^approve/,
    /^fail/,
  ]);
  // Each connection is named for a screen reader.
  await expect(page.getByRole("group", { name: "approve to fail, on error" })).toHaveCount(1);

  await press(page.getByRole("button", { name: "Save draft" }));
  await expect(page).toHaveURL(/\/flows\/edit\/orders\/route(\?|$)/);
  const saved = await call(page, "GET", `${W}/drafts/orders/route`);
  expect(saved.body.edges).toEqual(
    expect.arrayContaining([
      { from: "start", to: "branch" },
      { from: "branch", to: "set", output: "yes" },
      { from: "branch", to: "approve", output: "otherwise" },
      { from: "approve", to: "fail", error: true },
    ]),
  );

  await press(page.getByRole("button", { name: "Test", exact: true }));
  const panel = page.getByRole("region", { name: "The test run" });
  await press(panel.getByRole("button", { name: "Run a test" }));
  await expect(
    panel.getByRole("list", { name: "Steps of the test" }).getByRole("button", { name: /^set/ }),
  ).toContainText("Succeeded", { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("steps are duplicated, copied into another flow, and a renamed case keeps its connection", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant = await call(page, "POST", "/tenants", {
    slug: `canvas-${stamp}`,
    name: "Canvas",
    addCreator: true,
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const link = `/t/${tenant.id}/workspaces/${dev.id}`;
  await call(page, "PUT", `${W}/drafts/orders/count`, {
    kind: "flow",
    schemaVersion: 1,
    body: flow,
  });
  await call(page, "PUT", `${W}/drafts/orders/other`, {
    kind: "flow",
    schemaVersion: 1,
    body: {
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        size: { type: "branch", cases: [{ name: "large", when: "true" }] },
        big: { type: "set", values: { big: "true" } },
      },
      edges: [
        { from: "start", to: "size" },
        { from: "size", to: "big", output: "large" },
      ],
    },
  });
  const body = async (path: string) => (await call(page, "GET", `${W}/drafts/${path}`)).body;
  const saved = async (path: string, done: (flow: { nodes: Record<string, unknown> }) => boolean) =>
    expect.poll(async () => done(await body(path)), { timeout: 20_000 }).toBe(true);

  // ----- Duplicate: one action, a valid name, references between the copies following -----
  await page.goto(`${link}/flows/edit/orders/count`);
  const canvas = page.getByTestId("flow-canvas");
  await canvas.getByText("totals", { exact: true }).waitFor({ timeout: 30_000 });
  await canvas.getByText("totals", { exact: true }).click();
  await canvas.getByText("check", { exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await expect(page.getByRole("region", { name: "The chosen steps" })).toContainText(
    "2 steps chosen",
  );
  await page.keyboard.press("ControlOrMeta+d");
  await expect(canvas.getByText("check_2", { exact: true })).toBeVisible();
  await saved("orders/count", (flow) => "totals_2" in flow.nodes && "check_2" in flow.nodes);
  const copied = (await body("orders/count")).nodes.check_2 as { values: Record<string, string> };
  expect(copied.values.double).toBe("steps.totals_2.output.count * 2.0");
  // One step to undo.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(canvas.getByText("check_2", { exact: true })).toHaveCount(0);
  await saved("orders/count", (flow) => !("check_2" in flow.nodes));

  // ----- Copy into another flow -----
  await canvas.getByText("totals", { exact: true }).click();
  await canvas.getByText("check", { exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.getByText("2 steps copied.")).toBeVisible();
  await page.goto(`${link}/flows/edit/orders/other`);
  await canvas.getByText("size", { exact: true }).waitFor({ timeout: 30_000 });
  await canvas.click({ position: { x: 40, y: 40 } });
  await page.keyboard.press("ControlOrMeta+v");
  await expect(canvas.getByText("check", { exact: true })).toBeVisible();
  await saved("orders/other", (flow) => "totals" in flow.nodes && "check" in flow.nodes);

  // ----- The context menu offers the same, on a step -----
  await canvas.getByText("big", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(canvas.getByText("big_2", { exact: true })).toBeVisible();

  // ----- A renamed case keeps its connection -----
  await canvas.getByText("size", { exact: true }).click();
  const settings = page.getByRole("complementary", { name: "The chosen step" });
  const name = settings.getByRole("group", { name: "Cases, tried in order" }).getByLabel("Name");
  await name.fill("huge");
  await saved("orders/other", (flow) => {
    const edges = (flow as unknown as { edges: { from: string; to: string; output?: string }[] })
      .edges;
    return edges.some(
      (edge) => edge.from === "size" && edge.to === "big" && edge.output === "huge",
    );
  });

  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
});
