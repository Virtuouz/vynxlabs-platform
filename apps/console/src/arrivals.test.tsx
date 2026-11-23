// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useArrivals } from "./kit/arrivals.ts";

/** Rows that arrive live fade in where they land, or wait while the reader is elsewhere (P4-4). */

const key = (row: { id: string }) => row.id;

test("a row that arrives fades in; while the reader is away it waits, and comes on asking", () => {
  let away = false;
  const { result, rerender } = renderHook(
    ({ rows, query }) => useArrivals(rows, key, query, () => away),
    { initialProps: { rows: [{ id: "a" }], query: "all" } },
  );
  // What the list first shows is not news.
  expect(result.current.arriving.size).toBe(0);

  rerender({ rows: [{ id: "b" }, { id: "a" }], query: "all" });
  expect([...result.current.arriving]).toEqual(["b"]);
  expect(result.current.shown?.map(key)).toEqual(["b", "a"]);

  away = true;
  rerender({ rows: [{ id: "c" }, { id: "b" }, { id: "a" }], query: "all" });
  expect(result.current.waiting).toBe(1);
  expect(result.current.shown?.map(key)).toEqual(["b", "a"]);

  act(() => result.current.release());
  expect(result.current.waiting).toBe(0);
  expect(result.current.shown?.map(key)).toEqual(["c", "b", "a"]);
  expect([...result.current.arriving]).toEqual(["c"]);

  // Another question is another list: nothing in it is new.
  rerender({ rows: [{ id: "x" }], query: "failed" });
  expect(result.current.waiting).toBe(0);
  expect(result.current.shown?.map(key)).toEqual(["x"]);
});

test("a page added at the end is shown at once, even while the reader is away (OPS-10)", () => {
  const { result, rerender } = renderHook(({ rows }) => useArrivals(rows, key, "all", () => true), {
    initialProps: { rows: [{ id: "a" }, { id: "b" }] },
  });
  rerender({ rows: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] });
  expect(result.current.waiting).toBe(0);
  expect(result.current.shown?.map(key)).toEqual(["a", "b", "c", "d"]);
  // What comes before the first known row is still news, and waits.
  rerender({ rows: [{ id: "z" }, { id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] });
  expect(result.current.waiting).toBe(1);
});
