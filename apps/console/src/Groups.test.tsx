// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AttributesDialog, EndUserGroups, Groups } from "./screens/Groups.tsx";
import { show } from "./testing.tsx";

const base = "/tenants/t1";
let calls: { method: string; url: string; body: unknown }[];
let members: { id: string; email: string; name: string }[];

beforeEach(() => {
  calls = [];
  members = [{ id: "u1", email: "ada@acme.test", name: "Ada" }];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (method === "PUT") {
      members = [...members, { id: "u2", email: "bo@acme.test", name: "Bo" }];
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE") {
      members = members.filter((person) => !address.endsWith(person.id));
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH") return json({});
    if (/\/(groups|end-user-groups)\/g1$/.test(address)) return json({ members });
    if (/\/(members|end-users)\?/.test(address)) {
      return json({
        items: [
          { id: "u1", email: "ada@acme.test", name: "Ada" },
          { id: "u2", email: "bo@acme.test", name: "Bo" },
        ],
      });
    }
    return json({
      items: [
        {
          id: "g1",
          name: "finance",
          description: "Sees invoices.",
          memberCount: 1,
          createdAt: "2026-11-13T00:00:00Z",
        },
      ],
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a group of members shows who is in it, adds someone found by email, and takes someone out", async () => {
  show(<Groups base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Members" }));
  expect(await screen.findByText("ada@acme.test")).toBeTruthy();

  // Only people not already in the group are offered.
  const search = screen.getByRole("combobox");
  // The list opens as it does for a person: a click on the box, then a key.
  fireEvent.click(search);
  fireEvent.keyDown(search, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /bo@acme\.test/ }));
  expect(screen.queryByRole("option", { name: /ada@acme\.test/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.url).toBe(
      `/api/v1${base}/groups/g1/members/u2`,
    ),
  );
  expect(await screen.findByText("bo@acme.test")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Take ada@acme.test out" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "DELETE")?.url).toBe(
      `/api/v1${base}/groups/g1/members/u1`,
    ),
  );
  await waitFor(() => expect(screen.queryByText("ada@acme.test")).toBeNull());
});

test("groups of end users have the same membership dialog, against their own routes", async () => {
  show(<EndUserGroups base={base} />);
  expect(await screen.findByText("Sees invoices.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "People" }));
  await screen.findByText("ada@acme.test");
  expect(calls.some((call) => call.url === `/api/v1${base}/end-user-groups/g1`)).toBe(true);
  expect(calls.some((call) => call.url === `/api/v1${base}/end-users?limit=200`)).toBe(true);
});

test("attributes are saved together, and a row left empty is left out", async () => {
  const saved = vi.fn();
  show(
    <AttributesDialog
      base={base}
      user={{ id: "u1", email: "ada@acme.test", attributes: { customer_id: "C-1" } }}
      onClose={() => {}}
      onSaved={saved}
    />,
  );
  expect((screen.getByLabelText("Value") as HTMLInputElement).value).toBe("C-1");
  fireEvent.click(screen.getByRole("button", { name: "Add an attribute" }));
  fireEvent.change(screen.getAllByLabelText("Name")[1] as HTMLElement, {
    target: { value: "region" },
  });
  fireEvent.change(screen.getAllByLabelText("Value")[1] as HTMLElement, {
    target: { value: "north" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add an attribute" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(calls.find((call) => call.method === "PATCH")).toEqual({
    method: "PATCH",
    url: `/api/v1${base}/end-users/u1`,
    body: { attributes: { customer_id: "C-1", region: "north" } },
  });
});
