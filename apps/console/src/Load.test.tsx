// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, useLoad } from "./api.ts";
import { show } from "./testing.tsx";

let asked: string[];
let count: number;

beforeEach(() => {
  asked = [];
  count = 0;
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    asked.push(`${init.method ?? "GET"} ${address}`);
    if ((init.method ?? "GET") !== "GET") {
      count += 1;
      return new Response(null, { status: 204 });
    }
    return Response.json({ count });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Count({ path, label }: { path: string; label: string }) {
  const loaded = useLoad<{ count: number }>(path);
  return (
    <p>
      {label} {loaded.data?.count ?? "…"}
      <button type="button" onClick={loaded.reload}>
        Reload {label}
      </button>
    </p>
  );
}

const reads = (path: string) => asked.filter((one) => one === `GET /api/v1${path}`);

test("two screens that read the same path share one request", async () => {
  show(
    <>
      <Count path="/tenants/t1/summary" label="header" />
      <Count path="/tenants/t1/summary" label="overview" />
    </>,
  );
  await screen.findByText("header 0");
  await screen.findByText("overview 0");
  expect(reads("/tenants/t1/summary")).toHaveLength(1);
});

test("reload asks again", async () => {
  show(<Count path="/tenants/t1/summary" label="overview" />);
  await screen.findByText("overview 0");
  fireEvent.click(screen.getByRole("button", { name: "Reload overview" }));
  await waitFor(() => expect(reads("/tenants/t1/summary")).toHaveLength(2));
});

test("a write asks again for what is on screen in the same tenant, and nothing else", async () => {
  show(
    <>
      <Count path="/tenants/t1/summary" label="ours" />
      <Count path="/tenants/t1/workspaces/w1/activity?limit=100" label="runs" />
      <Count path="/tenants/t2/summary" label="theirs" />
    </>,
  );
  await screen.findByText("ours 0");
  await screen.findByText("runs 0");
  await screen.findByText("theirs 0");
  await api.post("/tenants/t1/approvals/a1", { decision: "approve" });
  // The approval changed this tenant's numbers, and every view of them follows.
  await screen.findByText("ours 1");
  await screen.findByText("runs 1");
  expect(screen.getByText("theirs 0")).toBeTruthy();
  expect(reads("/tenants/t2/summary")).toHaveLength(1);
});

test("a person's own settings change only their own reads", async () => {
  show(
    <>
      <Count path="/tenants/t1/summary" label="tenant" />
      <Count path="/me" label="me" />
    </>,
  );
  await screen.findByText("tenant 0");
  await screen.findByText("me 0");
  // Remembering where someone is must not have every screen asked for again.
  await api.put("/me/recent", { tenantId: "t1", workspaceId: null });
  await screen.findByText("me 1");
  expect(screen.getByText("tenant 0")).toBeTruthy();
  expect(reads("/tenants/t1/summary")).toHaveLength(1);
});
