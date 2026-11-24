import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { signInWithPassword } from "./sign-in.ts";
import { type Browser, test as base, expect, type Page } from "./test.ts";

/**
 * What the polish specs (`polish-*.spec.ts`) share: one tenant seen through operator access,
 * as an operator would, with a long script path, a long error and a flow run waiting for
 * approval among its runs. One tenant serves every worker of a run (the worker-scoped `polish`
 * fixture of `test`, below): the first worker that needs it builds it, under a lock, and leaves
 * its ids in a file named for the run; the others read them. The measuring specs only look, so
 * they can share it; `polish-behaviour`, which changes things, runs in another run (the `alone`
 * phase) and so builds its own. The run's global teardown (`polish-teardown.ts`) deletes it.
 */

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.E2E_ADMIN_PASSWORD ?? "change-me-please",
};
const TENANT_ADMIN = "00000000-0000-7000-8000-000000000002";
const stamp = Date.now().toString(36);
/** How long setup waits for a run to finish, on a machine that other work is loading too. */
const RUNS_WAIT = 200_000;
const LONG = "billing/record-payment-and-reconcile-ledger-entries";

// biome-ignore lint/suspicious/noExplicitAny: answers are inspected freely
export const call = (page: Page, method: string, path: string, body?: unknown): Promise<any> =>
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

const script = (code: string) => ({
  kind: "script",
  schemaVersion: 1,
  body: {
    description: "",
    input: { type: "object" },
    output: { type: "object" },
    timeoutSeconds: 60,
    retries: { limit: 0, delaySeconds: 0, backoff: false },
    uses: { connections: [], secrets: [], variables: [] },
    source: { language: "typescript", code },
  },
});

export type Polish = {
  page: Page;
  tenant: { id: string; slug: string };
  /** The dev workspace's address in the console. */
  ws: string;
  /** The dev workspace's address in the API. */
  W: string;
  /** The production workspace's address in the console. */
  prodWs: string;
  failedRun: string;
  waitingRun: string;
  /**
   * Whether a data source is bound to a database the console can read. A source is somebody
   * else's database, so one is bound only when E2E_SOURCE_URL names a Postgres to read; the
   * source page is measured when it is, and left out (and said so) when it is not.
   */
  sourceBound: boolean;
  /** The dashboard "Clinic visits": the page editor of a dashboard is measured on it. */
  board: string;
};

