// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApproveLink } from "./screens/ApproveLink.tsx";
import { show } from "./testing.tsx";

let calls: { method: string; url: string; body: unknown }[];
let gone: boolean;

beforeEach(() => {
  calls = [];
  gone = false;
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (address.includes("/approval-links/")) {
      if (gone) {
        return json({ status: 410, code: "link_expired", detail: "This link has been used." }, 410);
      }
      if (method === "POST") {
        return json({
          decision: body.decision,
          title: "Refund the Brooks family",
          approver: { name: "Bob" },
          flowRunId: "fr1",
          tenantId: "t1",
          workspaceId: "w1",
        });
      }
      return json({
        title: "Refund the Brooks family",
        detail: { amount: 120, reason: "Double charge" },
        flow: "refunds/approve",
        flowRunId: "fr1",
        workspace: { id: "w1", name: "Clinics", type: "production" },
        tenant: { id: "t1", name: "Fernhill" },
        approver: { name: "Bob" },
        waitingSince: "2026-11-15T10:00:00Z",
        expiresAt: "2026-11-17T10:00:00Z",
        test: false,
      });
    }
    return json({});
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows what is asked, without a sign-in, and approves with a comment", async () => {
  show(<ApproveLink token="abc123abc123abc123abc123" />);
  expect(await screen.findByRole("heading", { name: "Refund the Brooks family" })).toBeTruthy();
  expect(screen.getByText(/Fernhill · Clinics/)).toBeTruthy();
  expect(document.body.textContent).toContain("Double charge");
  expect(screen.getByText(/Asked of Bob/)).toBeTruthy();
  // Nothing was decided by opening it.
  expect(calls.every((call) => call.method === "GET")).toBe(true);
  fireEvent.change(screen.getByLabelText("Comment (needed to reject)"), {
    target: { value: "Receipt checked" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect(await screen.findByRole("heading", { name: "Approved. Thank you, Bob." })).toBeTruthy();
  expect(calls.find((call) => call.method === "POST")).toEqual({
    method: "POST",
    url: "/api/v1/approval-links/abc123abc123abc123abc123",
    body: { decision: "approve", comment: "Receipt checked" },
  });
  expect(screen.getByRole("link", { name: "Open the run" }).getAttribute("href")).toBe(
    "/t/t1/workspaces/w1/runs/fr1",
  );
});

test("rejecting needs a comment", async () => {
  show(<ApproveLink token="abc123abc123abc123abc123" />);
  fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
  expect(screen.getByText(/Say why it is rejected/)).toBeTruthy();
  expect(calls.some((call) => call.method === "POST")).toBe(false);
  fireEvent.change(screen.getByLabelText("Comment (needed to reject)"), {
    target: { value: "No receipt" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      decision: "reject",
      comment: "No receipt",
    }),
  );
  expect(await screen.findByRole("heading", { name: "Rejected. Thank you, Bob." })).toBeTruthy();
});

test("a link that does not work says so, and where to look instead", async () => {
  gone = true;
  show(<ApproveLink token="abc123abc123abc123abc123" />);
  expect(await screen.findByRole("heading", { name: "Nothing to decide here" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /See the approvals waiting/ })).toBeTruthy();
});

test("the decided list shows each decision's comment, and which were decided from a mail", async () => {
  vi.stubGlobal("fetch", async (address: string) => {
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (address.includes("/approvals/decided")) {
      return json({
        items: [
          {
            flowRunId: "fr1",
            workspaceId: "w1",
            flow: "refunds/approve",
            node: "ask",
            title: "Refund the Brooks family",
            approved: true,
            comment: "Receipt checked",
            decidedBy: { id: "m2", label: "bob@fernhill.example" },
            decidedAt: "2026-11-15T10:05:00Z",
            via: "email",
            waitedSeconds: 300,
          },
        ],
      });
    }
    if (address.endsWith("/workspaces")) {
      return json({ items: [{ id: "w1", name: "Clinics", type: "production" }] });
    }
    return json({ items: [] });
  });
  const { ApprovalsQueue } = await import("./screens/Operate.tsx");
  show(<ApprovalsQueue base="/tenants/t1" tenantId="t1" />);
  fireEvent.click(await screen.findByRole("radio", { name: /Decided/ }));
  expect(await screen.findByText(/Receipt checked/)).toBeTruthy();
  expect(screen.getByText(/decided from the mail/)).toBeTruthy();
});
