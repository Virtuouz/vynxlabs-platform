import { defineScript, z } from "@volvel/sdk";

/** The table's path. Its columns are in platform/load/records.table.yaml. */
export const RECORDS = "load/records";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The slow script: it does nothing for `seconds`, and so holds a run slot. */
export const sleep = defineScript({
  path: "load/sleep",
  description:
    "Waits, then returns. A slow script: a per-minute schedule of it fills the run slots.",
  input: z.object({
    seconds: z.number().min(0).max(600).default(20).describe("How long to wait."),
  }),
  output: z.object({ sleptSeconds: z.number() }),
  timeoutSeconds: 700,
  memoryMb: 128,
  async run({ seconds }) {
    const started = Date.now();
    await wait(seconds * 1000);
    return { sleptSeconds: Math.round((Date.now() - started) / 100) / 10 };
  },
});

/**
 * Takes real memory: the buffers are filled, so every page is resident and not merely promised.
 * `memoryMb` is 512, so 300 MB succeeds and 700 MB is stopped as out of memory.
 */
export const holdMemory = defineScript({
  path: "load/hold-memory",
  description:
    "Holds `megabytes` of resident memory for `seconds`. The script's memoryMb is 512: more than about 450 is stopped.",
  input: z.object({
    megabytes: z.number().int().min(1).max(4000).default(300).describe("How much to hold."),
    seconds: z.number().min(0).max(600).default(20).describe("How long to hold it."),
  }),
  output: z.object({ heldMegabytes: z.number(), checksum: z.number() }),
  timeoutSeconds: 700,
  memoryMb: 512,
  async run({ megabytes, seconds }) {
    const chunks: Buffer[] = [];
    for (let i = 0; i < megabytes; i++) {
      // Not zeros and not allocated lazily: every byte is written, so it is all resident.
      const chunk = Buffer.allocUnsafe(1024 * 1024);
      chunk.fill((i % 250) + 1);
      chunks.push(chunk);
    }
    await wait(seconds * 1000);
    // Read it back, so the buffers cannot be thought unused.
    let checksum = 0;
    for (const chunk of chunks) checksum += (chunk[0] ?? 0) + (chunk[chunk.length - 1] ?? 0);
    return { heldMegabytes: chunks.length, checksum };
  },
});

/** Uses a processor flat out for `seconds`. */
export const burnCpu = defineScript({
  path: "load/burn-cpu",
  description: "Busy-loops for `seconds`, one processor's worth.",
  input: z.object({
    seconds: z.number().min(0).max(600).default(10).describe("How long to burn."),
  }),
  output: z.object({ iterations: z.number() }),
  timeoutSeconds: 700,
  memoryMb: 128,
  run({ seconds }) {
    const until = Date.now() + seconds * 1000;
    let iterations = 0;
    let x = 1;
    while (Date.now() < until) {
      // A chunk of arithmetic between looks at the clock.
      for (let i = 0; i < 200_000; i++) x = (x * 1103515245 + 12345) % 2147483648;
      iterations += 200_000;
    }
    return { iterations: iterations + (x === -1 ? 1 : 0) };
  },
});

/** Returns at once, for throughput: how many runs a second the instance starts and finishes. */
export const quick = defineScript({
  path: "load/quick",
  description: "Returns at once with a small payload.",
  input: z.object({}).passthrough(),
  output: z.object({ ok: z.literal(true), at: z.string() }),
  timeoutSeconds: 30,
  memoryMb: 128,
  run: () => ({ ok: true as const, at: new Date().toISOString() }),
});

/** The list the flow goes over: a foreach needs a list, and an expression cannot make one. */
export const items = defineScript({
  path: "load/items",
  description: "The numbers 0 to count - 1, for the fan-out flow's foreach.",
  input: z.object({ count: z.number().int().min(1).max(1000).default(1000) }),
  output: z.object({ items: z.array(z.number()) }),
  timeoutSeconds: 30,
  memoryMb: 128,
  run: ({ count }) => ({ items: Array.from({ length: count }, (_, i) => i) }),
});

/** One item of the fan-out flow: a run of its own with a little work in it. */
export const item = defineScript({
  path: "load/item",
  description: "The per-item step of load/fan-out. Does a tiny amount of work.",
  input: z.object({ index: z.number().int().default(0) }),
  output: z.object({ index: z.number(), square: z.number() }),
  timeoutSeconds: 60,
  memoryMb: 128,
  run: ({ index }) => ({ index, square: index * index }),
});

