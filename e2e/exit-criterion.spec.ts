import { createHmac } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { GitServer } from "./git-server.ts";

/**
 * The exit criterion of phase 7, walked in a browser on a fresh instance:
 *
 * a member who signs in through single sign-on and never opens a terminal
 * writes a script, has a flow of core nodes that a signed webhook starts and
 * that starts a second flow chosen by data, deploys it and sees the commit on
 * the connected repository's branch, promotes it to production, and
 * publishes a generated app over a table that two groups of end users see
 * differently. A developer who edits the same files and pushes sees the
 * change pulled into the workspace. No screen uses a browser dialog.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const KEYCLOAK = process.env.E2E_KEYCLOAK ?? "http://localhost:8180";
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);
const SIGNING = "whsec_e2e_1";

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
type Api = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
/** Calls the API as whoever is signed in on the page, as the console itself does. */
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

const dialogs: string[] = [];
const errors: string[] = [];
async function open(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  // The console asks its questions in its own dialogs. A browser's own must never appear.
  page.on("dialog", (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 300)));
  return page;
}

test.describe.configure({ mode: "serial" });

const git = new GitServer();
let admin: Page;
let ada: Page;
let asAdmin: Api;
let asAda: Api;
let tenant: { id: string; slug: string };
let dev: string;
let prod: string;
let W: string;
let link: string;

test.beforeAll(async ({ browser }) => {
  await git.start();
  admin = await open(browser);
  await admin.goto("/");
  await admin.getByLabel("Email").fill(ADMIN.email);
  await admin.getByRole("button", { name: "Continue" }).click();
  await admin.getByLabel("Password").fill(ADMIN.password);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.getByText("All tenants").first().waitFor();
  asAdmin = apiOf(admin);
});

test.afterAll(async () => {
  await git.stop();
});

test("a member signs in through single sign-on, and is given a tenant to look after", async ({
  browser,
}) => {
  // An operator connects the organization's identity provider, once.
  for (const old of (await asAdmin("GET", "/instance/identity-providers")).body.items) {
    await asAdmin("DELETE", `/instance/identity-providers/${old.id}`);
  }
  const provider = ok(
    await asAdmin("POST", "/instance/identity-providers", {
      audience: "members",
      protocol: "oidc",
      name: "Acme Keycloak",
      config: { issuer: `${KEYCLOAK}/realms/acme`, clientId: "vynxlabs-platform" },
      clientSecret: "dev-only-oidc-secret",
      provision: true,
    }),
    "connect the provider",
  ).body;
  const domain = ok(
    await asAdmin("POST", `/instance/identity-providers/${provider.id}/domains`, {
      domain: "acme.example",
    }),
    "list the domain",
  ).body;
  ok(
    await asAdmin(
      "POST",
      `/instance/identity-providers/${provider.id}/domains/${domain.id}/checks`,
    ),
    "prove the domain",
  );
  ok(
    await asAdmin("PATCH", `/instance/identity-providers/${provider.id}`, { enabled: true }),
    "turn the provider on",
  );

  ada = await open(browser);
  await ada.goto("/");
  await ada.getByLabel("Email").fill("ada@acme.example");
  await ada.getByRole("button", { name: "Continue" }).click();
  await ada.getByRole("link", { name: "Sign in with Acme Keycloak" }).click();
  await ada.getByLabel("Username or email").fill("ada");
  await ada.getByLabel("Password", { exact: true }).fill("ada-password");
  await ada.getByRole("button", { name: "Sign In" }).click();
  await ada.waitForURL(
    (url) => url.origin === new URL(ada.url()).origin && !url.href.includes(":8180"),
  );
  asAda = apiOf(ada);
  await expect
    .poll(async () => (await asAda("GET", "/me")).body?.principal?.email)
    .toBe("ada@acme.example");

  // The operator makes her tenant and hands it to her. From here on everything is hers to do.
  tenant = ok(
    await asAdmin("POST", "/tenants", { slug: `e2e-${stamp}`, name: `E2E ${stamp}` }),
    "make the tenant",
  ).body;
  const grant = ok(
    await asAdmin("POST", `/tenants/${tenant.id}/access-grants`, {
      reason: "Hand the tenant over",
      roleId: TENANT_ADMIN,
      durationMinutes: 30,
    }),
    "open access",
  ).body;
  const member = ok(
    await asAdmin("POST", `/tenants/${tenant.id}/members`, { email: "ada@acme.example" }),
    "add Ada",
  ).body;
  ok(
    await asAdmin("POST", `/tenants/${tenant.id}/bindings`, {
      principalType: "member",
      principalId: member.id,
      roleId: TENANT_ADMIN,
    }),
    "make Ada the tenant's admin",
  );
  ok(await asAdmin("DELETE", `/tenants/${tenant.id}/access-grants/${grant.id}`), "end access");

  const T = `/tenants/${tenant.id}`;
  prod = ok(
    await asAda("POST", `${T}/workspaces`, { slug: "main", name: "Main", type: "production" }),
    "make production",
  ).body.id;
  dev = ok(
    await asAda("POST", `${T}/workspaces`, { slug: "sandbox", name: "Sandbox", type: "dev" }),
    "make the dev workspace",
  ).body.id;
  ok(await asAda("PATCH", `${T}/workspaces/${dev}`, { linkedWorkspaceId: prod }), "link them");
  W = `${T}/workspaces/${dev}`;
  link = `/t/${tenant.id}/workspaces/${dev}`;
  // The tenant's repository, and the branch the dev workspace follows.
  ok(await asAda("PUT", `${T}/git-repository`, { url: git.url, token: git.token }), "connect git");
  ok(await asAda("PUT", `${W}/git`, { branch: "vx/sandbox" }), "follow a branch");
});

