// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { grants, PERMISSION_KINDS } from "@volvel/manifest";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { BUILTIN_ROLES } from "./builtinRoles.ts";
import { Alerts } from "./screens/Alerts.tsx";
import { SourceView, Sources, Tables, TableView } from "./screens/Data.tsx";
import { ConnectionGroups, Scripts } from "./screens/Execution.tsx";
import { Files } from "./screens/Files.tsx";
import { Flows } from "./screens/Flows.tsx";
import { Groups } from "./screens/Groups.tsx";
import { Interfaces } from "./screens/Interfaces.tsx";
import { AccessList } from "./screens/Members.tsx";
import { EventPage } from "./screens/ObjectPages.tsx";
import { OfferButton } from "./screens/OfferToAgent.tsx";
import { EventsWorkbench, TriggersWorkbench } from "./screens/Operate.tsx";
import { Release } from "./screens/Release.tsx";
import { RetentionSettings } from "./screens/Retention.tsx";
import { Roles } from "./screens/Roles.tsx";
import { RunsWorkbench } from "./screens/Runs.tsx";
import { show } from "./testing.tsx";

// The console asks for exactly what the server checks: the same permission, at the same scope,
// with the resource when the server counts a grant on it. Each row below is a control of a family
// of screens, the route it calls and what that route's access rule needs (`serves`); each is
// rendered as every built-in role, and is offered exactly when the server would allow the call.
// The roles are those of `builtinRoles.ts`, which a test of the control plane holds to the database.

const base = "/tenants/t1";
const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";

type Held = (permission: string) => boolean;
/** Where the member's role is bound: the tenant, one workspace, or one resource of it. */
type Scope = "tenant" | "workspace" | "resource" | "instance";

interface Family {
  family: string;
  /** The control, by its name. */
  control: RegExp | string;
  /** What kind of control it is: a button, unless said. */
  role?: "button" | "textbox" | "menuitem";
  /** The screen leaves the control out, rather than switching it off, where it is not offered. */
  leftOut?: true;
  /** The route it calls, and its rule, as the server declares it. */
  route: string;
  /** Whether the server allows that route to someone who holds `has`, bound at `scope`. */
  serves: (has: Held, scope: Scope) => boolean;
  /** The scopes a role is bound at, for the rows: those the server tells apart. */
  scopes: readonly Scope[];
  draw: () => ReactElement;
}

/** A route of a workspace counts what a role gives at the tenant or the workspace. */
const WORKSPACE = ["tenant"] as const;
/** A route of the tenant counts what a role gives at the tenant alone. */
const TENANT = ["tenant", "workspace"] as const;
/** A route that is checked at the workspace counts a grant given on one resource for nothing. */
/** A route that counts the tenant's or the instance's, and not a workspace's. */
const TENANT_OR_INSTANCE = ["tenant", "workspace", "instance"] as const;
const NOT_ON_A_RESOURCE = ["workspace", "resource"] as const;

