import { Worker } from "node:worker_threads";
import { EXPRESSION_ROOTS } from "@volvel/manifest";
import { patternProblem } from "@volvel/widgets/pattern";

/** The most characters a pattern in an expression is run on. */
export const EXPRESSION_PATTERN_INPUT = 1024;

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
// A pattern handed to matches() is run by a backtracking engine, which a pattern such as
// ^(a+)+$ keeps busy for ever. A pattern is refused unless it is shown safe: this is the one rule
// the widget frame's check and the schema guard use too (@volvel/widgets/pattern), built into the
// thread as text. A change to that function is a change to all three.
const patternProblem = ${patternProblem.toString()};
// What a pattern is run on is held to this many characters: the work is at most the square of it.
const MAX_TEXT = ${EXPRESSION_PATTERN_INPUT};
const NativeRegExp = RegExp;
class CheckedRegExp extends NativeRegExp {
  constructor(pattern, flags) {
    const why = typeof pattern === "string" ? patternProblem(pattern, 200) : undefined;
    if (why) throw new Error("The pattern " + why + ", so it is not run.");
    super(pattern, flags);
  }
  test(text) {
    if (String(text).length > MAX_TEXT) throw new Error("The text is longer than " + MAX_TEXT + " characters, the most a pattern is run on.");
    return super.test(text);
  }
  exec(text) {
    if (String(text).length > MAX_TEXT) throw new Error("The text is longer than " + MAX_TEXT + " characters, the most a pattern is run on.");
    return super.exec(text);
  }
}
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
    let value = null;
    if (!parseOnly) {
      // Only while the expression runs: the library builds patterns of its own when it parses.
      globalThis.RegExp = CheckedRegExp;
      try {
        value = plain(program(data));
      } finally {
        globalThis.RegExp = NativeRegExp;
      }
    }
    parentPort.postMessage({ id, value });
  } catch (error) {
    parentPort.postMessage({ id, error: String(error && error.message ? error.message : error) });
  }
});
`;

interface Waiting {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  /** Whose it is: the line each tenant waits in. */
  owner: string;
  message: {
    id: number;
    expression: string;
    data: unknown;
    parseOnly: boolean;
    names: boolean;
  };
  /** Set once the thread has started on it. */
  timer?: NodeJS.Timeout | undefined;
  /** How long the thread may take to start on it at all: a thread that cannot start is given up on. */
  patience?: NodeJS.Timeout | undefined;
}

/** How long a thread may take to start on an expression. */
const PATIENCE_MS = 15_000;

/** How many expressions one owner (a tenant) may have waiting, the one being worked on included. */
const MAX_WAITING_PER_OWNER = 256;

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
 *
 * The thread works on one expression at a time, and each owner (a tenant) has a line of its
 * own, served in turn: one tenant's slow expressions delay another's by at most one time limit
 * per turn, and never fail them. When the thread is replaced, only the expression that held it
 * fails; the rest wait for the new one.
 */
export class Expressions {
  readonly #timeoutMs: number;
  readonly #memoryMb: number;
  readonly #library = import.meta.resolve("@marcbachmann/cel-js");
  /** The owners with something waiting, in the order they are served. */
  readonly #lines = new Map<string, Waiting[]>();
  #current: Waiting | undefined;
  #worker: Worker | undefined;
  #next = 0;
  #unanswered = 0;
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
        const waiting = this.#current;
        if (!waiting || waiting.message.id !== message.id) return;
        clearTimeout(waiting.patience);
        if (message.started) {
          this.#unanswered = 0;
          waiting.timer = setTimeout(() => this.#stuck(message.id), this.#timeoutMs);
          return;
        }
        clearTimeout(waiting.timer);
        this.#current = undefined;
        if (message.error !== undefined)
          waiting.reject(new ExpressionError(explain(message.error)));
        else waiting.resolve(message.value);
        this.#serve();
      },
    );
    worker.on("error", (error: Error & { code?: string }) => {
      // The thread died, almost always from running out of memory. What it held fails.
      if (this.#worker !== worker) return;
      this.#worker = undefined;
      const reason =
        error.code === "ERR_WORKER_OUT_OF_MEMORY"
          ? "The expression used too much memory and was stopped."
          : `The expression could not be evaluated: ${error.message}`;
      this.#end(reason);
    });
    this.#worker = worker;
    return worker;
  }

  /** The expression the thread holds fails; the next in line is given to a new thread. */
  #end(reason: string) {
    const waiting = this.#current;
    this.#current = undefined;
    if (waiting) {
      clearTimeout(waiting.timer);
      clearTimeout(waiting.patience);
      waiting.reject(new ExpressionError(reason));
    }
    this.#serve();
  }

  /** Fails everything that waits, for a thread that cannot be made to answer or for closing. */
  #failAll(reason: string) {
    const all = [this.#current, ...[...this.#lines.values()].flat()];
    this.#current = undefined;
    this.#lines.clear();
    for (const waiting of all) {
      if (!waiting) continue;
      clearTimeout(waiting.timer);
      clearTimeout(waiting.patience);
      waiting.reject(new ExpressionError(reason));
    }
  }

  /** Gives the thread the next owner's expression, when it is free. */
  #serve() {
    if (this.#current || this.#closed) return;
    const first = this.#lines.entries().next().value as [string, Waiting[]] | undefined;
    if (!first) return;
    const [owner, line] = first;
    const waiting = line.shift() as Waiting;
    // The owner goes to the back of the turns, if it has more waiting.
    this.#lines.delete(owner);
    if (line.length > 0) this.#lines.set(owner, line);
    this.#current = waiting;
    waiting.patience = setTimeout(() => this.#unresponsive(waiting), PATIENCE_MS);
    waiting.patience.unref();
    this.#thread().postMessage(waiting.message);
  }

  /**
   * An expression ran past its limit. The thread is busy and cannot be
   * interrupted, so it is replaced: that expression fails, and those that were
   * only waiting their turn are given to the new thread.
   */
  #stuck(id: number) {
    if (this.#current?.message.id !== id) return;
    const stuck = this.#worker;
    this.#worker = undefined;
    void stuck?.terminate();
    this.#end(`The expression took longer than ${this.#timeoutMs} ms and was stopped.`);
  }

  /** The thread did not start on the expression in all this time: it is replaced. */
  #unresponsive(waiting: Waiting) {
    if (this.#current !== waiting) return;
    const stuck = this.#worker;
    this.#worker = undefined;
    void stuck?.terminate();
    this.#unanswered += 1;
    const reason = "The expression could not be evaluated: the evaluator did not respond.";
    // A thread that twice would not start is not going to: nothing more is held for it.
    if (this.#unanswered >= 2) {
      this.#unanswered = 0;
      this.#failAll(reason);
    } else this.#end(reason);
  }

  #send(
    expression: string,
    data: unknown,
    parseOnly: boolean,
    names: boolean,
    owner: string,
  ): Promise<unknown> {
    if (this.#closed)
      return Promise.reject(new ExpressionError("The expression evaluator is closed."));
    const line = this.#lines.get(owner) ?? [];
    const waiting = line.length + (this.#current?.owner === owner ? 1 : 0);
    if (waiting >= MAX_WAITING_PER_OWNER) {
      return Promise.reject(
        new ExpressionError(
          "Too many expressions are waiting to be worked out for this tenant. Try again in a moment.",
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const message = { id: ++this.#next, expression, data, parseOnly, names };
      line.push({ resolve, reject, owner, message });
      this.#lines.set(owner, line);
      this.#serve();
    });
  }

  /**
   * The value of an expression over the given data, as plain JSON. `owner` is whose it is (a
   * tenant's id): each owner's expressions wait in a line of their own.
   */
  evaluate(expression: string, data: Record<string, unknown>, owner = ""): Promise<unknown> {
    return this.#send(expression, data, false, false, owner);
  }

  /**
   * Throws an ExpressionError if the expression does not parse. With `names`, also when it
   * reads a name a flow's expression never has, such as `input`.
   */
  async check(expression: string, names = false, owner = ""): Promise<void> {
    await this.#send(expression, {}, true, names, owner);
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#failAll("The expression evaluator is closed.");
    await this.#worker?.terminate();
    this.#worker = undefined;
  }
}