/** Signs in and seeds a tenant; `part` names the worker, so each worker has a tenant of its own. */
export async function setUpPolishTenant(browser: Browser, part: string): Promise<Polish> {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await signInWithPassword(page, ADMIN.email, ADMIN.password);
  const tenant: { id: string; slug: string } = await call(page, "POST", "/tenants", {
    slug: `polish-${stamp}-${part}`,
    name: "Polish",
  });
  await call(page, "POST", `/tenants/${tenant.id}/access-grants`, {
    reason: "Measuring the console's polish against the roadmap's targets",
    roleId: TENANT_ADMIN,
  });
  const prod = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "main",
    name: "Main",
    type: "production",
  });
  const dev = await call(page, "POST", `/tenants/${tenant.id}/workspaces`, {
    slug: "dev",
    name: "Dev",
    type: "dev",
    linkedWorkspaceId: prod.id,
  });
  const W = `/tenants/${tenant.id}/workspaces/${dev.id}`;
  const prodWs = `/t/${tenant.id}/workspaces/${prod.id}`;
  const ws = `/t/${tenant.id}/workspaces/${dev.id}`;
  await call(
    page,
    "PUT",
    `${W}/drafts/${LONG}`,
    script(
      "export default async () => {\n" +
        '  throw new Error("The SMS gateway refused the message because the sender ID is not registered for this country, so the customer was not told their payment was recorded");\n};\n',
    ),
  );
  await call(
    page,
    "PUT",
    `${W}/drafts/stock/check`,
    script("export default async () => ({ ok: true });\n"),
  );
  await call(page, "PUT", `${W}/drafts/refunds/approve`, {
    kind: "flow",
    schemaVersion: 1,
    body: {
      nodes: {
        start: { type: "trigger", trigger: { type: "manual" } },
        ask: { type: "approval", title: "Refund the Brooks family", detail: "trigger" },
        done: { type: "set", values: { refunded: "true" } },
      },
      edges: [
        { from: "start", to: "ask" },
        { from: "ask", to: "done" },
      ],
    },
  });
  // The data screens (A2-31) are measured with something on them: a table with rows, a
  // saved query, a variable and a dashboard, so none is judged while empty.
  const table = (name: string, body: object) =>
    call(page, "PUT", `${W}/resources/${name}`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      body,
    });
  await table("patients", {
    columns: { name: { type: "text", required: true }, visits: { type: "integer" } },
    display: "name",
  });
  for (const [name, visits] of [
    ["Amara Brooks", 3],
    ["Joaquin Reyes", 1],
    ["Priya Natarajan-Whitfield", 7],
  ] as const) {
    await call(page, "POST", `${W}/rows/patients`, { name, visits });
  }
  let sourceBound = false;
  if (process.env.E2E_SOURCE_URL) {
    try {
      const url = new URL(process.env.E2E_SOURCE_URL);
      await call(page, "PUT", `${W}/drafts/erp`, {
        kind: "data_source",
        schemaVersion: 1,
        create: true,
        body: { connector: "postgres" },
      });
      await call(page, "PUT", `${W}/data-source-bindings/erp`, {
        config: {
          host: url.hostname,
          port: Number(url.port || 5432),
          database: url.pathname.slice(1),
          user: decodeURIComponent(url.username),
        },
        password: decodeURIComponent(url.password),
      });
      await call(page, "GET", `${W}/data-source-tables/erp`);
      sourceBound = true;
    } catch {
      sourceBound = false;
    }
  }
  await call(page, "PUT", `${W}/drafts/reports/visits-by-patient`, {
    kind: "query",
    schemaVersion: 1,
    create: true,
    body: { sql: "select name, visits from patients order by visits desc" },
  });
  await call(page, "PUT", `${W}/drafts/billing/late-fee`, {
    kind: "variable",
    schemaVersion: 1,
    body: { description: "What a late payment costs, in cents" },
  });
  const board = await call(page, "POST", `${W}/dashboards`, { title: "Clinic visits" });
  await call(page, "PUT", `${W}/dashboards/${board.id}`, {
    revision: board.revision,
    body: {
      title: "Clinic visits",
      widgets: [
        {
          id: "visits",
          type: "core/stat",
          title: "Visits",
          at: { x: 0, y: 0, w: 3, h: 3 },
          data: {
            value: {
              source: {
                visual: {
                  table: "patients",
                  measures: [{ fn: "sum", column: "visits", as: "visits" }],
                },
              },
            },
          },
        },
        {
          id: "by-patient",
          type: "core/table",
          title: "Visits by patient",
          at: { x: 3, y: 0, w: 6, h: 6 },
          data: {
            rows: {
              source: { visual: { table: "patients", groupBy: [{ column: "name" }] } },
            },
          },
        },
      ],
    },
  });
  // An app made of pages, for the page editor of an app: a stat and a table under a filter.
  await call(page, "PUT", `${W}/drafts/screens/front-desk`, {
    kind: "interface",
    schemaVersion: 2,
    create: true,
    body: {
      title: "Front desk",
      pages: [
        {
          id: "patients",
          title: "Patients",
          widgets: [
            {
              // The page's filter is a Search and filter widget since phase 27.
              id: "filters",
              type: "core/filter",
              at: { x: 0, y: 0, w: 12, h: 2 },
              config: { filters: [{ name: "name", label: "Name", type: "text" }], reset: true },
            },
            {
              // A Section holding the stat and the note on its own grid (phase 27), so the page
              // editor is measured with a container drawn, in its outline and on its canvas.
              id: "totals",
              type: "core/section",
              title: "Totals",
              at: { x: 0, y: 2, w: 12, h: 4 },
              config: {},
            },
            {
              id: "visits",
              type: "core/stat",
              title: "Visits",
              in: { widget: "totals" },
              at: { x: 0, y: 0, w: 3, h: 3 },
              data: {
                value: {
                  source: {
                    visual: {
                      table: "patients",
                      measures: [{ fn: "sum", column: "visits", as: "visits" }],
                    },
                  },
                  filters: [{ filter: "name", column: "name" }],
                },
              },
              config: { caption: "Across the patients shown" },
            },
            {
              id: "list",
              type: "core/table",
              title: "Patients",
              at: { x: 0, y: 6, w: 12, h: 8 },
              data: {
                rows: {
                  source: { visual: { table: "patients", sort: [{ by: "name" }] } },
                  filters: [{ filter: "name", column: "name" }],
                },
              },
            },
            {
              id: "note",
              type: "core/text",
              in: { widget: "totals" },
              at: { x: 3, y: 0, w: 9, h: 3 },
              config: {
                text: ":::alert[Counts are of visits]{type=info}\nA patient's visits are counted once each.\n:::",
              },
            },
          ],
        },
      ],
    },
  });
  await call(page, "PUT", `${W}/drafts/front-desk`, {
    kind: "app",
    schemaVersion: 1,
    create: true,
    body: { title: "Front desk", interface: "screens/front-desk" },
  });
  await call(page, "POST", `${W}/changes/deploy`, {});
  const failedRun = (await call(page, "POST", `${W}/runs`, { script: LONG, input: {} })).id;
  const okRun = (await call(page, "POST", `${W}/runs`, { script: "stock/check", input: {} })).id;
  const waitingRun = (
    await call(page, "POST", `${W}/flow-runs`, { flow: "refunds/approve", input: {} })
  ).id;
  // Both runs are done before anything is measured: a run still waiting draws the queue on
  // the workers screen, and a loaded machine takes a minute to start the tenant's worker.
  await expect
    .poll(async () => (await call(page, "GET", `${W}/runs/${failedRun}`)).status, {
      timeout: RUNS_WAIT,
    })
    .toBe("failed");
  await expect
    .poll(async () => (await call(page, "GET", `${W}/runs/${okRun}`)).status, {
      timeout: RUNS_WAIT,
    })
    .not.toMatch(/^(queued|running)$/);
  await expect
    .poll(
      async () =>
        (await call(page, "GET", `${W}/approvals`)).items.some(
          (one: { flowRunId: string }) => one.flowRunId === waitingRun,
        ),
      { timeout: RUNS_WAIT },
    )
    .toBe(true);
  return { page, tenant, ws, W, prodWs, failedRun, waitingRun, sourceBound, board: board.id };
}

