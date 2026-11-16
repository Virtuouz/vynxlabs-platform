import { readdirSync, readFileSync } from "node:fs";
import { hostname } from "node:os";

/**
 * What a machine can say about its memory and its processes, read from `/proc`.
 * Where there is no `/proc` (macOS in development), every answer is `undefined`
 * and the checks that use them are skipped.
 */
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

export const procProbe: MachineProbe = {
  memory() {
    try {
      const text = readFileSync("/proc/meminfo", "utf8");
      const totalMb = readNumber(text, "MemTotal");
      const availableMb = readNumber(text, "MemAvailable");
      return totalMb === undefined || availableMb === undefined
        ? undefined
        : { totalMb, availableMb };
    } catch {
      return undefined;
    }
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
    } catch {
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
