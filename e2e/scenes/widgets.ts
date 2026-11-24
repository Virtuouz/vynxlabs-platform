import type { Given, Scene } from "./scene.ts";

/** The scenes of the area "widgets"'s pictures (packages/docs/shots/widgets.mjs), by the name a shot's `setup` gives. */

/** A workspace of the run's tenant for one scene, named Sandbox, with the appointments the pictures read. */
export async function appointmentsWorkspace(given: Given, slug: string) {
  const { call, tenant } = given;
  const workspace = await call("POST", `/tenants/${tenant.id}/workspaces`, {
    slug,
    name: "Sandbox",
    type: "dev",
  });
  const W = `/tenants/${tenant.id}/workspaces/${workspace.id}`;
  await call("PUT", `${W}/resources/appointments`, {
    kind: "table",
    schemaVersion: 1,
    ownership: "ui",
    create: true,
    body: {
      description: "Every visit, booked or past, and where it stands.",
      columns: {
        number: { type: "text", required: true, unique: true },
        pet_name: { type: "text", required: true },
        species: { type: "text" },
        client_code: { type: "text", required: true },
        clinic: { type: "text", required: true },
        starts_at: { type: "timestamp", required: true },
        minutes: { type: "integer", required: true, default: 20 },
        reason: { type: "text", required: true },
        status: { type: "text", required: true, default: "booked" },
      },
      display: "number",
    },
  });
  const visits: [string, string, string, string, string, number, string, string][] = [
    ["AP-1001", "Biscuit", "Dog", "C-204", "Northside", 20, "Ear check", "booked"],
    ["AP-1002", "Juniper", "Dog", "C-118", "Riverside", 10, "Booster shot", "booked"],
    ["AP-1003", "Pepper", "Dog", "C-377", "Hilltop", 30, "Limping on a hind leg", "checked in"],
    ["AP-1004", "Moss", "Cat", "C-092", "Riverside", 30, "Dental clean", "booked"],
    ["AP-1005", "Olive", "Dog", "C-245", "Northside", 20, "Annual check", "finished"],
    ["AP-1006", "Clover", "Dog", "C-310", "Hilltop", 10, "Recheck", "finished"],
    ["AP-1007", "Thistle", "Cat", "C-150", "Northside", 20, "Vaccination", "finished"],
    ["AP-1008", "Rufus", "Dog", "C-066", "Riverside", 30, "First visit", "canceled"],
  ];
  const rows = visits.map(
    ([number, pet_name, species, client_code, clinic, minutes, reason, status], at) => ({
      number,
      pet_name,
      species,
      client_code,
      clinic,
      starts_at: `2026-03-${String(2 + at).padStart(2, "0")}T09:${at % 2 ? "30" : "00"}:00.000Z`,
      minutes,
      reason,
      status,
    }),
  );
  await call("POST", `${W}/rows/appointments`, { rows });
  return { workspace, W };
}

const place = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** The app "wdg-visits": a Chart of the appointments and a Table of the dogs among them. */
async function visitsApp(given: Given, slug: string, phone: boolean) {
  const { call, tenant } = given;
  const { workspace, W } = await appointmentsWorkspace(given, slug);
  await call("PUT", `${W}/drafts/screens/wdg-visits`, {
    kind: "interface",
    schemaVersion: 2,
    create: true,
    body: {
      title: "Visits",
      pages: [
        {
          id: "visits",
          title: "Visits",
          widgets: [
            {
              id: "table",
              type: "core/table",
              title: "Appointments",
              at: place(0, 0, 12, 9),
              data: {
                rows: {
                  source: {
                    visual: {
                      table: "appointments",
                      filters: [{ column: "species", op: "eq", value: "Dog" }],
                      sort: [{ by: "starts_at", descending: true }],
                      limit: 25,
                    },
                  },
                },
              },
              config: {
                groupRows: { column: "status" },
                columns: [
                  { column: "number" },
                  { column: "pet_name" },
                  { column: "clinic" },
                  { column: "minutes" },
                  {
                    column: "client_code",
                    label: "Client code",
                    ...(phone ? { phone: false } : {}),
                  },
                ],
              },
            },
            {
              id: "chart",
              type: "core/chart",
              title: "Visits by length",
              at: place(0, 9, 12, 7),
              ...(phone ? { layout: { priority: 5 } } : {}),
              data: {
                rows: {
                  source: {
                    visual: {
                      table: "appointments",
                      groupBy: [{ column: "minutes" }],
                      measures: [{ fn: "count", as: "visits" }],
                    },
                  },
                },
              },
              config: { mark: "scatter" },
            },
          ],
        },
      ],
    },
  });
  await call("PUT", `${W}/drafts/wdg-visits`, {
    kind: "app",
    schemaVersion: 1,
    create: true,
    body: { title: "Visits", interface: "screens/wdg-visits" },
  });
  return { workspace, W, tenant };
}

export const scenes: Record<string, Scene> = {
  "widgets-visits": async (given) => {
    const { workspace, tenant } = await visitsApp(given, "widgets-builder", false);
    return { at: `/t/${tenant.id}/workspaces/${workspace.id}` };
  },
  "widgets-phone": async (given) => {
    const { W } = await visitsApp(given, "widgets-phone", true);
    await given.call("POST", `${W}/changes/deploy`, {});
    const app = ((await given.call("GET", `${W}/apps`)).items as { url: string }[])[0];
    return { at: new URL(app.url).pathname.replace(/\/$/, "") };
  },
};
