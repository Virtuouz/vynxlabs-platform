// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Provisioning } from "./screens/Provisioning.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/provisioning/p1";
let calls: { method: string; url: string; body: unknown }[];
let state: Record<string, unknown>;

beforeEach(() => {
  calls = [];
  state = {
    address: "https://platform.example/api/v1/scim/v2/p1",
    settings: { subjectFrom: null, groups: "sign_in", createGroups: false },
    tokens: [
      {
        id: "k1",
        name: "Entra",
        prefix: "vxp_abcdefgh",
        createdAt: "2026-11-01T10:00:00Z",
        expiresAt: null,
        lastUsedAt: null,
      },
    ],
    users: { pushed: 12, active: 9 },
    groups: 3,
    lastPushAt: "2026-11-12T10:00:00Z",
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "POST") {
      return json(
        { id: "k2", name: body.name, prefix: "vxp_zzzz", token: "vxp_the-whole-token" },
        201,
      );
    }
    if (method === "DELETE") {
      state = { ...state, tokens: [] };
      return new Response(null, { status: 204 });
    }
    if (method === "PUT") state = { ...state, settings: body };
    if (address.includes("/pushed")) {
      return json({
        people: [
          {
            userName: "ana@acme.example",
            email: "ana@acme.example",
            displayName: "Ana Ruiz",
            active: true,
            updatedAt: "2026-11-12T10:00:00Z",
          },
          {
            userName: "bo@acme.example",
            email: "bo@acme.example",
            displayName: null,
            active: false,
            updatedAt: "2026-11-11T10:00:00Z",
          },
        ],
        refusals: [
          {
            method: "POST",
            resource: "Users",
            status: 409,
            reason: "A member with that email is already in another directory.",
            at: "2026-11-12T11:00:00Z",
          },
        ],
      });
    }
    return json(state);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the address, the tokens and what was pushed are shown, and a new token once", async () => {
  show(<Provisioning root={root} instance={false} audience="members" />);
  expect(await screen.findByText("https://platform.example/api/v1/scim/v2/p1")).toBeTruthy();
  expect(screen.getByText("vxp_abcdefgh…")).toBeTruthy();
  expect(screen.getByText("12")).toBeTruthy();
  // Three of the twelve were turned off.
  expect(screen.getByText("Of them, turned off").parentElement?.textContent).toContain("3");
  expect(screen.getByText(/is suspended in this tenant/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Make a token" }));
  await answer("Make the token", "Okta");
  expect(await screen.findByText("vxp_the-whole-token")).toBeTruthy();
  expect(calls.find((call) => call.method === "POST")).toEqual({
    method: "POST",
    url: `/api/v1${root}/tokens`,
    body: { name: "Okta" },
  });

  fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
  expect(await answer("Revoke")).toContain("Entra");
  await screen.findByText("No tokens yet");
  expect(calls.some((call) => call.method === "DELETE" && call.url.endsWith("/tokens/k1"))).toBe(
    true,
  );
});

test("how pushes are taken is chosen and saved together, from the save bar (GOV-33)", async () => {
  show(<Provisioning root={root} instance={false} audience="end_users" />);
  await screen.findByLabelText("A person's groups come from");
  // Nothing is changed: no bar, and nothing to save.
  expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
  expect(screen.getByText(/is disabled, and whatever they were signed in to ends/)).toBeTruthy();
  // Making groups is offered only once pushed groups decide.
  expect(screen.queryByLabelText(/Make a group here/)).toBeNull();
  fireEvent.change(screen.getByLabelText("A person's groups come from"), {
    target: { value: "scim" },
  });
  fireEvent.click(screen.getByLabelText(/Make a group here/));
  fireEvent.change(
    screen.getByLabelText("The name the provider signs a person in by is pushed as"),
    { target: { value: "externalId" } },
  );
  const bar = await screen.findByRole("region", { name: "Unsaved changes" });
  expect(bar.textContent).toContain("how pushes are taken");
  // Discard puts back what was saved.
  fireEvent.click(within(bar).getByRole("button", { name: "Discard" }));
  expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
  expect((screen.getByLabelText("A person's groups come from") as HTMLSelectElement).value).toBe(
    "sign_in",
  );
  fireEvent.change(screen.getByLabelText("A person's groups come from"), {
    target: { value: "scim" },
  });
  fireEvent.click(screen.getByLabelText(/Make a group here/));
  fireEvent.change(
    screen.getByLabelText("The name the provider signs a person in by is pushed as"),
    { target: { value: "externalId" } },
  );
  fireEvent.click(
    within(await screen.findByRole("region", { name: "Unsaved changes" })).getByRole("button", {
      name: "Save",
    }),
  );
  await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
  expect(calls.find((call) => call.method === "PUT")?.body).toEqual({
    subjectFrom: "externalId",
    groups: "scim",
    createGroups: true,
  });
});

test("the instance's own provider has no groups to push to", async () => {
  show(<Provisioning root="/instance/provisioning/p1" instance audience="members" />);
  await screen.findByText(/has their account disabled everywhere/);
  expect(screen.queryByLabelText("A person's groups come from")).toBeNull();
  expect(screen.queryByText("Groups")).toBeNull();
});

test("the people pushed and the pushes refused are listed, with why", async () => {
  show(<Provisioning root={root} instance={false} audience="members" />);
  expect(await screen.findByText("Ana Ruiz")).toBeTruthy();
  expect(screen.getByText("POST Users")).toBeTruthy();
  expect(screen.getByText(/already in another directory/)).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: /Turned off/ }));
  await waitFor(() => expect(screen.queryByText("Ana Ruiz")).toBeNull());
  expect(screen.getAllByText("bo@acme.example").length).toBeGreaterThan(0);
});