// ----- The table -----

const CATEGORIES = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"];
const REGIONS = Array.from({ length: 40 }, (_, i) => `region-${String(i + 1).padStart(2, "0")}`);
const WORDS = [
  "amber",
  "birch",
  "cinder",
  "dune",
  "ember",
  "fjord",
  "gale",
  "harbor",
  "iris",
  "juniper",
  "kelp",
  "lumen",
  "moss",
  "nectar",
  "onyx",
  "pylon",
  "quartz",
  "ridge",
  "sable",
  "tundra",
  "umber",
  "vellum",
  "willow",
  "yarrow",
  "zephyr",
];

/** The same number for the same row, every time, so a fill that resumes writes what it would have. */
function hash(seq: number, salt: number): number {
  let h = (seq * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
const pick = <T>(list: readonly T[], seq: number, salt: number): T =>
  list[hash(seq, salt) % list.length] as T;

const DAY = 86_400_000;
/** 2024-01-01, and the three years after it. */
const START = Date.UTC(2024, 0, 1);

function recordOf(seq: number) {
  const created = START + (hash(seq, 7) % (3 * 365)) * DAY;
  const sentence = Array.from({ length: 4 + (hash(seq, 3) % 28) }, (_, i) =>
    pick(WORDS, seq, 100 + i),
  ).join(" ");
  return {
    seq,
    title: `${pick(WORDS, seq, 1)} ${pick(WORDS, seq, 2)} ${seq}`,
    notes: sentence.slice(0, 40 + (hash(seq, 4) % 160)),
    category: pick(CATEGORIES, seq, 5),
    region: pick(REGIONS, seq, 6),
    amount: (hash(seq, 8) % 1_000_000) / 100,
    quantity: hash(seq, 9) % 500,
    active: hash(seq, 10) % 10 !== 0,
    created_on: new Date(created).toISOString().slice(0, 10),
    // Most rows are due; some are not.
    due_at: hash(seq, 11) % 5 === 0 ? undefined : new Date(created + 14 * DAY).toISOString(),
  };
}

const TIMEOUT_SECONDS = 3600;
/** A run stops writing this long before its timeout and says where to carry on. */
const STOP_AFTER_SECONDS = TIMEOUT_SECONDS - 300;

/**
 * Fills load/records, `batch` rows to a call (the SDK's most is 1,000). Rows are numbered by
 * `seq`, and the same `seq` always gives the same row, so a run that was cut short is carried on
 * from the `next` it returned. One run stops at about 55 minutes: at a few thousand rows a second
 * 200,000 rows is a few minutes, but a slow instance may need two or three runs.
 */
export const fillTable = defineScript({
  path: "load/fill-table",
  description:
    "Inserts rows into load/records in batches, from `from` up to `rows`. If it runs out of time it says where to continue.",
  input: z.object({
    rows: z.number().int().min(1).max(5_000_000).default(200_000).describe("The table's size."),
    from: z.number().int().min(0).default(0).describe("The row to start at, to carry on a fill."),
    batch: z.number().int().min(1).max(1000).default(500).describe("Rows per insert."),
  }),
  output: z.object({
    inserted: z.number().describe("Rows written by this run."),
    next: z.number().describe("The `from` to continue with: where this run stopped."),
    done: z.boolean().describe("Whether every row up to `rows` has been written."),
    seconds: z.number(),
  }),
  tables: [RECORDS],
  timeoutSeconds: TIMEOUT_SECONDS,
  memoryMb: 512,
  async run({ rows, from, batch }, ctx) {
    const table = ctx.table(RECORDS);
    const started = Date.now();
    let next = from;
    while (next < rows) {
      if ((Date.now() - started) / 1000 > STOP_AFTER_SECONDS) break;
      const end = Math.min(rows, next + batch);
      await table.insertMany(Array.from({ length: end - next }, (_, i) => recordOf(next + i)));
      next = end;
    }
    return {
      inserted: next - from,
      next,
      done: next >= rows,
      seconds: Math.round((Date.now() - started) / 100) / 10,
    };
  },
});
