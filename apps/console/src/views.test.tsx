// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { chooseColumns, type DataColumn } from "./kit/DataTable.tsx";
import { ColumnsMenu, ViewsMenu, viewQuery } from "./kit/views.tsx";
import { show } from "./testing.tsx";

let calls: { method: string; url: string; body: unknown }[];
let saved: { id: string; name: string; state: Record<string, unknown> }[];

beforeEach(() => {
  calls = [];
  saved = [];
  history.replaceState(null, "", "/t/t1/workspaces/w1/runs?when=24&status=failed&run=r9");
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    if (method === "POST") {
      const made = { id: `v${saved.length + 1}`, name: body.name, state: body.state };
      saved.push(made);
      return new Response(JSON.stringify(made), { status: 201 });
    }
    return new Response(JSON.stringify({ items: saved }), { status: 200 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a view is the list's address, less the open row, in a fixed order", () => {
  expect(viewQuery("?when=24&status=failed&run=r9", ["run"])).toBe("status=failed&when=24");
  // A list's values keep their order: the columns' order is what was chosen.
  expect(viewQuery("?cols=b&q=x&cols=a", [])).toBe("cols=b&cols=a&q=x");
});

test("a view is saved by name with the list's filters and density, and choosing it puts them back", async () => {
  const setDensity = vi.fn();
  show(
    <ViewsMenu
      tenantId="t1"
      workspaceId="w1"
      list="runs"
      omit={["run"]}
      density={{ value: "compact", set: setDensity }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Saved views" }));
  fireEvent.click(await screen.findByText("Save this view…"));
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Failed today" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      tenantId: "t1",
      workspaceId: "w1",
      list: "runs",
      name: "Failed today",
      state: { query: "status=failed&when=24", density: "compact" },
    }),
  );
  // Elsewhere in the list, choosing the view goes back to it.
  act(() => history.replaceState(null, "", "/t/t1/workspaces/w1/runs"));
  saved[0] = {
    ...saved[0],
    state: { query: "status=failed&when=24", density: "standard" },
  } as never;
  cleanup();
  show(
    <ViewsMenu
      tenantId="t1"
      workspaceId="w1"
      list="runs"
      density={{ value: "compact", set: setDensity }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Saved views" }));
  fireEvent.click(await screen.findByText("Failed today"));
  expect(location.search).toBe("?status=failed&when=24");
  expect(setDensity).toHaveBeenCalledWith("standard");
});

test("the first column always shows; the rest show as chosen, in the order chosen", () => {
  const columns: DataColumn<{ id: string }>[] = [
    { header: "State", cell: () => null },
    { header: "Target", cell: () => null },
    { header: "Started", cell: () => null },
    { header: "Run ID", key: "id", cell: () => null },
  ];
  expect(chooseColumns(columns, undefined).map((column) => column.header)).toEqual([
    "State",
    "Target",
    "Started",
    "Run ID",
  ]);
  expect(chooseColumns(columns, ["id", "Target", "gone"]).map((column) => column.header)).toEqual([
    "State",
    "Run ID",
    "Target",
  ]);
});

test("columns are hidden and moved from the keyboard, and the order defined is kept out of the address", async () => {
  const changes: (string[] | undefined)[] = [];
  function Harness() {
    const [shown, setShown] = useState<string[] | undefined>();
    return (
      <ColumnsMenu
        columns={[
          { key: "target", label: "Target" },
          { key: "started", label: "Started" },
          { key: "id", label: "Run ID" },
        ]}
        shown={shown}
        onChange={(next) => {
          changes.push(next);
          setShown(next);
        }}
      />
    );
  }
  show(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Move Run ID up" }));
  expect(changes.at(-1)).toEqual(["target", "id", "started"]);
  fireEvent.click(screen.getByRole("button", { name: "Move Run ID down" }));
  // Back to the order defined: no choice at all, so nothing is kept.
  expect(changes.at(-1)).toBeUndefined();
  fireEvent.click(screen.getByLabelText("Started"));
  expect(changes.at(-1)).toEqual(["target", "id"]);
});
