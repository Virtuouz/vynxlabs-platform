// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  Promotion,
  TenantExport,
  TenantImport,
  WorkspaceControls,
  type WorkspaceSummary,
} from "./screens/Environments.tsx";
import { show } from "./testing.tsx";

configure({ asyncUtilTimeout: 5000 });

const base = "/tenants/t1";
let calls: { method: string; url: string; body: unknown; headers: Record<string, string> }[];
let routes: Record<string, (body: unknown) => [number, unknown]>;

const dev: WorkspaceSummary = {
  id: "w-dev",
  slug: "dev",
  name: "Dev",
  type: "dev",
  linkedWorkspaceId: "w-main",
  triggersPaused: false,
};
const main: WorkspaceSummary = {
  ...dev,
  id: "w-main",
  slug: "main",
  name: "Main",
  type: "production",
  linkedWorkspaceId: null,
};

beforeEach(() => {
  calls = [];
  routes = { [`GET /api/v1${base}/workspaces`]: () => [200, { items: [dev, main] }] };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const url = new URL(address, "http://console.test");
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({
      method,
      url: `${url.pathname}${url.search}`,
      body,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    const handler = routes[`${method} ${url.pathname}`];
    const [status, answer] = handler
      ? handler(body)
      : [404, { status: 404, detail: `No mock for ${method} ${url.pathname}` }];
    return new Response(answer === null ? "" : JSON.stringify(answer), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sent = (method: string) => calls.filter((call) => call.method === method);

test("promotion shows what would change before anything does, then promotes", async () => {
  routes[`GET /api/v1${base}/workspaces/w-dev/promotion-preview`] = () => [
    200,
    {
      target: { id: "w-main", slug: "main", name: "Main", type: "production" },
      bundle: { digest: "abcdef0123456789", version: 4 },
      possible: true,
      refusal: null,
      summary: {
        created: 1,
        updated: 1,
        deleted: 0,
        unchanged: 9,
        changes: [
          { change: "created", kind: "script", path: "orders/record" },
          { change: "updated", kind: "table", path: "orders" },
        ],
        data: ["Table orders: column total renamed to amount. Its values are kept."],
      },
    },
  ];
  routes[`POST /api/v1${base}/workspaces/w-dev/promotions`] = () => [201, { bundleVersion: 7 }];
  show(<Promotion base={base} workspace={dev} reload={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Review and promote" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("Promote to Main");
  expect(dialog.textContent).toContain("Version 4 here, bundle abcdef012345.");
  expect(dialog.textContent).toContain("Nothing has been changed yet.");
  expect(dialog.textContent).toContain("orders/record");
  expect(dialog.textContent).toContain(
    "Table orders: column total renamed to amount. Its values are kept.",
  );
  expect(sent("POST")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Promote" }));
  expect((await screen.findByText("Promoted to Main as its version 7.")).textContent).toBeTruthy();
});

test("a promotion that would be refused says why, and offers nothing to press", async () => {
  routes[`GET /api/v1${base}/workspaces/w-dev/promotion-preview`] = () => [
    200,
    {
      target: { id: "w-main", slug: "main", name: "Main", type: "production" },
      bundle: { digest: "abcdef0123456789", version: 4 },
      possible: false,
      refusal: {
        detail: "The workspace is missing something this bundle needs.",
        errors: [
          {
            path: "/connections/erp",
            message: 'the connection "erp" is not bound in this workspace',
          },
        ],
      },
      summary: null,
    },
  ];
  show(<Promotion base={base} workspace={dev} reload={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Review and promote" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("It cannot be promoted yet.");
  expect(dialog.textContent).toContain('the connection "erp" is not bound in this workspace');
  expect(screen.queryByRole("button", { name: "Promote" })).toBeNull();
});

test("a workspace that is not linked offers no promotion, and a production workspace no panel at all", async () => {
  const { unmount } = render(
    <Promotion base={base} workspace={{ ...dev, linkedWorkspaceId: null }} reload={() => {}} />,
  );
  await screen.findByLabelText("Promotes to");
  expect(screen.queryByRole("button", { name: "Review and promote" })).toBeNull();
  routes[`PATCH /api/v1${base}/workspaces/w-dev`] = () => [200, {}];
  fireEvent.change(screen.getByLabelText("Promotes to"), { target: { value: "w-main" } });
  await waitFor(() => expect(sent("PATCH")[0]?.body).toEqual({ linkedWorkspaceId: "w-main" }));
  unmount();
  const { container } = show(<Promotion base={base} workspace={main} reload={() => {}} />);
  expect(container.textContent).toBe("");
});

test("triggers are paused and resumed, and only a dev workspace can be deleted", async () => {
  routes[`PATCH /api/v1${base}/workspaces/w-dev`] = () => [200, {}];
  const reload = vi.fn();
  const { rerender } = render(
    <WorkspaceControls base={base} tenantId="t1" workspace={dev} reload={reload} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pause triggers" }));
  await waitFor(() => expect(sent("PATCH")[0]?.body).toEqual({ triggersPaused: true }));
  expect(reload).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Delete workspace" })).toBeTruthy();

  rerender(
    <WorkspaceControls
      base={base}
      tenantId="t1"
      workspace={{ ...dev, triggersPaused: true }}
      reload={reload}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain("Triggers are paused.");
  fireEvent.click(screen.getByRole("button", { name: "Resume triggers" }));
  await waitFor(() => expect(sent("PATCH")[1]?.body).toEqual({ triggersPaused: false }));

  rerender(<WorkspaceControls base={base} tenantId="t1" workspace={main} reload={reload} />);
  expect(screen.queryByRole("button", { name: "Delete workspace" })).toBeNull();
});

test("cloning asks about data and safety, and says what the copy can reach", async () => {
  routes[`POST /api/v1${base}/workspaces/w-main/clones`] = () => [
    202,
    { id: "c1", workspaceId: "w-new", status: "running", error: null, report: {} },
  ];
  routes[`GET /api/v1${base}/workspace-clones/c1`] = () => [
    200,
    {
      id: "c1",
      workspaceId: "w-new",
      status: "succeeded",
      error: null,
      report: { resources: 12, rows: 340, tables: 3, files: 1, connections: 0, secrets: 0 },
    },
  ];
  show(<WorkspaceControls base={base} tenantId="t1" workspace={main} reload={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Clone workspace" }));
  const dialog = await screen.findByRole("dialog");
  // Safety is on unless someone turns it off.
  expect((screen.getByLabelText("Safety") as HTMLSelectElement).value).toBe("on");
  expect(dialog.textContent).toContain("The copy gets no connection, data source or secret value.");
  fireEvent.change(screen.getByLabelText("Safety"), { target: { value: "off" } });
  expect(dialog.textContent).toContain("This is recorded in the audit log.");
  fireEvent.change(screen.getByLabelText("Safety"), { target: { value: "on" } });
  fireEvent.change(screen.getByLabelText("Rows and files"), { target: { value: "yes" } });
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  await waitFor(() =>
    expect(sent("POST")[0]?.body).toEqual({
      name: "Main copy",
      slug: "main-copy",
      withData: true,
      safe: true,
    }),
  );
  await waitFor(
    () =>
      expect(screen.getByRole("dialog").textContent).toContain(
        "Copied 12 resources, 340 rows in 3 tables and 1 file.",
      ),
    { timeout: 5000 },
  );
  expect(screen.getByRole("dialog").textContent).toContain(
    "it cannot reach a real system until you bind it",
  );
  expect(screen.getByRole("button", { name: "Open the copy" })).toBeTruthy();
});

test("an export needs the passphrase typed twice the same", async () => {
  show(<TenantExport base={base} slug="acme" />);
  fireEvent.input(screen.getByLabelText("Passphrase"), { target: { value: "a long passphrase" } });
  fireEvent.input(screen.getByLabelText("Passphrase again"), {
    target: { value: "a long passphrasf" },
  });
  expect(screen.getByRole("alert").textContent).toBe("The two do not match.");
  expect(
    (screen.getByRole("button", { name: "Export tenant" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(sent("POST")).toHaveLength(0);
});

test("an import sends the file with its passphrase in a header, and reports what arrived", async () => {
  routes["GET /api/v1/instance/database-locations"] = () => [
    200,
    { items: [{ name: "acme-db", host: "db.internal", database: "acme" }] },
  ];
  routes["POST /api/v1/instance/tenant-imports"] = () => [
    201,
    {
      tenant: { id: "t9", slug: "acme", name: "Acme Corp", dataLocation: "acme-db" },
      counts: { workspace: 2, resource: 30 },
      members: { created: 2, linked: 1 },
      objects: 5,
      cancelled: { runs: 2, flowRuns: 0 },
      pausedWorkspaces: 2,
      notCarried: ["API keys: create new ones on the instance the tenant moves to."],
    },
  ];
  show(<TenantImport />);
  await screen.findByText(/acme-db: acme on db.internal/);
  const file = new File(["tar bytes"], "acme.tar", { type: "application/x-tar" });
  fireEvent.change(screen.getByLabelText("Export file"), { target: { files: [file] } });
  fireEvent.input(screen.getByLabelText("Its passphrase"), { target: { value: "the passphrase" } });
  fireEvent.change(screen.getByLabelText("Where its custom tables go"), {
    target: { value: "acme-db" },
  });
  fireEvent.submit(screen.getByLabelText("Its passphrase").closest("form") as HTMLFormElement);
  await screen.findByText(/was imported/);
  const call = sent("POST")[0];
  expect(call?.url).toBe("/api/v1/instance/tenant-imports?dataLocation=acme-db");
  expect(call?.headers["x-export-passphrase"]).toBe("the passphrase");
  expect(call?.body).toBe(file);
  const page = document.body.textContent ?? "";
  expect(page).toMatch(
    /32 rows and 5 stored objects\. Members created:\s*2\. Members linked to accounts already here:\s*1\./,
  );
  expect(page).toContain('Its custom tables are in the database location "acme-db".');
  expect(page).toContain("All 2 workspaces arrived with their triggers paused.");
  expect(page).toContain("2 runs and 0 flow runs were unfinished");
  expect(page).toContain("Not carried: API keys");
});
