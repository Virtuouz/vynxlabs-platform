// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CommandPalette, ShortcutSheet } from "./kit/CommandPalette.tsx";
import { Current } from "./kit/current.ts";
import { openShortcuts } from "./kit/keys.ts";
import { resetPreferences } from "./prefs.ts";
import { show } from "./testing.tsx";

const T = "t1";
const W = "w1";
const RUN = "01a1dd14-0000-7000-8000-000000000123";
let calls: { method: string; url: string; body: unknown }[];

let searchFails = false;

beforeEach(() => {
  calls = [];
  searchFails = false;
  localStorage.clear();
  resetPreferences();
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
      if (searchFails) {
        return new Response(
          JSON.stringify({ status: 500, detail: "Broken", requestId: "req_search_1" }),
          {
            status: 500,
            headers: { "content-type": "application/problem+json" },
          },
        );
      }
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
  // A script opens on its own page, where its runs, schedule and code are.
  expect(location.pathname).toBe(`/t/${T}/workspaces/${W}/scripts/reminders/send`);
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

test("/run can start the script later and with a priority (OPS-MP8)", async () => {
  palette();
  type("/run");
  await waitFor(() =>
    expect(screen.getAllByRole("option")[0]?.textContent).toContain("Run script"),
  );
  press("Enter");
  await screen.findByText("agent/find-client");
  type("find");
  press("Enter");
  fireEvent.input(await screen.findByLabelText("Name"), { target: { value: "Fernhill" } });
  fireEvent.change(screen.getByLabelText("Start"), { target: { value: "later" } });
  const at = new Date(Date.now() + 7_200_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const field = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
  fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: field } });
  fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "-5" } });
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  await waitFor(() =>
    expect(calls.find((one) => one.method === "POST")?.body).toEqual({
      script: "agent/find-client",
      input: { name: "Fernhill" },
      startAfter: new Date(field).toISOString(),
      priority: -5,
    }),
  );
});

test("⌘↵ runs what is chosen without opening its page", async () => {
  palette();
  type("reminders");
  await screen.findByText("This workspace");
  // Written as this computer writes it: ⌘↵ on a Mac, Ctrl+Enter elsewhere.
  expect(screen.getByText(/(⌘↵|Ctrl\+Enter) Run/)).toBeTruthy();
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
  // The list's own keys are listed, now that every list moves with them.
  expect(screen.getByText("Move down or up the list")).toBeTruthy();
});

test("with a run open, its own commands come first, and one that ends something asks", async () => {
  const cancel = vi.fn();
  const rerun = vi.fn();
  show(
    <>
      <Current
        object={{
          heading: "This run",
          commands: [
            { key: "rerun", label: "Run again with the same input", run: rerun },
            { key: "cancel", label: "Cancel this run", danger: true, run: cancel },
          ],
          pin: { kind: "run", ref: RUN, id: RUN, workspaceId: W, title: "reminders/send" },
        }}
      />
      <CommandPalette open onClose={() => {}} destinations={[]} tenantId={T} workspaceId={W} />
    </>,
  );
  expect(await screen.findByText("This run")).toBeTruthy();
  const options = screen.getAllByRole("option").map((one) => one.textContent ?? "");
  expect(options[0]).toContain("Run again with the same input");
  expect(options[2]).toContain("Pin to the palette");
  // The results are grouped, each group named by its heading.
  expect(screen.getByRole("group", { name: "This run" })).toBeTruthy();
  press("Enter");
  expect(rerun).toHaveBeenCalled();
});

test("what is pinned comes before what is recent, and ⌘P pins what is chosen", async () => {
  palette();
  type("reminders");
  await screen.findByText("This workspace");
  press("p", { ctrlKey: true });
  type("");
  expect(await screen.findByText("Pinned")).toBeTruthy();
  const options = screen.getAllByRole("option").map((one) => one.textContent ?? "");
  expect(options[0]).toContain("reminders/send");
  expect(options[1]).toContain("orders/sync");
  expect(JSON.parse(localStorage.getItem(`vx-pref:palette.pins:${T}`) ?? "[]")).toEqual([
    expect.objectContaining({ kind: "script", ref: "reminders/send" }),
  ]);
});

test("a search that failed says so, with its request ID, and can be tried again", async () => {
  searchFails = true;
  palette();
  type("reminders");
  const failed = await screen.findByRole("alert");
  expect(failed.textContent).toMatch(/search failed/);
  expect(failed.textContent).toContain("req_search_1");
  expect(screen.queryByText(/Nothing matches/)).toBeNull();
  searchFails = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("This workspace")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("with single keys off, the sheet marks only the shortcuts that turn off (SHL-03)", async () => {
  localStorage.setItem("vx-pref:shortcuts.single-key", "false");
  show(<ShortcutSheet />);
  // F1 opens help; the sheet itself is opened with `?`, which is off, so it is asked for.
  act(() => openShortcuts());
  await screen.findByText("Keyboard shortcuts");
  // Enter, Space and Shift+F10 still work, so they are not marked.
  expect(screen.getByText("Open the row")).toBeTruthy();
  expect(screen.getByText("Check the row (single keys off)")).toBeTruthy();
  expect(screen.getByText("The menu for a step, or for the canvas")).toBeTruthy();
  // These really are turned off.
  expect(screen.getByText("Search this list (off)")).toBeTruthy();
  expect(screen.getByText("Overview (off)")).toBeTruthy();
  localStorage.clear();
});

test("WLK-04: the shortcut sheet writes the space bar as Space, not as an empty key cap", async () => {
  show(<ShortcutSheet />);
  act(() => openShortcuts());
  await screen.findByText("Keyboard shortcuts");
  const row = screen.getByText("Check the row").previousElementSibling as HTMLElement;
  expect(Array.from(row.children).map((cap) => cap.textContent)).toEqual(["x", "Space"]);
});
