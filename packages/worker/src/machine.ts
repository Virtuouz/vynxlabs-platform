import { readdirSync, readFileSync } from "node:fs";
import { hostname } from "node:os";

/**
 * What a machine can say about its memory and its processes, read from `/proc`.
 * Where there is no `/proc` (macOS in development), every answer is `undefined`
 * and the checks that use them are skipped.
 */
/** CAP_KILL, in the effective capabilities line of `/proc/<pid>/status`. */
const CAP_KILL = 5n;

/**
 * Whether a process may signal processes of other users: it is root with CAP_KILL. A worker
 * host that is not cannot stop its workers, and the memory guard cannot end a script.
 * Where this cannot be told (not Linux), it is taken to be so.
 */
export function canSignalOtherUsers(
  uid: number | undefined = process.getuid?.(),
  status?: string,
): boolean {
  if (uid === undefined) return true;
  if (uid !== 0) return false;
  try {
    const text = status ?? readFileSync("/proc/self/status", "utf8");
    const line = /^CapEff:\s*([0-9a-f]+)/m.exec(text);
    if (!line) return true;
    return ((BigInt(`0x${line[1]}`) >> CAP_KILL) & 1n) === 1n;
  } catch {
    return true;
  }
}

export interface MachineProbe {
  /** Memory in MB: all of it, and what can still be had without swapping. */
  memory(): { totalMb: number; availableMb: number } | undefined;
  /** What a process holds in memory now, in MB. */
  rssMb(pid: number): number | undefined;
  /** The processes a process started, directly. */
  children(pid: number): number[];
}

function readNumber(text: string, field: string): number | undefined {
  const match = new RegExp(`^${field}:\\s+(\\d+)\\s*kB`, "m").exec(text);
  return match ? Number(match[1]) / 1024 : undefined;
}

/**
 * Memory as this process may use it: what the machine has, held to the container's limit and
 * use where there is one (cgroup v2, then v1). A container held to 1 GB on a 16 GB machine has
 * 1 GB, whatever `/proc/meminfo` says. `read` returns a file's text, or undefined.
 */
export function memoryOf(
  read: (path: string) => string | undefined,
): { totalMb: number; availableMb: number } | undefined {
  const meminfo = read("/proc/meminfo");
  if (meminfo === undefined) return undefined;
  const machineTotal = readNumber(meminfo, "MemTotal");
  const machineAvailable = readNumber(meminfo, "MemAvailable");
  if (machineTotal === undefined || machineAvailable === undefined) return undefined;
  const MB = 1024 * 1024;
  const bytes = (text: string | undefined) => {
    const value = text?.trim();
    return value && /^\d+$/.test(value) ? Number(value) : undefined;
  };
  // v2 says `max` for none; v1 says a number near 2^63.
  let limit = bytes(read("/sys/fs/cgroup/memory.max"));
  let used = bytes(read("/sys/fs/cgroup/memory.current"));
  let cache = readStat(read("/sys/fs/cgroup/memory.stat"), "inactive_file");
  if (limit === undefined) {
    limit = bytes(read("/sys/fs/cgroup/memory/memory.limit_in_bytes"));
    used = bytes(read("/sys/fs/cgroup/memory/memory.usage_in_bytes"));
    cache = readStat(read("/sys/fs/cgroup/memory/memory.stat"), "total_inactive_file");
  }
  if (limit === undefined || limit / MB >= machineTotal) {
    return { totalMb: machineTotal, availableMb: machineAvailable };
  }
  // What the container still has: its limit less what it holds that cannot be given back.
  const held = Math.max(0, (used ?? 0) - (cache ?? 0));
  const free = Math.max(0, limit - held) / MB;
  return { totalMb: limit / MB, availableMb: Math.min(machineAvailable, free) };
}

function readStat(text: string | undefined, field: string): number | undefined {
  const match = text ? new RegExp(`^${field} (\\d+)$`, "m").exec(text) : null;
  return match ? Number(match[1]) : undefined;
}

export const procProbe: MachineProbe = {
  memory() {
    return memoryOf((path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    });
  },
  rssMb(pid) {
    try {
      return readNumber(readFileSync(`/proc/${pid}/status`, "utf8"), "VmRSS");
    } catch {
      return undefined;
    }
  },
  children(pid) {
    let entries: string[];
    try {
      entries = readdirSync("/proc");
    } catch {
      return [];
    }
    const found: number[] = [];
    for (const entry of entries) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        // The parent is the fourth field, after the name, which may hold spaces and is in brackets.
        const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
        const parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
        if (parent === pid) found.push(Number(entry));
      } catch {
        // The process ended while being read.
      }
    }
    return found;
  },
};

/** How much a script's process may hold beyond its `memoryMb`: Node's own, outside its heap. */
export const NODE_OVERHEAD_MB = 64;

/** Memory kept back for the control plane or the host, and the system. */
const RESERVED_MB = 512;
/** What one run is planned at when slots are worked out from memory. Most use far less. */
const PLANNED_RUN_MB = 160;