const FAMILIES: Family[] = [
  {
    family: "Flows list: New flow",
    control: "New flow",
    route: "PUT /drafts/* (resource:write)",
    scopes: WORKSPACE,
    serves: (has) => has("resource:write"),
    draw: () => <Flows root={root} link={link} editable />,
  },
  {
    family: "Tables list: Create table",
    control: "Create table",
    route: "PUT /resources/* (resource:write)",
    scopes: WORKSPACE,
    serves: (has) => has("resource:write"),
    draw: () => <Tables root={root} link={link} />,
  },
  {
    family: "App Builder: Make an app",
    control: "Make an app",
    route: "PUT /drafts/* (resource:write, or interface:write alone)",
    scopes: WORKSPACE,
    serves: (has) => has("resource:write") || has("interface:write"),
    draw: () => <Interfaces root={root} link={link} editable />,
  },
  {
    family: "Scripts list: New script",
    control: "New script",
    route: "PUT /drafts/* (resource:write)",
    scopes: WORKSPACE,
    serves: (has) => has("resource:write"),
    draw: () => <Scripts root={root} link={link} editable />,
  },
  {
    family: "Triggers list: New trigger",
    control: "New trigger",
    route: "PUT /drafts/* (resource:write)",
    scopes: WORKSPACE,
    serves: (has) => has("resource:write"),
    draw: () => (
      <TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />
    ),
  },
  {
    family: "Events list: Publish an event",
    control: /Publish an event/,
    route: "POST /events (event:write)",
    scopes: WORKSPACE,
    serves: (has) => has("event:write"),
    draw: () => <EventsWorkbench root={root} link={link} />,
  },
  {
    family: "Files: Upload file",
    control: /Upload file/,
    route: "POST /files (file:write)",
    scopes: WORKSPACE,
    serves: (has) => has("file:write"),
    draw: () => <Files root={root} />,
  },
  {
    family: "Offer to an agent (a script or a flow)",
    control: /Offer to an agent/,
    route: "POST /bindings (binding:write at the resource)",
    scopes: WORKSPACE,
    serves: (has) => has("binding:write"),
    draw: () => <OfferButton root={root} kind="flow" path="appointments/after-visit" />,
  },
  {
    family: "Roles: Create role",
    control: "Create role",
    route: "POST /roles (role:write at the tenant)",
    scopes: TENANT,
    serves: (has, scope) => scope === "tenant" && has("role:write"),
    draw: () => <Roles base={base} />,
  },
  {
    family: "Groups: Create group",
    control: "Create group",
    route: "POST /groups (group:write at the tenant)",
    scopes: TENANT,
    serves: (has, scope) => scope === "tenant" && has("group:write"),
    draw: () => <Groups base={base} />,
  },
  {
    family: "Alerts: Send a test alert",
    control: "Send a test alert",
    route: "POST /alert-tests (connection:write)",
    scopes: WORKSPACE,
    serves: (has) => has("connection:write"),
    draw: () => <Alerts root={root} link={link} workspaceRoot={root} editable />,
  },
  {
    family: "Retention: the days kept",
    control: /\(days\)/,
    role: "textbox",
    route: "PUT /retention (tenant:write at the tenant or the instance)",
    scopes: TENANT_OR_INSTANCE,
    serves: (has, scope) => scope !== "workspace" && has("tenant:write"),
    draw: () => <RetentionSettings base={base} bare />,
  },
  {
    family: "Table page, Definition: Add column",
    control: "Add column",
    leftOut: true,
    route: "PUT /resources/* (resource:write)",
    scopes: WORKSPACE,
    serves: (has) => has("resource:write"),
    draw: () => {
      history.replaceState(null, "", `${link}/tables/clients?view=definition`);
      return <TableView root={root} name="clients" link={link} />;
    },
  },
  {
    family: "Data sources: Declare source",
    control: "Declare source",
    route: "PUT /resources/* (resource:write)",
    scopes: WORKSPACE,
    serves: (has) => has("resource:write"),
    draw: () => <Sources root={root} link={link} />,
  },
  {
    family: "Data sources: Test, Change",
    control: /^(Test|Change)$/,
    route: "POST data-source-checks, PUT data-source-bindings (data_source:write at the workspace)",
    scopes: WORKSPACE,
    serves: (has) => has("data_source:write"),
    draw: () => <Sources root={root} link={link} />,
  },
  {
    family: "Data sources: Remove from here",
    control: "Remove from here",
    route: "DELETE data-source-bindings (data_source:write at the workspace)",
    scopes: WORKSPACE,
    serves: (has) => has("data_source:write"),
    draw: () => <Sources root={root} link={link} />,
  },
  {
    family: "Source page: Test, Change",
    control: /^(Test|Change)$/,
    route: "POST data-source-checks, PUT data-source-bindings (data_source:write at the workspace)",
    scopes: WORKSPACE,
    serves: (has) => has("data_source:write"),
    draw: () => <SourceView root={root} path="erp" link={link} />,
  },
  {
    family: "Source page: Remove from here",
    control: "Remove from here",
    route: "DELETE data-source-bindings (data_source:write at the workspace)",
    scopes: WORKSPACE,
    serves: (has) => has("data_source:write"),
    draw: () => <SourceView root={root} path="erp" link={link} />,
  },
  {
    family: "Runs list: Run again",
    control: "Run again…",
    role: "menuitem",
    route: "POST /runs (run:write at the workspace or at the script)",
    scopes: ["tenant", "resource"],
    serves: (has) => has("run:write"),
    draw: () => <RunsWorkbench root={root} link={link} />,
  },
  {
    family: "Access: Give access",
    control: "Give access",
    route: "POST /bindings (binding:write at the tenant)",
    scopes: TENANT,
    serves: (has, scope) => scope === "tenant" && has("binding:write"),
    draw: () => <AccessList base={base} />,
  },
  {
    family: "Triggers list: Fire now",
    control: /Fire now/,
    leftOut: true,
    route: "POST /schedule-firings (run:write)",
    scopes: WORKSPACE,
    serves: (has) => has("run:write"),
    draw: () => {
      history.replaceState(null, "", `${link}/triggers?trigger=reminders%2Fnightly`);
      return (
        <TriggersWorkbench root={root} link={link} workspacePaused={false} production={false} />
      );
    },
  },
  {
    family: "Retired table: Delete for good",
    control: "Delete for good",
    route: "POST /table-purges (table:write)",
    scopes: WORKSPACE,
    serves: (has) => has("table:write"),
    draw: () => {
      history.replaceState(null, "", `${link}/tables/gone`);
      return <TableView root={root} name="gone" link={link} />;
    },
  },
  {
    family: "Retired table: Bring back",
    control: "Bring back",
    route: "PUT /resources/* (resource:write)",
    scopes: WORKSPACE,
    serves: (has) => has("resource:write"),
    draw: () => {
      history.replaceState(null, "", `${link}/tables/gone`);
      return <TableView root={root} name="gone" link={link} />;
    },
  },
  {
    family: "Connection groups: Add a member, Change",
    control: /^(Add a member|Change)$/,
    route: "PUT connection-group-members (connection:write at the workspace)",
    scopes: WORKSPACE,
    serves: (has) => has("connection:write"),
    draw: () => <ConnectionGroups root={root} />,
  },
  {
    family: "Connection groups: Remove a member",
    control: "Remove",
    route: "DELETE connection-group-members (connection:write at the workspace)",
    scopes: WORKSPACE,
    serves: (has) => has("connection:write"),
    draw: () => <ConnectionGroups root={root} />,
  },
  {
    family: "Release, Promote: Change where this promotes to",
    control: "Change where this promotes to",
    route: "PATCH /workspaces/:w (workspace:write at the workspace)",
    scopes: WORKSPACE,
    serves: (has) => has("workspace:write"),
    draw: () => {
      const place = { id: "w1", name: "Main", type: "dev", linkedWorkspaceId: "w2" };
      return (
        <Release
          base={base}
          root={root}
          link={link}
          workspace={place as never}
          step="promote"
          reload={() => {}}
        />
      );
    },
  },
  {
    family: "Event page: Publish",
    control: /^Publish/,
    route: "POST /events (event:write at the workspace, not at one event)",
    scopes: NOT_ON_A_RESOURCE,
    serves: (has, scope) => scope === "workspace" && has("event:write"),
    draw: () => <EventPage root={root} link={link} path="orders/placed" />,
  },
];