test("she writes a script and a flow of core nodes in the console, and deploys them", async () => {
  // A script, in the editor.
  await ada.goto(`${link}/scripts/new`);
  await ada.getByLabel("Path").fill("orders/greet");
  await ada.getByLabel("What it does").fill("Greets someone by name.");
  await ada
    .getByRole("region", { name: /Source of/ })
    .or(ada.locator(".monaco-editor").first())
    .first()
    .waitFor({ timeout: 30_000 });
  await ada.getByRole("button", { name: "Save draft" }).click();
  await expect(ada.getByText("Draft", { exact: true })).toBeVisible();

  // What the flows work on, made as the Resources screen makes it.
  const draft = (path: string, kind: string, body: unknown) =>
    asAda("PUT", `${W}/drafts/${path}`, { kind, schemaVersion: 1, body });
  ok(
    await draft("orders", "table", {
      columns: {
        number: { type: "text", required: true },
        total: { type: "number" },
        size: { type: "text" },
      },
    }),
    "the orders table",
  );
  ok(await asAda("PUT", `${W}/secrets/SHOP_SIGNING`, { value: SIGNING }), "the signing secret");
  const keeps = (size: string) => ({
    description: `Keeps a ${size} order.`,
    nodes: {
      start: { type: "trigger", trigger: { type: "manual" } },
      keep: {
        type: "script",
        script: "core/table-write",
        inputs: {
          table: "'orders'",
          values: `{'number': trigger.number, 'total': trigger.total, 'size': '${size}'}`,
        },
        with: { tables: ["orders"] },
      },
    },
    edges: [{ from: "start", to: "keep" }],
  });
  ok(await draft("orders/small", "flow", keeps("small")), "the flow for small orders");
  ok(await draft("orders/large", "flow", keeps("large")), "the flow for large orders");

  // The flow a signed webhook starts, drawn in the editor: a webhook, and a step that starts
  // one of the two flows, chosen by what the order is worth.
  await ada.goto(`${link}/flows/new`);
  await ada.getByLabel("Path").fill("orders/intake");
  // Steps are added from a list that opens over the canvas.
  await ada.getByRole("button", { name: "Add step" }).click();
  const palette = ada.getByRole("complementary", { name: "Steps to add" });
  // The steps that come with the platform are there to pick.
  await expect(palette.getByRole("button", { name: /^Send email/ })).toBeVisible();
  await expect(palette.getByRole("button", { name: /^Write a row/ })).toBeVisible();
  await ada.getByRole("button", { name: "Add step" }).click();
  const panel = ada.getByRole("complementary", { name: "The chosen step" });
  await ada.locator('.react-flow__node[data-id="start"]').click();
  await panel.getByLabel("It starts").selectOption("webhook");
  await panel.getByLabel("Each request is checked").selectOption("verify");
  await panel.getByLabel("Header it is sent in").fill("x-shop-signature");
  await panel.getByLabel("Secret it was signed with").click();
  await ada.getByRole("option", { name: "SHOP_SIGNING" }).click();
  await ada.getByRole("button", { name: "Add step" }).click();
  await palette.getByRole("button", { name: /^Run a flow/ }).click();
  await panel.getByLabel("Which flow").selectOption("chosen");
  await panel
    .getByLabel("Expression that gives the flow's path")
    .fill("trigger.total > 100.0 ? 'orders/large' : 'orders/small'");
  // The box keeps the cursor after a choice, so the second is typed straight after the first.
  await panel.getByRole("combobox", { name: /Flows it may start/ }).click();
  for (const one of ["orders/large", "orders/small"]) {
    await ada.keyboard.type(one);
    await ada.getByRole("option", { name: one }).first().click();
  }
  await panel.getByLabel("Input", { exact: true }).fill("trigger");
  await ada.getByRole("button", { name: "Tidy up" }).click();
  const from = await ada
    .locator('.react-flow__node[data-id="start"] .react-flow__handle.source')
    .first()
    .boundingBox();
  const to = await ada
    .locator('.react-flow__node[data-id="subflow"] .react-flow__handle.target')
    .first()
    .boundingBox();
  if (!from || !to) throw new Error("The steps are not on the canvas.");
  await ada.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await ada.mouse.down();
  await ada.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await ada.mouse.up();
  await ada.getByRole("button", { name: "Save draft" }).click();
  await expect(ada.getByRole("button", { name: "Review and deploy" })).toBeVisible();
  const saved = ok(await asAda("GET", `${W}/drafts/orders/intake`), "the drawn flow").body.body;
  expect(saved.edges).toEqual([{ from: "start", to: "subflow" }]);
  expect(saved.nodes.start.trigger.verify).toMatchObject({
    header: "x-shop-signature",
    secret: "SHOP_SIGNING",
  });

  // Deployed from the Changes screen, with a word about what changed.
  await ada.getByRole("button", { name: "Review and deploy" }).click();
  await expect(ada.getByText(/Deploying creates/)).toBeVisible();
  await ada.getByLabel("What changed").fill("Take orders in");
  await ada.getByRole("button", { name: /^Deploy \d+ changes?$/ }).click();
  await expect(ada.getByText(/Deployed as version/)).toBeVisible();
});