/**
 * What one more worker is planned at before it runs anything: a worker measured about 105 MB at
 * rest. A worker is started only where this much stays above the memory floor, so that starting
 * it is not what takes the machine below.
 */
export const PLANNED_WORKER_MB = 128;

/** Runs one machine takes at once when nobody says: what its memory can hold. */
export function defaultSlots(totalMb: number | undefined): number {
  if (totalMb === undefined) return 8;
  return Math.max(2, Math.floor((totalMb - RESERVED_MB) / PLANNED_RUN_MB));
}

/** Below this much free memory, no worker on the machine takes more work. */
export function defaultFloorMb(totalMb: number | undefined): number {
  return Math.max(128, Math.round((totalMb ?? 0) * 0.1));
}

/** Below this much, the largest script on the machine is stopped so the rest can go on. */
export function criticalMb(totalMb: number | undefined): number {
  return Math.max(64, Math.round((totalMb ?? 0) * 0.05));
}

/**
 * The name the machine's workers share, so the control plane can count what
 * runs on it: the Fly machine, or the host's name, with the boot, so a machine
 * that restarted does not inherit what its last life left running.
 */
export function machineName(): string {
  const base = process.env.FLY_MACHINE_ID ?? hostname();
  let boot = "";
  try {
    boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim().slice(0, 8);
  } catch {
    // No boot id: the name alone.
  }
  return (boot ? `${base}:${boot}` : base).slice(0, 120);
}

/** What a worker is told about its machine: `<name>|<slots>|<floor MB>`. */
export interface MachineShare {
  name: string;
  slots: number;
  floorMb: number;
}

export function formatMachine(share: MachineShare): string {
  return `${share.name}|${share.slots}|${share.floorMb}`;
}

export function parseMachine(value: string | undefined): MachineShare | undefined {
  if (!value) return undefined;
  const [name, slots, floorMb] = value.split("|");
  const parsedSlots = Number(slots);
  const parsedFloor = Number(floorMb);
  if (!name || !Number.isInteger(parsedSlots) || parsedSlots < 1) return undefined;
  return {
    name,
    slots: parsedSlots,
    floorMb: Number.isFinite(parsedFloor) && parsedFloor >= 0 ? parsedFloor : 0,
  };
}

/** The share for this machine, from what the operator set or from its memory. */
export function machineShare(
  options: { slots?: number; floorMb?: number },
  probe: MachineProbe = procProbe,
): MachineShare {
  const total = probe.memory()?.totalMb;
  return {
    name: machineName(),
    slots: options.slots ?? defaultSlots(total),
    floorMb: options.floorMb ?? defaultFloorMb(total),
  };
}

export type GuardLog = (
  level: "info" | "warn" | "error",
  message: string,
  fields?: Record<string, unknown>,
) => void;

/**
 * The last defence of a machine that runs scripts: when its free memory falls
 * below the critical line, the largest script process under this one is ended,
 * so the machine does not stall swapping its own code in and out. The worker
 * that started it reports the run as stopped for want of memory.
 */
export class MemoryGuard {
  readonly #probe: MachineProbe;
  readonly #log: GuardLog;
  readonly #criticalMb: number | undefined;
  #timer: NodeJS.Timeout | undefined;
  #quietUntil = 0;

  constructor(options: { probe?: MachineProbe; log?: GuardLog; criticalMb?: number } = {}) {
    this.#probe = options.probe ?? procProbe;
    this.#log = options.log ?? (() => {});
    this.#criticalMb = options.criticalMb;
  }

  start(intervalMs = 1000): void {
    if (this.#timer || this.#probe.memory() === undefined) return;
    this.#timer = setInterval(() => this.check(), intervalMs);
    this.#timer.unref();
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /** Looks once. Returns the process it ended, if it ended one. */
  check(root = process.pid, now = Date.now()): number | undefined {
    if (now < this.#quietUntil) return undefined;
    const memory = this.#probe.memory();
    if (!memory) return undefined;
    const critical = this.#criticalMb ?? criticalMb(memory.totalMb);
    if (memory.availableMb >= critical) return undefined;
    // Workers are this process's children; the scripts are theirs.
    let largest: { pid: number; mb: number } | undefined;
    for (const worker of this.#probe.children(root)) {
      for (const script of this.#probe.children(worker)) {
        const mb = this.#probe.rssMb(script) ?? 0;
        if (!largest || mb > largest.mb) largest = { pid: script, mb };
      }
    }
    if (!largest) return undefined;
    try {
      process.kill(largest.pid, "SIGKILL");
    } catch (error) {
      // Refused (EPERM) where a script is another user's and there is no CAP_KILL. Said once a minute.
      this.#quietUntil = now + 60_000;
      this.#log("error", "the machine is low on memory and a script cannot be stopped", {
        pid: largest.pid,
        error: (error as Error).message,
      });
      return undefined;
    }
    // Give the memory a moment to come back before judging again.
    this.#quietUntil = now + 3000;
    this.#log("warn", "the machine ran low on memory: stopped its largest script", {
      pid: largest.pid,
      scriptMb: Math.round(largest.mb),
      availableMb: Math.round(memory.availableMb),
    });
    return largest.pid;
  }
}
