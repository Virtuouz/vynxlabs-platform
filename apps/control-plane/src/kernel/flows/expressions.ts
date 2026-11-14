import { Worker } from "node:worker_threads";

/** An expression that could not be parsed or evaluated. The message is meant for the flow's author. */
export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

export interface ExpressionLimits {
  /** How long one evaluation may take. */
  timeoutMs?: number;
  /** How much memory the evaluating thread may use. */
  memoryMb?: number;
}

/**
 * The code of the evaluating thread. It holds no reference to anything but
 * the expression library and the data it is sent.
 */
const THREAD = `
const { parentPort, workerData } = require("node:worker_threads");
const ready = import(workerData.library).then(({ Environment }) =>
  new Environment({
    unlistedVariablesAreDyn: true,
    homogeneousAggregateLiterals: false,
    limits: { maxAstNodes: 2000, maxDepth: 64, maxListElements: 200, maxMapEntries: 200, maxCallArguments: 16 },
  // A timestamp as text: ISO 8601 in UTC, so string(now).substring(0, 10) is today's date.
  }).registerFunction("string(google.protobuf.Timestamp): string", (time) => time.toISOString()),
);
// CEL integers are 64-bit and maps are Maps. Results go back as plain JSON values.
const plain = (value) => {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [String(k), plain(v)]));
  if (Array.isArray(value)) return value.map(plain);
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value === undefined ? null : value;
};
parentPort.on("message", async ({ id, expression, data, parseOnly }) => {
  try {
    const environment = await ready;
    const program = environment.parse(expression);
    parentPort.postMessage({ id, value: parseOnly ? null : plain(program(data)) });
  } catch (error) {
    parentPort.postMessage({ id, error: String(error && error.message ? error.message : error) });
  }
});
`;

interface Waiting {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function explain(message: string): string {
  const first = (message.split("\n")[0] ?? message).trim();
  // JSON has one number type, and CEL does not mix it with integer literals in arithmetic.
  if (/no such overload: .*double.* [-+*/%] int|int [-+*/%] .*double/.test(first)) {
    return `${first}. Numbers from step outputs are doubles: write 1.0 instead of 1, or convert with int(...)`;
  }
  return first;
}

/**
 * Evaluates CEL expressions in a separate thread, with a time limit and a
 * memory cap. An expression that exceeds either is stopped, the thread is
 * replaced, and the caller gets an error. The control plane is never blocked.
 */
export class Expressions {
  readonly #timeoutMs: number;
  readonly #memoryMb: number;
  readonly #library = import.meta.resolve("@marcbachmann/cel-js");
  readonly #waiting = new Map<number, Waiting>();
  #worker: Worker | undefined;
  #next = 0;
  #closed = false;

  constructor(limits: ExpressionLimits = {}) {
    this.#timeoutMs = limits.timeoutMs ?? 250;
    this.#memoryMb = limits.memoryMb ?? 64;
  }

  #thread(): Worker {
    if (this.#worker) return this.#worker;
    const worker = new Worker(THREAD, {
      eval: true,
      workerData: { library: this.#library },
      resourceLimits: {
        maxOldGenerationSizeMb: this.#memoryMb,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 2,
      },
    });
    worker.unref();
    worker.on("message", (message: { id: number; value?: unknown; error?: string }) => {
      const waiting = this.#waiting.get(message.id);
      if (!waiting) return;
      this.#waiting.delete(message.id);
      clearTimeout(waiting.timer);
      if (message.error !== undefined) waiting.reject(new ExpressionError(explain(message.error)));
      else waiting.resolve(message.value);
    });
    worker.on("error", (error: Error & { code?: string }) => {
      // The thread died, almost always from running out of memory. Everything it held fails.
      if (this.#worker === worker) this.#worker = undefined;
      const reason =
        error.code === "ERR_WORKER_OUT_OF_MEMORY"
          ? "The expression used too much memory and was stopped."
          : `The expression could not be evaluated: ${error.message}`;
      this.#failAll(reason);
    });
    this.#worker = worker;
    return worker;
  }

  #failAll(reason: string) {
    for (const waiting of this.#waiting.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(new ExpressionError(reason));
    }
    this.#waiting.clear();
  }

  #send(expression: string, data: unknown, parseOnly: boolean): Promise<unknown> {
    if (this.#closed)
      return Promise.reject(new ExpressionError("The expression evaluator is closed."));
    return new Promise((resolve, reject) => {
      const id = ++this.#next;
      const timer = setTimeout(() => {
        // The thread is busy and cannot be interrupted, so it is replaced.
        const stuck = this.#worker;
        this.#worker = undefined;
        this.#failAll(`The expression took longer than ${this.#timeoutMs} ms and was stopped.`);
        void stuck?.terminate();
      }, this.#timeoutMs);
      this.#waiting.set(id, { resolve, reject, timer });
      this.#thread().postMessage({ id, expression, data, parseOnly });
    });
  }

  /** The value of an expression over the given data, as plain JSON. */
  evaluate(expression: string, data: Record<string, unknown>): Promise<unknown> {
    return this.#send(expression, data, false);
  }

  /** Throws an ExpressionError if the expression does not parse. */
  async check(expression: string): Promise<void> {
    await this.#send(expression, {}, true);
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#failAll("The expression evaluator is closed.");
    await this.#worker?.terminate();
    this.#worker = undefined;
  }
}
