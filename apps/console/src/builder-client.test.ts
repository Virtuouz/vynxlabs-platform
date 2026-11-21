import { WidgetReadError } from "@volvel/screens";
import { afterEach, describe, expect, test, vi } from "vitest";

const get = vi.fn();
vi.mock("./api.ts", async (original) => ({
  ...(await original<typeof import("./api.ts")>()),
  api: { get: (url: string) => get(url) },
}));

const { ApiError } = await import("./api.ts");
const { pageClient } = await import("./screens/builder/client.ts");

const missing = () => new ApiError(404, { title: "Not Found", detail: "There is no widget t." });

afterEach(() => get.mockReset());

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