/**
 * Deletes the tenant. The operator's own preferences are left alone: the one the specs change
 * (`operator.strip`) names the hidden grant, and a grant is the tenant's own, so it goes with it.
 */
export async function tearDownPolishTenant({ page, tenant }: Polish) {
  await call(page, "POST", `/tenants/${tenant.id}/deletion`, { confirm: tenant.slug }).catch(
    () => {},
  );
}

/** The workbenches (`nav.ts`): lists that fill the work area beside an inspector. */
export const workbenches = (ctx: Polish) => [
  ["runs", `${ctx.ws}/runs`],
  ["triggers", `${ctx.ws}/triggers`],
  ["events", `${ctx.ws}/events`],
  ["flows", `${ctx.ws}/flows`],
  ["scripts", `${ctx.ws}/scripts`],
  ["apps", `${ctx.ws}/apps`],
  ["a table's rows", `${ctx.ws}/tables/patients`],
  // A data source's tables beside its rows, when a source is bound (see `sourceBound`).
  ...(ctx.sourceBound ? [["a data source's rows", `${ctx.ws}/sources/erp`]] : []),
  ["approvals", `/t/${ctx.tenant.id}/approvals`],
  ["members", `/t/${ctx.tenant.id}/members`],
  ["end-users", `/t/${ctx.tenant.id}/end-users`],
  ["end-user-groups", `/t/${ctx.tenant.id}/end-user-groups`],
  ["audit", `/t/${ctx.tenant.id}/audit`],
  ["tenants", "/"],
  ["instance members", "/instance/members"],
  ["operators", "/instance/operators"],
  ["instance audit", "/instance/audit"],
];