test("a token says when it expires, and an expired one does not look live (GOV-28)", async () => {
  state = {
    ...state,
    tokens: [
      {
        id: "k1",
        name: "Old",
        prefix: "vxp_oldoldol",
        createdAt: "2026-01-01T10:00:00Z",
        expiresAt: "2026-02-01T10:00:00Z",
        lastUsedAt: null,
      },
      {
        id: "k2",
        name: "Fresh",
        prefix: "vxp_freshfre",
        createdAt: "2026-11-01T10:00:00Z",
        expiresAt: "2999-01-01T10:00:00Z",
        lastUsedAt: null,
      },
      {
        id: "k3",
        name: "Forever",
        prefix: "vxp_foreverr",
        createdAt: "2026-11-01T10:00:00Z",
        expiresAt: null,
        lastUsedAt: null,
      },
    ],
  };
  show(<Provisioning root={root} instance={false} audience="members" />);
  await screen.findByText("vxp_oldoldol…");
  expect(screen.getByRole("columnheader", { name: "Expires" })).toBeTruthy();
  const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;
  expect(rowOf("Old").textContent).toContain("Expired");
  expect(rowOf("Fresh").textContent).toContain("Active");
  expect(rowOf("Forever").textContent).toContain("Never");
});

test("people pushed past the first page say so and load on (GOV-34)", async () => {
  const person = (n: number) => ({
    userName: `u${n}@acme.example`,
    email: `u${n}@acme.example`,
    displayName: `Person ${n}`,
    active: true,
    updatedAt: "2026-11-12T10:00:00Z",
  });
  const fetched = globalThis.fetch;
  vi.stubGlobal("fetch", async (address: string, init?: RequestInit) => {
    if (address.endsWith("/pushed?limit=200"))
      return new Response(JSON.stringify({ people: [person(1)], refusals: [], nextCursor: "c1" }), {
        status: 200,
      });
    if (address.endsWith("/pushed?limit=200&cursor=c1"))
      return new Response(JSON.stringify({ people: [person(2)], refusals: [], nextCursor: null }), {
        status: 200,
      });
    return fetched(address, init);
  });
  show(<Provisioning root={root} instance={false} audience="members" />);
  await screen.findByText("Person 1");
  await screen.findByText("Showing the first 1 people.");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText("Person 2");
});
