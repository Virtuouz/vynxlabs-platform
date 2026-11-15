import { describe, expect, test } from "vitest";
import { labelText, Metrics } from "./metrics.js";

describe("metrics this replica counts", () => {
  test("counters and histograms are written in the Prometheus text format", () => {
    const metrics = new Metrics();
    metrics.inc("jobs_total", "Jobs.", { state: "done" });
    metrics.inc("jobs_total", "Jobs.", { state: "done" }, 2);
    metrics.observe("wait_seconds", "Waits.", { workspace: "w1" }, 0.3, [0.1, 1]);
    metrics.observe("wait_seconds", "Waits.", { workspace: "w1" }, 5, [0.1, 1]);
    const text = metrics.render();
    expect(text).toContain('# TYPE jobs_total counter\njobs_total{state="done"} 3');
    expect(text).toContain('wait_seconds_bucket{workspace="w1",le="0.1"} 0');
    expect(text).toContain('wait_seconds_bucket{workspace="w1",le="1"} 1');
    expect(text).toContain('wait_seconds_bucket{workspace="w1",le="+Inf"} 2');
    expect(text).toContain('wait_seconds_sum{workspace="w1"} 5.3');
    expect(text).toContain('wait_seconds_count{workspace="w1"} 2');
  });

  test("series named alike when written are added together", () => {
    const metrics = new Metrics();
    metrics.inc("runs_total", "Runs.", { workspace: "a", state: "ok" });
    metrics.inc("runs_total", "Runs.", { workspace: "b", state: "ok" });
    expect(metrics.workspaceIds()).toEqual(new Set(["a", "b"]));
    // With workspaces left out of the labels, the two are one series.
    const text = metrics.render(({ workspace: _workspace, ...rest }) => rest);
    expect(text).toContain('runs_total{state="ok"} 2');
  });

  test("label values are escaped", () => {
    expect(labelText({ a: 'say "hi"\\n' })).toBe('{a="say \\"hi\\"\\\\n"}');
    expect(labelText({})).toBe("");
  });
});
