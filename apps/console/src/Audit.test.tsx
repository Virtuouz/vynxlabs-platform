// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AREAS, AuditTable, targetName, verbOf } from "./screens/Audit.tsx";
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

test("an answer to a filter that is no longer the one asked is not shown (GOV-17)", async () => {
  // The first page, with no filter, answers only when told to: after the filtered one.
  let release: () => void = () => {};
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal("fetch", async (address: string) => {
    if (address.includes("/audit-facets")) {
      return new Response(JSON.stringify({ actions: [], actors: [], targetTypes: [] }), {
        status: 200,
      });
    }
    const filtered = address.includes("area=role");
    if (!filtered) await slow;
    const items = filtered ? [entry("r", "role.created")] : [entry("a", "run.started")];
    return new Response(JSON.stringify({ items, nextCursor: null }), { status: 200 });
  });
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  fireEvent.change(await screen.findByLabelText("Area"), { target: { value: "role" } });
  await screen.findAllByText("role.created");
  release();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryAllByText("run.started")).toHaveLength(0);
  expect(screen.getAllByText("role.created").length).toBeGreaterThan(0);
});

test("every action the server writes by a literal name has an area to narrow to (GOV-27)", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = join(__dirname, "../../control-plane/src");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) files.push(full);
    }
  };
  walk(root);
  const written = new Set<string>();
  for (const file of files) {
    for (const found of readFileSync(file, "utf8").matchAll(
      /action: ["'`]([a-z_]+)\.[a-z_.]+["'`]/g,
    )) {
      written.add(found[1] as string);
    }
  }
  const areas = new Set(AREAS.map(([value]) => value));
  expect([...written].filter((word) => !areas.has(word)).sort()).toEqual([]);
  // Operator access is under `operator`, not `access_grant`.
  expect(areas.has("operator")).toBe(true);
});

test("the instance's log offers the instance's areas, not a tenant's", async () => {
  show(<AuditTable title="Audit log" description="" path="/instance/audit" />);
  await screen.findByLabelText("Area");
  const options = screen.getAllByRole("option").map((option) => option.textContent);
  expect(options).toContain("Instance settings");
  expect(options).not.toContain("Flows");
});
