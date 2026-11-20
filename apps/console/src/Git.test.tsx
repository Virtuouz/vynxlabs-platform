// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GitPanel, RepositorySettings } from "./screens/Git.tsx";
import { GitSync } from "./screens/GitSync.tsx";
import { show } from "./testing.tsx";

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
  // Once stored, the token is said to be there, and is never shown: it can only be replaced.
  expect(screen.queryByLabelText("Access token")).toBeNull();
  expect(screen.getByText("Stored encrypted. It is never shown.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Replace the access token" })).toBeTruthy();

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
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Follow this branch" })).toBeNull(),
  );
  expect(sent("PUT")[0]?.body).toEqual({ branch: "console/dev" });
});

const compare = (conflicts: boolean) => ({
  branch: "console/dev",
  exists: true,
  head: { commit: "abc1234def", message: "Tidy", author: "Ana", at: "2026-01-01T00:00:00Z" },
  syncedCommit: "abc1234def",
  ahead: 1,
  behind: 1,
  conflicts: conflicts ? 1 : 0,
  files: conflicts
    ? [
        {
          path: "orders/sync.script.yaml",
          resource: "orders/sync.script",
          here: true,
          branch: true,
          conflict: true,
          mine: "a: 1",
          theirs: "a: 2",
        },
      ]
    : [],
});

test("Git sync is where a push takes its message, and a followed branch brings no second set of controls", async () => {
  routes[`GET /api/v1${root}/git`] = () => [
    200,
    {
      repository,
      branch: "console/dev",
      state: "ahead",
      syncedCommit: "abc1234def",
      updatedAt: null,
    },
  ];
  routes[`GET /api/v1${root}/git/compare`] = () => [200, compare(false)];
  routes[`POST /api/v1${root}/git/push`] = () => [200, { status: "done" }];
  show(<GitSync root={root} link="/t/t1/workspaces/w1" />);
  const message = (await screen.findByLabelText("Commit message")) as HTMLInputElement;
  expect(message.value).toBe("Deploy from the console");
  // One Push, and Push with drafts: the embedded panel adds none.
  expect(screen.getAllByRole("button", { name: /^Push/ })).toHaveLength(2);
  fireEvent.change(message, { target: { value: "Send large orders for approval" } });
  fireEvent.click(screen.getByRole("button", { name: /^Push 1 change/ }));
  await screen.findByText("Committed what is deployed here to the branch.");
  expect(sent("POST")[0]?.body).toEqual({ message: "Send large orders for approval" });
});

test("a pull stays disabled until every conflict is chosen, and none is chosen for you", async () => {
  routes[`GET /api/v1${root}/git`] = () => [
    200,
    { repository, branch: "console/dev", state: "conflict", syncedCommit: "abc1234def" },
  ];
  routes[`GET /api/v1${root}/git/compare`] = () => [200, compare(true)];
  routes[`POST /api/v1${root}/git/pull`] = () => [
    200,
    { status: "done", state: "synced", conflicts: [], applied: ["orders/sync.script"] },
  ];
  show(<GitSync root={root} link="/t/t1/workspaces/w1" />);
  const pull = (await screen.findByRole("button", { name: /^Pull 1 change/ })) as HTMLButtonElement;
  expect(pull.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Keep workspace" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: "Take branch" }));
  await waitFor(() => expect(pull.disabled).toBe(false));
  fireEvent.click(pull);
  await screen.findByText("Deployed what changed on the branch.");
  expect(sent("POST")[0]?.body).toEqual({ resolutions: { "orders/sync.script": "theirs" } });
});
