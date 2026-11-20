// @vitest-environment happy-dom
import { cleanup, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Providers } from "./ask.tsx";
import { usePagedList } from "./kit/paged.tsx";
import { EndUserGroups } from "./screens/Groups.tsx";
import { MemberList } from "./screens/Members.tsx";
import { EventsWorkbench } from "./screens/Operate.tsx";
import { Tenants } from "./screens/Tenants.tsx";
import { show } from "./testing.tsx";

let calls: string[];
/** What each route has, in the order the server pages it. */
let rows: Record<string, { id: string; [key: string]: unknown }[]>;
const PAGE = 2;

/** Answers like the API: `?search=` narrows by email, name or slug, `cursor` is the last ID. */
function page(url: string, all: { id: string; [key: string]: unknown }[]) {
  const query = new URL(url, "http://x").searchParams;
  const search = query.get("search")?.toLowerCase();
  // This server pages by 2 at most, as a long list would be by its limit.
  const limit = Math.min(Number(query.get("limit") ?? PAGE), query.has("id") ? 100 : PAGE);
  const found = all
    .filter((row) => query.get("id") === null || row.id === query.get("id"))
    .filter(
      (row) =>
        !search ||
        [row.email, row.name, row.slug].some((text) =>
          String(text ?? "")
            .toLowerCase()
            .includes(search),
        ),
    );
  const start = query.get("cursor")
    ? found.findIndex((row) => row.id === query.get("cursor")) + 1
    : 0;
  const items = found.slice(start, start + limit);
  const more = start + limit < found.length;
  return { items, nextCursor: more ? (items.at(-1)?.id ?? null) : null };
}

