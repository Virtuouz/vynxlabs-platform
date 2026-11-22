// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError, api, type Loaded } from "./api.ts";
import { LoadState } from "./kit/LoadState.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const loaded = <T,>(more: Partial<Loaded<T>>): Loaded<T> => ({
  data: undefined,
  error: undefined,
  loading: false,
  reload: async () => {},
  ...more,
});

test("a proxy's HTML error page is an ApiError that says the server could not be reached", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("<html><body>502 Bad Gateway</body></html>", {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "x-request-id": "req-502" },
        }),
    ),
  );
  const failed = (await api.get("/things").catch((error) => error)) as ApiError;
  expect(failed).toBeInstanceOf(ApiError);
  expect(failed.status).toBe(502);
  expect(failed.code).toBe("unreadable_response");
  expect(failed.message).toMatch(/could not be reached \(502 Bad Gateway\)/);
  expect(failed.requestId).toBe("req-502");
});

test("an error keeps the request ID the server put in its problem document", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "nope", detail: "Not allowed.", requestId: "req-1" }), {
          status: 403,
          headers: { "content-type": "application/problem+json" },
        }),
    ),
  );
  const failed = (await api.get("/things").catch((error) => error)) as ApiError;
  expect(failed.requestId).toBe("req-1");
  expect(failed.message).toBe("Not allowed.");
});

test("nothing shows for the first moments, then the shape of what comes", async () => {
  render(
    <LoadState of={loaded<string[]>({ loading: true })} what="runs">
      {(rows) => rows.join(", ")}
    </LoadState>,
  );
  expect(screen.queryByRole("status")).toBeNull();
  expect(await screen.findByRole("status", { name: "Loading runs" })).toBeTruthy();
});

test("what failed is said with Try again and the request ID, and empty shows the empty state", () => {
  const reload = vi.fn();
  const { rerender } = render(
    <LoadState
      of={loaded<string[]>({ error: new ApiError(500, { detail: "It broke." }, "req-9"), reload })}
      what="runs"
    >
      {(rows) => rows.join(", ")}
    </LoadState>,
  );
  expect(screen.getByRole("alert").textContent).toContain("Could not load runs. It broke.");
  expect(screen.getByText("req-9")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reload).toHaveBeenCalled();
  rerender(
    <LoadState
      of={loaded<string[]>({ data: [] })}
      empty={<p>No runs yet</p>}
      isEmpty={(rows) => rows.length === 0}
    >
      {(rows) => rows.join(", ")}
    </LoadState>,
  );
  expect(screen.getByText("No runs yet")).toBeTruthy();
  rerender(
    <LoadState of={loaded<string[]>({ data: ["a", "b"], loading: true })}>
      {(rows) => rows.join(", ")}
    </LoadState>,
  );
  expect(screen.getByText("a, b").closest("[aria-busy]")?.getAttribute("aria-busy")).toBe("true");
});
