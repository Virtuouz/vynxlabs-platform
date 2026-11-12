#!/usr/bin/env node
import { parseArgs } from "node:util";
import { Worker } from "./worker.js";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    token: { type: "string" },
    concurrency: { type: "string" },
    "idle-exit": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage: platform-worker --url <control plane url> --token <worker credential>

Runs a tenant's scripts. It only makes outbound calls to the control plane.

Options:
  --concurrency <n>   Runs handled at once. Default 4.
  --idle-exit <s>     Exit after this many seconds with nothing to do.

PLATFORM_URL and PLATFORM_WORKER_TOKEN can be used instead of the flags.`);
  process.exit(0);
}

const url = values.url ?? process.env.PLATFORM_URL;
const token = values.token ?? process.env.PLATFORM_WORKER_TOKEN;
if (!url || !token) {
  console.error(
    "platform-worker needs --url and --token, or PLATFORM_URL and PLATFORM_WORKER_TOKEN.",
  );
  process.exit(2);
}
// The credential is in memory now. Nothing a script spawns should inherit it.
delete process.env.PLATFORM_WORKER_TOKEN;

const idleExit = values["idle-exit"] ?? process.env.PLATFORM_WORKER_IDLE_EXIT;
const worker = new Worker({
  url,
  token,
  ...(values.concurrency ? { concurrency: Number(values.concurrency) } : {}),
  ...(idleExit ? { idleExitSeconds: Number(idleExit) } : {}),
  log: (level, message, fields) =>
    console.log(JSON.stringify({ time: new Date().toISOString(), level, message, ...fields })),
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => worker.stop());
}

console.log(
  JSON.stringify({
    time: new Date().toISOString(),
    level: "info",
    message: "worker started",
    workerId: worker.id,
    url,
  }),
);
const reason = await worker.run();
console.log(
  JSON.stringify({
    time: new Date().toISOString(),
    level: "info",
    message: `worker exiting: ${reason}`,
  }),
);
process.exit(reason === "refused" ? 1 : 0);
