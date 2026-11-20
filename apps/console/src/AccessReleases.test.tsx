// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, api } from "./api.ts";
import { AccessReleases } from "./screens/AccessReleases.tsx";
import { answer, show } from "./testing.tsx";

const base = "/tenants/t1";
let calls: { method: string; url: string; body: unknown }[];
let approval: boolean;
let who: string;
let mayChange: boolean;
const release = (number: number, extra: object = {}) => ({
  id: `r${number}`,
  number,
  scope: "partial",
  status: "applied",
  origin: "console",
  message: null,
  summary: {
    created: 1,
    updated: 0,
    deleted: 0,
    changes: [{ change: "created", kind: "group", key: "night-shift", label: "Night shift" }],
  },
  createdBy: "Alice",
  createdByType: "member",
  createdById: "alice",
  createdAt: "2026-11-17T10:00:00.000Z",
  decidedBy: null,
  comment: null,
  ...extra,
});

beforeEach(() => {
  calls = [];
  approval = true;
  who = "bob";
  mayChange = true;
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "GET" && address.endsWith("/access/releases")) {
      return json({
        items: [
          release(2, { status: "awaiting_approval", message: "Made the group Night shift" }),
          release(1, { origin: "cli", message: "Bring up the tenant" }),
        ],
      });
    }
    if (method === "GET" && address.endsWith("/me"))
      return json({ principal: { type: "member", id: who, name: who, email: null } });
    if (method === "GET" && address.endsWith("/access")) return json({ approval, mayChange });
    if (method === "PUT") {
      approval = false;
      return json({ required: false });
    }
    if (address.endsWith("/groups")) {
      return json(
        {
          waiting: true,
          release: { id: "r3", number: 3, status: "awaiting_approval" },
          detail: "This tenant asks for a second person. Nothing changed yet.",
        },
        202,
      );
    }
    return json({ id: "r2", number: 2, status: "applied" });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a release that waits says what it would do, and is approved after asking", async () => {
  show(<AccessReleases base={base} />);
  expect(await screen.findByText("Made the group Night shift")).toBeTruthy();
  expect(screen.getAllByText("Makes the group Night shift.").length).toBeGreaterThan(0);
  expect(screen.getByText("Waits for approval")).toBeTruthy();
  expect(
    screen.getByText(
      "A change to access waits until someone other than whoever made it approves it.",
    ),
  ).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect(await answer("Approve")).toContain("It applies at once, and does all of this:");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")).toMatchObject({
      url: `/api/v1${base}/access/releases/r2/decision`,
      body: { decision: "approve" },
    }),
  );
});

test("an applied release can be gone back to, and asking for a second person can be stopped", async () => {
  show(<AccessReleases base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Go back to this" }));
  const sure = await answer("Go back");
  expect(sure).toContain("It waits for a second person.");
  expect(sure).toContain("groups an identity provider made are left alone");
  expect(sure).toContain("Makes the group Night shift");
  await waitFor(() =>
    expect(calls.some((call) => call.url.endsWith("/access/releases/r1/rollback"))).toBe(true),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // It asks first, saying what changes and what becomes of the release that waits.
  fireEvent.click(screen.getByRole("button", { name: "Stop asking for a second person" }));
  const said = await answer("Cancel");
  expect(said).toContain("applies as soon as it is made, with nobody else approving it");
  expect(said).toContain("The 1 release that waits now stays waiting");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(calls.some((call) => call.method === "PUT")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Stop asking for a second person" }));
  await answer("Stop asking");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ required: false }),
  );
});

test("asking for a second person is turned on without a question", async () => {
  approval = false;
  show(<AccessReleases base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Ask for a second person" }));
  await waitFor(() =>
    expect(
      calls.find((call) => call.method === "PUT" && !call.url.includes("/me/preferences"))?.body,
    ).toEqual({ required: true }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a change that waits is told to whoever made it, in place of the thing they asked for", async () => {
  const made = await api.post(`${base}/groups`, { name: "Night shift" }).catch((error) => error);
  expect(made).toBeInstanceOf(ApiError);
  expect((made as ApiError).code).toBe("awaiting_approval");
  expect((made as ApiError).message).toBe(
    "This tenant asks for a second person. Nothing changed yet.",
  );
});

test("whoever asked for a release is offered only to withdraw it, and told why", async () => {
  who = "alice";
  show(<AccessReleases base={base} />);
  expect(await screen.findByText("You asked for this. Someone else approves it.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Withdraw" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
});

test("someone who may only read a release is offered nothing to answer it with", async () => {
  mayChange = false;
  show(<AccessReleases base={base} />);
  expect(await screen.findByText("You may read this, not answer it.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Go back to this" })).toBeNull();
});

test("a decline takes a comment and sends it", async () => {
  show(<AccessReleases base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
  await answer("Decline", "Wrong group");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")).toMatchObject({
      url: `/api/v1${base}/access/releases/r2/decision`,
      body: { decision: "decline", comment: "Wrong group" },
    }),
  );
});
