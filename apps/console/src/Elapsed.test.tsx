// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Elapsed, waitedAndRan } from "./kit/Elapsed.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("a run that is going counts up each second, and stops when it ends", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-01T10:00:05Z"));
  const { rerender } = render(<Elapsed from="2026-03-01T10:00:00Z" />);
  expect(screen.getByText("5.0 s")).toBeTruthy();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByText("7.0 s")).toBeTruthy();
  rerender(<Elapsed from="2026-03-01T10:00:00Z" to="2026-03-01T10:00:03Z" />);
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByText("3.0 s")).toBeTruthy();
});

test("time waiting for a worker is told apart from time running, from when it was due", () => {
  const run = {
    createdAt: "2026-03-01T09:00:00Z",
    scheduledFor: "2026-03-01T10:00:00Z",
    startedAt: "2026-03-01T10:00:02.100Z",
    finishedAt: "2026-03-01T10:00:05.100Z",
  };
  expect(waitedAndRan(run)).toEqual({ waited: 2100, ran: 3000 });
  // Still waiting: the wait counts up, nothing has run.
  expect(
    waitedAndRan(
      { createdAt: "2026-03-01T10:00:00Z", startedAt: null, finishedAt: null },
      Date.parse("2026-03-01T10:00:04Z"),
    ),
  ).toEqual({ waited: 4000, ran: null });
});
