import { describe, expect, it } from "vitest";
import {
  canSignalOtherUsers,
  defaultFloorMb,
  defaultSlots,
  formatMachine,
  type MachineProbe,
  MemoryGuard,
  memoryOf,
  parseMachine,
} from "./machine.js";

describe("a machine's share", () => {
  it("gives a run slot per 160 MB past the first 512, and never fewer than two", () => {
    expect(defaultSlots(512)).toBe(2);
    expect(defaultSlots(1024)).toBe(3);
    expect(defaultSlots(2048)).toBe(9);
    expect(defaultSlots(8192)).toBe(48);
  });

  it("keeps a tenth of memory free, and at least 128 MB", () => {
    expect(defaultFloorMb(512)).toBe(128);
    expect(defaultFloorMb(4096)).toBe(410);
  });

  it("is handed to workers and read back as it was", () => {
    const share = { name: "abc:1234", slots: 9, floorMb: 205 };
    expect(parseMachine(formatMachine(share))).toEqual(share);
    expect(parseMachine("abc|0|10")).toBeUndefined();
    expect(parseMachine(undefined)).toBeUndefined();
  });
});

describe("the memory guard", () => {
  /** Workers 10 and 20 under this process, each with scripts of the given sizes. */
  const machine = (availableMb: number): MachineProbe => ({
    memory: () => ({ totalMb: 2048, availableMb }),
    rssMb: (pid) => ({ 11: 50, 12: 400, 21: 120 })[pid],
    children: (pid) => ({ 1: [10, 20], 10: [11, 12], 20: [21] })[pid] ?? [],
  });

  it("does nothing while the machine has memory", () => {
    expect(new MemoryGuard({ probe: machine(500) }).check(1)).toBeUndefined();
  });

  it("stops the largest script when memory runs low, then waits before judging again", () => {
    const killed: number[] = [];
    const real = process.kill;
    process.kill = ((pid: number) => {
      killed.push(pid);
      return true;
    }) as typeof process.kill;
    try {
      const guard = new MemoryGuard({ probe: machine(40) });
      expect(guard.check(1, 1000)).toBe(12);
      expect(guard.check(1, 2000)).toBeUndefined();
      expect(guard.check(1, 5000)).toBe(12);
    } finally {
      process.kill = real;
    }
    expect(killed).toEqual([12, 12]);
  });

  it("says when it cannot end a script, and does not try again at once (HOST-04)", () => {
    const real = process.kill;
    let tries = 0;
    process.kill = (() => {
      tries += 1;
      throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
    }) as typeof process.kill;
    const said: string[] = [];
    try {
      const guard = new MemoryGuard({
        probe: machine(40),
        log: (_level, message) => said.push(message),
      });
      expect(guard.check(1, 1000)).toBeUndefined();
      expect(guard.check(1, 2000)).toBeUndefined();
    } finally {
      process.kill = real;
    }
    expect(tries).toBe(1);
    expect(said).toEqual(["the machine is low on memory and a script cannot be stopped"]);
  });
});

describe("whether a process may signal other users' processes", () => {
  it("is root with CAP_KILL, as compose's capabilities leave it", () => {
    // CapEff with only SETUID, SETGID, CHOWN, DAC_OVERRIDE, NET_ADMIN (compose before KILL).
    const without = "Name:\tnode\nCapEff:\t0000000000001cc1\n";
    // The same with bit 5 (KILL) added.
    const withKill = "Name:\tnode\nCapEff:\t0000000000001ce1\n";
    expect(canSignalOtherUsers(0, without)).toBe(false);
    expect(canSignalOtherUsers(0, withKill)).toBe(true);
    expect(canSignalOtherUsers(1000, withKill)).toBe(false);
  });
});

describe("memory as a container has it (HOST-24)", () => {
  const meminfo = "MemTotal: 16339968 kB\nMemAvailable: 12000000 kB\n";
  const files = (extra: Record<string, string>) => (path: string) =>
    path === "/proc/meminfo" ? meminfo : extra[path];

  it("is the machine's when nothing holds the container", () => {
    const total = 16339968 / 1024;
    expect(memoryOf(files({}))?.totalMb).toBeCloseTo(total);
    expect(memoryOf(files({ "/sys/fs/cgroup/memory.max": "max\n" }))?.totalMb).toBeCloseTo(total);
    expect(memoryOf(() => undefined)).toBeUndefined();
  });

  it("is the limit of a container held to 1 GB, less what it holds (cgroup v2)", () => {
    const memory = memoryOf(
      files({
        "/sys/fs/cgroup/memory.max": `${1024 * 1024 * 1024}\n`,
        "/sys/fs/cgroup/memory.current": `${300 * 1024 * 1024}\n`,
        "/sys/fs/cgroup/memory.stat": `anon 1\ninactive_file ${100 * 1024 * 1024}\n`,
      }),
    );
    expect(memory?.totalMb).toBe(1024);
    expect(memory?.availableMb).toBe(824);
    // Slots and the floor follow it: three, not ninety-six.
    expect(defaultSlots(memory?.totalMb ?? 0)).toBe(3);
  });

  it("reads the older cgroup layout, and ignores a limit as large as the machine", () => {
    const old = memoryOf(
      files({
        "/sys/fs/cgroup/memory/memory.limit_in_bytes": `${2048 * 1024 * 1024}`,
        "/sys/fs/cgroup/memory/memory.usage_in_bytes": `${512 * 1024 * 1024}`,
      }),
    );
    expect(old?.totalMb).toBe(2048);
    expect(old?.availableMb).toBe(1536);
    const unlimited = memoryOf(
      files({ "/sys/fs/cgroup/memory/memory.limit_in_bytes": "9223372036854771712" }),
    );
    expect(unlimited?.totalMb).toBeCloseTo(16339968 / 1024);
  });
});
