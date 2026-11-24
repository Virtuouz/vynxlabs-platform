import type { Given, Scene } from "./scene.ts";

/** The scenes of the tutorials' pictures (packages/docs/shots/tutorials.mjs), by the name a shot's `setup` gives. */

const CLINICS = ["northside", "riverside", "hilltop"];
const PETS = ["Biscuit", "Juniper", "Pepper", "Moss", "Olive", "Fern"];
const SPECIES = ["dog", "cat", "rabbit"];
const DOLLARS = { style: "currency", currency: "USD", minorUnits: true } as const;

/** The tables the tutorials read, in the Sandbox, as Fernhill has them. */
const made = new Map<string, Promise<string>>();
const tables = (given: Given) => {
  const key = given.tenant.id;
  if (!made.has(key)) made.set(key, buildTables(given, given.workspaces.sandbox, false));
  return made.get(key) as Promise<string>;
};
/**
 * The tables in a workspace. The visits are dated in February, so that the builder's pictures are
 * the same in each run; with `recent` they are of the last 30 days from the day of the run, for the
 * dashboard whose first look is "Last 30 days".
 */
async function buildTables(given: Given, workspace: string, recent: boolean) {
  const { call, tenant } = given;
  const W = `/tenants/${tenant.id}/workspaces/${workspace}`;
  const table = (path: string, body: object) =>
    call("PUT", `${W}/resources/${path}`, {
      kind: "table",
      schemaVersion: 1,
      ownership: "ui",
      create: true,
      body,
    });
  await table("appointments", {
    description: "Every booked visit.",
    columns: {
      number: { type: "text", required: true },
      pet_name: { type: "text" },
      status: { type: "enum", values: ["booked", "checked_in", "done"], default: "booked" },
      starts_at: { type: "timestamp" },
      pet: { type: "text" },
      species: { type: "enum", values: SPECIES },
      client_code: { type: "text" },
      clinic: { type: "enum", values: CLINICS },
    },
  });
  await table("invoices", {
    description: "What is owed for a visit.",
    columns: {
      number: { type: "text", required: true },
      status: { type: "enum", values: ["unpaid", "paid", "void"], default: "unpaid" },
      appointment: { type: "text" },
      client_code: { type: "text", required: true },
      clinic: { type: "enum", values: CLINICS, required: true },
      total: { type: "integer", required: true },
      issued_on: { type: "date" },
      payment_ref: { type: "text" },
    },
  });
  const today = new Date();
  const rows = Array.from({ length: 24 }, (_, n) => ({
    number: `A-${1000 + n}`,
    pet_name: PETS[n % PETS.length],
    status: n < 8 ? "done" : "booked",
    starts_at: new Date(
      recent
        ? Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate() - 1 - n,
            9 + (n % 6),
          )
        : Date.UTC(2026, 1, 3 + Math.floor(n * 1.1), 9 + (n % 6)),
    ).toISOString(),
    pet: PETS[n % PETS.length],
    species: SPECIES[n % SPECIES.length],
    client_code: `C-${1001 + (n % 5)}`,
    clinic: CLINICS[(n * 2) % CLINICS.length],
  }));
  await call("POST", `${W}/rows/appointments`, { rows });
  await call("POST", `${W}/rows/invoices`, {
    rows: Array.from({ length: 5 }, (_, n) => ({
      number: `INV-${200 + n}`,
      status: n % 2 ? "paid" : "unpaid",
      client_code: `C-${1001 + n}`,
      clinic: CLINICS[n % CLINICS.length],
      total: 4200 + n * 1300,
      issued_on: `2026-02-${10 + n}`,
    })),
  });
  return W;
}

const APPOINTMENT_COLUMNS = [
  "number",
  "pet_name",
  "status",
  "starts_at",
  "pet",
  "species",
  "client_code",
  "clinic",
];

const view = (page: string, record: "event" | "this" = "event") => ({
  do: "open" as const,
  page,
  record,
});

