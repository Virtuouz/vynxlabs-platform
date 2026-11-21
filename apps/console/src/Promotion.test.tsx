// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DriftView } from "./screens/Drift.tsx";
import { PromotionRequests } from "./screens/Promotion.tsx";
import { Release } from "./screens/Release.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
const dev = { id: "w1", name: "Clinics dev", type: "dev" as const, linkedWorkspaceId: "w2" };
const prod = { id: "w2", name: "Clinics", type: "production" as const, linkedWorkspaceId: null };
let calls: { method: string; url: string; body: unknown }[];
let preview: Record<string, unknown>;
let pending: object[];

const request = (more: object = {}) => ({
  id: "r1",
  source: { id: "w1", slug: "dev", name: "Clinics dev" },
  target: { id: "w2", slug: "prod", name: "Clinics" },
  version: 12,
  digest: "abc",
  note: "The new size limit",
  status: "pending",
  requestedBy: { type: "member", id: "m2", name: "Dave" },
  createdAt: new Date(Date.now() - 300_000).toISOString(),
  decidedBy: null,
  decidedAt: null,
  comment: null,
  sourceVersionNow: 12,
  mayDecide: true,
  mine: false,
  ...more,
});

beforeEach(() => {
  calls = [];
  pending = [request({ sourceVersionNow: 14 })];
  preview = {
    target: { id: "w2", name: "Clinics", type: "production" },
    bundle: { digest: "abc", version: 12 },
    possible: true,
    refusal: null,
    summary: {
      created: 0,
      updated: 1,
      deleted: 0,
      data: [],
      changes: [{ change: "updated", kind: "variable", path: "orders/size" }],
    },
    tried: { runs: 3, failed: 0, flowRuns: 0, flowRunsFailed: 0 },
    triggers: 1,
    canPromote: false,
    request: null,
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (address.endsWith("/workspaces")) return json({ items: [dev, prod] });
    if (address.endsWith("/promotion-preview")) return json(preview);
    if (method === "POST" && address.endsWith("/promotion-requests")) {
      preview = {
        ...preview,
        request: request({ mine: true, mayDecide: false, note: body?.note ?? null }),
      };
      return json(request(), 201);
    }
    if (method === "DELETE") {
      preview = { ...preview, request: null };
      return new Response(null, { status: 204 });
    }
    if (address.includes("/promotion-requests?")) return json({ items: pending });
    if (address.includes("/r1/preview")) {
      // Once the review has said the deletion may go, the preview stops refusing it.
      return json(
        address.includes("allowDelete=") && preview.refusal
          ? { ...preview, refusal: null, possible: true }
          : preview,
      );
    }
    if (address.endsWith("/r1/decision")) {
      pending = [];
      return json(request({ status: body.decision === "promote" ? "promoted" : "declined" }));
    }
    if (address.endsWith("/drift")) {
      return json({
        target: { id: "w2", name: "Clinics", slug: "prod", type: "production" },
        versions: { here: 14, there: 12 },
        counts: { in_sync: 3, changed: 1, only_here: 1, only_there: 1 },
        items: [
          {
            path: "a/same",
            kind: "variable",
            state: "in_sync",
            ownership: "ui",
            about: [],
            staysOnPromote: false,
          },
          {
            path: "orders/size",
            kind: "variable",
            state: "changed",
            ownership: "ui",
            about: ["Changes its description."],
            staysOnPromote: false,
          },
          {
            path: "orders/new",
            kind: "flow",
            state: "only_here",
            ownership: "ui",
            about: ["A new flow of 2 steps."],
            staysOnPromote: false,
          },
          {
            path: "old/thing",
            kind: "variable",
            state: "only_there",
            ownership: "ui",
            about: ["Only in Clinics."],
            staysOnPromote: true,
          },
        ],
      });
    }
    if (address.endsWith("/drift/orders/size")) {
      return json({
        path: "orders/size",
        kind: "variable",
        state: "changed",
        here: { description: "How many, at the most", default: "10" },
        there: { default: "10", description: "How many" },
        about: ["Changes its description."],
      });
    }
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const promoteStep = () =>
  show(
    <Release
      base="/tenants/t1"
      root={root}
      link={link}
      workspace={dev}
      step="promote"
      reload={() => {}}
    />,
  );

test("one who may not promote is offered to ask, with a note, and may withdraw what they asked", async () => {
  promoteStep();
  const ask = await screen.findByRole("button", { name: /Request promotion of v12/ });
  expect(screen.queryByRole("button", { name: /Promote to production/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("A note for whoever decides (optional)"), {
    target: { value: "The new size limit" },
  });
  fireEvent.click(ask);
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")).toEqual({
      method: "POST",
      url: `/api/v1${root}/promotion-requests`,
      body: { note: "The new size limit" },
    }),
  );
  expect(await screen.findByText("Waiting")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Withdraw the request" }));
  await waitFor(() =>
    expect(
      calls.some((call) => call.method === "DELETE" && call.url.endsWith("/promotion-requests/r1")),
    ).toBe(true),
  );
});

test("a declined request says who declined it and why; a promoter promotes as before", async () => {
  preview.request = request({
    status: "declined",
    mine: true,
    decidedBy: { type: "member", id: "m1", name: "Alice" },
    decidedAt: new Date().toISOString(),
    comment: "Wait for Monday",
  });
  promoteStep();
  expect(await screen.findByText("Declined")).toBeTruthy();
  expect(screen.getByText("Wait for Monday")).toBeTruthy();
  cleanup();
  preview = { ...preview, canPromote: true, request: null };
  promoteStep();
  expect(await screen.findByRole("button", { name: /Promote to production/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Request promotion/ })).toBeNull();
});

test("a promoter reviews a request and promotes it in place", async () => {
  let decided = 0;
  show(<PromotionRequests tenantId="t1" onDecided={() => decided++} />);
  const item = await screen.findByText(/Dave asks to promote/);
  expect(item.closest("li")?.textContent).toMatch(/Clinics dev is now at v14/);
  fireEvent.click(screen.getByRole("button", { name: "Review" }));
  const sheet = await screen.findByRole("dialog");
  expect(await within(sheet).findByText(/This promotes v12, what was asked for/)).toBeTruthy();
  expect(within(sheet).getByText("orders/size")).toBeTruthy();
  fireEvent.click(within(sheet).getByRole("button", { name: "Promote" }));
  await answer("Promote");
  await waitFor(() =>
    expect(calls.find((call) => call.url.endsWith("/decision"))?.body).toEqual({
      decision: "promote",
    }),
  );
  await waitFor(() => expect(decided).toBe(1));
});

test("a request that renames what an agent calls is approved after its breaking names are shown and confirmed", async () => {
  preview = {
    ...preview,
    summary: {
      ...(preview.summary as object),
      breaking: [{ path: "orders/lookup", message: "the tool agents call as lookup is removed" }],
    },
  };
  show(<PromotionRequests tenantId="t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  const sheet = await screen.findByRole("dialog");
  expect(
    await within(sheet).findByText(/changes a name that something outside calls/),
  ).toBeTruthy();
  expect(within(sheet).getByText(/The tool agents call as lookup is removed/)).toBeTruthy();
  fireEvent.click(within(sheet).getByRole("button", { name: "Promote" }));
  const asked = await answer("Promote");
  expect(asked).toMatch(/It also changes what an agent calls: The tool agents call as lookup/);
  await waitFor(() =>
    expect(calls.find((call) => call.url.endsWith("/decision"))?.body).toEqual({
      decision: "promote",
      confirmBreaking: true,
    }),
  );
});

test("a request whose deletion looked like a rename offers Delete them anyway, and sends what was allowed", async () => {
  preview = {
    ...preview,
    // The preview of a request does not say whether the caller may promote.
    canPromote: undefined,
    possible: false,
    refusal: {
      code: "rename_suspected",
      detail: "It deletes orders/old and creates orders/new.",
      errors: [{ path: "script/orders/old", message: "is deleted and holds runs" }],
    },
    summary: null,
  };
  show(<PromotionRequests tenantId="t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByRole("button", { name: "Promote" })).toHaveProperty("disabled", true);
  fireEvent.click(await within(sheet).findByRole("button", { name: "Delete them anyway" }));
  await answer("Delete them and look again");
  await waitFor(() =>
    expect(
      calls.some((call) => call.url.includes("/r1/preview?allowDelete=script%2Forders%2Fold")),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(within(sheet).getByRole("button", { name: "Promote" })).toHaveProperty(
      "disabled",
      false,
    ),
  );
  fireEvent.click(within(sheet).getByRole("button", { name: "Promote" }));
  await answer("Promote");
  await waitFor(() =>
    expect(calls.find((call) => call.url.endsWith("/decision"))?.body).toEqual({
      decision: "promote",
      allowDelete: ["script/orders/old"],
    }),
  );
});

test("declining asks why", async () => {
  show(<PromotionRequests tenantId="t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Review" }));
  const sheet = await screen.findByRole("dialog");
  fireEvent.click(within(sheet).getByRole("button", { name: "Decline…" }));
  await answer("Decline", "Wait for Monday");
  await waitFor(() =>
    expect(calls.find((call) => call.url.endsWith("/decision"))?.body).toEqual({
      decision: "decline",
      comment: "Wait for Monday",
    }),
  );
});

test("drift lists what differs, and a resource opens with what differs line by line", async () => {
  show(<DriftView root={root} hereName="Clinics dev" />);
  expect(await screen.findByText(/3 of 4 resources differ|of 4 resources differ/)).toBeTruthy();
  expect(screen.queryByText("a/same")).toBeNull();
  expect(screen.getByText("Made there: a promotion leaves it.")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: /In sync/ }));
  expect(await screen.findByText("a/same")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: /All that differ/ }));
  fireEvent.click(await screen.findByText("orders/size"));
  const sheet = await screen.findByRole("dialog");
  const diff = await within(sheet).findByTestId("drift-diff");
  expect(diff.textContent).toContain('−   "description": "How many"');
  expect(diff.textContent).toContain('+   "description": "How many, at the most"');
  expect(diff.textContent).toContain('    "default": "10"');
  expect(within(sheet).getByText("Changes its description.")).toBeTruthy();
});
