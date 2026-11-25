// Prints a GitHub-markdown table for each result file of run.mjs.
//
//   node scripts/load/report.mjs <result.json> [more.json...] [--routes]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const pct = (share) => `${(share * 100).toFixed(2)}`;

/** The most common statuses of a stage, like `200:812 503:40`. */
export function topStatuses(statuses, count = 3) {
  return (
    Object.entries(statuses)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([code, n]) => `${code}:${n}`)
      .join(" ") || "-"
  );
}

/** The `count` slowest routes of a stage by p95. */
export function slowestRoutes(stage, count = 5) {
  return Object.entries(stage.routes ?? {})
    .sort((a, b) => b[1].p95 - a[1].p95)
    .slice(0, count);
}

export function render(result, { routes = false } = {}) {
  const lines = [];
  lines.push(`### ${result.scenario} (${result.url}, ${result.startedAt})`);
  lines.push("");
  lines.push("| Users | rps | p50 ms | p95 ms | p99 ms | Error % | Refused % | Top statuses |");
  lines.push("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const s of result.stages) {
    lines.push(
      `| ${s.users} | ${s.rps} | ${s.overall.p50} | ${s.overall.p95} | ${s.overall.p99} | ` +
        `${pct(s.errorShare)} | ${pct(s.refusedShare)} | ${topStatuses(s.statuses)}` +
        `${s.retryAfterMissing ? ` (no retry-after: ${s.retryAfterMissing})` : ""} |`,
    );
  }
  lines.push("");
  const knee = result.knee;
  lines.push(
    knee
      ? `Knee: ${knee.users} users at ${knee.rps} rps (${knee.reason}).`
      : "Knee: none decided (a fixed or open-loop run, or the first stage was already outside the limits).",
  );
  if (routes) {
    const stage = knee
      ? (result.stages.find((s) => s.users === knee.users) ?? result.stages.at(-1))
      : result.stages.at(-1);
    if (stage) {
      lines.push("");
      lines.push(`Slowest routes at ${stage.users} users:`);
      lines.push("");
      lines.push("| Route | n | p50 ms | p95 ms | p99 ms | max ms | Statuses |");
      lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
      for (const [route, r] of slowestRoutes(stage)) {
        lines.push(
          `| ${route} | ${r.n} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${topStatuses(r.statuses)} |`,
        );
      }
    }
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const routes = args.includes("--routes");
  const files = args.filter((a) => a !== "--routes");
  if (files.length === 0) {
    console.error("Usage: node scripts/load/report.mjs <result.json> [more.json...] [--routes]");
    process.exit(2);
  }
  console.log(
    files.map((file) => render(JSON.parse(readFileSync(file, "utf8")), { routes })).join("\n\n"),
  );
}
