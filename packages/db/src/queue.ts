import type pg from "pg";
import { PgBoss } from "pg-boss";

/** Jobs whose retries are used up land here, so their final failure can be recorded. */
export const DEAD_LETTER_QUEUE = "dead";

/** The highest per-group concurrency limit a job may ask for. */
export const MAX_GROUP_LIMIT = 64;

/** A worker must send a heartbeat at least this often, or its job is taken back. */
export const HEARTBEAT_SECONDS = 30;

export interface EnqueueOptions {
  /** Higher runs first. Default 0. */
  priority?: number;
  /** Do not start before this time, or this many seconds from now. */
  startAfter?: Date | number;
  /** Retries after the first attempt. Default 0. */
  retryLimit?: number;
  /** Seconds before the first retry. Doubles each time when `backoff` is set. */
  retryDelaySeconds?: number;
  backoff?: boolean;
  /** How long one attempt may run. */
  timeoutSeconds?: number;
  /** Jobs with the same group ID run at most `limit` at a time, across all workers. */
  group?: { id: string; limit: number };
}

export interface ClaimedJob<Data> {
  id: string;
  data: Data;
  /** 1 for the first attempt. */
  attempt: number;
  timeoutSeconds: number;
}

export type JobState = "created" | "retry" | "active" | "completed" | "cancelled" | "failed";

export interface QueueTuning {
  /** How often expired and silent jobs are looked for. Lower in tests. */
  superviseIntervalSeconds?: number;
  heartbeatSeconds?: number;
}

const tier = (limit: number) => `c${limit}`;
const GROUP_TIERS = Object.fromEntries(
  Array.from({ length: MAX_GROUP_LIMIT }, (_, index) => [tier(index + 1), index + 1]),
);

/**
 * The job queue, held in Postgres. A thin layer over pg-boss that exposes only
 * what the platform uses: explicit claim, heartbeat, complete and fail, so a
 * worker on another network can be served over HTTP.
 */
export class JobQueue {
  readonly #boss: PgBoss;
  readonly #known = new Set<string>();
  readonly #heartbeatSeconds: number;
  #started = false;

  /** Built by `Database`. The pool never leaves this package. */
  constructor(pool: pg.Pool, tuning: QueueTuning = {}, onError: (error: Error) => void = () => {}) {
    this.#heartbeatSeconds = tuning.heartbeatSeconds ?? HEARTBEAT_SECONDS;
    this.#boss = new PgBoss({
      db: { executeSql: (text: string, values?: unknown[]) => pool.query(text, values) },
      schema: "pgboss",
      // The platform has its own scheduler and its own instance records.
      schedule: false,
      registerInstance: false,
      ...(tuning.superviseIntervalSeconds
        ? {
            superviseIntervalSeconds: tuning.superviseIntervalSeconds,
            monitorIntervalSeconds: tuning.superviseIntervalSeconds,
          }
        : {}),
    });
    this.#boss.on("error", onError);
  }

  /** Creates or upgrades the queue's own tables, then starts supervision. */
  async start(): Promise<void> {
    if (this.#started) return;
    await this.#boss.start();
    this.#started = true;
    await this.#ensure(DEAD_LETTER_QUEUE, false);
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    this.#started = false;
    await this.#boss.stop({ graceful: false, close: false });
  }

  async #ensure(name: string, work = true): Promise<void> {
    if (this.#known.has(name)) return;
    if (!(await this.#boss.getQueue(name))) {
      await this.#boss
        .createQueue(
          name,
          work ? { deadLetter: DEAD_LETTER_QUEUE, heartbeatSeconds: this.#heartbeatSeconds } : {},
        )
        .catch(async (error) => {
          // Another replica created it first.
          if (!(await this.#boss.getQueue(name))) throw error;
        });
    }
    this.#known.add(name);
  }

  async enqueue(queue: string, data: object, options: EnqueueOptions = {}): Promise<string> {
    await this.#ensure(queue);
    if (options.group && (options.group.limit < 1 || options.group.limit > MAX_GROUP_LIMIT)) {
      throw new Error(`A concurrency limit must be from 1 to ${MAX_GROUP_LIMIT}.`);
    }
    const id = await this.#boss.send(queue, data, {
      priority: options.priority ?? 0,
      retryLimit: options.retryLimit ?? 0,
      retryDelay: options.retryDelaySeconds ?? 0,
      retryBackoff: options.backoff ?? false,
      ...(options.startAfter !== undefined ? { startAfter: options.startAfter } : {}),
      ...(options.timeoutSeconds !== undefined ? { expireInSeconds: options.timeoutSeconds } : {}),
      ...(options.group
        ? { group: { id: options.group.id, tier: tier(options.group.limit) } }
        : {}),
    });
    if (!id) throw new Error(`The job could not be queued on ${queue}.`);
    return id;
  }

  /** Takes the next job that is due and within its group's limit, or null. */
  async claim<Data = object>(queue: string): Promise<ClaimedJob<Data> | null> {
    await this.#ensure(queue);
    const [job] = await this.#boss.fetch<Data>(queue, {
      batchSize: 1,
      priority: true,
      groupConcurrency: { default: MAX_GROUP_LIMIT * 1000, tiers: GROUP_TIERS },
    });
    if (!job) return null;
    return {
      id: job.id,
      data: job.data,
      attempt: job.retryCount + 1,
      timeoutSeconds: job.expireInSeconds,
    };
  }

  /** Says the worker is still alive. Returns false when the job is no longer its to run. */
  async heartbeat(queue: string, id: string): Promise<boolean> {
    const result = await this.#boss.touch(queue, id);
    return result.affected > 0;
  }

  async complete(queue: string, id: string, output?: object): Promise<boolean> {
    return (await this.#boss.complete(queue, id, output ?? null)).affected > 0;
  }

  /** Fails the attempt. The job is retried if it has retries left. */
  async fail(queue: string, id: string, error: object): Promise<boolean> {
    return (await this.#boss.fail(queue, id, error)).affected > 0;
  }

  async cancel(queue: string, id: string): Promise<boolean> {
    return (await this.#boss.cancel(queue, id)).affected > 0;
  }

  async state(queue: string, id: string): Promise<JobState | null> {
    const [job] = await this.#boss.findJobs(queue, { id });
    return job?.state ?? null;
  }

  /**
   * Takes one job whose retries are used up, with the queue it came from, so
   * the caller can record the final failure. Completes it in the same call.
   */
  async takeDead<Data = object>(): Promise<{ data: Data } | null> {
    const [job] = await this.#boss.fetch<Data>(DEAD_LETTER_QUEUE, { batchSize: 1 });
    if (!job) return null;
    await this.#boss.complete(DEAD_LETTER_QUEUE, job.id);
    return { data: job.data };
  }
}