/** What the stubbed server says of a member bound to `role`, at `scope`. */
function serve(role: string, scope: Scope) {
  const permissions = BUILTIN_ROLES[role] as string[];
  const flat = PERMISSION_KINDS.filter((kind) => kind.scope !== "instance").flatMap((kind) =>
    Object.keys(kind.verbs).map((verb) => `${kind.kind}:${verb}`),
  );
  return (address: string) => {
    const path = address.replace("/api/v1", "");
    const instance = scope === "instance";
    const body = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (path === "/me") {
      // A role bound on the instance is held there, and is no source of the tenant's.
      return body({
        principal: { id: "me", type: "member" },
        instancePermissions: instance ? permissions : [],
      });
    }
    if (path.startsWith(`${base}/access/member/me`)) {
      return body({
        sources: instance
          ? []
          : [
              {
                id: "s1",
                role: { id: "r", name: role, permissions },
                scope:
                  scope === "tenant"
                    ? { type: "tenant" }
                    : scope === "workspace"
                      ? { type: "workspace", workspaceId: "w1", workspaceName: "Main" }
                      : {
                          type: "resource",
                          workspaceId: "w1",
                          kind: "event",
                          path: "orders/placed",
                        },
                through: { type: "direct" },
                counts: true,
              },
            ],
        permissions: flat
          .filter((one) => !instance && grants(permissions, one))
          .map((one) => ({ permission: one, sources: ["s1"] })),
      });
    }
    // The workspace's own check counts a role bound at the tenant or at the workspace.
    if (path.includes("/allowed?")) {
      // A role bound on one resource counts only where that resource is asked about.
      if (scope === "resource" && !path.includes("&kind=")) return body({ allowed: [] });
      const asked = decodeURIComponent(path.split("permissions=")[1]?.split("&")[0] ?? "");
      return body({ allowed: asked.split(",").filter((one) => grants(permissions, one)) });
    }
    if (path === `${root}/tables/clients`) {
      return body({
        id: "tb1",
        name: "clients",
        status: "active",
        managedIn: "ui",
        policy: { type: "open" },
        rowCount: 0,
        stored: { schema: "s", table: "t" },
        columns: [{ name: "name", type: "text", required: true, status: "active" }],
      });
    }
    if (path.startsWith(`${root}/activity`)) {
      return body({
        items: [
          {
            kind: "script",
            id: "r1",
            target: "reminders/send",
            status: "failed",
            state: "failed",
            trigger: "manual",
            attempt: 1,
            maxAttempts: 1,
            error: null,
            errorSummary: null,
            tags: [],
            bundleVersion: 1,
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          },
        ],
        counts: { failed: 1 },
        stateCounts: { failed: 1 },
      });
    }
    if (path === `${root}/tables/gone`) {
      return body({
        id: "tb2",
        name: "gone",
        status: "retired",
        managedIn: "ui",
        policy: { type: "open" },
        rowCount: 3,
        stored: { schema: "s", table: "t" },
        columns: [{ name: "name", type: "text", required: true, status: "active" }],
      });
    }
    if (path.startsWith(`${root}/triggers`)) {
      return body({
        items: [
          {
            path: "reminders/nightly",
            node: "",
            type: "schedule",
            script: "reminders/send",
            targetKind: "script",
            event: null,
            enabled: true,
            cron: "0 2 * * *",
            timezone: "UTC",
            nextFireAt: "2026-11-24T02:00:00Z",
            lastFiredAt: null,
            url: null,
            paused: null,
            lastRun: null,
            lastRefusal: null,
          },
        ],
      });
    }
    if (path === `${root}/data-source-bindings`) {
      return body({
        items: [
          {
            path: "erp",
            description: "The ERP",
            defined: true,
            bound: true,
            hasPassword: true,
            config: { host: "db.test", port: 5432, database: "erp", user: "u", ssl: true },
            health: null,
          },
        ],
      });
    }
    if (path === `${root}/connection-groups`) {
      return body({
        items: [
          {
            path: "mailers",
            description: "",
            connector: "smtp",
            configSchema: { type: "object", properties: { host: { type: "string" } } },
            draft: null,
            members: [
              {
                key: "acme",
                label: "Acme",
                config: { host: "mail.acme.test" },
                hasCredential: true,
              },
            ],
          },
        ],
      });
    }
    if (path.includes("/promotion-preview")) {
      return body({
        target: { id: "w2", name: "Clinics", type: "production", linkedWorkspaceId: null },
        bundle: { digest: "a".repeat(64), version: 8 },
        possible: true,
        refusal: null,
        summary: { created: 0, updated: 1, deleted: 0, data: [], changes: [], breaking: [] },
        tried: { runs: 0, failed: 0, flowRuns: 0, flowRunsFailed: 0 },
        triggers: 0,
        canPromote: true,
        request: null,
      });
    }
    if (path === `${base}/workspaces`) {
      return body({
        items: [
          { id: "w1", name: "Main", type: "dev", linkedWorkspaceId: "w2" },
          { id: "w2", name: "Clinics", type: "production", linkedWorkspaceId: null },
        ],
      });
    }
    if (path.endsWith("/drift")) {
      return body({
        target: { id: "w2", name: "Clinics", type: "production", slug: "main" },
        versions: { here: 8, there: 7 },
        counts: { changed: 0, only_here: 0, only_there: 0, in_sync: 0 },
        items: [],
      });
    }
    if (path === `${root}/alert-settings`) {
      return body({ default: { notify: "ops/chat" }, overrides: [] });
    }
    if (path === `${base}/retention`) {
      const days = { runsDays: 30, eventsDays: 30, refusalsDays: 30, auditDays: 365 };
      const bound = { min: 1, max: 3650 };
      return body({
        ...days,
        effective: days,
        defaults: days,
        bounds: { runsDays: bound, eventsDays: bound, refusalsDays: bound, auditDays: bound },
      });
    }
    if (path === "/permissions") return body({ items: PERMISSION_KINDS });
    if (path === `${root}/resources/orders/placed`) {
      return body({
        id: "r1",
        kind: "event",
        path: "orders/placed",
        body: {},
        ownership: "ui",
        version: 1,
        updatedAt: "2026-11-01T00:00:00Z",
      });
    }
    return body({ items: [] });
  };
}