beforeEach(() => {
  calls = [];
  rows = {};
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string) => {
    calls.push(address);
    const path = address.replace("/api/v1", "").split("?")[0] as string;
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (/\/end-user-groups\/g1$/.test(path)) return json({ members: rows.inGroup ?? [] });
    if (path.endsWith("/end-user-groups")) {
      return json({
        items: [
          {
            id: "g1",
            name: "finance",
            description: "",
            memberCount: 2,
            createdAt: "2026-11-13T00:00:00Z",
          },
        ],
      });
    }
    const all = rows[path];
    if (all) return json(page(address, all));
    return json({ items: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const member = (n: number) => ({
  id: `m${String(n).padStart(3, "0")}`,
  name: `Person ${n}`,
  email: `person${n}@acme.test`,
  suspended: false,
  createdAt: "2026-11-13T00:00:00Z",
});

test("the loader gives the first page, adds the next on loadMore, and starts again on a search the server answers", async () => {
  rows["/things"] = [1, 2, 3, 4, 5].map((n) => ({ id: `i${n}`, name: `thing ${n}` }));
  const { result } = renderHook(
    ({ search }) => usePagedList<{ id: string }>("/things", { search, limit: 2, debounce: 0 }),
    { wrapper: Providers, initialProps: { search: "" } },
  );
  await waitFor(() => expect(result.current.items?.map((one) => one.id)).toEqual(["i1", "i2"]));
  expect(result.current.hasMore).toBe(true);
  await result.current.loadMore();
  await waitFor(() =>
    expect(result.current.items?.map((one) => one.id)).toEqual(["i1", "i2", "i3", "i4"]),
  );
  expect(calls.at(-1)).toContain("cursor=i2");
});

test("the loader sends what is searched for to the server, and shows only what it found", async () => {
  rows["/things"] = [1, 2, 3, 4, 5].map((n) => ({ id: `i${n}`, name: `thing ${n}` }));
  const { result, rerender } = renderHook(
    ({ search }) => usePagedList<{ id: string }>("/things", { search, limit: 2, debounce: 0 }),
    { wrapper: Providers, initialProps: { search: "" } },
  );
  await waitFor(() => expect(result.current.items?.length).toBe(2));
  rerender({ search: "thing 5" });
  await waitFor(() => expect(result.current.items?.map((one) => one.id)).toEqual(["i5"]));
  expect(calls.some((call) => call.includes("search=thing+5"))).toBe(true);
  expect(result.current.hasMore).toBe(false);
});

test("members past the first page are reached with Load more, and the 250th by searching", async () => {
  rows["/tenants/t1/members"] = Array.from({ length: 250 }, (_, i) => member(i + 1));
  show(<MemberList base="/tenants/t1" />);
  expect((await screen.findAllByText("person1@acme.test")).length).toBeGreaterThan(0);
  expect(screen.getByText(/Showing the first 2 members/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect((await screen.findAllByText("person3@acme.test")).length).toBeGreaterThan(0);

  fireEvent.change(screen.getByRole("textbox", { name: /Search by email or name/ }), {
    target: { value: "person250@" },
  });
  expect((await screen.findAllByText("person250@acme.test")).length).toBeGreaterThan(0);
  expect(
    calls.some((call) => call.includes("/members?") && call.includes("search=person250%40")),
  ).toBe(true);
  expect(screen.queryByText("person1@acme.test")).toBeNull();
});

test("tenants page and are searched on the server", async () => {
  rows["/tenants"] = Array.from({ length: 5 }, (_, i) => ({
    id: `t${i + 1}`,
    slug: `tenant-${i + 1}`,
    name: `Tenant ${i + 1}`,
    dataLocation: null,
    workspaceCount: 1,
    createdAt: "2026-11-13T00:00:00Z",
  }));
  show(
    <Tenants
      me={{
        principal: { type: "member", id: "m1", name: null, email: null },
        instancePermissions: [],
        tenants: [],
      }}
    />,
  );
  expect(await screen.findByText("Tenant 1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Tenant 3")).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: /Search tenants/ }), {
    target: { value: "tenant-5" },
  });
  expect(await screen.findByText("Tenant 5")).toBeTruthy();
  expect(calls.some((call) => call.includes("/tenants?") && call.includes("search=tenant-5"))).toBe(
    true,
  );
});

test("a group's picker keeps looking past a page of people who are in the group already", async () => {
  rows["/tenants/t1/end-users"] = [1, 2, 3].map((n) => ({
    id: `u${n}`,
    email: `user${n}@acme.test`,
    name: `User ${n}`,
  }));
  // The first page, u1 and u2, is all in the group: the one to add is on the next.
  rows.inGroup = [
    { id: "u1", email: "user1@acme.test", name: "User 1" },
    { id: "u2", email: "user2@acme.test", name: "User 2" },
  ];
  show(<EndUserGroups base="/tenants/t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "People" }));
  const search = await screen.findByRole("combobox");
  fireEvent.click(search);
  fireEvent.keyDown(search, { key: "ArrowDown" });
  expect(await screen.findByRole("option", { name: /user3@acme\.test/ })).toBeTruthy();
  expect(screen.queryByText(/already in the group/)).toBeNull();
});

test("events page, and one linked from elsewhere that the pages loaded do not reach is fetched by its ID", async () => {
  const event = (n: number) => ({
    id: `e${String(n).padStart(3, "0")}`,
    name: "orders/placed",
    payload: { n },
    source: { type: "api", id: null },
    occurredAt: "2026-11-13T00:00:00Z",
    publishedBy: null,
    started: [],
    listeners: 1,
  });
  rows["/tenants/t1/workspaces/w1/events"] = Array.from({ length: 120 }, (_, i) => event(i + 1));
  history.replaceState(null, "", "/?item=e110");
  show(<EventsWorkbench root="/tenants/t1/workspaces/w1" link="/t/t1/workspaces/w1" />);
  // The first page holds 100: e110 is looked up by its ID, and opens.
  expect(await screen.findByText("e110")).toBeTruthy();
  expect(calls.some((call) => call.includes("events?id=e110"))).toBe(true);
  expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
  cleanup();

  history.replaceState(null, "", "/?item=e999");
  show(<EventsWorkbench root="/tenants/t1/workspaces/w1" link="/t/t1/workspaces/w1" />);
  expect(await screen.findByText("Event not found")).toBeTruthy();
});
