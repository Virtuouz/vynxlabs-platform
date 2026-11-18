// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, api } from "./api.ts";
import { AccessReleases } from "./screens/AccessReleases.tsx";
import { answer, show } from "./testing.tsx";

const base = "/tenants/t1";
let calls: { method: string; url: string; body: unknown }[];
let approval: boolean;
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
  createdAt: "2026-11-17T10:00:00.000Z",
  decidedBy: null,
  comment: null,
  ...extra,
});

beforeEach(() => {
  calls = [];
  approval = true;
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
    if (method === "GET" && address.endsWith("/access")) return json({ approval });
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
  expect(await answer("Approve")).toContain("Makes the group Night shift. It applies at once.");
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
  expect(await answer("Go back")).toContain("It waits for a second person.");
  await waitFor(() =>
    expect(calls.some((call) => call.url.endsWith("/access/releases/r1/rollback"))).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop asking for a second person" }));
  await waitFor(() =>
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ required: false }),
  );
});

test("a change that waits is told to whoever made it, in place of the thing they asked for", async () => {
  const made = await api.post(`${base}/groups`, { name: "Night shift" }).catch((error) => error);
  expect(made).toBeInstanceOf(ApiError);
  expect((made as ApiError).code).toBe("awaiting_approval");
  expect((made as ApiError).message).toBe(
    "This tenant asks for a second person. Nothing changed yet.",
  );
});