/** Every screen whose layout is judged: the workbenches, and the screens the audit named. */
export const screens = (ctx: Polish) => [
  ...workbenches(ctx),
  ["overview", `${ctx.ws}/overview`],
  ["release", `${ctx.ws}/release`],
  ["tables", `${ctx.ws}/tables`],
  ["a table's definition", `${ctx.ws}/tables/patients?view=definition`],
  ["connections", `${ctx.ws}/connections`],
  ["settings", `${ctx.ws}/settings`],
  ["a flow", `${ctx.ws}/flows/refunds/approve`],
  ["tenant", `/t/${ctx.tenant.id}`],
  ["sso", `/t/${ctx.tenant.id}/single-sign-on`],
  ["domains", `/t/${ctx.tenant.id}/domains`],
  ["account", "/account/api-keys"],
  // The data screens (A2-31), with a table, a saved query, a variable and a dashboard to hold.
  ["queries", `${ctx.ws}/queries`],
  ["sources", `${ctx.ws}/sources`],
  ["dashboards", `${ctx.ws}/dashboards`],
  ["files", `${ctx.ws}/files`],
  ["variables", `${ctx.ws}/variables`],
  ["alerts", `${ctx.ws}/alerts`],
  ["retention", `/t/${ctx.tenant.id}/retention`],
  // The rest of the navigation, which had no finding against it but was never looked at.
  ["app builder", `${ctx.ws}/screens`],
  // The page editor (phase 25), of an app and of a dashboard: the same editor, so both are judged.
  ["the page editor of an app", `${ctx.ws}/screens/screens/front-desk`],
  ["the page editor of a dashboard", `${ctx.ws}/dashboards/${ctx.board}?edit=1`],
  ["extensions", `${ctx.ws}/extensions`],
  ["documentation", `${ctx.ws}/docs`],
  // The product's own documentation (phase 30): a page of the server, not of the console, with a
  // `main`, so the same measures (text over text, box in box) judge it. Its home, as pages move.
  ["the product's documentation", "/docs/"],
  ["resources", `${ctx.ws}/resources`],
  ["workspace approvals", `${ctx.ws}/approvals`],
  ["git sync", `${ctx.ws}/git`],
  ["secrets", `${ctx.ws}/secrets`],
  ["workspaces", `/t/${ctx.tenant.id}/workspaces`],
  ["service accounts", `/t/${ctx.tenant.id}/service-accounts`],
  ["operator access", `/t/${ctx.tenant.id}/operator-access`],
  ["tenant branding", `/t/${ctx.tenant.id}/branding`],
  ["repository", `/t/${ctx.tenant.id}/repository`],
  ["workers", `/t/${ctx.tenant.id}/workers`],
  ["export", `/t/${ctx.tenant.id}/export`],
  ["instance sso", "/instance/single-sign-on"],
  ["databases", "/instance/databases"],
  ["import", "/instance/import"],
  ["instance triggers", "/instance/triggers"],
  ["instance health", "/instance/health"],
  ["instance branding", "/instance/branding"],
  ["kit", "/instance/kit"],
  // A flow run, whose timeline is judged again at 390 px below.
  ["a flow run", `${ctx.ws}/runs/${ctx.waitingRun}`],
];

/**
 * The sections of `nav.ts` that the measures above do not reach yet. A section is
 * either measured in `screens()` or listed here; `apps/console/src/enforce.test.ts`
 * fails on one that is neither, so a new section is measured or its absence is said
 * (the polish gate, step 6). Phase 22 M7 emptied this list: the data screens were
 * found by the polish audit to be outside every layout measure (A2-31). A section that
 * cannot be measured yet goes back here with the reason on the line above it.
 */
