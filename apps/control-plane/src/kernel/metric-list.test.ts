import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { METRIC_LIST, METRICS } from "./metric-list.js";
import { Metrics, observe } from "./metrics.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourcesOf(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((one) =>
    one.isDirectory()
      ? sourcesOf(join(dir, one.name))
      : one.name.endsWith(".ts") && !one.name.endsWith(".test.ts") && !one.name.endsWith(".d.ts")
        ? [join(dir, one.name)]
        : [],
  );
}

test("every series is named volvel_ once, with its words (D55)", () => {
  const names = METRIC_LIST.map((one) => one.name);
  expect(new Set(names).size).toBe(names.length);
  for (const one of METRIC_LIST) {
    expect(one.name.startsWith("volvel_"), one.name).toBe(true);
    expect(one.help, one.name).toMatch(/\.$/);
    if (one.type === "counter") expect(one.name, one.name).toMatch(/_total$/);
  }
});

test("no code writes a series name of its own: what is served is what the list holds", () => {
  const loose: string[] = [];
  for (const file of sourcesOf(SRC)) {
    if (file.endsWith("metric-list.ts")) continue;
    for (const found of readFileSync(file, "utf8").matchAll(/["'`](volvel_[a-z_]+)/g)) {
      loose.push(`${file.slice(SRC.length + 1)}: ${found[1]}`);
    }
  }
  expect(loose).toEqual([]);
});

test("what this replica counts is declared with the type, the labels and the words of its entry", () => {
  const metrics = new Metrics();
  observe.http(metrics, { method: "GET", route: "/x", status: "200" }, 0.2);
  const run = { workspace_id: "w", started_at: new Date(Date.now() - 1000), due: new Date() };
  for (const state of ["succeeded", "failed", "cancelled"] as const) {
    observe.runEnded(metrics, run, state);
  }
  observe.runClaimed(metrics, run);
  observe.flowRunEnded(metrics, "succeeded");
  observe.webhookRefused(metrics, "bad_signature");
  observe.alert(metrics, "delivered");
  const text = metrics.render();
  const byName = new Map<string, (typeof METRIC_LIST)[number]>(
    METRIC_LIST.map((one) => [one.name, one]),
  );
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const help = /^# HELP (\S+) (.*)$/.exec(line);
    if (help) {
      const entry = byName.get(help[1] as string);
      expect(entry, `${help[1]} is in the list`).toBeDefined();
      expect(help[2]).toBe(entry?.help);
      seen.add(help[1] as string);
    }
    const type = /^# TYPE (\S+) (\S+)$/.exec(line);
    if (type) expect(type[2]).toBe(byName.get(type[1] as string)?.type);
    const sample = /^(volvel_[a-z_]+?)(?:_bucket|_sum|_count)?(?:\{([^}]*)\})? /.exec(line);
    if (sample) {
      const entry = byName.get(sample[1] as string);
      expect(entry, `${sample[1]} is in the list`).toBeDefined();
      const labels = [...(sample[2] ?? "").matchAll(/([a-z_]+)="/g)]
        .map((one) => one[1] as string)
        .filter((one) => one !== "le");
      for (const label of labels) expect(entry?.labels, sample[1]).toContain(label);
    }
  }
  for (const key of [
    "httpRequests",
    "httpDuration",
    "runsFinished",
    "runDuration",
    "runQueueWait",
    "flowRunsFinished",
    "webhookRefusals",
    "alerts",
  ] as const) {
    expect(seen.has(METRICS[key].name), METRICS[key].name).toBe(true);
  }
});
