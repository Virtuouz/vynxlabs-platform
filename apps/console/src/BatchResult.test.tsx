// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { type BatchAnswer, useBatch } from "./kit/BatchResult.tsx";
import { show } from "./testing.tsx";

afterEach(cleanup);

let start: (request: () => Promise<BatchAnswer>) => Promise<unknown>;
function Harness({ retry }: { retry: (ids: string[]) => Promise<BatchAnswer> }) {
  const batch = useBatch();
  start = (request) =>
    batch.run(request, {
      title: "Canceling runs",
      done: (count) => `${count} runs canceled.`,
      name: (id) => `script for ${id}`,
      retry,
    });
  return <>{batch.dialog}</>;
}

const answer = (results: BatchAnswer["results"]): BatchAnswer => ({
  results,
  done: results.filter((one) => one.ok).length,
  failed: results.filter((one) => !one.ok).length,
});

test("when every item was done, a toast says so and nothing else opens", async () => {
  show(<Harness retry={vi.fn()} />);
  await act(() =>
    start(async () =>
      answer([
        { id: "r1", ok: true, status: 200 },
        { id: "r2", ok: true, status: 200 },
      ]),
    ),
  );
  expect(await screen.findByText("2 runs canceled.")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("when some were not, each says why with its request ID, and only those are tried again", async () => {
  const retry = vi.fn(async () => answer([{ id: "r2", ok: true, status: 200 }]));
  show(<Harness retry={retry} />);
  await act(() =>
    start(async () =>
      answer([
        { id: "r1", ok: true, status: 200 },
        {
          id: "r2",
          ok: false,
          status: 409,
          detail: "It has already finished.",
          requestId: "req_9",
        },
      ]),
    ),
  );
  const dialog = await screen.findByRole("dialog", { name: "Canceling runs" });
  expect(dialog.textContent).toContain("1 done, 1 not done.");
  expect(dialog.textContent).toContain("script for r2");
  expect(dialog.textContent).toContain("It has already finished.");
  expect(dialog.textContent).toContain("req_9");
  expect(dialog.textContent).not.toContain("script for r1");
  fireEvent.click(screen.getByRole("button", { name: "Retry the one not done" }));
  expect(await screen.findByText("1 done, 0 not done.")).toBeTruthy();
  expect(retry).toHaveBeenCalledWith(["r2"]);
});
