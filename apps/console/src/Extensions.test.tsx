// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Extensions } from "./screens/Authoring.tsx";
import { Connections, connectionForm } from "./screens/Execution.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let calls: { method: string; url: string; body: unknown }[];

const smtp = {
  type: "object",
  properties: {
    host: { type: "string", title: "Server" },
    port: { type: "integer", title: "Port", default: 587 },
    security: { type: "string", enum: ["starttls", "tls", "none"] },
    from: { type: "string", title: "From" },
  },
  required: ["host", "from"],
};

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "PUT") return new Response(null, { status: 204 });
    if (address.endsWith("/resources")) {
      return json({
        items: [
          { path: "orders/sync", kind: "script", ownership: "ui", body: {} },
          {
            path: "connectors/shop",
            kind: "connector",
            ownership: "code",
            body: { description: "Talks to the shop." },
          },
          {
            path: "sources/inbox",
            kind: "trigger_source",
            ownership: "ui",
            body: { mode: "poll", description: "Looks for new mail." },
          },
        ],
      });
    }
    if (address.endsWith("/drafts")) {
      return json({
        items: [
          { path: "sources/payments", kind: "trigger_source", deleted: false, change: "create" },
          { path: "sources/gone", kind: "trigger_source", deleted: true, change: "delete" },
          { path: "orders/sync", kind: "script", deleted: false, change: "update" },
        ],
      });
    }
    if (address.endsWith("/connection-bindings")) {
      return json({
        items: [
          {
            path: "shop",
            connector: "http",
            description: "The shop's API.",
            defined: true,
            bound: true,
            config: { baseUrl: "https://shop.example" },
            configSchema: { properties: { baseUrl: { type: "string" } }, required: ["baseUrl"] },
            hasCredential: true,
          },
          {
            path: "outbox",
            connector: "smtp",
            description: "Where mail goes out.",
            defined: true,
            bound: false,
            config: null,
            configSchema: smtp,
            hasCredential: false,
          },
        ],
      });
    }
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a workspace's connectors and trigger sources are listed, deployed or still drafts", async () => {
  show(<Extensions root={root} link={link} editable />);
  const shop = await screen.findByRole("link", { name: "connectors/shop" });
  expect(shop.getAttribute("href")).toBe(`${link}/extensions/connector/edit/connectors/shop`);
  expect(screen.getByRole("link", { name: "sources/inbox" }).getAttribute("href")).toBe(
    `${link}/extensions/trigger_source/edit/sources/inbox`,
  );
  expect(screen.getByText("Trigger source for a schedule")).toBeTruthy();
  expect(screen.getByText("From the repository")).toBeTruthy();
  // A draft that was never deployed is listed too. One that removes, and a script, are not.
  expect(screen.getByRole("link", { name: "sources/payments" })).toBeTruthy();
  expect(screen.getByText("Draft")).toBeTruthy();
  expect(screen.queryByText("sources/gone")).toBeNull();
  expect(screen.queryByText("orders/sync")).toBeNull();
  expect(screen.getByRole("button", { name: "New connector" })).toBeTruthy();
});

test("a production workspace offers nothing to write", async () => {
  show(<Extensions root={root} link={link} editable={false} />);
  await screen.findByRole("link", { name: "connectors/shop" });
  expect(screen.queryByRole("button", { name: "New connector" })).toBeNull();
});

test("a connection's form is what its connector's schema can say plainly, and a secret", () => {
  const form = connectionForm({
    hasCredential: true,
    configSchema: {
      properties: {
        host: { type: "string" },
        secret: { type: "string" },
        auth: { type: "object" },
        tags: { type: "array" },
      },
      required: ["host", "auth"],
    },
  });
  expect(Object.keys(form.schema.properties)).toEqual(["host", "secret", "connection_secret"]);
  expect(form.secret).toBe("connection_secret");
  expect(form.left).toEqual(["auth", "tags"]);
  expect(form.schema.required).toEqual(["host"]);
  expect(form.schema.properties.connection_secret?.description).toBe(
    "Leave empty to keep the stored one.",
  );
});

test("a mail connection is set up from its row, with the form its connector gives", async () => {
  show(<Connections root={root} />);
  await screen.findByText("Mail (SMTP)");
  // Only a connection of another kind than HTTP has a form of its own on its row.
  expect(screen.getAllByRole("button", { name: "Set up" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Set up" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Server"), {
    target: { value: "mail.acme.example" },
  });
  fireEvent.change(within(dialog).getByLabelText("From"), {
    target: { value: "orders@acme.example" },
  });
  fireEvent.change(within(dialog).getByLabelText("Secret"), { target: { value: "s3cret" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
  expect(calls.find((call) => call.method === "PUT")).toEqual({
    method: "PUT",
    url: `/api/v1${root}/connection-bindings/outbox`,
    body: {
      config: { host: "mail.acme.example", port: 587, from: "orders@acme.example" },
      credential: "s3cret",
    },
  });
});
