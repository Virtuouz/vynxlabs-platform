import { describe, expect, it, vi } from "vitest";
import { startStepLoops } from "./kernel/execution/background.js";

const quiet = { error: vi.fn(), warn: vi.fn() };

describe("background steps (HOST-07)", () => {
  it("a step that never ends does not stop the next one", async () => {
    let schedules = 0;
    const loops = startStepLoops(
      [
        ["health", () => new Promise(() => {})],
        ["schedules", async () => void schedules++],
      ],
      quiet,
      { intervalMs: 5, limitMs: 50 },
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
    await loops.stop();
    expect(schedules).toBeGreaterThan(5);
    expect(loops.late.health).toBe(1);
    expect(quiet.warn).toHaveBeenCalledWith(
      expect.objectContaining({ step: "health" }),
      expect.stringContaining("longer than its limit"),
    );
  });

  it("a step still going is not started a second time, and stop waits for it", async () => {
    let started = 0;
    let finished = false;
    const loops = startStepLoops(
      [
        [
          "slow",
          async () => {
            started++;
            await new Promise((resolve) => setTimeout(resolve, 60));
            finished = true;
          },
        ],
      ],
      quiet,
      { intervalMs: 5, limitMs: 1_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await loops.stop();
    expect(started).toBe(1);
    expect(finished).toBe(true);
  });
});
