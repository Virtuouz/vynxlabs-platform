#!/usr/bin/env node
import { parseArgs } from "node:util";
import { WorkerHost } from "./host.js";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    "max-workers": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage: platform-worker-host --url <control plane url>

Starts the instance's managed workers: asks the control plane for a tenant with
work, and starts a worker for it as a user of its own. Run it in a container on
a network that reaches the control plane and nothing else of the instance's.

Options:
  --max-workers <n>   Workers alive at once. Default 50.

WORKER_HOST_TOKEN is the token the control plane was given. PLATFORM_URL can be
used instead of --url. Workers run as MANAGED_WORKER_UID and MANAGED_WORKER_GID,
10001 by default; this process must be able to switch to them.`);
  process.exit(0);
}

const log = (level: string, message: string, fields?: Record<string, unknown>) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), level, message, ...fields }));

const url = values.url ?? process.env.PLATFORM_URL;
const token = process.env.WORKER_HOST_TOKEN;
if (!url || !token) {
  console.error("platform-worker-host needs --url, or PLATFORM_URL, and WORKER_HOST_TOKEN.");
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
const user = { uid: id("MANAGED_WORKER_UID"), gid: id("MANAGED_WORKER_GID") };
// A worker of the host's own user could read the token from this process. Refuse to start any.
if (process.getuid?.() === user.uid) {
  console.error(
    "platform-worker-host runs as the user it would start workers as. Run it as root, " +
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

const host = new WorkerHost({
  url,
  token,
  user,
  ...(values["max-workers"] ? { maxWorkers: Number(values["max-workers"]) } : {}),
  log,
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => void host.stop());
}
log("info", "worker host started", { url, uid: user.uid, gid: user.gid });
const reason = await host.run();
log("info", `worker host exiting: ${reason}`);
process.exit(reason === "refused" ? 1 : 0);