test("the deploy is a commit on the repository's branch, and a signed webhook starts the flow chosen by the data", async () => {
  const pushed = ok(
    await asAda("POST", `${W}/git/push`, { message: "Take orders in" }),
    "push",
  ).body;
  expect(pushed.status).toBe("done");
  const files = git.files("vx/sandbox");
  expect(files).toContain("platform/orders/intake.flow.yaml");
  expect(files).toContain("platform/orders/greet.script.ts");
  // The commit is hers: the person who asked, by the name she signed in with.
  expect(git.git(["log", "-1", "--format=%s|%ae", "vx/sandbox"], git.bare).trim()).toBe(
    "Take orders in|ada@acme.example",
  );
  // The platform's own steps are not the repository's to keep.
  expect(files.some((file) => file.includes("core/"))).toBe(false);

  const hook = (await asAda("GET", `${W}/triggers`)).body.items.find(
    (item: { path: string }) => item.path === "orders/intake",
  ).url as string;
  const send = async (order: object, secret: string) => {
    const body = JSON.stringify(order);
    return fetch(hook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shop-signature": createHmac("sha256", secret).update(body).digest("hex"),
      },
      body,
    });
  };
  expect((await send({ number: "A-1", total: 20 }, "not-the-secret")).status).toBe(401);
  expect((await send({ number: "A-1", total: 20 }, SIGNING)).status).toBe(202);
  expect((await send({ number: "A-2", total: 2500 }, SIGNING)).status).toBe(202);
  await expect
    .poll(
      async () =>
        ((await asAda("GET", `${W}/rows/orders?sort=number`)).body.items ?? []).map(
          (row: { number: string; size: string }) => `${row.number} ${row.size}`,
        ),
      { timeout: 60_000 },
    )
    .toEqual(["A-1 small", "A-2 large"]);
});

