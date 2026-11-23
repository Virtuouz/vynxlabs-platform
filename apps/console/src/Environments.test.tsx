// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  DeleteTenantButton,
  Promotion,
  TenantExport,
  TenantImport,
  WorkspaceControls,
  WorkspaceSettings,
  type WorkspaceSummary,
} from "./screens/Environments.tsx";
import { answer, show } from "./testing.tsx";

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
    const [status, reply] = handler
      ? handler(body)
      : [404, { status: 404, detail: `No mock for ${method} ${url.pathname}` }];
    return new Response(reply === null ? "" : JSON.stringify(reply), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sent = (method: string) => calls.filter((call) => call.method === method);

test("Review and promote opens the Release screen's promote step, which is the one place that promotes (REL-11)", async () => {
  history.replaceState(null, "", "/");
  show(<Promotion base={base} workspace={dev} reload={() => {}} />);
  fireEvent.click(await screen.findByRole("button", { name: "Review and promote" }));
  expect(location.pathname).toBe("/t/t1/workspaces/w-dev/release");
  expect(location.search).toBe("?step=promote");
  // No second dialog, and nothing asked of the server.
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(calls.filter((call) => call.url.includes("promotion"))).toHaveLength(0);
  history.replaceState(null, "", "/");
});

test("a workspace that is not linked offers no promotion, and a production workspace no panel at all", async () => {
  const { unmount } = render(
    <Promotion base={base} workspace={{ ...dev, linkedWorkspaceId: null }} reload={() => {}} />,
  );
  await screen.findByLabelText("Promotes to");
  // The workspaces it can be linked to arrive after the field itself.
  await screen.findByRole("option", { name: "Main (production)" });
  expect(screen.queryByRole("button", { name: "Review and promote" })).toBeNull();
  routes[`PATCH /api/v1${base}/workspaces/w-dev`] = () => [200, {}];
  fireEvent.change(screen.getByLabelText("Promotes to"), { target: { value: "w-main" } });
  await waitFor(() => expect(sent("PATCH")[0]?.body).toEqual({ linkedWorkspaceId: "w-main" }));
  unmount();
  const { container } = show(<Promotion base={base} workspace={main} reload={() => {}} />);
  expect(container.textContent).toBe("");
});

test("triggers are paused and resumed, and a production workspace says what deleting it needs", async () => {
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
  expect(screen.getByText("Triggers are paused")).toBeTruthy();
  expect(screen.getByText(/No schedule, webhook or event starts anything/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Resume triggers" }));
  await waitFor(() => expect(sent("PATCH")[1]?.body).toEqual({ triggersPaused: false }));

  rerender(<WorkspaceControls base={base} tenantId="t1" workspace={main} reload={reload} />);
  // A production workspace can be deleted too, by whoever was given the permission for it,
  // and the row says that nobody has it until then.
  expect(screen.getByRole("button", { name: "Delete workspace" })).toBeTruthy();
  expect(screen.getByText(/no role has until it\s+is added to one by name/)).toBeTruthy();
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

const inspection = {
  problem: null,
  tenant: { id: "t9", slug: "acme", name: "Acme Corp" },
  exportedAt: "2026-11-10T10:00:00Z",
  coreVersion: "1.8.0",
  migrationLevel: 44,
  levelMatches: true,
  history: true,
  workspaces: [
    { name: "Main", type: "production" },
    { name: "Dev", type: "dev" },
  ],
  rows: 32,
  members: 3,
  pendingRuns: 2,
  notCarried: ["API keys: create new ones on the instance the tenant moves to."],
  passphraseOk: null as boolean | null,
  tenantPresent: false,
  slugTaken: true,
};
const staged = (more: Partial<typeof inspection> = {}) => ({
  id: "s1",
  fileName: "acme.tar",
  sizeBytes: 4096,
  expiresAt: "2026-11-13T11:00:00Z",
  inspection: { ...inspection, ...more },
});

test("an import is uploaded and checked first, then imported with its passphrase in a header", async () => {
  routes["GET /api/v1/instance/database-locations/names"] = () => [
    200,
    { items: [{ name: "acme-db", description: "" }] },
  ];
  routes["POST /api/v1/instance/tenant-imports/staged"] = () => [201, staged()];
  routes["GET /api/v1/instance/tenant-imports/staged/s1"] = () => [
    200,
    staged({ passphraseOk: true, slugTaken: false }),
  ];
  routes["POST /api/v1/instance/tenant-imports/staged/s1/import"] = () => [
    201,
    {
      tenant: { id: "t9", slug: "acme-2", name: "Acme Corp", dataLocation: "acme-db" },
      counts: { workspace: 2, resource: 30 },
      members: { created: 2, linked: 1 },
      objects: 5,
      cancelled: { runs: 2, flowRuns: 0 },
      pausedWorkspaces: 2,
      notCarried: ["API keys: create new ones on the instance the tenant moves to."],
    },
  ];
  show(<TenantImport />);
  const file = new File(["tar bytes"], "acme.tar", { type: "application/x-tar" });
  fireEvent.change(screen.getByLabelText("Export file"), { target: { files: [file] } });
  fireEvent.submit(screen.getByLabelText("Export file").closest("form") as HTMLFormElement);

  // What it holds, and why it cannot come in yet.
  await screen.findByText("Acme Corp");
  expect(sent("POST")[0]?.url).toBe("/api/v1/instance/tenant-imports/staged?name=acme.tar");
  expect(sent("POST")[0]?.body).toBe(file);
  expect(screen.getByText("Its slug is taken here: choose another below")).toBeTruthy();
  expect(screen.getByText("Passphrase not checked yet")).toBeTruthy();
  const importButton = () =>
    screen.getByRole("button", { name: "Import tenant" }) as HTMLButtonElement;
  expect(importButton().disabled).toBe(true);

  fireEvent.input(screen.getByLabelText("Its passphrase"), { target: { value: "the passphrase" } });
  fireEvent.input(screen.getByLabelText("Slug on this instance"), { target: { value: "acme-2" } });
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await screen.findByText("The passphrase opens it");
  const check = sent("GET").find((call) => call.url.startsWith("/api/v1/instance/tenant-imports"));
  expect(check?.url).toBe("/api/v1/instance/tenant-imports/staged/s1?slug=acme-2");
  expect(check?.headers["x-export-passphrase"]).toBe("the passphrase");
  await screen.findByRole("option", { name: "acme-db" });
  fireEvent.change(screen.getByLabelText("Where its custom tables go"), {
    target: { value: "acme-db" },
  });
  await waitFor(() => expect(importButton().disabled).toBe(false));
  fireEvent.submit(screen.getByLabelText("Its passphrase").closest("form") as HTMLFormElement);

  await screen.findByText(/was imported/);
  const call = sent("POST")[1];
  expect(call?.url).toBe(
    "/api/v1/instance/tenant-imports/staged/s1/import?slug=acme-2&dataLocation=acme-db",
  );
  expect(call?.headers["x-export-passphrase"]).toBe("the passphrase");
  const page = document.body.textContent ?? "";
  expect(page).toMatch(
    /32 rows and 5 stored objects\. Members created:\s*2\. Members linked to accounts already here:\s*1\./,
  );
  expect(page).toContain('Its custom tables are in the database location "acme-db".');
  expect(page).toContain("All 2 workspaces arrived with their triggers paused.");
  expect(page).toContain("2 runs and 0 flow runs were unfinished");
  expect(page).toContain("Not carried: API keys");
});

test("an upload kept by another replica is said so, and asked for again", async () => {
  routes["GET /api/v1/instance/database-locations/names"] = () => [200, { items: [] }];
  routes["POST /api/v1/instance/tenant-imports/staged"] = () => [201, staged()];
  routes["GET /api/v1/instance/tenant-imports/staged/s1"] = () => [
    409,
    { status: 409, code: "staged_elsewhere", detail: "That upload is kept elsewhere." },
  ];
  show(<TenantImport />);
  const file = new File(["tar bytes"], "acme.tar", { type: "application/x-tar" });
  fireEvent.change(screen.getByLabelText("Export file"), { target: { files: [file] } });
  fireEvent.submit(screen.getByLabelText("Export file").closest("form") as HTMLFormElement);
  await screen.findByText("Acme Corp");
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await screen.findByText(/another replica of the control plane kept it/);
  expect(screen.getByRole("button", { name: "Upload and check" })).toBeTruthy();
});

test("a workspace is renamed from its settings, saved by the bar with its other settings", async () => {
  routes[`GET /api/v1${base}/workspaces/w-dev`] = () => [200, { timeZone: "UTC" }];
  routes[`PATCH /api/v1${base}/workspaces/w-dev`] = () => [200, {}];
  const reload = vi.fn();
  show(<WorkspaceSettings base={base} tenantId="t1" workspace={dev} reload={reload} />);
  const field = await screen.findByLabelText("Workspace name");
  expect((field as HTMLInputElement).value).toBe("Dev");
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  fireEvent.input(field, { target: { value: "Development" } });
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PATCH")[0]?.body).toEqual({ name: "Development" }));
  expect(reload).toHaveBeenCalled();
});

test("a workspace cannot be given an empty name", async () => {
  routes[`GET /api/v1${base}/workspaces/w-dev`] = () => [200, { timeZone: "UTC" }];
  show(<WorkspaceSettings base={base} tenantId="t1" workspace={dev} reload={() => {}} />);
  fireEvent.input(await screen.findByLabelText("Workspace name"), { target: { value: "  " } });
  expect(await screen.findByText("A workspace needs a name.")).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  expect(sent("PATCH")).toHaveLength(0);
});

test("a verdict made for another slug or passphrase does not enable the import, the check is made again, and the form starts over (INS-12)", async () => {
  routes["GET /api/v1/instance/database-locations/names"] = () => [200, { items: [] }];
  routes["POST /api/v1/instance/tenant-imports/staged"] = () => [
    201,
    staged({ passphraseOk: true, slugTaken: false }),
  ];
  let here = false;
  routes["GET /api/v1/instance/tenant-imports/staged/s1"] = () => [
    200,
    staged({ passphraseOk: true, slugTaken: false, tenantPresent: here }),
  ];
  routes["DELETE /api/v1/instance/tenant-imports/staged/s1"] = () => [204, null];
  show(<TenantImport />);
  const file = new File(["tar bytes"], "acme.tar", { type: "application/x-tar" });
  fireEvent.input(screen.getByLabelText("Its passphrase"), { target: { value: "the passphrase" } });
  fireEvent.change(screen.getByLabelText("Export file"), { target: { files: [file] } });
  fireEvent.submit(screen.getByLabelText("Export file").closest("form") as HTMLFormElement);
  await screen.findByText("Acme Corp");
  const importButton = () =>
    screen.getByRole("button", { name: "Import tenant" }) as HTMLButtonElement;
  expect(importButton().disabled).toBe(false);
  // Typing a slug makes the verdict old: the button is off at once, and the check runs by itself.
  fireEvent.input(screen.getByLabelText("Slug on this instance"), { target: { value: "other" } });
  expect(importButton().disabled).toBe(true);
  await waitFor(() =>
    expect(
      sent("GET").some((call) => call.url.endsWith("/tenant-imports/staged/s1?slug=other")),
    ).toBe(true),
  );
  await waitFor(() => expect(importButton().disabled).toBe(false));
  // The tenant is here already: the answer says so, and the button stays off.
  here = true;
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  await screen.findByText("This tenant is on this instance already");
  expect(importButton().disabled).toBe(true);
  // Throwing it away leaves nothing of what was typed.
  fireEvent.click(screen.getByRole("button", { name: "Throw it away" }));
  await screen.findByRole("button", { name: "Upload and check" });
  expect((screen.getByLabelText("Its passphrase") as HTMLInputElement).value).toBe("");
});

test("a workspace whose triggers the operator paused says so, not that they are on (INS-24)", () => {
  render(
    <WorkspaceControls
      base={base}
      tenantId="t1"
      workspace={{ ...main, triggersPaused: false, pausedByInstance: true }}
      reload={() => {}}
    />,
  );
  expect(screen.getByText("Triggers are paused by the instance")).toBeTruthy();
  expect(screen.queryByText("Triggers are on")).toBeNull();
  expect(screen.getByText(/An operator has paused every trigger in this instance/)).toBeTruthy();
});

test("a tenant whose database does not answer is deleted only after a second confirmation (INS-17, D47)", async () => {
  const sentBodies: object[] = [];
  routes["POST /api/v1/tenants/t9/deletion"] = (body) => {
    sentBodies.push(body as object);
    return (body as { tablesLeftBehind?: boolean }).tablesLeftBehind
      ? [204, null]
      : [
          503,
          {
            status: 503,
            code: "data_location_unavailable",
            detail: 'The database location "acme-db" could not be reached. no route to host',
          },
        ];
  };
  const done = vi.fn();
  show(<DeleteTenantButton tenant={{ id: "t9", slug: "acme", name: "Acme Corp" }} onDone={done} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await answer("Delete tenant", "acme");
  const anyway = await screen.findByRole("button", { name: "Delete anyway" });
  const second = anyway.closest('[role="dialog"]')?.textContent ?? "";
  expect(second).toContain("could not be reached");
  expect(second).toContain("its tables stay in that database");
  fireEvent.click(anyway);
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(sentBodies).toEqual([{ confirm: "acme" }, { confirm: "acme", tablesLeftBehind: true }]);
});

test("WLK-17f: a file with no signature is a note, not a failure, and its long line wraps", async () => {
  routes["GET /api/v1/instance/database-locations/names"] = () => [200, { items: [] }];
  routes["POST /api/v1/instance/tenant-imports/staged"] = () => [
    201,
    staged({ authenticated: false, formatVersion: 1 } as never),
  ];
  show(<TenantImport />);
  const file = new File(["tar bytes"], "acme.tar", { type: "application/x-tar" });
  fireEvent.change(screen.getByLabelText("Export file"), { target: { files: [file] } });
  fireEvent.submit(screen.getByLabelText("Export file").closest("form") as HTMLFormElement);
  const line = (await screen.findByText(/Format 1 has no signature/)).closest("li");
  expect(line?.getAttribute("data-check")).toBe("note");
  expect(line?.querySelector("span")?.className).toContain("break-words");
});
