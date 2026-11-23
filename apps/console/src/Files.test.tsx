// @vitest-environment happy-dom
import { cleanup, configure, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Files } from "./screens/Files.tsx";
import { answer, show } from "./testing.tsx";

configure({ asyncUtilTimeout: 5000 });

const root = "/tenants/t1/workspaces/w1";
const api = `/api/v1${root}`;
let calls: { method: string; url: string; body: unknown; type?: string | null }[];
let routes: Record<string, (url: URL, body: unknown) => [number, unknown]>;

const file = (id: string, name: string, over: object = {}) => ({
  id,
  name,
  contentType: "text/plain",
  sizeBytes: 2048,
  createdAt: "2026-11-20T10:00:00.000Z",
  namedBy: [],
  ...over,
});

beforeEach(() => {
  calls = [];
  routes = {};
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const url = new URL(address, "http://x");
    calls.push({
      method,
      url: address,
      body: init.body,
      type: new Headers(init.headers).get("content-type"),
    });
    const [status, reply] = routes[`${method} ${url.pathname}`]?.(url, init.body) ?? [
      404,
      { detail: "No mock" },
    ];
    return new Response(reply === null ? null : JSON.stringify(reply), { status });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sent = (method: string) => calls.filter((call) => call.method === method);

test("TAB-P10: files are listed with what names each, a page at a time", async () => {
  routes[`GET ${api}/files`] = (url) =>
    url.searchParams.get("cursor")
      ? [200, { items: [file("f3", "old.txt")], nextCursor: null }]
      : [
          200,
          {
            items: [
              file("f1", "orders.csv", {
                contentType: "text/csv",
                namedBy: [{ table: "orders", column: "export", rows: 2 }],
              }),
              file("f2", "notes.txt"),
            ],
            nextCursor: "f2",
          },
        ];
  show(<Files root={root} />);
  await screen.findByText("orders.csv");
  screen.getByText("orders, export (2 rows)");
  expect(screen.getAllByText("No row")).toHaveLength(1);
  expect(screen.getAllByText("2 KB")).toHaveLength(2);
  // A file a row names is not offered for deletion, and the row says why.
  expect(
    (screen.getByRole("button", { name: "Delete orders.csv" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Delete notes.txt" }) as HTMLButtonElement).disabled,
  ).toBe(false);
  // w-data 6: the reason is not a title, which a keyboard or a finger never meets: it is on a
  // stop that takes focus, and focusing it says it.
  const named = screen.getByRole("button", { name: "Delete orders.csv" });
  expect(named.hasAttribute("title")).toBe(false);
  const stop = named.parentElement as HTMLElement;
  expect(stop.getAttribute("tabindex")).toBe("0");
  fireEvent.focus(stop);
  await screen.findByText("A row still names this file. Change the row first.");
  expect(screen.getByRole("link", { name: "Download orders.csv" }).getAttribute("href")).toBe(
    `${api}/files/f1/content`,
  );
  fireEvent.click(screen.getByRole("button", { name: "Show more files" }));
  await screen.findByText("old.txt");
  expect(sent("GET").at(-1)?.url).toContain("cursor=f2");
  expect(screen.queryByRole("button", { name: "Show more files" })).toBeNull();
});

test("TAB-P10: a name is looked for, and what is not found says so", async () => {
  routes[`GET ${api}/files`] = (url) =>
    url.searchParams.get("search") === "zzz"
      ? [200, { items: [], nextCursor: null }]
      : [200, { items: [file("f1", "orders.csv")], nextCursor: null }];
  show(<Files root={root} />);
  await screen.findByText("orders.csv");
  fireEvent.change(screen.getByLabelText("Find a file by name"), { target: { value: "zzz" } });
  await screen.findByText("No file has that in its name");
  expect(sent("GET").at(-1)?.url).toContain("search=zzz");
});

test("TAB-P10: a file is uploaded with its name and type, and the list is read again", async () => {
  let listed = [file("f1", "orders.csv")];
  routes[`GET ${api}/files`] = () => [200, { items: listed, nextCursor: null }];
  routes[`POST ${api}/files`] = () => {
    listed = [file("f9", "report.pdf", { contentType: "application/pdf" }), ...listed];
    return [201, listed[0]];
  };
  show(<Files root={root} />);
  await screen.findByText("orders.csv");
  const made = new File(["hello"], "report.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("File to upload"), { target: { files: [made] } });
  await screen.findByText("report.pdf");
  expect(sent("POST")[0]?.url).toBe(`${api}/files?name=report.pdf`);
  expect(sent("POST")[0]?.type).toBe("application/pdf");
});

test("TAB-P10: a file over the limit, or with nothing in it, is said before anything is sent", async () => {
  routes[`GET ${api}/files`] = () => [200, { items: [file("f1", "orders.csv")], nextCursor: null }];
  show(<Files root={root} />);
  await screen.findByText("orders.csv");
  fireEvent.change(screen.getByLabelText("File to upload"), {
    target: { files: [new File([], "empty.txt")] },
  });
  await screen.findByText(/empty\.txt is empty/);
  expect(sent("POST")).toHaveLength(0);
});

test("TAB-P10: a file is deleted after asking, and a refusal is said", async () => {
  let listed = [file("f1", "notes.txt"), file("f2", "kept.txt")];
  routes[`GET ${api}/files`] = () => [200, { items: listed, nextCursor: null }];
  routes[`DELETE ${api}/files/f1`] = () => {
    listed = listed.filter((one) => one.id !== "f1");
    return [204, null];
  };
  routes[`DELETE ${api}/files/f2`] = () => [
    409,
    { detail: "A row still names this file. Change the row first." },
  ];
  show(<Files root={root} />);
  await screen.findByText("notes.txt");
  fireEvent.click(screen.getByRole("button", { name: "Delete notes.txt" }));
  await answer("Delete", undefined);
  await waitFor(() => expect(screen.queryByText("notes.txt")).toBeNull());
  expect(sent("DELETE")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Delete kept.txt" }));
  await answer("Delete", undefined);
  await screen.findByText(/A row still names this file/);
  expect(screen.getByText("kept.txt")).toBeTruthy();
});

test("TAB-P10: nothing stored, and a refusal to list, are each said", async () => {
  routes[`GET ${api}/files`] = () => [200, { items: [], nextCursor: null }];
  const { unmount } = show(<Files root={root} />);
  await screen.findByText("No files yet");
  unmount();
  routes[`GET ${api}/files`] = () => [403, { detail: "This needs the data_all:read permission." }];
  show(<Files root={root} />);
  await screen.findByText(/data_all:read/);
});