test("she promotes it to production", async () => {
  // Production is told nothing it was not given: without the secret the webhook checks
  // signatures against, the promotion is refused, and says what is missing.
  const refused = await asAda("POST", `${W}/promotions`);
  expect(refused.status).toBe(409);
  expect(refused.body.code).toBe("bindings_missing");
  ok(
    await asAda("PUT", `/tenants/${tenant.id}/workspaces/${prod}/secrets/SHOP_SIGNING`, {
      value: "whsec_production_1",
    }),
    "production's own signing secret",
  );
  const promoted = ok(await asAda("POST", `${W}/promotions`), "promote").body;
  expect(JSON.stringify(promoted)).toContain("created");
  const there = (
    await asAda("GET", `/tenants/${tenant.id}/workspaces/${prod}/resources`)
  ).body.items.map((item: { path: string }) => item.path);
  expect(there).toEqual(expect.arrayContaining(["orders/intake", "orders/greet", "orders"]));
});

test("she publishes an app over a table, and two groups of end users see it differently", async ({
  browser,
}) => {
  const T = `/tenants/${tenant.id}`;
  ok(
    await asAda("PUT", `${W}/resources/bills`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body: {
        columns: {
          number: { type: "text", required: true },
          team: { type: "text" },
          total: { type: "number" },
        },
        policy: {
          type: "rules",
          rules: [{ allow: "read", when: { column: "team", in: "groups" } }],
        },
      },
    }),
    "the bills table",
  );
  const people: Record<string, { invite: string }> = {};
  for (const team of ["north", "south"]) {
    const group = ok(
      await asAda("POST", `${T}/end-user-groups`, { name: team, description: "" }),
      "a group",
    ).body;
    const user = ok(
      await asAda("POST", `${T}/end-users`, { email: `${team}@customer.example`, name: team }),
      "an end user",
    ).body;
    ok(
      await asAda("PUT", `${T}/end-user-groups/${group.id}/members/${user.endUser.id}`),
      "put them in the group",
    );
    people[team] = { invite: user.invitation.url };
    ok(
      await asAda("POST", `${W}/rows/bills`, {
        rows: [1, 2, 3]
          .slice(0, team === "north" ? 3 : 2)
          .map((n) => ({ number: `${team}-${n}`, team, total: n * (team === "north" ? 100 : 10) })),
      }),
      "rows",
    );
  }

  // The app is made in the builder, with no code.
  await ada.goto(`${link}/screens`);
  await ada.getByRole("button", { name: "Make an app" }).first().click();
  await ada.getByRole("dialog").getByLabel("Name").fill("Bills desk");
  await ada.getByRole("dialog").getByRole("button", { name: "Make the app" }).click();
  await ada.getByText("This page has nothing on it yet.").waitFor();
  const settings = ada.getByRole("complementary", { name: "Settings" });
  const pick = async () => {
    await settings.getByLabel("Table", { exact: true }).click();
    await ada.keyboard.type("bills");
    await ada.getByRole("option", { name: "bills" }).first().click();
  };
  await ada.getByRole("button", { name: "Table", exact: true }).click();
  await settings.getByLabel("Title").fill("Bills");
  await pick();
  await settings.getByLabel("Height").fill("7");
  await ada.getByRole("button", { name: "Table", exact: true }).click();
  await settings.getByLabel("Title").fill("Total owed");
  await pick();
  await settings.getByLabel("Show totals in place of rows").check();
  await settings.getByLabel("Total 1", { exact: true }).selectOption("sum");
  await settings.getByLabel("Height").fill("4");
  await ada.waitForTimeout(1500);
  await ada.getByRole("button", { name: "Publish" }).click();
  await ada.getByText("Published. People who open the app now see this.").waitFor();
  const url = (await ada
    .getByRole("link", { name: "Open the app" })
    .getAttribute("href")) as string;

  // Shared with every end user, from the apps screen.
  await ada.goto(`${link}/apps`);
  await ada.getByRole("row", { name: /Bills desk/ }).click();
  await ada
    .getByRole("complementary", { name: "The chosen app" })
    .getByRole("button", { name: "Share" })
    .click();
  const dialog = ada.getByRole("dialog");
  await dialog.getByLabel("Share with").selectOption("end_users");
  await dialog.getByRole("button", { name: "Share" }).click();
  await dialog.getByText("may read").waitFor();

  // Each person opens the same address, and is shown the rows of their own group.
  const sees: Record<string, { rows: number; total: string }> = {};
  for (const team of ["north", "south"]) {
    const visitor = await open(browser);
    const invite = new URL(people[team]?.invite as string);
    await visitor.goto(`${invite.pathname}${invite.search}`);
    await visitor.getByLabel("Password", { exact: false }).first().fill("a-good-long-password");
    await visitor.getByRole("button").first().click();
    await visitor.waitForLoadState();
    await visitor.goto(url);
    const bills = visitor.getByRole("region", { name: "Bills" });
    await bills.getByRole("row").nth(1).waitFor();
    await expect
      .poll(async () => (await bills.getByRole("row").count()) - 1)
      .toBe(team === "north" ? 3 : 2);
    sees[team] = {
      rows: (await bills.getByRole("row").count()) - 1,
      total: (
        (await visitor
          .getByRole("region", { name: "Total owed" })
          .getByRole("cell")
          .last()
          .textContent()) ?? ""
      ).trim(),
    };
    await visitor.context().close();
  }
  expect(sees).toEqual({ north: { rows: 3, total: "600" }, south: { rows: 2, total: "30" } });
});

test("a developer edits a file and pushes, and the change is pulled into the workspace", async () => {
  // What the builder published is on the branch too, once pushed.
  ok(await asAda("POST", `${W}/git/push`, { message: "Publish the bills app" }), "push again");
  git.edit(
    "vx/sandbox",
    "platform/orders/small.flow.yaml",
    (text) => text.replace("Keeps a small order.", "Keeps a small order, as a developer put it."),
    "Reword",
  );
  const pulled = ok(await asAda("POST", `${W}/git/pull`, {}), "pull").body;
  expect(pulled.status).toBe("done");
  expect(pulled.applied).toEqual(["orders/small.flow"]);
  expect((await asAda("GET", `${W}/resources/orders/small`)).body.body.description).toBe(
    "Keeps a small order, as a developer put it.",
  );
  // The console shows where the workspace stands against its branch.
  await ada.goto(`${link}/git`);
  await expect(ada.getByText("vx/sandbox").first()).toBeVisible();
});

test("no screen used a browser dialog, and none threw", () => {
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});
