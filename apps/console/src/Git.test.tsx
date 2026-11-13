// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GitPanel, RepositorySettings } from "./screens/Git.tsx";
import { answer, show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const repository = {
  url: "https://git.example/acme.git",
  defaultBranch: "main",
  folder: "platform",
  paused: false,
};
let calls: { method: string; url: string; body: unknown }[];
let routes: Record<string, (body: unknown) => [number, unknown]>;

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url: address, body });
    const [status, answer] = routes[`${method} ${address}`]?.(body) ?? [404, { detail: "No mock" }];
    return new Response(answer === null ? null : JSON.stringify(answer), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sent = (method: string) => calls.filter((call) => call.method === method);

test("a repository is connected with a token, which is sent once and not kept on the page", async () => {
  let stored: object | null = null;
  routes["GET /api/v1/tenants/t1/git-repository"] = () => [200, { repository: stored }];
  routes["PUT /api/v1/tenants/t1/git-repository"] = () => {
    stored = repository;
    return [200, repository];
  };
  show(<RepositorySettings base="/tenants/t1" />);
  fireEvent.change(await screen.findByLabelText("Address"), { target: { value: repository.url } });
  fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "tok-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await screen.findByText("Connected. The repository was reached with the token.");
  expect(sent("PUT")[0]?.body).toEqual({
    url: repository.url,
    defaultBranch: "main",
    folder: "platform",
    token: "tok-123",
  });
  expect((screen.getByLabelText("Access token") as HTMLInputElement).value).toBe("");

  // Saving again without typing a token keeps the stored one.
  fireEvent.click(await screen.findByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent("PUT")).toHaveLength(2));
  expect(sent("PUT")[1]?.body).toEqual({
    url: repository.url,
    defaultBranch: "main",
    folder: "platform",
  });
});

test("a refused token is said, and a paused sync is explained", async () => {
  routes["GET /api/v1/tenants/t1/git-repository"] = () => [
    200,
    { repository: { ...repository, paused: true } },
  ];
  routes["PUT /api/v1/tenants/t1/git-repository"] = () => [
    409,
    {
      status: 409,
      code: "repository_unreachable",
      detail: "The repository refused the access token.",
    },
  ];
  show(<RepositorySettings base="/tenants/t1" />);
  expect(
    (await screen.findByText("Sync is paused.")).closest("[role=status]")?.textContent,
  ).toContain("imported from another instance");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await screen.findByRole("alert")).textContent).toContain("refused the access token");
});

test("a workspace with no repository, or no branch, is told what to do", async () => {
  routes[`GET /api/v1${root}/git`] = () => [200, { repository: null, branch: null, state: null }];
  const { unmount } = show(<GitPanel root={root} tenantLink="/t/t1" />);
  expect(
    (await screen.findByRole("link", { name: "Connect the tenant's repository" })).getAttribute(
      "href",
    ),
  ).toBe("/t/t1/repository");
  unmount();
  let branch: string | null = null;
  routes[`GET /api/v1${root}/git`] = () => [
    200,
    { repository, branch, state: branch ? "never" : null, syncedCommit: null, lastError: null },
  ];
  routes[`PUT /api/v1${root}/git`] = (body) => {
    branch = (body as { branch: string }).branch;
    return [200, {}];
  };
  show(<GitPanel root={root} tenantLink="/t/t1" />);
  fireEvent.change(await screen.findByLabelText("Branch"), { target: { value: "console/dev" } });
  fireEvent.click(screen.getByRole("button", { name: "Follow this branch" }));
  await screen.findByText("Not pushed yet");
  expect(sent("PUT")[0]?.body).toEqual({ branch: "console/dev" });
});

test("a push asks for a message, and a pull with conflicts asks which version of each to keep", async () => {
  let state = "ahead";
  routes[`GET /api/v1${root}/git`] = () => [
    200,
    { repository, branch: "console/dev", state, syncedCommit: "abc1234def", lastError: null },
  ];
  routes[`POST /api/v1${root}/git/push`] = () => {
    state = "synced";
    return [200, { status: "done", state: "synced", commit: "fff", changedOnBranch: [] }];
  };
  routes[`POST /api/v1${root}/git/pull`] = (body) =>
    (body as { resolutions?: object }).resolutions
      ? [200, { status: "done", state: "synced", conflicts: [], applied: ["orders/sync.script"] }]
      : [
          200,
          { status: "refused", state: "conflict", conflicts: ["orders/sync.script"], applied: [] },
        ];
  const pulled = vi.fn();
  show(<GitPanel root={root} tenantLink="/t/t1" onPulled={pulled} />);
  expect(await screen.findByText("Ahead of the branch")).toBeTruthy();
  expect(screen.getByText("abc1234")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Push" }));
  await answer("Push", "Send large orders for approval");
  await screen.findByText("Pushed.");
  expect(sent("POST")[0]?.body).toEqual({ message: "Send large orders for approval" });
  await screen.findByText("In sync");

  fireEvent.click(screen.getByRole("button", { name: "Pull" }));
  fireEvent.change(await screen.findByLabelText("orders/sync.script"), {
    target: { value: "theirs" },
  });
  expect(pulled).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Pull with these choices" }));
  await screen.findByText("Pulled and deployed: orders/sync.script.");
  expect(sent("POST").at(-1)?.body).toEqual({ resolutions: { "orders/sync.script": "theirs" } });
  expect(pulled).toHaveBeenCalledTimes(1);
});
