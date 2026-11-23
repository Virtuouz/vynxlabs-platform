// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuditTable, auditAreas, targetName, verbOf } from "./screens/Audit.tsx";
import { show } from "./testing.tsx";

const entry = (id: string, action: string, over: object = {}) => ({
  id,
  occurredAt: "2026-10-01T10:42:18.000Z",
  actorType: "member",
  actorId: "00000000-0000-7000-8000-00000000aaaa",
  actorLabel: "jane@acme.test",
  accessGrantId: null,
  action,
  targetType: "secret",
  targetId: `target-${id}`,
  details: { name: `detail-${id}` },
  ipAddress: "10.0.0.1",
  userAgent: null,
  requestId: `req-${id}`,
  ...over,
});
let asked: string[];

beforeEach(() => {
  asked = [];
  // A wide screen: the inspector stands beside the list.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
    if (address === "/api/v1/tenants/t1/workspaces") {
      return new Response(JSON.stringify({ items: [{ id: "w1", name: "Main" }] }), { status: 200 });
    }
    if (address.includes("/audit-facets")) {
      return new Response(
        JSON.stringify({
          actions: [
            { value: "secret.set", count: 4 },
            { value: "run.started", count: 2 },
          ],
          actors: [
            {
              type: "member",
              id: "00000000-0000-7000-8000-00000000aaaa",
              label: "jane@acme.test",
              count: 6,
            },
          ],
          targetTypes: [{ value: "secret", count: 6 }],
        }),
        { status: 200 },
      );
    }
    const items = address.includes("area=role")
      ? [entry("r", "role.created")]
      : [
          entry("a", "secret.set"),
          entry("b", "secret.deleted", { actorLabel: null, accessGrantId: "g1" }),
          entry("c", "run.started"),
        ];
    return new Response(JSON.stringify({ items, nextCursor: null }), { status: 200 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("an action's kind is read from how its name ends", () => {
  expect(verbOf("role.created")).toBe("Create");
  expect(verbOf("secret.set")).toBe("Update");
  expect(verbOf("flow.layout_saved")).toBe("Update");
  expect(verbOf("api_key.revoked")).toBe("Delete");
  expect(verbOf("portal.logo_removed")).toBe("Delete");
  expect(verbOf("run.started")).toBe("Execute");
  expect(verbOf("member.signed_in")).toBe("Execute");
  expect(verbOf("workspace.cloned")).toBe("Create");
  expect(verbOf("something.odd")).toBe("Other");
});

test("the newest entry is open beside the list, and choosing another opens it", async () => {
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  const details = await screen.findByRole("complementary", { name: "Entry details" });
  expect(details.textContent).toContain("jane@acme.test");
  expect(details.textContent).toContain("detail-a");
  expect(details.textContent).toContain("req-a");

  fireEvent.click(screen.getAllByText("secret.deleted")[0] as HTMLElement);
  expect(details.textContent).toContain("detail-b");
  // With no name for the actor, its type and the end of its ID stand in.
  expect(details.textContent).toContain("member 0000aaaa");
  expect(details.textContent).toContain("Done by an operator under an access grant.");
});

test("every filter is the server's, chosen from what the log holds", async () => {
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  await screen.findAllByText("secret.set");
  const lastList = () => asked.filter((one) => /\/audit\?/.test(one)).at(-1) ?? "";
  // Who, the action and the kind of thing are offered from the log, with how many each.
  fireEvent.click(screen.getByRole("button", { name: "More filters" }));
  await screen.findByRole("option", { name: "jane@acme.test (6)" });
  fireEvent.change(screen.getByLabelText("Who"), {
    target: { value: "00000000-0000-7000-8000-00000000aaaa" },
  });
  await waitFor(() => expect(lastList()).toContain("actorId=00000000-0000-7000-8000-00000000aaaa"));
  fireEvent.change(screen.getByLabelText("Done to"), { target: { value: "secret" } });
  await waitFor(() => expect(lastList()).toContain("targetType=secret"));
  fireEvent.change(screen.getByLabelText("Area"), { target: { value: "role" } });
  await screen.findAllByText("role.created");
  await waitFor(() => expect(lastList()).toContain("area=role"));
  // The facets follow the same filters.
  expect(asked.filter((one) => one.includes("/audit-facets")).at(-1)).toContain("area=role");
});

test("a search is the server's, so it looks through the whole log", async () => {
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  await screen.findAllByText("secret.set");
  fireEvent.input(screen.getByLabelText("Search"), { target: { value: "target-c" } });
  await waitFor(() =>
    expect(asked.filter((one) => /\/audit\?/.test(one)).at(-1)).toContain("q=target-c"),
  );
});

test("an entry linked to is opened, even when it is not among those loaded", async () => {
  history.replaceState(null, "", "/t/t1/audit?entry=far");
  const fetched = vi.fn();
  const listed = globalThis.fetch;
  vi.stubGlobal("fetch", async (address: string) => {
    if (address === "/api/v1/tenants/t1/audit/far") {
      fetched();
      return new Response(JSON.stringify(entry("far", "member.deleted")), { status: 200 });
    }
    return (listed as (address: string) => Promise<Response>)(address);
  });
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  const details = await screen.findByRole("complementary", { name: "Entry details" });
  await waitFor(() => expect(details.textContent).toContain("detail-far"));
  expect(fetched).toHaveBeenCalled();
  history.replaceState(null, "", "/");
});

test("an entry the instance's log keeps for a deleted tenant says whose it was (INS-28)", async () => {
  vi.stubGlobal("fetch", async (address: string) => {
    if (address.includes("/audit-facets")) {
      return new Response(JSON.stringify({ actions: [], actors: [], targetTypes: [] }), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({
        items: [
          entry("own", "instance.updated", { tenantId: null }),
          entry("gone", "workspace.created", { tenantId: "00000000-0000-7000-8000-0000000000de" }),
        ],
        nextCursor: null,
      }),
      { status: 200 },
    );
  });
  show(<AuditTable title="Instance log" description="" path="/audit" />);
  const gone = (await screen.findAllByText("workspace.created"))[0]?.closest("tr") as HTMLElement;
  expect(within(gone).getByText("Deleted tenant")).toBeTruthy();
  const own = screen.getAllByText("instance.updated")[0]?.closest("tr") as HTMLElement;
  expect(within(own).queryByText("Deleted tenant")).toBeNull();
});

test("an operator's access is said as the tenant's API, and empty details are not drawn as braces", async () => {
  expect(
    targetName({
      action: "operator.access",
      targetType: "request",
      targetId: "PUT /api/v1/tenants/:tenantId/drafts/*",
      targetLabel: null,
    }),
  ).toBe("the tenant's API");
  expect(
    targetName({
      action: "secret.set",
      targetType: "secret",
      targetId: "x",
      targetLabel: "Stripe",
    }),
  ).toBe("Stripe");
  vi.stubGlobal("fetch", async (address: string) => {
    if (address.includes("/audit-facets")) {
      return new Response(JSON.stringify({ actions: [], actors: [], targetTypes: [] }), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({
        items: [
          entry("o", "operator.access", {
            targetType: "request",
            targetId: "PUT /api/v1/tenants/t1/drafts/billing/record-payment-and-reconcile",
            details: {},
          }),
        ],
        nextCursor: null,
      }),
      { status: 200 },
    );
  });
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  const details = await screen.findByRole("complementary", { name: "Entry details" });
  await waitFor(() => expect(details.textContent).toContain("Nothing more was recorded."));
  expect(details.textContent).not.toContain("{}");
  expect(screen.getAllByText("the tenant's API").length).toBeGreaterThan(0);
});

test("the time it covers is asked of the server", async () => {
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  await screen.findAllByText("secret.set");
  fireEvent.change(screen.getByLabelText("Since"), { target: { value: "24h" } });
  await waitFor(() => expect(asked.at(-1)).toMatch(/[?&]from=\d{4}-/));
});

test("the instance's log offers the instance's areas, and every action's first word is in one list (INS-21)", async () => {
  show(<AuditTable title="Instance log" description="" path="/audit" />);
  await screen.findAllByText("secret.set");
  // The areas, not what the log holds (which the facets give, and may be anything).
  const areas = () =>
    within(screen.getByLabelText("Area"))
      .getAllByRole("option")
      .map((one) => one.getAttribute("value"));
  const options = areas();
  for (const own of ["instance", "identity_provider", "database_location", "tenant_import"]) {
    expect(options, own).toContain(own);
  }
  // A tenant's secrets and runs are never in the instance's log.
  expect(options).not.toContain("secret");
  expect(options).not.toContain("run");
  cleanup();
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  await screen.findAllByText("secret.set");
  const tenant = areas();
  for (const own of ["promotion", "dashboard", "git_repository", "worker_pool", "trigger"]) {
    expect(tenant, own).toContain(own);
  }
  expect(tenant).not.toContain("database_location");

  // Every action the control plane writes starts with a word one of the lists has.
  const known = new Set([...auditAreas(false), ...auditAreas(true)]);
  const missing = new Set<string>();
  for (const file of sourcesOf(join(__dirname, "../../control-plane/src"))) {
    for (const found of readFileSync(file, "utf8").matchAll(
      /\baction: ["`]([a-z_]+)\.[a-z_.${}]+["`]/g,
    )) {
      const first = found[1] as string;
      if (!known.has(first) && !NOT_AUDIT.has(first)) missing.add(first);
    }
  }
  expect([...missing]).toEqual([]);
});

/** Words `action:` is followed by in the control plane's code that are not entries of the log. */
const NOT_AUDIT = new Set([
  "body",
  "request",
  "older",
  "updated",
  "taken",
  "old",
  "input",
  "operation",
]);

function sourcesOf(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((one) =>
    one.isDirectory()
      ? sourcesOf(join(dir, one.name))
      : one.name.endsWith(".ts") && !one.name.endsWith(".test.ts") && !one.name.endsWith(".d.ts")
        ? [join(dir, one.name)]
        : [],
  );
}

const lastList = () => asked.filter((one) => /\/audit\?/.test(one)).at(-1) ?? "";

test("a tenant's log is narrowed to dates and a workspace, and the CSV is the same list (GOV-P9)", async () => {
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  await screen.findAllByText("secret.set");
  expect(screen.queryByLabelText("From date")).toBeNull();
  fireEvent.change(screen.getByLabelText("Since"), { target: { value: "custom" } });
  fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-31" } });
  await waitFor(() => expect(lastList()).toContain("to="));
  const from = new URL(lastList(), "http://x").searchParams.get("from");
  const to = new URL(lastList(), "http://x").searchParams.get("to");
  // The reader's own days: the start of the first and the end of the last.
  expect(from).toBe(new Date("2026-10-01T00:00:00").toISOString());
  expect(to).toBe(new Date("2026-10-31T23:59:59.999").toISOString());
  await screen.findByRole("option", { name: "Main" });
  fireEvent.change(screen.getByLabelText("Workspace"), { target: { value: "w1" } });
  await waitFor(() => expect(lastList()).toContain("workspaceId=w1"));
  expect(asked.filter((one) => one.includes("/audit-facets")).at(-1)).toContain("workspaceId=w1");
  const csv = screen.getByRole("link", { name: /CSV/ }).getAttribute("href") ?? "";
  expect(csv).toContain("/api/v1/tenants/t1/audit-export?");
  expect(csv).toContain("workspaceId=w1");
  expect(csv).toContain(encodeURIComponent(to ?? ""));
  // An end before the start is said.
  fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-01" } });
  expect(screen.getByLabelText("To date")).toBeTruthy();
});

test("everything about one thing is asked of the log from an entry, and is left again (GOV-P9)", async () => {
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  const details = await screen.findByRole("complementary", { name: "Entry details" });
  fireEvent.click(within(details).getByRole("button", { name: "Everything about this" }));
  await waitFor(() => expect(lastList()).toContain("target=target-a"));
  await screen.findByRole("button", { name: "Show everything" });
  expect(screen.getByRole("link", { name: /CSV/ }).getAttribute("href")).toContain(
    "target=target-a",
  );
  fireEvent.click(screen.getByRole("button", { name: "Show everything" }));
  await waitFor(() => expect(lastList()).not.toContain("target="));
});

test("the instance's log is narrowed by who, what, to what and until when (GOV-P8)", async () => {
  show(<AuditTable title="Instance log" description="" path="/audit" />);
  await screen.findAllByText("secret.set");
  fireEvent.click(screen.getByRole("button", { name: "More filters" }));
  await screen.findByRole("option", { name: "jane@acme.test (6)" });
  expect(asked.some((one) => one === "/api/v1/audit-facets?")).toBe(true);
  expect(screen.queryByLabelText("Workspace")).toBeNull();
  // The instance's log is a file too, from the server's own route.
  expect(screen.getByRole("link", { name: /CSV/ }).getAttribute("href")).toContain(
    "/api/v1/audit-export?",
  );
  fireEvent.change(screen.getByLabelText("Who"), {
    target: { value: "00000000-0000-7000-8000-00000000aaaa" },
  });
  await waitFor(() => expect(lastList()).toContain("actorId=00000000-0000-7000-8000-00000000aaaa"));
  fireEvent.change(screen.getByLabelText("Action"), { target: { value: "secret.set" } });
  await waitFor(() => expect(lastList()).toContain("action=secret.set"));
  fireEvent.change(screen.getByLabelText("Done to"), { target: { value: "secret" } });
  await waitFor(() => expect(lastList()).toContain("targetType=secret"));
  fireEvent.change(screen.getByLabelText("Since"), { target: { value: "custom" } });
  fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-31" } });
  await waitFor(() => expect(lastList()).toContain("to="));
  fireEvent.click(
    within(await screen.findByRole("complementary", { name: "Entry details" })).getByRole(
      "button",
      {
        name: "Everything about this",
      },
    ),
  );
  await waitFor(() => expect(lastList()).toContain("target=target-"));
});

test("R-final: the first row holds search and the few used most; the rest are behind 'More filters', which counts those set and applies them", async () => {
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  await screen.findAllByText("secret.set");
  const lastList = () => asked.filter((one) => /\/audit\?/.test(one)).at(-1) ?? "";
  // Search comes first, and the three used less are not in the row.
  const row = screen.getByLabelText("Search").closest("div");
  expect(row?.firstElementChild?.contains(screen.getByLabelText("Search"))).toBe(true);
  expect(screen.queryByLabelText("Who")).toBeNull();
  expect(screen.queryByLabelText("Action")).toBeNull();
  expect(screen.queryByLabelText("Done to")).toBeNull();
  const more = screen.getByRole("button", { name: "More filters" });
  expect(more.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(more);
  expect(more.getAttribute("aria-expanded")).toBe("true");
  await screen.findByRole("option", { name: "jane@acme.test (6)" });
  fireEvent.change(screen.getByLabelText("Action"), { target: { value: "secret.set" } });
  fireEvent.change(screen.getByLabelText("Done to"), { target: { value: "secret" } });
  await waitFor(() => expect(lastList()).toContain("targetType=secret"));
  expect(lastList()).toContain("action=secret.set");
  expect(screen.getByRole("button", { name: "More filters (2)" })).toBeTruthy();
});
