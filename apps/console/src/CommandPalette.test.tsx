// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CommandPalette, ShortcutSheet } from "./kit/CommandPalette.tsx";
import { show } from "./testing.tsx";

const T = "t1";
const W = "w1";
const RUN = "01a1dd14-0000-7000-8000-000000000123";
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    const url = new URL(address, "http://x");
    if (url.pathname.endsWith("/me/recent-items")) {
      return json({
        items: [
          {
            kind: "script",
            ref: "orders/sync",
            workspaceId: W,
            workspaceSlug: "dev",
            title: "orders/sync",
            visitedAt: "2026-11-14T10:00:00Z",
          },
        ],
      });
    }
    if (url.pathname.endsWith("/search")) {
      const q = url.searchParams.get("q") ?? "";
      if (q === RUN) {
        return json({
          items: [
            {
              kind: "run",
              id: RUN,
              ref: RUN,
              workspaceId: W,
              workspaceSlug: "dev",
              title: "reminders/send",
              hint: "Run · failed",
            },
          ],
        });
      }
      return json({
        items: [
          {
            kind: "script",
            id: "r1",
            ref: "reminders/send",
            workspaceId: W,
            workspaceSlug: "dev",
            title: "reminders/send",
            hint: null,
          },
          {
            kind: "schedule",
            id: "r2",
            ref: "reminders/hourly",
            workspaceId: "w2",
            workspaceSlug: "main",
            title: "reminders/hourly",
            hint: null,
          },
        ],
      });
    }
    if (url.pathname.endsWith("/scripts")) {
      return json({ items: [{ path: "agent/find-client" }, { path: "orders/sync" }] });
    }
    if (url.pathname.includes("/resources/")) {
      return json({
        body: {
          input: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        },
      });
    }
    if (method === "POST" && url.pathname.endsWith("/runs")) return json({ id: "new-run" }, 201);
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

const palette = () =>
  show(
    <CommandPalette
      open
      onClose={() => {}}
      destinations={[{ key: "secrets", label: "Secrets", to: `/t/${T}/workspaces/${W}/secrets` }]}
      tenantId={T}
      workspaceId={W}
      workspaceType="dev"
      workspaces={[
        { id: W, name: "Dev" },
        { id: "w2", name: "Main" },
      ]}
    />,
  );
const box = () => screen.getByRole("combobox");
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const press = (key: string, more: object = {}) => fireEvent.keyDown(box(), { key, ...more });

test("recent things first, then screens and actions", async () => {
  palette();
  expect(await screen.findByText("Recent")).toBeTruthy();
  const options = screen.getAllByRole("option").map((one) => one.textContent ?? "");
  expect(options[0]).toContain("orders/sync");
  expect(options.some((one) => one.includes("Secrets"))).toBe(true);
});

test("a name finds things here before other workspaces, and opens the one chosen", async () => {
  palette();
  type("reminders");
  await screen.findByText("This workspace");
  expect(screen.getByText("Other workspaces")).toBeTruthy();
  const options = screen.getAllByRole("option").map((one) => one.textContent ?? "");
  expect(options[0]).toContain("reminders/send");
  expect(options[1]).toContain("reminders/hourly");
  press("Enter");
  expect(location.pathname).toBe(`/t/${T}/workspaces/${W}/scripts/edit/reminders/send`);
});

test("a pasted run ID opens its run", async () => {
  palette();
  type(`>${RUN}`);
  await screen.findByText("Runs");
  const asked = calls.find((one) => one.url.includes("/search"));
  expect(asked?.url).toContain("only=runs");
  press("Enter");
  expect(location.pathname).toBe(`/t/${T}/workspaces/${W}/runs/${RUN}`);
});

test("/run picks a script, asks for its input, and starts it", async () => {
  palette();
  type("/run");
  await waitFor(() =>
    expect(screen.getAllByRole("option")[0]?.textContent).toContain("Run script"),
  );
  press("Enter");
  // Now choosing the script.
  await screen.findByText("agent/find-client");
  type("find");
  press("Enter");
  const name = await screen.findByLabelText("Name");
  fireEvent.input(name, { target: { value: "Fernhill" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() =>
    expect(calls.find((one) => one.method === "POST")).toMatchObject({
      url: `/api/v1/tenants/${T}/workspaces/${W}/runs`,
      body: { script: "agent/find-client", input: { name: "Fernhill" } },
    }),
  );
  await waitFor(() => expect(location.pathname).toBe(`/t/${T}/workspaces/${W}/runs/new-run`));
});

test("⌘↵ runs what is chosen without opening its page", async () => {
  palette();
  type("reminders");
  await screen.findByText("This workspace");
  expect(screen.getByText("⌘↵ Run")).toBeTruthy();
  press("Enter", { metaKey: true });
  expect(await screen.findByLabelText("Name")).toBeTruthy();
  expect(location.pathname).toBe("/");
});

test("? opens the shortcuts, except while typing", async () => {
  show(
    <>
      <input aria-label="Somewhere to type" />
      <ShortcutSheet />
    </>,
  );
  fireEvent.keyDown(screen.getByLabelText("Somewhere to type"), { key: "?" });
  expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  fireEvent.keyDown(document.body, { key: "?" });
  expect(await screen.findByText("Keyboard shortcuts")).toBeTruthy();
});
