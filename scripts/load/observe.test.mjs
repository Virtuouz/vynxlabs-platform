import { expect, test } from "vitest";
import { cpuPercent, histogramQuantile, parsePg, parsePrometheus } from "./observe.mjs";

test("parses samples, labels and escapes", () => {
  const out = parsePrometheus(
    [
      "# HELP a x",
      "# TYPE a counter",
      'a{route="/x",status="200"} 5',
      'b{v="a\\"b\\\\c"} 1.5',
      "c 7",
      'd_bucket{le="+Inf"} 3',
    ].join("\n"),
  );
  expect(out).toEqual([
    { name: "a", labels: { route: "/x", status: "200" }, value: 5 },
    { name: "b", labels: { v: 'a"b\\c' }, value: 1.5 },
    { name: "c", labels: {}, value: 7 },
    { name: "d_bucket", labels: { le: "+Inf" }, value: 3 },
  ]);
});

test("histogram quantile interpolates and handles the +Inf bucket", () => {
  const b = [
    { le: 1, count: 0 },
    { le: 2, count: 10 },
    { le: 4, count: 20 },
    { le: Number.POSITIVE_INFINITY, count: 20 },
  ];
  expect(histogramQuantile(0.5, b)).toBe(2);
  expect(histogramQuantile(0.75, b)).toBe(3);
  expect(
    histogramQuantile(0.5, [
      { le: 1, count: 0 },
      { le: Number.POSITIVE_INFINITY, count: 0 },
    ]),
  ).toBeNull();
  expect(
    histogramQuantile(0.99, [
      { le: 1, count: 1 },
      { le: Number.POSITIVE_INFINITY, count: 10 },
    ]),
  ).toBe(1);
});

test("cpu percentages and pg rows", () => {
  expect(cpuPercent([0, 0, 0, 0, 0, 0, 0, 0], [10, 0, 10, 70, 0, 0, 0, 10])).toMatchObject({
    user_pct: 10,
    system_pct: 10,
    steal_pct: 10,
  });
  expect(parsePg("active|2|12.5\nidle|5|40\n|1|\n")).toEqual({
    by_state: { active: 2, idle: 5, none: 1 },
    longest_active_s: 12.5,
    total: 8,
  });
});
