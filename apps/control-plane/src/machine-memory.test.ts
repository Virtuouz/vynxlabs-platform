import { machineName } from "@volvel/worker";
import { describe, expect, test } from "vitest";
import {
  machineShortOfMemory,
  noteStarted,
  noteWorkerStarted,
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
});
