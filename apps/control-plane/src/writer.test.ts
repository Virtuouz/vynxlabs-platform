import { describe, expect, it, vi } from "vitest";
import { createWriter } from "./writer.js";

vi.mock("./kernel/bootstrap.js", () => ({ bootstrapAdmin: async () => {} }));
vi.mock("./kernel/execution/runs.js", () => ({ forgiveSilentRuns: async () => {} }));
vi.mock("./kernel/rekey.js", () => ({ rekeyIfRotating: async () => {} }));
vi.mock("./kernel/tenancy/clone.js", () => ({ failInterruptedClones: async () => {} }));

function setup(readOnly: () => boolean, queueMs = 0) {
  const stops: number[] = [];
  let begun = 0;
  const log = { warn: vi.fn(), error: vi.fn() };
  const writer = createWriter({
    database: {
      queue: {
        start: () => new Promise<void>((resolve) => setTimeout(resolve, queueMs)),
        stop: async () => {},
      },
      readOnly: async () => readOnly(),
    } as never,
    kernel: { log } as never,
    log,
    config: { managedWorkers: "false", limits: {}, port: 1 } as never,
    checkMs: 10,
    background: (() => {
      const id = ++begun;
      return { stop: async () => void stops.push(id) };
    }) as never,
  });
  return { writer, stops, begun: () => begun };
}

describe("writing and the watch (HOST-08, HOST-09)", () => {
  it("a slow start and the watch begin one background loop, not two", async () => {
    const { writer, begun } = setup(() => false, 80);
    const boot = writer.start({ atBoot: true });
    // The old code began its watch before boot was done: it called start again at 10 ms.
    writer.watch(() => false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    await boot;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(begun()).toBe(1);
    await writer.close();
  });

  it("stops when writes stop and starts again when they return, once each", async () => {
    let readOnly = false;
    const { writer, stops, begun } = setup(() => readOnly);
    await writer.start({ atBoot: true });
    writer.watch(() => false);
    readOnly = true;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(stops).toEqual([1]);
    readOnly = false;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(begun()).toBe(2);
    await writer.close();
    expect(stops).toEqual([1, 2]);
  });
});
