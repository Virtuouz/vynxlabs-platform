import { machineName } from "@volvel/worker";
import { describe, expect, test } from "vitest";
import { machineShortOfMemory, noteStarted } from "./kernel/execution/workers.js";

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
    const machine = { name: "elsewhere-b", slots: 9, availableMb: 400, floorMb: 200 };
    expect(machineShortOfMemory(machine, probe(0), 0)).toBe(false);
    noteStarted(machine, 0);
    noteStarted(machine, 0);
    expect(machineShortOfMemory(machine, probe(0), 1)).toBe(false);
    noteStarted(machine, 0);
    // Three scripts planned at 96 MB each leave 112 MB of the 400: below the floor.
    expect(machineShortOfMemory(machine, probe(0), 1)).toBe(true);
    // Their memory shows by then, and the reading is believed again.
    expect(machineShortOfMemory(machine, probe(0), 3001)).toBe(false);
  });

  test("the control plane's own machine is read now, not taken from what the worker said", () => {
    const machine = { name: machineName(), slots: 9, availableMb: 1500, floorMb: 200 };
    expect(machineShortOfMemory(machine, probe(150), 0)).toBe(true);
    expect(machineShortOfMemory(machine, probe(900), 0)).toBe(false);
  });
});
