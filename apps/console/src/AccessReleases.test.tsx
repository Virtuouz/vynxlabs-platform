// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, api } from "./api.ts";
import { AccessReleases } from "./screens/AccessReleases.tsx";
import { answer, show } from "./testing.tsx";

const base = "/tenants/t1";
let calls: { method: string; url: string; body: unknown }[];
let approval: boolean;
let who: string;
let mayChange: boolean;
let removes: { kind: string; key: string; label: string }[];
/** What a POST to a release's rollback answers, and what its decision answers. */
let rollbackAnswer: { status: number; body: unknown };
let decisionAnswer: { status: number; body: unknown };
let warnings: string[];
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
  removes = [{ kind: "group", key: "late", label: "Late shift" }];
  rollbackAnswer = { status: 201, body: { id: "r9", number: 9, status: "applied" } };
  decisionAnswer = { status: 200, body: { id: "r2", number: 2, status: "applied" } };
  warnings = [];
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
          release(2, {
            status: "awaiting_approval",
            message: "Made the group Night shift",
            summary: {
              created: 1,
              updated: 0,
              deleted: 0,
              changes: [
                { change: "created", kind: "group", key: "night-shift", label: "Night shift" },
              ],
              warnings,
            },
          }),
          release(1, { origin: "cli", message: "Bring up the tenant" }),
        ],
      });
    }
    if (method === "GET" && address.endsWith("/rollback")) return json({ removes, warnings: [] });
    if (method === "POST" && address.endsWith("/rollback"))
      return json(rollbackAnswer.body, rollbackAnswer.status);
    if (method === "POST" && address.endsWith("/decision"))
      return json(decisionAnswer.body, decisionAnswer.status);
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
    if (address.endsWith("/rollback")) {
      return approval
        ? json({ id: "r9", number: 9, status: "awaiting_approval" }, 202)
        : json({ id: "r9", number: 9, status: "applied" }, 201);
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

test("from a tablet up the answers have a column wide enough for their buttons (r-narrow 3)", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  show(<AccessReleases base={base} />);
  const button = await screen.findByRole("button", { name: "Go back to this" });
  const cell = button.closest("td") as HTMLElement;
  const header = screen.getAllByRole("columnheader")[(cell.cellIndex as number) ?? -1];
  expect(header?.className).toContain("w-44");
});