export const NOT_MEASURED: string[] = [];

/** Opens an address and waits until the screen has loaded. */
export async function open(page: Page, path: string) {
  if (path === "/") {
    // Opened fresh, "/" reopens the last place a member was: the list is reached from inside.
    await page.goto("/instance/members");
    await page.locator("main").first().waitFor();
    await page.evaluate(() => {
      history.pushState(null, "", "/");
      dispatchEvent(new PopStateEvent("popstate"));
    });
  } else await page.goto(path);
  await page.locator("main").first().waitFor();
  await expect(page.getByText(/^Loading/).first()).toBeHidden({ timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(250);
}

export const WIDTHS = [390, 768, 1280, 1440];

/** The file that names a run's shared tenant: the run is the process that started the workers. */
export const sharedFile = (run: number) =>
  new URL(`./.auth/polish-${run}.json`, import.meta.url).pathname;

/** The run's tenant: built by the first worker to ask, under a lock; read by the others. */
async function sharedTenant(browser: Browser): Promise<Polish> {
  const file = sharedFile(process.ppid);
  const lock = `${file}.lock`;
  mkdirSync(new URL("./.auth/", import.meta.url).pathname, { recursive: true });
  for (;;) {
    if (existsSync(file)) {
      const page = await (
        await browser.newContext({ viewport: { width: 1440, height: 900 } })
      ).newPage();
      await signInWithPassword(page, ADMIN.email, ADMIN.password);
      return { ...(JSON.parse(readFileSync(file, "utf8")) as Omit<Polish, "page">), page };
    }
    try {
      mkdirSync(lock);
    } catch {
      await new Promise((done) => setTimeout(done, 1000));
      continue;
    }
    try {
      const built = await setUpPolishTenant(browser, "shared");
      const { page: _page, ...ids } = built;
      writeFileSync(file, JSON.stringify(ids));
      return built;
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
  }
}

/**
 * `test` with a worker-scoped `polish`: the run's one tenant (see above), and a page of the
 * worker's own on it. The tests of a worker run one after another on its page.
 */
export const test = base.extend<object, { polish: Polish }>({
  polish: [
    async ({ browser }, use) => {
      const polish = await sharedTenant(browser);
      await use(polish);
      await polish.page.context().close();
    },
    { scope: "worker", timeout: 480_000 },
  ],
});

/** How many screens one test measures: about 15 page opens, 20 to 40 seconds. */
const GROUP_SIZE = 15;

/**
 * The screens' names, known before any tenant exists, so a test can be declared for each group.
 * Addresses are worked out from the worker's tenant by `screensOf`.
 */
const NAMES_CTX = {
  ws: "/ws",
  prodWs: "/prod",
  W: "/w",
  tenant: { id: "t", slug: "t" },
  board: "b",
  waitingRun: "r",
  failedRun: "f",
  sourceBound: Boolean(process.env.E2E_SOURCE_URL),
} as Polish;
const NAMES = screens(NAMES_CTX).map(([name]) => name as string);
export const WORKBENCH_NAMES = workbenches(NAMES_CTX).map(([name]) => name as string);
export const SCREEN_GROUPS: string[][] = Array.from(
  { length: Math.ceil(NAMES.length / GROUP_SIZE) },
  (_, index) => NAMES.slice(index * GROUP_SIZE, (index + 1) * GROUP_SIZE),
);
/** The addresses of a group's screens in this worker's tenant. */
export const screensOf = (ctx: Polish, names: string[]) =>
  screens(ctx).filter(([name]) => names.includes(name as string)) as [string, string][];
/** The workbenches of a group, in this worker's tenant. */
export const workbenchesOf = (ctx: Polish, names: string[]) =>
  workbenches(ctx).filter(([name]) => names.includes(name as string)) as [string, string][];
/** The test-title label of a group of screens. */
export const groupLabel = (index: number) =>
  `screens ${index * GROUP_SIZE + 1} to ${Math.min(NAMES.length, (index + 1) * GROUP_SIZE)}`;
