// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EventPage } from "./screens/ObjectPages.tsx";
import { EventsWorkbench } from "./screens/Operate.tsx";
import { show } from "./testing.tsx";

// Phase 29, lane t3-flow-ops-sdk (OPS-MP1): an event published by hand, with a form from its schema.

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let posted: { url: string; body: unknown }[];
let publish: () => [number, unknown];

const declared = {
  kind: "event",
  path: "orders/placed",
  ownership: "code",
  version: 2,
  body: {
    description: "An order was placed.",
    payload: {
      type: "object",
      properties: { orderId: { type: "string" }, total: { type: "number" } },
      required: ["orderId"],
    },
  },
};

beforeEach(() => {
  posted = [];
  publish = () => [201, { id: "e9", started: 2 }];
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const url = new URL(address, "http://console.test");
    const path = url.pathname.replace("/api/v1", "");
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (init.method === "POST" && path === `${root}/events`) {
      posted.push({ url: path, body: JSON.parse(init.body as string) });
      const [status, body] = publish();
      return json(status, body);
    }
    if (path === `${root}/events`) return json(200, { items: [], nextCursor: null });
    if (path === `${root}/resources` && url.searchParams.get("kind") === "event") {
      return json(200, { items: [declared] });
    }
    if (path === `${root}/resources/orders/placed`) return json(200, declared);
    return json(200, { items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("an event is published by hand from the Events screen, with a form from its schema", async () => {
  show(<EventsWorkbench root={root} link={link} production={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Publish an event" }));
  const dialog = await screen.findByRole("dialog");
  const box = await within(dialog).findByRole("combobox", { name: "Event" });
  fireEvent.mouseDown(box);
  fireEvent.click(box);
  fireEvent.click(await screen.findByText("orders/placed"));
  fireEvent.input(await within(dialog).findByLabelText(/^order id/i), { target: { value: "A-1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]?.body).toEqual({ name: "orders/placed", payload: { orderId: "A-1" } });
  expect(await screen.findByText(/It started 2 runs/)).toBeTruthy();
});

test("on an event's own page it is already chosen, and what the server refuses is said on the field", async () => {
  publish = () => [
    400,
    {
      status: 400,
      detail: "The payload does not match the event's schema.",
      errors: [{ path: "/payload/orderId", message: "must be a string" }],
    },
  ];
  show(<EventPage root={root} link={link} path="orders/placed" production={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Publish it" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByRole("combobox", { name: "Event" })).toBeNull();
  fireEvent.input(await within(dialog).findByLabelText(/^order id/i), { target: { value: "x" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
  expect(await within(dialog).findByText("must be a string")).toBeTruthy();
});

test("in production it asks first, and says that it starts real work", async () => {
  show(<EventPage root={root} link={link} path="orders/placed" production />);
  fireEvent.click(await screen.findByRole("button", { name: "Publish it" }));
  const form = await screen.findByRole("dialog");
  fireEvent.input(await within(form).findByLabelText(/^order id/i), { target: { value: "A-2" } });
  fireEvent.click(within(form).getByRole("button", { name: "Publish" }));
  const sure = await screen.findByText(/production/i, { selector: "p, div, span" });
  expect(sure).toBeTruthy();
  expect(posted).toHaveLength(0);
  const confirm = (await screen.findAllByRole("dialog")).at(-1) as HTMLElement;
  fireEvent.click(within(confirm).getByRole("button", { name: "Publish in production" }));
  await waitFor(() => expect(posted).toHaveLength(1));
});

test("with no event declared, the dialog says so and what to do", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
  show(<EventsWorkbench root={root} link={link} production={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "Publish an event" }));
  expect(await screen.findByText(/No event is declared in this workspace yet/)).toBeTruthy();
});
