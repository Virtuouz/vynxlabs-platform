// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConnectionGroups } from "./screens/Execution.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];
let groups: object[];

beforeEach(() => {
  calls = [];
  groups = [
    {
      path: "shops",
      description: "Each customer's shop.",
      connector: "http",
      members: [
        {
          key: "north",
          label: "North shop",
          config: { baseUrl: "https://north.example" },
          hasCredential: true,
        },
      ],
    },
    { path: "erps", description: "", connector: "http", members: [] },
  ];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    if (method === "GET") return new Response(JSON.stringify({ items: groups }), { status: 200 });
    return new Response(null, { status: 204 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("each group is shown with its members, and a group with none says what that means", async () => {
  show(<ConnectionGroups root={root} />);
  expect(await screen.findByText("north")).toBeTruthy();
  expect(screen.getByText("https://north.example")).toBeTruthy();
  expect(screen.getByText("Set")).toBeTruthy();
  expect(
    screen.getByText(/No members yet\. A script that asks this group for a key will fail/),
  ).toBeTruthy();
});

test("a member is added with a key, an address and a credential, and removed after asking", async () => {
  show(<ConnectionGroups root={root} />);
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Add a member" }))[1] as HTMLElement,
  );
  fireEvent.change(await screen.findByLabelText("Key"), { target: { value: "acme" } });
  fireEvent.change(screen.getByLabelText("Address"), {
    target: { value: "https://erp.acme.example" },
  });
  fireEvent.change(screen.getByLabelText("How the credential is sent"), {
    target: { value: "header" },
  });
  fireEvent.change(await screen.findByLabelText("Header name"), { target: { value: "x-erp-key" } });
  fireEvent.change(screen.getByLabelText("Credential"), { target: { value: "s3cret" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Add a member" }).at(-1) as HTMLElement);
  await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
  expect(calls.find((call) => call.method === "PUT")).toEqual({
    method: "PUT",
    url: `/api/v1${root}/connection-group-members/acme/erps`,
    body: {
      config: { baseUrl: "https://erp.acme.example", auth: { type: "header", name: "x-erp-key" } },
      credential: "s3cret",
    },
  });

  fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
  expect(await answer("Remove")).toContain('Scripts that ask shops for "north" will fail');
  await waitFor(() =>
    expect(calls.find((call) => call.method === "DELETE")?.url).toBe(
      `/api/v1${root}/connection-group-members/north/shops`,
    ),
  );
});

test("a workspace with no groups shows nothing", async () => {
  groups = [];
  const { container } = show(<ConnectionGroups root={root} />);
  await waitFor(() => expect(calls.length).toBe(1));
  expect(container.textContent).toBe("");
});