let pending = 0;
beforeEach(() => {
  history.replaceState(null, "", `${link}/flows`);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const offered = (control: HTMLElement) =>
  !(control as HTMLButtonElement | HTMLInputElement).disabled &&
  !(control.closest("fieldset") as HTMLFieldSetElement | null)?.disabled &&
  control.getAttribute("aria-disabled") !== "true";

/** Waits until every request the screen made has been answered, and the answers drawn. */
async function settled() {
  for (let round = 0; round < 3; round++) {
    await waitFor(() => expect(pending).toBe(0));
    await new Promise((done) => setTimeout(done, 40));
  }
}

for (const family of FAMILIES) {
  describe(family.family, () => {
    for (const role of Object.keys(BUILTIN_ROLES)) {
      for (const scope of family.scopes) {
        const has: Held = (permission) => grants(BUILTIN_ROLES[role] as string[], permission);
        const allowed = family.serves(has, scope);
        test(`${family.route}: it ${allowed ? "is offered to" : "is not offered to"} ${role}, bound at the ${scope}`, async () => {
          const answer = serve(role, scope);
          vi.stubGlobal("fetch", async (address: string) => {
            pending += 1;
            try {
              return answer(address);
            } finally {
              pending -= 1;
            }
          });
          show(family.draw());
          if (family.role === "menuitem") {
            // A row's menu: the item is there when it is offered, and left out when it is not.
            const menu = await screen.findByRole("button", { name: /^Actions for/ });
            await settled();
            fireEvent.click(menu);
            await screen.findAllByRole("menuitem", { name: "Open" });
            expect(screen.queryAllByRole("menuitem", { name: family.control }).length > 0).toBe(
              allowed,
            );
            return;
          }
          if (family.leftOut) {
            await screen.findByText(/Rows of|Columns/i).catch(() => undefined);
            await settled();
          } else {
            await screen.findAllByRole(family.role ?? "button", { name: family.control });
            await settled();
          }
          // Looked up again: answering what the member holds can redraw the control. Every place
          // the screen puts it (its header, its empty state) says the same.
          const seen = screen
            .queryAllByRole(family.role ?? "button", { name: family.control })
            .map(offered);
          if (family.leftOut && !allowed) {
            expect(seen.some(Boolean)).toBe(false);
          } else {
            expect(seen.length).toBeGreaterThan(0);
            expect(seen).toEqual(seen.map(() => allowed));
          }
        });
      }
    }
  });
}

describe("Data sources: Edit, a link to the declaration", () => {
  for (const [role, allowed] of [
    ["viewer", false],
    ["tenant_admin", true],
  ] as const) {
    test(`${allowed ? "is a link for" : "is switched off for"} ${role}`, async () => {
      const answer = serve(role, "tenant");
      vi.stubGlobal("fetch", async (address: string) => answer(address));
      show(<Sources root={root} link={link} />);
      const edit = await screen.findByLabelText("Edit erp");
      await settled();
      const now = screen.getByLabelText("Edit erp");
      expect(now.tagName === "A").toBe(allowed);
      if (!allowed) expect(offered(now)).toBe(false);
      void edit;
    });
  }
});
