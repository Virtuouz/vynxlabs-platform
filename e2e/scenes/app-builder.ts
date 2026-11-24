import type { Given, Scene } from "./scene.ts";
import { appointmentsWorkspace } from "./widgets.ts";

/** The scenes of the area "app-builder"'s pictures (packages/docs/shots/app-builder.mjs), by the name a shot's `setup` gives. */

const place = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/**
 * An app as "Make an app" and a page started from "A list of Appointments" leave it: a search, a
 * Table whose row click opens a side sheet, a button that opens a modal with a form. Saved as
 * drafts, never published.
 */
async function frontDesk(given: Given, W: string) {
  await given.call("PUT", `${W}/drafts/screens/front-desk`, {
    kind: "interface",
    schemaVersion: 2,
    create: true,
    body: {
      title: "Front desk",
      pages: [
        {
          id: "appointments",
          title: "Appointments",
          widgets: [
            {
              id: "search",
              type: "core/filter",
              at: place(0, 0, 12, 2),
              config: {
                filters: [{ name: "search", label: "Search", type: "search" }],
                reset: true,
              },
            },
            {
              id: "appointments",
              type: "core/table",
              title: "Appointments",
              at: place(0, 2, 12, 9),
              data: {
                rows: {
                  source: {
                    visual: {
                      table: "appointments",
                      columns: ["number", "pet_name", "clinic", "starts_at", "status"],
                      sort: [{ by: "starts_at", descending: true }],
                      limit: 25,
                    },
                  },
                  filters: [
                    { filter: "search", columns: ["number", "pet_name", "clinic", "status"] },
                  ],
                },
              },
              config: {
                pageSize: 25,
                buttons: [
                  {
                    id: "add",
                    label: "Add appointment",
                    tone: "primary",
                    action: { steps: [{ do: "open", page: "new-appointment" }] },
                  },
                ],
              },
              on: {
                rowClick: {
                  steps: [{ do: "open", page: "appointment-detail", record: "event" }],
                },
              },
            },
          ],
        },
        {
          id: "appointment-detail",
          title: "Appointment detail",
          kind: "sheet",
          record: { table: "appointments" },
          widgets: [
            {
              id: "detail",
              type: "core/detail",
              at: place(0, 0, 12, 8),
              data: { record: { source: { record: "this" } } },
              config: { heading: "number" },
            },
          ],
        },
        {
          id: "new-appointment",
          title: "New appointment",
          kind: "modal",
          widgets: [
            {
              id: "note",
              type: "core/text",
              at: place(0, 8, 12, 2),
              config: { text: "Times are in the clinic's own time." },
            },
            {
              id: "form",
              type: "core/form",
              at: place(0, 0, 12, 8),
              data: { record: { source: { visual: { table: "appointments" } } } },
              config: {
                mode: "create",
                fields: [
                  { column: "pet_name" },
                  { column: "clinic" },
                  { column: "starts_at" },
                  { column: "reason" },
                ],
                submit: {
                  steps: [
                    {
                      do: "create",
                      table: "appointments",
                      set: {
                        pet_name: { asked: "pet_name" },
                        clinic: { asked: "clinic" },
                        starts_at: { asked: "starts_at" },
                        reason: { asked: "reason" },
                      },
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
  });
  await given.call("PUT", `${W}/drafts/front-desk`, {
    kind: "app",
    schemaVersion: 1,
    create: true,
    body: { title: "Front desk", interface: "screens/front-desk" },
  });
}

export const scenes: Record<string, Scene> = {
  "app-builder-list-app": async (given) => {
    const { workspace, W } = await appointmentsWorkspace(given, "app-builder-list");
    await frontDesk(given, W);
    return { at: `/t/${given.tenant.id}/workspaces/${workspace.id}` };
  },
  /** The list of apps: Front desk as a draft, and Clinic operations, made and published. */
  "app-builder-apps": async (given) => {
    const { workspace, W } = await appointmentsWorkspace(given, "app-builder-apps");
    await given.call("PUT", `${W}/drafts/screens/clinic-operations`, {
      kind: "interface",
      schemaVersion: 2,
      create: true,
      body: {
        title: "Clinic operations",
        pages: [
          {
            id: "today",
            title: "Today",
            widgets: [
              {
                id: "visits",
                type: "core/stat",
                title: "Visits",
                at: place(0, 0, 3, 3),
                data: {
                  value: {
                    source: {
                      visual: { table: "appointments", measures: [{ fn: "count", as: "visits" }] },
                    },
                  },
                },
              },
            ],
          },
          { id: "board", title: "Board", widgets: [] },
        ],
      },
    });
    await given.call("PUT", `${W}/drafts/clinic-operations`, {
      kind: "app",
      schemaVersion: 1,
      create: true,
      body: { title: "Clinic operations", interface: "screens/clinic-operations" },
    });
    await given.call("POST", `${W}/changes/deploy`, {});
    await frontDesk(given, W);
    return { at: `/t/${given.tenant.id}/workspaces/${workspace.id}` };
  },
};
