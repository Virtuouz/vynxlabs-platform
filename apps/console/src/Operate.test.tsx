// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApprovalsQueue } from "./screens/Operate.tsx";
import { show } from "./testing.tsx";

let calls: { method: string; url: string; body: unknown }[];

const waiting = (n: number) => ({
  flowRunId: `fr${n}`,
  workspaceId: "w1",
  flow: "refunds/approve",
  node: "ask",
  title: `Refund ${n}`,
  detail: { amount: 100 + n },
  waitingSince: "2026-11-15T10:00:00Z",
  timesOutAt: null,
  approvers: null,
});

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "POST") {
      return json({ results: [], done: body.approvals.length, failed: 0 });
    }
    if (address.endsWith("/workspaces")) {
      return json({ items: [{ id: "w1", name: "Clinics", type: "production" }] });
    }
    if (address.endsWith("/approvals")) return json({ items: [waiting(1), waiting(2)] });
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

test("a batch reject needs a reason, as a single one does, and keeps it with each decision", async () => {
  show(<ApprovalsQueue base="/tenants/t1" tenantId="t1" />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Select all shown" }));
  fireEvent.click(
    within(screen.getByRole("toolbar", { name: "Batch actions" })).getByRole("button", {
      name: "Reject",
    }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("Why are they rejected?");
  const reject = within(dialog).getByRole("button", { name: "Reject" }) as HTMLButtonElement;
  // Without a reason it cannot be sent.
  expect(reject.disabled).toBe(true);
  fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
  expect(calls.filter((call) => call.method === "POST")).toEqual([]);

  fireEvent.change(within(dialog).getByRole("textbox"), {
    target: { value: "The receipts are missing." },
  });
  expect(reject.disabled).toBe(false);
  fireEvent.click(reject);
  await waitFor(() => expect(calls.filter((call) => call.method === "POST")).toHaveLength(1));
  expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({
    decision: "reject",
    comment: "The receipts are missing.",
    approvals: [
      { workspaceId: "w1", flowRunId: "fr1", node: "ask" },
      { workspaceId: "w1", flowRunId: "fr2", node: "ask" },
    ],
  });
});

test("a batch approve may be sent without a note", async () => {
  show(<ApprovalsQueue base="/tenants/t1" tenantId="t1" />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Select all shown" }));
  fireEvent.click(
    within(screen.getByRole("toolbar", { name: "Batch actions" })).getByRole("button", {
      name: "Approve",
    }),
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
  await waitFor(() => expect(calls.filter((call) => call.method === "POST")).toHaveLength(1));
  expect(calls.find((call) => call.method === "POST")?.body).not.toHaveProperty("comment");
});
