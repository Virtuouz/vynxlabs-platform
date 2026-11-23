// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { differenceLabel } from "./screens/GitSync.tsx";
import { Release } from "./screens/Release.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
interface Place {
  id: string;
  name: string;
  type: "dev" | "production";
  linkedWorkspaceId: string | null;
}
const dev: Place = { id: "w1", name: "Clinics dev", type: "dev", linkedWorkspaceId: null };
const production: Place = { ...dev, name: "Clinics", type: "production" };
const review = (workspace = dev) => (
  <Release
    base="/tenants/t1"
    root={root}
    link={link}
    workspace={workspace}
    step="review"
    reload={() => {}}
  />
);
let calls: { method: string; url: string; body: unknown }[];
let drafts: object[];
let preview: object;

beforeEach(() => {
  calls = [];
  drafts = [
    {
      path: "orders/sync",
      kind: "script",
      change: "update",
      deleted: false,
      revision: 3,
      updatedAt: "2026-11-13T01:00:00Z",
    },
    {
      path: "orders/size",
      kind: "variable",
      change: "create",
      deleted: false,
      revision: 1,
      updatedAt: "2026-11-13T01:00:00Z",
    },
  ];
  preview = {
    possible: true,
    refusal: null,
    summary: { created: 1, updated: 1, deleted: 0, data: [], changes: [] },
  };
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "POST") {
      drafts = [];
      return json({ bundleVersion: 7, applied: ["orders/size", "orders/sync"] }, 201);
    }
    if (method === "DELETE") {
      drafts = drafts.slice(1);
      return new Response(null, { status: 204 });
    }
    return json(address.endsWith("/changes/preview") ? preview : { items: drafts });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("drafts are listed with what deploying each would do, and deployed with a message", async () => {
  show(review());
  expect((await screen.findByRole("link", { name: "orders/sync" })).getAttribute("href")).toBe(
    `${link}/scripts/edit/orders/sync`,
  );
  // A variable has no editor of its own to open.
  expect(screen.getByText("orders/size")).toBeTruthy();
  expect(screen.getByText("Changed")).toBeTruthy();
  expect(screen.getByText("New")).toBeTruthy();
  await screen.findByText(/Deploying creates 1, changes 1 and removes 0\./);

  fireEvent.change(screen.getByLabelText("What changed"), { target: { value: "Bigger batches" } });
  fireEvent.click(screen.getByRole("button", { name: "Deploy 2 changes" }));
  await screen.findByText("Deployed as version 7: orders/size, orders/sync.");
  expect(calls.find((call) => call.method === "POST")).toEqual({
    method: "POST",
    url: `/api/v1${root}/changes/deploy`,
    body: { message: "Bigger batches" },
  });
});

test("a takeover from code says what it does, and old drafts are pointed out until some are chosen", async () => {
  drafts = [
    { ...(drafts[0] as object), path: "screens/desk", kind: "interface", change: "take_over" },
    { ...(drafts[1] as object), updatedAt: new Date().toISOString() },
  ];
  show(review());
  expect(await screen.findByText("Takes over from code")).toBeTruthy();
  expect(screen.getByText(/becomes a file the console owns, which git sync/)).toBeTruthy();
  expect(screen.getByText(/takes it back/)).toBeTruthy();
  // Deploying with none chosen deploys both: the one saved days ago is named.
  const stale = screen.getByText(/One of these was saved more than a day ago/);
  expect(stale.textContent).toContain("screens/desk");
  expect(stale.textContent).not.toContain("orders/size");
  // Once the ones meant are chosen, nothing rides along, and nothing needs saying.
  fireEvent.click(screen.getByLabelText("Choose orders/size"));
  expect(screen.queryByText(/saved more than a day ago/)).toBeNull();
});

test("changes that cannot be deployed say why, and offer no deploy", async () => {
  preview = {
    possible: false,
    refusal: {
      code: "validation_failed",
      detail: "The code written in the console does not build.",
      errors: [{ path: "orders/sync.script.ts:2", message: 'Unexpected ";"' }],
    },
    summary: null,
  };
  show(review());
  await screen.findByText("orders/sync.script.ts:2");
  expect(screen.getByText(/These changes cannot be deployed yet\./)).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Deploy 2 changes" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("WLK-17h: a refusal is a title, a sentence and a list, and what is missing links to where it is set up", async () => {
  preview = {
    possible: false,
    refusal: {
      code: "bindings_missing",
      detail: "The workspace is missing something this bundle needs.",
      errors: [{ path: "/secrets/KEY", message: 'the secret "KEY" is not set in this workspace' }],
    },
    summary: null,
  };
  show(review());
  const title = await screen.findByText(/These changes cannot be deployed yet\./);
  // The title does not run into the sentence, and the sentence not into the list.
  expect(title.closest("p")?.textContent).toBe("These changes cannot be deployed yet.");
  expect(screen.getByRole("link", { name: "Set up" }).getAttribute("href")).toContain(
    "/secrets?setup=KEY",
  );
});

test("a draft is set aside after asking, and a production workspace has no review step", async () => {
  const { unmount } = show(review());
  fireEvent.click((await screen.findAllByRole("button", { name: "Set aside" }))[0] as HTMLElement);
  expect(await answer("Set aside")).toContain("It goes back to how it was last deployed.");
  await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true));
  expect(calls.find((call) => call.method === "DELETE")?.url).toBe(
    `/api/v1${root}/drafts/orders/sync`,
  );
  unmount();
  const asked = () => calls.filter((call) => call.url.endsWith("/drafts")).length;
  const before = asked();

  show(review(production));
  await screen.findByRole("heading", { name: "Versions" });
  expect(screen.queryByText("Review draft")).toBeNull();
  // Production has no drafts, so they are not even asked for.
  expect(asked()).toBe(before);
});

