import { ActionError, WidgetReadError } from "@volvel/screens";
import { afterEach, describe, expect, test, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("./api.ts", async (original) => ({
  ...(await original<typeof import("./api.ts")>()),
  api: { get: (url: string) => get(url), post: (url: string, body: unknown) => post(url, body) },
}));

const { ApiError } = await import("./api.ts");
const { pageClient } = await import("./screens/builder/client.ts");

const missing = () => new ApiError(404, { title: "Not Found", detail: "There is no widget t." });

afterEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("the builder's page client", () => {
  test("waits for the save on its way when a just-added widget isn't in the draft yet (POLISH-012)", async () => {
    vi.useFakeTimers();
    get.mockRejectedValueOnce(missing()).mockResolvedValueOnce({ inputs: {} });
    const client = pageClient("/r", { of: "interface", path: "screens/p", page: "money" }, true);
    const read = client.read("t", {});
    await vi.advanceTimersByTimeAsync(600);
    await expect(read).resolves.toEqual({ inputs: {} });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0]?.[0]).toContain("draft=1");
    vi.useRealTimers();
  });

  test("a widget still missing after the waits is said, and a dashboard's 404 is said at once", async () => {
    vi.useFakeTimers();
    get.mockRejectedValue(missing());
    const draft = pageClient(
      "/r",
      { of: "interface", path: "screens/p", page: "money" },
      true,
    ).read("t", {});
    const caught = draft.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await caught).toBeInstanceOf(WidgetReadError);
    expect(get).toHaveBeenCalledTimes(5);
    get.mockClear();
    await expect(
      pageClient("/r", { of: "dashboard", id: "d1" }).read("t", {}),
    ).rejects.toBeInstanceOf(WidgetReadError);
    expect(get).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

test("the rows behind a number are that input's, as the served app's client gives them", async () => {
  const rows = { shape: "rows", columns: [], rows: [{ id: "1" }] };
  get.mockResolvedValueOnce({ inputs: { value: rows } });
  const read = await pageClient("/r", { of: "dashboard", id: "d1" }).behind?.("fees", "value", {});
  expect(read).toEqual(rows);
  expect(get.mock.calls[0]?.[0]).toContain("behind=%7B%7D");
});

test("deciding an approval is asked of the server by the widget and the step, from the draft while building", async () => {
  const done = {
    decision: "approve",
    title: "Approve a stock order",
    flow: { path: "p", title: "P" },
    by: "Maya",
  };
  post.mockResolvedValueOnce(done);
  const client = pageClient("/r", { of: "interface", path: "screens/p", page: "stock" }, true);
  await expect(client.decide?.("waiting", "run/ask", "approve", "ok")).resolves.toEqual(done);
  expect(post).toHaveBeenCalledWith("/r/page-approvals", {
    path: "screens/p",
    page: "stock",
    widget: "waiting",
    id: "run/ask",
    decision: "approve",
    comment: "ok",
    draft: true,
  });
});

test("someone having decided first reaches the view as a 409, and a dashboard decides nothing", async () => {
  post.mockRejectedValueOnce(
    new ApiError(409, { title: "Conflict", detail: "Maya Brooks approved this a moment ago." }),
  );
  const client = pageClient("/r", { of: "interface", path: "screens/p", page: "stock" });
  const caught = await client
    .decide?.("waiting", "run/ask", "reject", "no")
    .catch((e: unknown) => e);
  expect(caught).toBeInstanceOf(ActionError);
  expect((caught as ActionError).status).toBe(409);
  expect((caught as ActionError).message).toBe("Maya Brooks approved this a moment ago.");
  expect(post.mock.calls[0]?.[1]).not.toHaveProperty("draft");
  await expect(
    pageClient("/r", { of: "dashboard", id: "d1" }).decide?.("w", "i/n", "approve"),
  ).rejects.toBeInstanceOf(ActionError);
});
