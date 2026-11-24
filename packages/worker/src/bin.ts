#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { parseMachine } from "./machine.js";
import { readTokenFile } from "./token.js";
import { telemetryFromEnv } from "./trace.js";
import { Worker } from "./worker.js";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    token: { type: "string" },
    "token-stdin": { type: "boolean" },
    "token-file": { type: "string" },
    concurrency: { type: "string" },
    "idle-exit": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`Usage: volvel-worker --url <control plane url> --token <worker credential>

Runs a tenant's scripts. It only makes outbound calls to the control plane.

Options:
  --token-stdin       Read the credential from the first line of standard input.
                      Kept out of the process's environment and command line, where
                      other processes of the same user could read it.
  --token-file <path> Read the credential from the first line of a file, such as a
                      Compose or Docker secret. Not in the environment either.
  --concurrency <n>   Runs handled at once. Default 4. VOLVEL_WORKER_CONCURRENCY also sets it.
  --idle-exit <s>     Exit after this many seconds with nothing to do. VOLVEL_WORKER_IDLE_EXIT also sets it.

VOLVEL_URL and VOLVEL_WORKER_TOKEN can be used instead of the flags.`);
  process.exit(0);
}

/** The first line of standard input. */
async function firstLine(): Promise<string | undefined> {
  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    lines.close();
    return line.trim();
  }
  return undefined;
}

const url = values.url ?? process.env.VOLVEL_URL;
let fromFile: string | undefined;
if (values["token-file"]) {
  try {
    fromFile = readTokenFile(values["token-file"]);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
}
const token = values["token-stdin"]
  ? await firstLine()
  : (fromFile ?? values.token ?? process.env.VOLVEL_WORKER_TOKEN);
if (!url || !token) {
  console.error(
    "volvel-worker needs --url and a credential: --token-file, --token-stdin or --token, or VOLVEL_URL and VOLVEL_WORKER_TOKEN.",
  );
  process.exit(2);
}
// The credential is in memory now. Nothing a script spawns should inherit it.
delete process.env.VOLVEL_WORKER_TOKEN;

// Scripts run as this worker's own user. With the kernel's ptrace protection off, a
// script's process could read this one's memory, credential included.
try {
  if (readFileSync("/proc/sys/kernel/yama/ptrace_scope", "utf8").trim() === "0") {
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        level: "warn",
        message:
          "kernel.yama.ptrace_scope is 0: a script could read this worker's memory. Set it to 1 or more.",
      }),
    );
  }
} catch {
  // Not Linux, or no Yama: nothing to say.
}

/** A flag or its variable, checked before the worker asks for anything. Empty is not set. */
const whole = (flag: string, variable: string, raw: string | undefined) => {
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(`--${flag} (or ${variable}) must be a positive whole number.`);
    process.exit(2);
  }
  return parsed;
};
const concurrency = whole(
  "concurrency",
  "VOLVEL_WORKER_CONCURRENCY",
  values.concurrency ?? process.env.VOLVEL_WORKER_CONCURRENCY,
);
const idleExit = whole(
  "idle-exit",
  "VOLVEL_WORKER_IDLE_EXIT",
  values["idle-exit"] ?? process.env.VOLVEL_WORKER_IDLE_EXIT,
);
// Set by the worker host or control plane that started this worker: the machine it shares.
const machine = parseMachine(process.env.VOLVEL_WORKER_MACHINE);
const worker = new Worker({
  url,
  token,
  ...(machine ? { machine } : {}),
  // Spans are sent only when this worker's own environment names somewhere to send them.
  telemetry: telemetryFromEnv(process.env),
  ...(concurrency ? { concurrency } : {}),
  ...(idleExit ? { idleExitSeconds: idleExit } : {}),
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
