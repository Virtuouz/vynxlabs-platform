// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AppPreview } from "./screens/builder/AppPreview.tsx";

const link = "/t/t1/workspaces/w1";
const root = "/tenants/t1/workspaces/w1";

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let drafts: () => Response;

beforeEach(() => {
  window.history.replaceState({}, "", `${link}/screens/screens/sales/preview`);
  vi.stubGlobal("fetch", async (address: string) => {
    if (address.includes("/drafts/")) return drafts();
    if (address.includes("/apps")) {
      return answer(200, {
        items: [{ path: "screens/sales", url: "https://vx.example/apps/sales/" }],
      });
    }
    return answer(404, { title: "Not found", status: 404 });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("the draft is drawn with a bar that says so, names the workspace and offers the published app", async () => {
  drafts = () =>
    answer(200, {
      revision: 1,
      body: { title: "Sales", pages: [{ id: "money", title: "Money", widgets: [] }] },
    });
  render(<AppPreview root={root} link={link} path="screens/sales" workspaceName="Sandbox" />);
  expect(await screen.findByRole("heading", { name: "Sales" })).toBeTruthy();
  const bar = screen.getByRole("region", { name: "Preview of the draft" });
  expect(bar.textContent).toContain("Preview of the draft · Sandbox.");
  expect(bar.textContent).toContain("Actions change Sandbox's rows.");
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  const published = await screen.findByRole("link", { name: "Open the published app" });
  expect(published.getAttribute("href")).toBe("https://vx.example/apps/sales/");
});

test("someone who may not read the draft is told so", async () => {
  drafts = () => answer(403, { title: "Forbidden", status: 403, detail: "no" });
  render(<AppPreview root={root} link={link} path="screens/sales" workspaceName="Sandbox" />);
  await waitFor(() => expect(screen.getByText(/You may not read this app's draft/)).toBeTruthy());
});
