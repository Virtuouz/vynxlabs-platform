import type { Database } from "@volvel/db";
import type { Config } from "./config.js";
import { bootstrapAdmin } from "./kernel/bootstrap.js";
import { startBackground } from "./kernel/execution/background.js";
import { forgiveSilentRuns } from "./kernel/execution/runs.js";
import { WorkerSupervisor } from "./kernel/execution/supervisor.js";
import type { Kernel } from "./kernel/kernel.js";
import { rekeyIfRotating } from "./kernel/rekey.js";
import { failInterruptedClones } from "./kernel/tenancy/clone.js";

/** Every 10 seconds: has the database started or stopped taking writes? */
const WRITABLE_CHECK_MS = 10_000;

interface Log {
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * What needs writes: the queue, the background loop, managed workers. Started once, stopped when
 * the database takes no writes, and started again when it does.
 */
export function createWriter(options: {
  database: Pick<Database, "queue" | "readOnly">;
  kernel: Kernel;
  log: Log;
  config: Config;
  /** For tests. */
  checkMs?: number;
  background?: typeof startBackground;
}) {
  const { database, kernel, log, config } = options;
  const begin = options.background ?? startBackground;
  let background: ReturnType<typeof startBackground> | undefined;
  /** Whether what needs writes is running: the queue, the background loop, managed workers. */
  let writing = false;
  /** A change between writing and not, in progress. */
  let changing: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;

  async function start(opts: { atBoot?: boolean } = {}) {
    // Already on: a second loop would double every tick and could start more workers than the cap.
    if (writing || background) return;
    // Nothing could be written until now, a worker's heartbeat no more than anything else:
    // what is in progress is given its time again before anything is taken back for silence.
    await forgiveSilentRuns(kernel);
    await database.queue.start();
    // At boot these ran already, before the sign-in for row requests was set up.
    if (!opts.atBoot) {
      await bootstrapAdmin(kernel, kernel.log);
      // During a rotation, what the other key sealed is sealed again before anything else uses it.
      await rekeyIfRotating(kernel);
    }
    // A clone that was running an hour ago, when this process was not, did not survive.
    await failInterruptedClones(kernel, new Date(Date.now() - 60 * 60 * 1000));
    if (writing || background) return;
    background = begin(
      kernel,
      config.managedWorkers === "process"
        ? new WorkerSupervisor(kernel, {
            url: `http://127.0.0.1:${config.port}`,
            user: config.managedWorkerUser,
            ...(config.limits.runSlots ? { runSlots: config.limits.runSlots } : {}),
            ...(config.limits.runMemoryFloorMb !== undefined
              ? { memoryFloorMb: config.limits.runMemoryFloorMb }
              : {}),
            ...(config.limits.managedWorkersMax
              ? { maxWorkers: config.limits.managedWorkersMax }
              : {}),
          })
        : undefined,
    );
    writing = true;
  }

  async function stop() {
    writing = false;
    const ended = background;
    background = undefined;
    await ended?.stop();
  }

  /** Writes stopped: the queue is not supervised until they return, so that it takes nothing back meanwhile. */
  async function pause() {
    await stop();
    await database.queue.stop().catch((error) => {
      log.warn({ err: error }, "the queue's supervision could not be stopped");
    });
  }

  return {
    start,
    stop,
    get running() {
      return writing;
    },
    /** Watches for the database starting or stopping to take writes. Called after boot is done. */
    watch(stopping: () => boolean) {
      if (timer) return;
      timer = setInterval(() => {
        if (changing || stopping()) return;
        changing = database
          .readOnly()
          .then(async (readOnly) => {
            if (!readOnly && !writing) {
              log.warn("the database takes writes again: starting the queue and background work");
              await start();
            } else if (readOnly && writing) {
              log.error(
                "the database takes no writes: its disk may be full. Background work stops; " +
                  "reads go on, and changes are answered 503 until writes come back",
              );
              await pause();
            }
          })
          .catch((error) =>
            log.warn({ err: error }, "could not tell whether the database takes writes"),
          )
          .finally(() => {
            changing = undefined;
          });
      }, options.checkMs ?? WRITABLE_CHECK_MS);
      timer.unref();
    },
    async close() {
      if (timer) clearInterval(timer);
      await changing;
      await stop();
    },
  };
}
