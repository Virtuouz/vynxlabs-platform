import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  ago,
  between,
  bytes,
  clock,
  count,
  day,
  duration,
  fullTime,
  hm,
  middle,
  stamp,
} from "./format.ts";

/**
 * The formats of 07 §7.3, at each boundary. Times are read in the test's own
 * zone, so they are built from local parts rather than UTC strings.
 */

const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s);
const NOW = local(2026, 11, 16, 16, 38, 54);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

test.each([
  [0, "0 ms"],
  [420, "420 ms"],
  [999, "999 ms"],
  [1000, "1.0 s"],
  [3049, "3.0 s"],
  [59_999, "59.9 s"],
  [60_000, "1m 0s"],
  [252_000, "4m 12s"],
  [3_599_000, "59m 59s"],
  [3_600_000, "1h 0m"],
  [7_500_000, "2h 5m"],
  [-5, "0 ms"],
])("a duration of %i ms reads %s", (ms, text) => {
  expect(duration(ms)).toBe(text);
});

test("times of day and dates", () => {
  expect(hm(NOW)).toBe("16:38");
  expect(day(NOW)).toBe("2026-11-16");
  expect(stamp(NOW)).toBe("2026-11-16 16:38:54");
  expect(clock(local(2026, 11, 16, 9, 5, 7))).toBe("09:05:07");
  expect(clock(local(2026, 11, 15, 23, 59, 59))).toBe("2026-11-15 23:59:59");
  expect(clock(local(2026, 11, 16, 9, 5, 7).toISOString())).toBe("09:05:07");
});

test.each([
  [0, "just now"],
  [-4_000, "just now"],
  [-12_000, "12s ago"],
  [-5 * 60_000, "5m ago"],
  [-59 * 60_000 - 59_000, "59m ago"],
  [-3 * 3_600_000, "3h ago"],
  [-26 * 3_600_000, "1d ago"],
  [-6 * 86_400_000, "6d ago"],
  [-7 * 86_400_000, "2026-11-09"],
  [2 * 60_000 + 14_000, "in 2m"],
  [3 * 86_400_000, "in 3d"],
])("%i ms from now reads %s, in its largest unit", (offset, text) => {
  expect(ago(NOW.getTime() + offset)).toBe(text);
});

test("a time's full form gives local, UTC and age", () => {
  const text = fullTime(local(2026, 11, 16, 16, 33, 54));
  expect(text).toMatch(/^2026-11-16 16:33:54/);
  expect(text).toContain(" UTC · 5m ago");
});

test("counts, sizes, spans and identifiers", () => {
  expect(count(12480)).toMatch(/^12.480$/);
  expect(bytes(900)).toBe("900 B");
  expect(bytes(12_700)).toMatch(/^12.4 KB$/);
  expect(bytes(3.25 * 1024 * 1024)).toMatch(/^3.3 MB$/);
  expect(between("2026-11-16T10:00:00Z", "2026-11-16T10:00:01.200Z")).toBe("1.2 s");
  expect(between(null, "2026-11-16T10:00:00Z")).toBe("");
  expect(middle("r_01HX5K2M9F2K")).toBe("r_01HX…M9F2K");
  expect(middle("01a1e7f7-0000-7000-8000-000000000999")).toBe("01a1e7…00999");
  expect(middle("short")).toBe("short");
});
