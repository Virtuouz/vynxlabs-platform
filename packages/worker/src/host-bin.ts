#!/usr/bin/env node
import { parseArgs } from "node:util";
import { WorkerHost } from "./host.js";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    "max-workers": { type: "string" },
    "run-slots": { type: "string" },
    "memory-floor": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage: volvel-worker-host --url <control plane url>

Starts the instance's managed workers: asks the control plane for a tenant with
work, and starts a worker for it as a user of its own. Run it in a container on
a network that reaches the control plane and nothing else of the instance's.

Options:
  --run-slots <n>     Scripts running at once on this machine, across all its
                      workers. Default: from its memory, one per 160 MB past the
                      first 512 MB, at least 2. RUN_SLOTS also sets it.
  --memory-floor <mb> No worker takes more work while the machine has less free
                      memory than this. Default: a tenth of it, at least 128 MB.
                      RUN_MEMORY_FLOOR_MB also sets it.
  --max-workers <n>   Workers alive at once. Default: twice the run slots.
                      MANAGED_WORKERS_MAX also sets it.

WORKER_HOST_TOKEN is the token the control plane was given. VOLVEL_URL can be
used instead of --url. Each worker runs as a user of its own: the next free one of
MANAGED_WORKER_USERS (256 by default) from MANAGED_WORKER_UID and MANAGED_WORKER_GID,
10001 by default, so no more than that many workers run at once. This process must
be able to switch to them.`);
  process.exit(0);
}

const log = (level: string, message: string, fields?: Record<string, unknown>) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), level, message, ...fields }));

const url = values.url ?? process.env.VOLVEL_URL;
const token = process.env.WORKER_HOST_TOKEN;
if (!url || !token) {
  console.error("volvel-worker-host needs --url, or VOLVEL_URL, and WORKER_HOST_TOKEN.");
  process.exit(2);
}
const id = (name: string) => {
  const parsed = Number(process.env[name] ?? "10001");
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(`${name} must be a positive whole number.`);
    process.exit(2);
  }
  return parsed;
};
const users = Number(process.env.MANAGED_WORKER_USERS ?? "256");
if (!Number.isInteger(users) || users < 1 || users > 60000) {
  console.error("MANAGED_WORKER_USERS must be a whole number from 1 to 60000.");
  process.exit(2);
}
const user = { uid: id("MANAGED_WORKER_UID"), gid: id("MANAGED_WORKER_GID"), count: users };
// A worker of the host's own user could read the token from this process. Refuse to start any.
if (
  process.getuid?.() !== undefined &&
  process.getuid() >= user.uid &&
  process.getuid() < user.uid + users
) {
  console.error(
    "volvel-worker-host runs as one of the users it would start workers as. Run it as root, " +
      "with CAP_SETUID and CAP_SETGID, so that workers run as a user of their own.",
  );
  process.exit(2);
}
if (process.getuid?.() !== 0) {
  log(
    "warn",
    "not running as root: starting a worker as another user may fail, and then no worker starts",
  );
}

const positive = (value: string | undefined, name: string, allowZero = false) => {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    console.error(`${name} must be a ${allowZero ? "" : "positive "}whole number.`);
    process.exit(2);
  }
  return parsed;
};
const slots = positive(values["run-slots"] ?? process.env.RUN_SLOTS, "--run-slots");
const floor = positive(
  values["memory-floor"] ?? process.env.RUN_MEMORY_FLOOR_MB,
  "--memory-floor",
  true,
);

const maxWorkers = positive(
  values["max-workers"] ?? process.env.MANAGED_WORKERS_MAX,
  "--max-workers",
);

const host = new WorkerHost({
  url,
  token,
  user,
  ...(maxWorkers ? { maxWorkers } : {}),
  ...(slots ? { runSlots: slots } : {}),
  ...(floor !== undefined ? { memoryFloorMb: floor } : {}),
  log,
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => void host.stop());
}
log("info", "worker host started", { url, uid: user.uid, gid: user.gid, users });
const reason = await host.run();
log("info", `worker host exiting: ${reason}`);
process.exit(reason === "refused" ? 1 : 0);
