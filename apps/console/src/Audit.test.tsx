// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuditTable, verbOf } from "./screens/Audit.tsx";
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
  vi.stubGlobal("fetch", async (address: string) => {
    asked.push(address);
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

test("the list narrows by kind here and by area on the server", async () => {
  show(<AuditTable title="Audit log" description="" path="/tenants/t1/audit" />);
  await screen.findAllByText("secret.set");
  fireEvent.click(screen.getByRole("button", { name: "Execute" }));
  expect(screen.queryByText("secret.set")).toBeNull();
  // In the list, and in the details that open for it.
  expect(screen.getAllByText("run.started")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  expect(screen.getByText("Nothing of that kind")).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Area"), { target: { value: "role" } });
  await screen.findAllByText("role.created");
  await waitFor(() => expect(asked.at(-1)).toBe("/api/v1/tenants/t1/audit?limit=50&area=role"));
});
