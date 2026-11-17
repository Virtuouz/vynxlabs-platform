// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DeployMenu } from "./kit/DeployMenu.tsx";
import { Release } from "./screens/Release.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
const dev = { id: "w1", name: "Clinics dev", type: "dev" as const, linkedWorkspaceId: "w2" };
const production = {
  id: "w2",
  name: "Clinics",
  type: "production" as const,
  linkedWorkspaceId: null,
};
let routes: Record<string, (body: unknown) => [number, unknown]>;
let calls: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  routes = {
    [`GET ${root}`]: () => [200, dev],
    "GET /tenants/t1/workspaces": () => [200, { items: [dev, production] }],
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const url = address.replace("/api/v1", "");
    calls.push({ method, url, body });
    const handler = routes[`${method} ${url}`] ?? routes[`${method} ${url.split("?")[0]}`];
    const [status, value] = handler ? handler(body) : [200, { items: [] }];
    return new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

test("one change is deployed from the editor in two presses, and the toast offers to promote it", async () => {
  routes[`GET ${root}/changes/preview?paths=orders%2Fsync`] = () => [
    200,
    { possible: true, refusal: null },
  ];
  routes[`POST ${root}/changes/deploy`] = () => [
    201,
    { bundleVersion: 5, applied: ["orders/sync"] },
  ];
  const deployed = vi.fn();
  history.replaceState(null, "", `${link}/scripts/edit/orders/sync?fromRun=w2%3Ar9`);
  show(<DeployMenu root={root} link={link} path="orders/sync" onDeployed={deployed} />);
  // Wait for where it promotes to, so the toast can name it.
  await waitFor(() => expect(calls.some((one) => one.url === "/tenants/t1/workspaces")).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "This change only" }));
  await waitFor(() => expect(deployed).toHaveBeenCalled());
  expect(calls.find((one) => one.method === "POST")?.body).toEqual({ paths: ["orders/sync"] });
  const toast = await screen.findByText("Deployed orders/sync as version 5.");
  const card = toast.closest("div") as HTMLElement;
  fireEvent.click(
    within(card.parentElement as HTMLElement).getByRole("button", { name: "Promote to Clinics" }),
  );
  // The fix keeps the run it came from, for the promotion to offer to run it again.
  expect(`${location.pathname}${location.search}`).toBe(
    `${link}/release?step=promote&fromRun=w2%3Ar9`,
  );
});

test("a change that cannot be deployed alone says why, and deploys nothing", async () => {
  routes[`GET ${root}/changes/preview?paths=orders%2Fsync`] = () => [
    200,
    {
      possible: false,
      refusal: {
        detail: "It needs what other drafts change.",
        errors: [
          { path: "orders/sync", message: "uses the variable orders/size, only in a draft" },
        ],
      },
    },
  ];
  show(<DeployMenu root={root} link={link} path="orders/sync" onDeployed={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Deploy" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "This change only" }));
  expect(await screen.findByText(/only in a draft/)).toBeTruthy();
  expect(calls.some((one) => one.method === "POST")).toBe(false);
});

test("the release step is in the address, and a promotion offers to run the failed run again on it", async () => {
  routes[`GET ${root}/promotion-preview`] = () => [
    200,
    {
      target: production,
      bundle: { digest: "d", version: 5 },
      possible: true,
      refusal: null,
      summary: null,
      tried: { runs: 1, failed: 0, flowRuns: 0, flowRunsFailed: 0 },
      triggers: 0,
      canPromote: true,
      request: null,
    },
  ];
  routes[`POST ${root}/promotions`] = () => [
    201,
    { bundleVersion: 8, bundleId: "b8", workspaceId: "w2", digest: "d" },
  ];
  routes["POST /tenants/t1/workspaces/w2/runs/r9/rerun"] = () => [201, { id: "r10" }];
  routes[`GET ${root}/drift`] = () => [
    200,
    {
      target: { ...production, slug: "clinics" },
      versions: { here: 5, there: 4 },
      counts: { changed: 0, only_here: 0, only_there: 0, in_sync: 0 },
      items: [],
    },
  ];
  history.replaceState(null, "", `${link}/release?step=promote&fromRun=w2%3Ar9`);
  show(
    <Release
      base="/tenants/t1"
      root={root}
      link={link}
      workspace={dev}
      step="review"
      reload={() => {}}
    />,
  );
  const promote = await screen.findByRole("button", { name: /Promote to production/ });
  await waitFor(() => expect((promote as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(promote);
  await answer("Promote to production");
  fireEvent.click(await screen.findByRole("button", { name: "Run the failed run again on v8" }));
  await waitFor(() => expect(location.pathname).toBe("/t/t1/workspaces/w2/runs/r10"));
  // On exactly the version promoted, not whatever is active by then.
  expect(calls.find((one) => one.url.endsWith("/rerun"))?.body).toEqual({ bundleId: "b8" });
});
