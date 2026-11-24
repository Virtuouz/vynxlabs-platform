/**
 * Every series an instance serves at `/api/v1/metrics`, declared once: its name, what kind it is, the
 * labels it carries and what it means. What counts or reads a series takes its name and its
 * words from here, and the reference's page of metrics is drawn from this list, so a series
 * that is not here is not served.
 */
export interface MetricDefinition {
  /** The series' name, which always begins `volvel_`. */
  name: `volvel_${string}`;
  type: "counter" | "gauge" | "histogram";
  /** The labels each sample carries, in the order they are written. */
  labels: readonly string[];
  /** Said in the `# HELP` line and on the reference page. */
  help: string;
  /** What decides whether the series is there at all, when it is not always. */
  when?: string;
}

const declare = <const M extends Record<string, MetricDefinition>>(metrics: M): M => metrics;

export const METRICS = declare({
  httpRequests: {
    name: "volvel_http_requests_total",
    type: "counter",
    labels: ["method", "route", "status"],
    help: "Requests answered, by route and status.",
  },
  httpDuration: {
    name: "volvel_http_request_duration_seconds",
    type: "histogram",
    labels: ["method", "route"],
    help: "How long a request took to answer, by route.",
  },
  runsFinished: {
    name: "volvel_runs_finished_total",
    type: "counter",
    labels: ["workspace", "state"],
    help: "Script runs that ended, by how.",
  },
  runDuration: {
    name: "volvel_run_duration_seconds",
    type: "histogram",
    labels: ["workspace"],
    help: "How long a script run took, from its first start to its end.",
  },
  runQueueWait: {
    name: "volvel_run_queue_wait_seconds",
    type: "histogram",
    labels: ["workspace"],
    help: "How long a script run waited, from when it was due to when a worker took it.",
  },
  flowRunsFinished: {
    name: "volvel_flow_runs_finished_total",
    type: "counter",
    labels: ["state"],
    help: "Flow runs that ended, by how.",
  },
  webhookRefusals: {
    name: "volvel_webhook_refusals_total",
    type: "counter",
    labels: ["reason"],
    help: "Requests to webhooks that were refused, by why.",
  },
  alerts: {
    name: "volvel_alerts_total",
    type: "counter",
    labels: ["outcome"],
    help: "Failure alerts, by what came of them.",
  },
  runsQueued: {
    name: "volvel_runs_queued",
    type: "gauge",
    labels: [],
    help: "Runs waiting for a worker.",
  },
  runsRunning: {
    name: "volvel_runs_running",
    type: "gauge",
    labels: [],
    help: "Runs in progress.",
  },
  queueOldest: {
    name: "volvel_queue_oldest_seconds",
    type: "gauge",
    labels: [],
    help: "Age of the oldest run that is due and still waiting.",
  },
  workers: {
    name: "volvel_workers",
    type: "gauge",
    labels: ["kind"],
    help: "Workers heard from recently.",
  },
  workspaceRunsQueued: {
    name: "volvel_workspace_runs_queued",
    type: "gauge",
    labels: ["tenant", "workspace", "pool"],
    help: "Runs due and waiting for a worker, by workspace and pool.",
    when: "The instance keeps workspaces in its labels.",
  },
  workspaceQueueOldest: {
    name: "volvel_workspace_queue_oldest_seconds",
    type: "gauge",
    labels: ["tenant", "workspace"],
    help: "How long the oldest due run of a workspace has waited.",
    when: "The instance keeps workspaces in its labels.",
  },
  flowRuns: {
    name: "volvel_flow_runs",
    type: "gauge",
    labels: ["state"],
    help: "Flow runs in progress, by state.",
  },
  tasksQueued: {
    name: "volvel_tasks_queued",
    type: "gauge",
    labels: ["kind"],
    help: "Tasks waiting for a worker, by kind.",
  },
  machineRunning: {
    name: "volvel_machine_running",
    type: "gauge",
    labels: ["machine"],
    help: "Scripts running on each machine whose workers share its run slots.",
  },
  dbPool: {
    name: "volvel_db_pool",
    type: "gauge",
    labels: ["pool", "state"],
    help: "Connections of this replica's pools to Volvel's own database: open, idle, and requests waiting for one.",
  },
  databaseSize: {
    name: "volvel_database_size_bytes",
    type: "gauge",
    labels: [],
    help: "Volvel's own database size on disk. Alert well before its volume is full.",
  },
  databaseReadOnly: {
    name: "volvel_database_read_only",
    type: "gauge",
    labels: [],
    help: "1 while Volvel's own database takes no writes, such as when its disk is full.",
  },
  memoryAvailable: {
    name: "volvel_memory_available_bytes",
    type: "gauge",
    labels: [],
    help: "Memory this replica's machine can still give out.",
    when: "The replica can read its machine's memory.",
  },
  memoryTotal: {
    name: "volvel_memory_total_bytes",
    type: "gauge",
    labels: [],
    help: "All of this replica's machine's memory.",
    when: "The replica can read its machine's memory.",
  },
});

/** Every series, in the order they are declared. */
export const METRIC_LIST: readonly MetricDefinition[] = Object.values(METRICS);

/** The two lines that begin a series' samples. */
export const metricHeader = (metric: MetricDefinition): [string, string] => [
  `# HELP ${metric.name} ${metric.help}`,
  `# TYPE ${metric.name} ${metric.type}`,
];