export const scenes: Record<string, Scene> = {
  // The Sandbox as the first three tutorials leave it before publishing: the flow `tut-approve`,
  // the apps `tut Visits` and `tut Invoices`, and the dashboard `tut Visit mix`, all drafts.
  "tutorials-drafts": async (given) => {
    const { call, tenant, workspaces } = given;
    const W = await tables(given);
    const draft = (path: string, kind: string, body: object, schemaVersion = 1) =>
      call("PUT", `${W}/drafts/${path}`, { kind, schemaVersion, create: true, body });

    // The flow: "Decide, then answer", with an approval after `large`.
    // Made once in the run's tenant; another scene may have made it first (the flow names its key).
    const managers = await call("POST", `/tenants/${tenant.id}/groups`, {
      name: "Practice managers",
      description: "Decide stock orders over the threshold.",
    }).catch(() => ({ slug: "practice-managers" }));
    const billing = await call("POST", `/tenants/${tenant.id}/groups`, {
      name: "Billing",
      description: "Mark invoices paid.",
    }).catch(() => ({ slug: "billing" }));
    await draft("tut-approve", "flow", {
      nodes: {
        start: {
          type: "trigger",
          trigger: {
            type: "manual",
            input: {
              type: "object",
              properties: { amount: { type: "number" } },
              required: ["amount"],
            },
          },
        },
        size: { type: "branch", cases: [{ name: "large", when: "trigger.amount > 100" }] },
        large: { type: "set", values: { size: "'large'", amount: "trigger.amount" } },
        small: { type: "set", values: { size: "'small'", amount: "trigger.amount" } },
        approve: {
          type: "approval",
          title: "Approve a large amount",
          detail: "trigger.amount",
          approvers: { groups: [managers.slug ?? "practice-managers"] },
        },
      },
      edges: [
        { from: "start", to: "size" },
        { from: "size", to: "large", output: "large" },
        { from: "size", to: "small", output: "otherwise" },
        { from: "large", to: "approve" },
      ],
    });

    // The app `tut Visits`: one table of appointments, headed Visits, Pet and Client code hidden.
    await draft(
      "screens/tut-visits",
      "interface",
      {
        title: "tut Visits",
        pages: [
          {
            id: "tut-visits",
            title: "tut Visits",
            widgets: [
              {
                id: "table",
                type: "core/table",
                title: "Visits",
                at: { x: 0, y: 0, w: 12, h: 10 },
                data: { rows: { source: { visual: { table: "appointments" } } } },
                config: {
                  columns: APPOINTMENT_COLUMNS.map((column) => ({
                    column,
                    ...(column === "pet" || column === "client_code" ? { hidden: true } : {}),
                  })),
                },
              },
            ],
          },
        ],
      },
      2,
    );
    await draft("tut-visits", "app", { title: "tut Visits", interface: "screens/tut-visits" });

    // The app `tut Invoices`: the table, a detail sheet, a form in a modal, and Mark paid for Billing.
    const dollars = DOLLARS;
    await draft(
      "screens/tut-invoices",
      "interface",
      {
        title: "tut Invoices",
        pages: [
          {
            id: "tut-invoices",
            title: "tut Invoices",
            widgets: [
              {
                id: "table",
                type: "core/table",
                title: "Invoices",
                at: { x: 0, y: 0, w: 12, h: 10 },
                data: {
                  rows: {
                    source: {
                      visual: { table: "invoices", sort: [{ by: "created_at", descending: true }] },
                    },
                  },
                },
                config: {
                  columns: [
                    { column: "number" },
                    { column: "status" },
                    { column: "appointment" },
                    { column: "client_code" },
                    { column: "clinic" },
                    { column: "total", format: dollars },
                    { column: "issued_on" },
                    { column: "payment_ref" },
                  ],
                  buttons: [
                    {
                      id: "new-invoice",
                      label: "New invoice",
                      tone: "primary",
                      action: { steps: [{ do: "open", page: "new-invoice" }] },
                    },
                  ],
                  rowActions: [
                    {
                      id: "mark-paid",
                      label: "Mark paid",
                      action: {
                        runBy: { groups: ["groups/billing"] },
                        steps: [
                          { do: "update", record: "event", set: { status: { value: "paid" } } },
                        ],
                      },
                    },
                  ],
                },
                on: { rowClick: { steps: [view("invoice-detail")] } },
              },
            ],
          },
          {
            id: "invoice-detail",
            title: "Invoice detail",
            kind: "sheet",
            record: { table: "invoices" },
            widgets: [
              {
                id: "detail",
                type: "core/detail",
                at: { x: 0, y: 0, w: 12, h: 12 },
                data: { record: { source: { record: "this" } } },
                config: {
                  heading: "number",
                  status: "status",
                  fields: [
                    { column: "client_code" },
                    { column: "clinic" },
                    { column: "total", format: dollars },
                  ],
                },
              },
            ],
          },
          {
            id: "new-invoice",
            title: "New invoice",
            kind: "modal",
            widgets: [
              {
                id: "form",
                type: "core/form",
                at: { x: 0, y: 0, w: 12, h: 14 },
                data: { record: { source: { visual: { table: "invoices" } } } },
                config: {
                  mode: "create",
                  fields: [
                    { column: "number" },
                    { column: "client_code" },
                    { column: "clinic" },
                    { column: "total", format: dollars },
                  ],
                  submitLabel: "Create invoice",
                  submit: {
                    steps: [
                      {
                        do: "create",
                        table: "invoices",
                        set: Object.fromEntries(
                          ["number", "client_code", "clinic", "total"].map((column) => [
                            column,
                            { asked: column },
                          ]),
                        ),
                      },
                      { do: "close" },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      2,
    );
    await draft("tut-invoices", "app", {
      title: "tut Invoices",
      interface: "screens/tut-invoices",
    });
    void billing;

    return { at: `/t/${tenant.id}/workspaces/${workspaces.sandbox}` };
  },

  // The dashboard `tut Visit mix`, Maya's own. Its address has no more to add: the shot's `address` is empty and falls after the "#".
  "tutorials-dashboard": async (given) => {
    const { call, tenant } = given;
    // A workspace of its own, named as the Sandbox is, so that its dates can be recent.
    const workspace = await call("POST", `/tenants/${tenant.id}/workspaces`, {
      slug: "sandbox-visits",
      name: "Sandbox",
      type: "dev",
    });
    const W = await buildTables(given, workspace.id, true);
    // The dashboard: Search, Starts at and Clinic filters, a stat, a chart by clinic and a table.
    const follows = [
      { filter: "search", columns: ["number", "pet_name", "client_code"] },
      { filter: "starts", column: "starts_at" },
      { filter: "clinic", column: "clinic" },
    ];
    // The dashboard is Maya's own, as "New dashboard" makes it: kept for the person, not deployed.
    const body = {
      title: "tut Visit mix",
      widgets: [
        {
          id: "filters",
          type: "core/filter",
          at: { x: 0, y: 0, w: 12, h: 2 },
          config: {
            filters: [
              { name: "search", label: "Search", type: "search" },
              { name: "starts", label: "Starts", type: "date_range", default: "last_30_days" },
              { name: "clinic", label: "Clinic", type: "text" },
            ],
          },
        },
        {
          id: "stat",
          type: "core/stat",
          title: "Appointments",
          at: { x: 0, y: 2, w: 4, h: 3 },
          data: {
            value: {
              source: {
                visual: { table: "appointments", measures: [{ fn: "count", as: "appointments" }] },
              },
              filters: follows,
            },
          },
        },
        {
          id: "chart",
          type: "core/chart",
          title: "Appointments by clinic",
          at: { x: 4, y: 2, w: 8, h: 6 },
          data: {
            rows: {
              source: {
                visual: {
                  table: "appointments",
                  groupBy: [{ column: "clinic" }],
                  measures: [{ fn: "count", as: "appointments" }],
                },
              },
              filters: follows,
            },
          },
          config: { mark: "bar" },
        },
        {
          id: "table",
          type: "core/table",
          title: "Appointments",
          at: { x: 0, y: 8, w: 12, h: 8 },
          data: { rows: { source: { visual: { table: "appointments" } }, filters: follows } },
          // Without the times, which are of the days before the run and are not the same each time.
          config: {
            columns: APPOINTMENT_COLUMNS.filter((column) => column !== "starts_at").map(
              (column) => ({
                column,
              }),
            ),
          },
        },
      ],
    };
    const dashboard = await call("POST", `${W}/dashboards`, { title: "tut Visit mix" });
    await call("PUT", `${W}/dashboards/${dashboard.id}#`, { body, revision: dashboard.revision });
    return { at: `/t/${tenant.id}/workspaces/${workspace.id}/dashboards/${dashboard.id}#` };
  },

  // The rota guide, deployed with page feedback on and the how-to page "Swap a shift".
  "tutorials-docs": async (given) => {
    const { call, tenant, workspaces } = given;
    const W = `/tenants/${tenant.id}/workspaces/${workspaces.sandbox}`;
    await call("PUT", `${W}/drafts/docs-feedback`, {
      kind: "table",
      schemaVersion: 1,
      create: true,
      body: {
        columns: {
          site_key: { type: "text" },
          site: { type: "text" },
          page: { type: "text" },
          helpful: { type: "boolean" },
          version: { type: "text" },
          at: { type: "timestamp" },
        },
      },
    });
    const page = (path: string, source: string) =>
      call("PUT", `${W}/drafts/${path}`, {
        kind: "doc",
        schemaVersion: 1,
        create: true,
        body: { source },
      });
    await page(
      "rota/index",
      "---\ntitle: Fernhill rota guide\npages: [swap-a-shift]\n---\n\nHow the clinics' rota works.\n",
    );
    await page(
      "rota/swap-a-shift",
      "---\ntitle: Swap a shift\ntype: how-to\nsubjects: [rota]\n---\n\n## Swap a shift with a colleague\n\nYou will have your shift swapped and the practice manager told.\n\n:::steps\n1. Find a colleague who is free on the day.\n2. Ask the practice manager to change the rota.\n:::\n\n## If it does not work\n\nIf nobody is free, ask the practice manager for cover.\n",
    );
    await call("PUT", `${W}/drafts/rota-site`, {
      kind: "app",
      schemaVersion: 1,
      create: true,
      body: { title: "Fernhill rota guide", docs: "rota", feedback: { table: "docs-feedback" } },
    });
    await call("POST", `${W}/changes/deploy`, {
      paths: ["docs-feedback", "rota/index", "rota/swap-a-shift", "rota-site"],
    });
    const roles = (await call("GET", `/tenants/${tenant.id}/roles?limit=200`)).items as {
      id: string;
      name: string;
    }[];
    const resources = (await call("GET", `${W}/resources`)).items as {
      id: string;
      kind: string;
      path: string;
    }[];
    await call("POST", `/tenants/${tenant.id}/bindings`, {
      workspaceId: workspaces.sandbox,
      resourceId: resources.find((one) => one.kind === "app" && one.path === "rota-site")?.id,
      principalType: "anonymous",
      roleId: roles.find((one) => one.name === "portal_reader")?.id,
    });
    return { at: `/apps/pictures-${given.stamp}/sandbox` };
  },
};
