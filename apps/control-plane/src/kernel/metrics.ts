/**
 * Counters and histograms this replica observes, written in the Prometheus
 * text format. Each replica counts what it saw; a Prometheus server adds them
 * up. What must agree across replicas, such as how many runs wait, is read
 * from the database when scraped instead, in the metrics route.
 *
 * Labels name a workspace and a tenant by ID while counting, and are given
 * their slugs when written, so that a renamed workspace keeps one series.
 */

type Labels = Record<string, string>;

/** Seconds, from a fast script to one that runs for an hour. */
export const DURATION_BUCKETS = [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 300, 900, 3600];

interface Histogram {
  buckets: number[];
  counts: number[];
  sum: number;
  count: number;
}

interface Family {
  help: string;
  type: "counter" | "histogram";
  series: Map<string, { labels: Labels; value: number; histogram?: Histogram }>;
}

const keyOf = (labels: Labels) =>
  Object.keys(labels)
    .sort()
    .map((name) => `${name}=${labels[name]}`)
    .join(",");

const escapeLabel = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');

/** Writes a set of labels as Prometheus does: `{a="1",b="2"}`, or nothing. */
export function labelText(labels: Labels): string {
  const names = Object.keys(labels);
  if (names.length === 0) return "";
  return `{${names.map((name) => `${name}="${escapeLabel(labels[name] as string)}"`).join(",")}}`;
}

export class Metrics {
  readonly #families = new Map<string, Family>();

  #family(name: string, help: string, type: Family["type"]): Family {
    let family = this.#families.get(name);
    if (!family) {
      family = { help, type, series: new Map() };
      this.#families.set(name, family);
    }
    return family;
  }

  /** Adds to a counter. */
  inc(name: string, help: string, labels: Labels = {}, by = 1) {
    const family = this.#family(name, help, "counter");
    const key = keyOf(labels);
    const series = family.series.get(key) ?? { labels, value: 0 };
    series.value += by;
    family.series.set(key, series);
  }

  /** Records one observation in a histogram. */
  observe(name: string, help: string, labels: Labels, value: number, buckets = DURATION_BUCKETS) {
    if (!Number.isFinite(value) || value < 0) return;
    const family = this.#family(name, help, "histogram");
    const key = keyOf(labels);
    const series = family.series.get(key) ?? {
      labels,
      value: 0,
      histogram: { buckets, counts: buckets.map(() => 0), sum: 0, count: 0 },
    };
    const histogram = series.histogram as Histogram;
    histogram.buckets.forEach((bound, index) => {
      if (value <= bound) histogram.counts[index] = (histogram.counts[index] ?? 0) + 1;
    });
    histogram.sum += value;
    histogram.count += 1;
    family.series.set(key, series);
  }

  /** The workspace and tenant IDs the series carry, for naming them when written. */
  workspaceIds(): Set<string> {
    const ids = new Set<string>();
    for (const family of this.#families.values()) {
      for (const series of family.series.values()) {
        if (series.labels.workspace) ids.add(series.labels.workspace);
      }
    }
    return ids;
  }

  /**
   * The text format. `name` turns a series' labels into the ones written: IDs
   * into slugs, or none at all when the instance keeps workspaces out of its labels.
   */
  render(name: (labels: Labels) => Labels = (labels) => labels): string {
    const lines: string[] = [];
    for (const [metric, family] of this.#families) {
      lines.push(`# HELP ${metric} ${family.help}`, `# TYPE ${metric} ${family.type}`);
      // Series that name to the same labels are added together.
      const merged = new Map<string, { labels: Labels; value: number; histogram?: Histogram }>();
      for (const series of family.series.values()) {
        const labels = name(series.labels);
        const key = keyOf(labels);
        const held = merged.get(key);
        if (!held) {
          merged.set(key, {
            labels,
            value: series.value,
            ...(series.histogram
              ? {
                  histogram: {
                    ...series.histogram,
                    counts: [...series.histogram.counts],
                  },
                }
              : {}),
          });
          continue;
        }
        held.value += series.value;
        if (held.histogram && series.histogram) {
          held.histogram.counts = held.histogram.counts.map(
            (count, index) => count + (series.histogram?.counts[index] ?? 0),
          );
          held.histogram.sum += series.histogram.sum;
          held.histogram.count += series.histogram.count;
        }
      }
      for (const series of merged.values()) {
        if (family.type === "counter") {
          lines.push(`${metric}${labelText(series.labels)} ${series.value}`);
          continue;
        }
        const histogram = series.histogram as Histogram;
        histogram.buckets.forEach((bound, index) => {
          lines.push(
            `${metric}_bucket${labelText({ ...series.labels, le: String(bound) })} ${histogram.counts[index]}`,
          );
        });
        lines.push(
          `${metric}_bucket${labelText({ ...series.labels, le: "+Inf" })} ${histogram.count}`,
          `${metric}_sum${labelText(series.labels)} ${Number(histogram.sum.toFixed(6))}`,
          `${metric}_count${labelText(series.labels)} ${histogram.count}`,
        );
      }
    }
    return lines.length > 0 ? `${lines.join("\n")}\n` : "";
  }
}

/** What a run's end, or a claim, adds to the metrics. */
export const observe = {
  runEnded(
    metrics: Metrics,
    run: { workspace_id: string; started_at: Date | null; finished_at?: Date | null },
    state: "succeeded" | "failed" | "cancelled",
  ) {
    const labels = { workspace: run.workspace_id };
    metrics.inc("platform_runs_finished_total", "Script runs that ended, by how.", {
      ...labels,
      state,
    });
    if (run.started_at) {
      const end = run.finished_at ?? new Date();
      metrics.observe(
        "platform_run_duration_seconds",
        "How long a script run took, from its first start to its end.",
        labels,
        (end.getTime() - run.started_at.getTime()) / 1000,
      );
    }
  },
  runClaimed(metrics: Metrics, run: { workspace_id: string; due: Date }) {
    metrics.observe(
      "platform_run_queue_wait_seconds",
      "How long a script run waited, from when it was due to when a worker took it.",
      { workspace: run.workspace_id },
      (Date.now() - run.due.getTime()) / 1000,
    );
  },
  flowRunEnded(metrics: Metrics, state: "succeeded" | "failed" | "cancelled") {
    metrics.inc("platform_flow_runs_finished_total", "Flow runs that ended, by how.", { state });
  },
  webhookRefused(metrics: Metrics, reason: string) {
    metrics.inc(
      "platform_webhook_refusals_total",
      "Requests to webhooks that were refused, by why.",
      { reason },
    );
  },
  alert(metrics: Metrics, outcome: "delivered" | "failed" | "suppressed") {
    metrics.inc("platform_alerts_total", "Failure alerts, by what came of them.", { outcome });
  },
};