test("going back says it waits for a second person when it does, and that it applied when it did (REL-12)", async () => {
  // The answer of a server that does not say `waiting` (ACC-14) is worded here.
  rollbackAnswer = { status: 201, body: { id: "r9", number: 9, status: "awaiting_approval" } };
  show(<AccessReleases base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Go back to this" }));
  await answer("Go back");
  expect(
    await screen.findByText(
      /access change 9, and waits for a second person\. Nothing has changed yet\./,
    ),
  ).toBeTruthy();
  cleanup();
  approval = false;
  rollbackAnswer = { status: 201, body: { id: "r9", number: 9, status: "applied" } };
  show(<AccessReleases base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Go back to this" }));
  await answer("Go back");
  expect(await screen.findByText("The tenant's access is what access change 1 left.")).toBeTruthy();
});

test("an applied release can be gone back to, and asking for a second person can be stopped", async () => {
  show(<AccessReleases base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Go back to this" }));
  const sure = await answer("Go back");
  expect(sure).toContain("It waits for a second person.");
  expect(sure).toContain("groups an identity provider made are left alone");
  // ACC-37: a service account made again has no keys: they are not part of a release.
  expect(sure).toContain("A service account that is gone is made again with no API keys");
  expect(sure).toContain("Makes the group Night shift");
  expect(sure).toContain("These are removed:");
  expect(sure).toContain("the group Late shift");
  await waitFor(() =>
    expect(calls.some((call) => call.url.endsWith("/access/releases/r1/rollback"))).toBe(true),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // It asks first, saying what changes and what becomes of the release that waits.
  fireEvent.click(screen.getByRole("button", { name: "Stop asking for a second person" }));
  const said = await answer("Cancel");
  expect(said).toContain("applies as soon as it is made, with nobody else approving it");
  expect(said).toContain("The 1 access change that waits now stays waiting");
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

test("going back says when it removes nothing, and asks as a danger only when it removes", async () => {
  removes = [];
  show(<AccessReleases base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Go back to this" }));
  const sure = await answer("Cancel");
  expect(sure).toContain("Nothing is removed.");
  expect(sure).not.toContain("These are removed:");
  expect(calls.some((call) => call.method === "POST")).toBe(false);
});

test("going back that waits is said to wait, not to be done (ACC-14)", async () => {
  rollbackAnswer = {
    status: 202,
    body: {
      waiting: true,
      id: "r9",
      number: 9,
      status: "awaiting_approval",
      detail: "Access change 9 waits for a second person. Nothing changed yet.",
    },
  };
  show(<AccessReleases base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Go back to this" }));
  await answer("Go back");
  const said = await screen.findByText(
    "Access change 9 waits for a second person. Nothing changed yet.",
  );
  // A notice among the changes, not a failure under the list.
  expect(said.closest('[aria-live="polite"]')).not.toBeNull();
  expect(screen.queryByText("The tenant's access is what access change 1 left.")).toBeNull();
});

test("whoever asked may withdraw it with no right to answer, and is not told they may only read (ACC-16)", async () => {
  who = "alice";
  mayChange = false;
  show(<AccessReleases base={base} />);
  expect(await screen.findByRole("button", { name: "Withdraw" })).toBeTruthy();
  expect(screen.queryByText("You may read this, not answer it.")).toBeNull();
});

test("what a release warned of is in the row and in the dialog that approves it (ACC-36)", async () => {
  warnings = ["the group night-shift was last changed in access change 1, outside the repository."];
  show(<AccessReleases base={base} />);
  expect(
    (await screen.findAllByText(/was last changed in access change 1, outside the repository/))
      .length,
  ).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  const said = await answer("Cancel");
  expect(said).toContain("Read before you answer:");
  expect(said).toContain("was last changed in access change 1");
});

test("a refusal names its cause, not only that the access is not valid (ACC-21)", async () => {
  decisionAnswer = {
    status: 400,
    body: {
      title: "Bad Request",
      status: 400,
      code: "validation_failed",
      detail: "The tenant's access is not valid.",
      errors: [
        {
          path: "group night-shift",
          message: "/body/description must NOT have more than 500 characters",
        },
      ],
    },
  };
  show(<AccessReleases base={base} />);
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  await answer("Approve");
  expect(await screen.findByText(/must NOT have more than 500 characters/)).toBeTruthy();
});

test("ACC-MP14: one release is opened from its address, with its changes and warnings, and closing leaves the address", async () => {
  history.replaceState(null, "", "/t/t1/releases?release=r2");
  show(<AccessReleases base={base} />);
  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("Access change 2");
  expect(dialog.textContent).toContain("Makes the group Night shift");
  fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(location.search).not.toContain("release=");
  // A number in the list opens the same.
  fireEvent.click(await screen.findByRole("button", { name: "Open access change 1" }));
  expect((await screen.findByRole("dialog")).textContent).toContain("Access change 1");
  expect(location.search).toContain("release=r1");
});

test("a role given to a group is worded as being given, not as making an access developer (w-people 2)", async () => {
  release(1);
  const items = [
    release(7, {
      message: null,
      summary: {
        created: 1,
        updated: 0,
        deleted: 0,
        changes: [
          {
            change: "created",
            kind: "tenant_binding",
            key: "b",
            label: "developer to group night-shift",
          },
        ],
      },
    }),
  ];
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", async (address: string, init?: RequestInit) =>
    address.endsWith("/access/releases")
      ? new Response(JSON.stringify({ items }), { status: 200 })
      : original(address, init),
  );
  show(<AccessReleases base={base} />);
  expect(await screen.findByText("Gives developer to group night-shift.")).toBeTruthy();
  expect(document.body.textContent).not.toContain("Makes the access");
  expect(document.body.textContent).not.toContain("may release access");
});

test("the list is the page's own box, with no wrapper that insets it from its sibling tabs (w-people 1)", async () => {
  const view = show(<AccessReleases base={base} />);
  await screen.findByText("Made the group Night shift");
  expect(view.container.querySelector("div.contents")).toBeNull();
});
