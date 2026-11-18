// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OldPaths } from "./screens/OldPaths.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
let items: object[];
let deleted: string[];

beforeEach(() => {
  deleted = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    if (method === "GET" && address === `/api/v1${root}/aliases`) {
      return new Response(JSON.stringify({ items }), { status: 200 });
    }
    if (method === "DELETE") {
      deleted.push(address);
      items = [];
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify({ detail: "No mock" }), { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("nothing is shown while no renamed resource answers at an old path", async () => {
  items = [];
  const { container } = show(<OldPaths root={root} canEnd />);
  await waitFor(() => expect(container.textContent).toBe(""));
});

test("an old path says where the resource is now and until when it answers, and can be ended", async () => {
  items = [
    {
      path: "requests/submit",
      kind: "script",
      resourceId: "r1",
      now: "lending/requests/file",
      createdAt: "2026-11-17T10:00:00.000Z",
      expiresAt: "2027-02-15T10:00:00.000Z",
      lastUsedAt: null,
    },
  ];
  show(<OldPaths root={root} canEnd />);
  expect(await screen.findByText("requests/submit")).toBeTruthy();
  expect(screen.getByText("lending/requests/file")).toBeTruthy();
  expect(screen.getByText("Never")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "End now" }));
  await answer("End now");
  await waitFor(() => expect(deleted).toEqual([`/api/v1${root}/aliases/requests/submit`]));
  await waitFor(() => expect(screen.queryByText("requests/submit")).toBeNull());
});