test("an address that names a step this workspace does not have opens the first one (REL-14)", async () => {
  history.replaceState(null, "", "/?step=review");
  const first = show(review(production));
  await screen.findByRole("heading", { name: "Versions" });
  expect(screen.queryByText("Loading")).toBeNull();
  first.unmount();
  // A dev workspace with nothing to promote to has no promote step.
  history.replaceState(null, "", "/?step=promote");
  show(review());
  expect(await screen.findByRole("link", { name: "orders/sync" })).toBeTruthy();
  history.replaceState(null, "", "/");
});

test("a promotion that changes an agent's tool says so, asks, and sends that it was confirmed", async () => {
  const linked: Place = { ...dev, linkedWorkspaceId: "w2" };
  const target = { id: "w2", name: "Clinics", type: "production", linkedWorkspaceId: null };
  const breaking = [
    {
      path: "desk/submit",
      message:
        "the tool submit_request is now called file_request. An agent that calls it by the old name will fail.",
    },
  ];
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "POST") {
      return json(
        {
          bundleVersion: 8,
          bundleId: "b8",
          workspaceId: "w2",
          release: { status: "failed", branch: "release/main", problem: "The remote refused it." },
        },
        201,
      );
    }
    if (address.includes("/promotion-preview")) {
      return json({
        target,
        bundle: { digest: "a".repeat(64), version: 8 },
        possible: true,
        refusal: null,
        summary: { created: 0, updated: 1, deleted: 0, data: [], changes: [], breaking },
        tried: { runs: 2, failed: 0, flowRuns: 0, flowRunsFailed: 0 },
        triggers: 0,
        canPromote: true,
        request: null,
      });
    }
    if (address.endsWith("/drift")) {
      return json({
        target: { ...target, slug: "main" },
        versions: { here: 8, there: 7 },
        counts: { changed: 0, only_here: 0, only_there: 0, in_sync: 0 },
        items: [],
      });
    }
    return json({ items: address.endsWith("/tenants/t1/workspaces") ? [linked, target] : [] });
  });
  show(
    <Release
      base="/tenants/t1"
      root={root}
      link={link}
      workspace={linked}
      step="promote"
      reload={() => {}}
    />,
  );
  expect(
    await screen.findByText(
      "The tool submit_request is now called file_request. An agent that calls it by the old name will fail.",
    ),
  ).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: /Promote to production/ }));
  const said = await answer("Promote to production");
  expect(said).toContain("It also changes what an agent calls");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ confirmBreaking: true }),
  );
  // A release commit that failed points at the place that tries it again (REL-06).
  const retry = await screen.findByRole("link", { name: "Try again from Git sync" });
  expect(retry.getAttribute("href")).toBe("/t/t1/workspaces/w2/git");
});

test("a file that differs from the branch says how: new, removed or changed, and on which side", () => {
  expect(
    ["new_here", "removed_here", "new_there", "removed_there", "changed"].map((change) =>
      differenceLabel({ here: change.endsWith("here"), change }),
    ),
  ).toEqual(["New here", "Removed here", "New there", "Removed there", "Changed there"]);
  // An instance from before it said so.
  expect(differenceLabel({ here: true })).toBe("Changed here");
});

test("Versions is the one list: a repeated version rolls back from its row, and a bundle never run sits below", async () => {
  const row = (id: string, bundleId: string, version: number) => ({
    id,
    bundleId,
    bundleVersion: version,
    message: `Version ${version}`,
    createdBy: "ana@fernhill.test",
    createdAt: "2026-11-13T00:00:00Z",
    promotedFromWorkspaceId: null,
    runningIn: [],
    summary: {},
  });
  const bundle = (id: string, version: number, active: boolean) => ({
    id,
    version,
    digest: String(version).repeat(16),
    active,
    createdAt: "2026-11-13T00:00:00Z",
  });
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    calls.push({
      method,
      url: address,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (method === "POST") return json({}, 201);
    // After a rollback, version 1 is listed twice, and version 2 is the one running.
    if (address.endsWith("/deployments"))
      return json({ items: [row("d3", "b1", 1), row("d2", "b2", 2), row("d1", "b1", 1)] });
    if (address.endsWith("/bundles"))
      return json({
        items: [bundle("b3", 3, false), bundle("b2", 2, true), bundle("b1", 1, false)],
      });
    return json({ items: [] });
  });
  show(
    <Release
      base="/tenants/t1"
      root={root}
      link={link}
      workspace={production}
      step="deploy"
      reload={() => {}}
    />,
  );
  await screen.findByText("Versions of Clinics");
  // Two history rows for version 1 and one bundle never run: three Activates, none on the running one.
  const buttons = await screen.findAllByRole("button", { name: "Activate this version" });
  expect(buttons).toHaveLength(3);
  expect(screen.getByText("Not yet run here")).toBeTruthy();
  expect(screen.queryByText("Bundles and rollback")).toBeNull();
  fireEvent.click(buttons[0] as HTMLElement);
  expect(await answer("Activate in production")).toContain("Clinics stops running");
  await waitFor(() =>
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ bundleId: "b1" }),
  );
});
