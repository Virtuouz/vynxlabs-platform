import { machineName } from "@volvel/worker";
import { describe, expect, test } from "vitest";
import {
  machineFull,
  machineOf,
  machineShortOfMemory,
  machineStateSize,
  notePeak,
  noteScriptsSeen,
  noteStarted,
  noteWorkerStarted,
  onMachine,
  plannedStartMb,
  runEnded,
} from "./kernel/execution/workers.js";

/**
 * STR-02 of phase 35: at the top of an hour twelve tenants' schedules came due together, every
 * worker read the same free memory, and the scripts handed out on that one reading left the
 * machine 56 MB.
 */
describe("a machine is handed a script only where one more fits above its memory floor", () => {
  const probe = (availableMb: number) => ({
    memory: () => ({ totalMb: 2048, availableMb }),
    rssMb: () => undefined,
    children: () => [],
  });

  test("a machine that says nothing about its memory is not held back", () => {
    expect(machineShortOfMemory({ name: "elsewhere-a", slots: 4 })).toBe(false);
  });

  test("another machine is judged by what its worker said, less what was just handed to it", () => {
    const machine = { name: "elsewhere-b", slots: 9, availableMb: 600, floorMb: 200 };
    expect(machineShortOfMemory(machine, probe(0), 0)).toBe(false);
    noteStarted(machine, "run-1", 0);
    noteStarted(machine, "run-2", 0);
    expect(machineShortOfMemory(machine, probe(0), 1)).toBe(false);
    noteStarted(machine, "run-3", 0);
    // Three scripts planned at 160 MB each leave 120 MB of the 600: below the floor.
    expect(machineShortOfMemory(machine, probe(0), 1)).toBe(true);
    // One that ended holds nothing back: a script that returns at once does not slow the next.
    runEnded("run-3");
    expect(machineShortOfMemory(machine, probe(0), 2)).toBe(false);
    noteStarted(machine, "run-4", 2);
    expect(machineShortOfMemory(machine, probe(0), 3)).toBe(true);
    // By then their memory shows, and the reading is believed again.
    expect(machineShortOfMemory(machine, probe(0), 8003)).toBe(false);
  });

  test("a worker just started counts against the scripts handed to its machine", () => {
    const machine = { name: "elsewhere-c", slots: 9, availableMb: 400, floorMb: 200 };
    noteWorkerStarted(machine.name, 96, 0);
    noteWorkerStarted(machine.name, 96, 0);
    expect(machineShortOfMemory(machine, probe(0), 1)).toBe(false);
    noteWorkerStarted(machine.name, 96, 0);
    expect(machineShortOfMemory(machine, probe(0), 1)).toBe(true);
    expect(machineShortOfMemory(machine, probe(0), 10_001)).toBe(false);
  });

  test("the control plane's own machine is read now, not taken from what the worker said", () => {
    const machine = { name: machineName(), slots: 9, availableMb: 1500, floorMb: 200 };
    expect(machineShortOfMemory(machine, probe(150), 0)).toBe(true);
    expect(machineShortOfMemory(machine, probe(900), 0)).toBe(false);
  });

  test("a script seen before is planned at what it held, not at the flat figure", () => {
    expect(plannedStartMb("ws:never-seen")).toBe(160);
    notePeak("ws:sleeper", 52);
    expect(plannedStartMb("ws:sleeper")).toBe(65);
    // The most of its last four runs, so one light run does not hide a heavy one.
    notePeak("ws:sleeper", 200);
    notePeak("ws:sleeper", 50);
    expect(plannedStartMb("ws:sleeper")).toBe(250);
    for (let i = 0; i < 4; i += 1) notePeak("ws:sleeper", 50);
    expect(plannedStartMb("ws:sleeper")).toBe(63);
    // A worker cannot talk a script down to nothing, and nonsense is not kept.
    notePeak("ws:liar", 1);
    expect(plannedStartMb("ws:liar")).toBe(48);
    notePeak("ws:nonsense", Number.NaN);
    expect(plannedStartMb("ws:nonsense")).toBe(160);

    const machine = { name: "elsewhere-d", slots: 9, availableMb: 440, floorMb: 200 };
    for (let i = 0; i < 3; i += 1) noteStarted(machine, `seen-${i}`, 0, "ws:sleeper");
    // Three at 63 MB leave 251 of the 440: a flat 160 each would have stopped at one.
    expect(machineShortOfMemory(machine, probe(0), 1)).toBe(false);
    noteStarted(machine, "seen-3", 0, "ws:sleeper");
    expect(machineShortOfMemory(machine, probe(0), 1)).toBe(true);
  });

  test("a tenant found to have had its share does not take the machine's turn again until a run ends", async () => {
    const machine = { name: "elsewhere-e", slots: 9 };
    let asked = 0;
    const atShare = () =>
      onMachine(
        machine,
        async (_full, noteShare) => {
          asked += 1;
          noteShare();
          return undefined;
        },
        "tenant-a",
      );
    await atShare();
    await atShare();
    await atShare();
    expect(asked).toBe(1);
    // Another tenant on the machine is still asked.
    expect(machineFull(machine, "tenant-b")).toBe(false);
    expect(await onMachine(machine, async () => "job", "tenant-b")).toBe("job");
    // A run ended: a slot is free, and the tenant is asked again at once.
    runEnded("any-run");
    await atShare();
    expect(asked).toBe(2);
  });

  test("a script is counted for what it has yet to take of its plan, as its worker says what it holds", () => {
    const machine = { name: "elsewhere-f", slots: 9, availableMb: 700, floorMb: 200 };
    for (let i = 0; i < 4; i += 1) notePeak("ws:grower", 320);
    expect(plannedStartMb("ws:grower")).toBe(400);
    noteStarted(machine, "grow-1", 0, "ws:grower", "worker-1");
    // 700 less 400 planned leaves 300: one more of these does not fit, and is not started.
    expect(machineShortOfMemory({ ...machine, availableMb: 700 }, probe(0), 1)).toBe(false);
    noteStarted(machine, "grow-2", 0, "ws:grower", "worker-2");
    expect(machineShortOfMemory({ ...machine, availableMb: 700 }, probe(0), 1)).toBe(true);
    // Twenty seconds on they are still growing, and still counted: a timer had let them go.
    noteScriptsSeen("worker-1", [{ runId: "grow-1", rssMb: 150 }], 20_000);
    noteScriptsSeen("worker-2", [{ runId: "grow-2", rssMb: 150 }], 20_000);
    // 400 MB free now, and 250 MB of each plan still to come.
    expect(machineShortOfMemory({ ...machine, availableMb: 400 }, probe(0), 20_001)).toBe(true);
    // Grown to their plan, they hold nothing back: what they took shows in the free memory.
    noteScriptsSeen("worker-1", [{ runId: "grow-1", rssMb: 400 }], 30_000);
    noteScriptsSeen("worker-2", [{ runId: "grow-2", rssMb: 400 }], 30_000);
    expect(machineShortOfMemory({ ...machine, availableMb: 210 }, probe(0), 30_001)).toBe(false);
    runEnded("grow-1");
    runEnded("grow-2");
  });

  test("another worker cannot speak for a run, and a script that outgrows its plan raises the next one's", () => {
    const machine = { name: "elsewhere-g", slots: 9, availableMb: 500, floorMb: 200 };
    notePeak("ws:small", 60);
    expect(plannedStartMb("ws:small")).toBe(75);
    noteStarted(machine, "small-1", 0, "ws:small", "worker-1");
    noteScriptsSeen("worker-2", [{ runId: "small-1", rssMb: 75 }], 1);
    expect(machineShortOfMemory({ ...machine, availableMb: 270 }, probe(0), 2)).toBe(true);
    noteScriptsSeen("worker-1", [{ runId: "small-1", rssMb: 300 }], 3);
    expect(plannedStartMb("ws:small")).toBe(375);
    runEnded("small-1");
  });
});

describe("round two: what is kept for each machine does not grow with the names a tenant's worker makes up", () => {
  test("a worker that names a new machine in every claim keeps a few names, and what they held is let go", () => {
    const scope = {
      credentialId: "c",
      tenantId: "tenant-made-up-names",
      workspaceId: null,
      pool: null,
      managed: false,
    } as never;
    const names = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const machine = machineOf(scope, { name: `made-up-${i}`, slots: 2 });
      names.add(machine.name);
      noteStarted(machine, `run-names-${i}`, 0);
      runEnded(`run-names-${i}`);
    }
    // Per tenant, a few distinct names; the rest are one name of the tenant's own.
    expect(names.size).toBeLessThanOrEqual(40);
    // Entries with nothing held are not kept.
    noteStarted({ name: "after-a-minute", slots: 1 }, "run-late", 120_000);
    runEnded("run-late");
    expect(machineStateSize()).toBeLessThan(100);
  });
});
