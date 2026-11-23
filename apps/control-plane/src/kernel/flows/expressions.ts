import { Worker } from "node:worker_threads";
import { EXPRESSION_ROOTS } from "@volvel/manifest";

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
const make = (Environment, unlisted) =>
  new Environment({
    unlistedVariablesAreDyn: unlisted,
    homogeneousAggregateLiterals: false,
    limits: { maxAstNodes: 2000, maxDepth: 64, maxListElements: 200, maxMapEntries: 200, maxCallArguments: 16 },
  // A timestamp as text: ISO 8601 in UTC, so string(now).substring(0, 10) is today's date.
  }).registerFunction("string(google.protobuf.Timestamp): string", (time) => time.toISOString());
const ready = import(workerData.library).then(({ Environment }) => {
  const environment = make(Environment, true);
  // For a check of the names: only what a flow's expressions may read is known.
  const strict = make(Environment, false);
  for (const name of workerData.roots) strict.registerVariable(name, "dyn");
  return { environment, strict };
});
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
parentPort.on("message", async ({ id, expression, data, parseOnly, names }) => {
  try {
    const both = await ready;
    const environment = parseOnly && names ? both.strict : both.environment;
    // The clock starts now: not while the thread was starting, nor while this waited its turn.
    parentPort.postMessage({ id, started: true });
    const program = environment.parse(expression);
    if (parseOnly && names) {
      const checked = program.check();
      if (!checked.valid) throw checked.error;
    }
    parentPort.postMessage({ id, value: parseOnly ? null : plain(program(data)) });
  } catch (error) {
    parentPort.postMessage({ id, error: String(error && error.message ? error.message : error) });
  }
});
`;

interface Waiting {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  /** What was asked, to ask a new thread when this one is replaced before it started. */
  message: {
    id: number;
    expression: string;
    data: unknown;
    parseOnly: boolean;
    names: boolean;
  };
  /** Set once the thread has started on it. */
  timer?: NodeJS.Timeout | undefined;
  /** How long it may wait to be started at all: a thread that cannot start is given up on. */
  patience: NodeJS.Timeout;
}

/** How long a thread may take to start, and an expression to wait for its turn. */
const PATIENCE_MS = 15_000;

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
      workerData: { library: this.#library, roots: EXPRESSION_ROOTS },
      resourceLimits: {
        maxOldGenerationSizeMb: this.#memoryMb,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 2,
      },
    });
    worker.unref();
    worker.on(
      "message",
      (message: { id: number; started?: boolean; value?: unknown; error?: string }) => {
        const waiting = this.#waiting.get(message.id);
        if (!waiting) return;
        if (message.started) {
          clearTimeout(waiting.patience);
          waiting.timer = setTimeout(() => this.#stuck(message.id), this.#timeoutMs);
          return;
        }
        this.#waiting.delete(message.id);
        clearTimeout(waiting.timer);
        clearTimeout(waiting.patience);
        if (message.error !== undefined)
          waiting.reject(new ExpressionError(explain(message.error)));
        else waiting.resolve(message.value);
      },
    );
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
      clearTimeout(waiting.patience);
      waiting.reject(new ExpressionError(reason));
    }
    this.#waiting.clear();
  }

  /**
   * An expression ran past its limit. The thread is busy and cannot be
   * interrupted, so it is replaced: that expression fails, and those that were
   * only waiting their turn are asked of the new thread.
   */
  #stuck(id: number) {
    const waiting = this.#waiting.get(id);
    if (!waiting) return;
    this.#waiting.delete(id);
    clearTimeout(waiting.patience);
    waiting.reject(
      new ExpressionError(`The expression took longer than ${this.#timeoutMs} ms and was stopped.`),
    );
    const stuck = this.#worker;
    this.#worker = undefined;
    void stuck?.terminate();
    for (const other of this.#waiting.values()) this.#thread().postMessage(other.message);
  }

  #send(expression: string, data: unknown, parseOnly: boolean, names = false): Promise<unknown> {
    if (this.#closed)
      return Promise.reject(new ExpressionError("The expression evaluator is closed."));
    return new Promise((resolve, reject) => {
      const id = ++this.#next;
      const message = { id, expression, data, parseOnly, names };
      const patience = setTimeout(() => {
        // Not started in all this time: the thread itself is wrong. It is replaced, and
        // everything it held fails.
        const stuck = this.#worker;
        this.#worker = undefined;
        this.#failAll("The expression could not be evaluated: the evaluator did not respond.");
        void stuck?.terminate();
      }, PATIENCE_MS);
      patience.unref();
      this.#waiting.set(id, { resolve, reject, message, patience });
      this.#thread().postMessage(message);
    });
  }

  /** The value of an expression over the given data, as plain JSON. */
  evaluate(expression: string, data: Record<string, unknown>): Promise<unknown> {
    return this.#send(expression, data, false);
  }

  /**
   * Throws an ExpressionError if the expression does not parse. With `names`, also when it
   * reads a name a flow's expression never has, such as `input`.
   */
  async check(expression: string, names = false): Promise<void> {
    await this.#send(expression, {}, true, names);
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#failAll("The expression evaluator is closed.");
    await this.#worker?.terminate();
    this.#worker = undefined;
  }
}
