// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConnectionGroups } from "./screens/Execution.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];

const smtp = {
  type: "object",
  properties: {
    host: { type: "string", title: "Server" },
    from: { type: "string", title: "From" },
  },
  required: ["host", "from"],
};
const http = {
  type: "object",
  properties: {
    baseUrl: { type: "string", title: "Address" },
    auth: {
      oneOf: [
        {
          type: "object",
          title: "Authorization: Bearer",
          properties: { type: { const: "bearer" } },
          required: ["type"],
        },
      ],
      title: "How the credential is sent",
    },
    headers: { type: "object", additionalProperties: { type: "string" }, title: "Headers" },
  },
  required: ["baseUrl"],
};

const group = (path: string, connector: string, configSchema: object, members: object[]) => ({
  path,
  description: "",
  connector,
  configSchema,
  draft: null,
  members,
});

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    if (method === "PUT") return new Response(null, { status: 204 });
    return new Response(
      JSON.stringify({
        items: [
          group("mailers", "smtp", smtp, []),
          group("crm", "http", http, [
            {
              key: "one",
              label: "One",
              config: {
                baseUrl: "https://one.test",
                auth: { type: "bearer" },
                headers: { "x-a": "b" },
              },
              hasCredential: true,
              updatedAt: "2026-11-15T10:00:00Z",
            },
          ]),
        ],
      }),
      { status: 200 },
    );
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const put = (url: string) => calls.find((call) => call.method === "PUT" && call.url.endsWith(url));

test("a member of a mail group is given the group's settings, not an address", async () => {
  show(<ConnectionGroups root={root} />);
  const buttons = await screen.findAllByRole("button", { name: "Add a member" });
  fireEvent.click(buttons[0] as HTMLElement);
  const sheet = await screen.findByRole("dialog");
  fireEvent.change(within(sheet).getByLabelText("Key"), { target: { value: "north" } });
  fireEvent.change(within(sheet).getByLabelText("Server"), { target: { value: "smtp.test" } });
  fireEvent.change(within(sheet).getByLabelText("From"), { target: { value: "a@b.test" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(put("/connection-group-members/north/mailers")).toBeTruthy());
  expect(put("/connection-group-members/north/mailers")?.body).toMatchObject({
    config: { host: "smtp.test", from: "a@b.test" },
  });
});

test("changing a member keeps how its credential is sent and its headers", async () => {
  show(<ConnectionGroups root={root} />);
  fireEvent.click(await screen.findByRole("button", { name: "Change" }));
  const sheet = await screen.findByRole("dialog");
  fireEvent.change(within(sheet).getByLabelText("Address"), {
    target: { value: "https://one-new.test" },
  });
  fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(put("/connection-group-members/one/crm")).toBeTruthy());
  const body = put("/connection-group-members/one/crm")?.body as {
    config: Record<string, unknown>;
    credential?: string;
  };
  expect(body.config).toMatchObject({
    baseUrl: "https://one-new.test",
    auth: { type: "bearer" },
    headers: { "x-a": "b" },
  });
  expect(body.credential).toBeUndefined();
});
