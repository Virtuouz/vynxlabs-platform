// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { lookUp, STATE_NAMES, StatePill } from "./status.tsx";

afterEach(cleanup);

/** Each state's word, the name of its icon, and its tone. */
const EXPECTED: [state: string, word: string, icon: string, tone: string][] = [
  ["queued", "Queued", "Clock", "text-ink-muted"],
  ["running", "Running", "LoaderCircle", "text-action"],
  ["waiting_approval", "Waiting for approval", "UserRoundCheck", "text-attention"],
  ["waiting_time", "Waiting", "Hourglass", "text-attention"],
  ["succeeded", "Succeeded", "CircleCheck", "text-success"],
  ["failed", "Failed", "CircleX", "text-danger"],
  ["canceled", "Canceled", "CircleSlash", "text-ink-muted"],
  ["skipped", "Skipped", "CircleDashed", "text-ink-subtle"],
  ["draft", "Draft", "PencilLine", "text-action"],
  ["deployed", "Deployed", "CircleCheck", "text-success"],
  ["active", "Active", "CircleCheck", "text-success"],
  ["invited", "Invited", "Mail", "text-attention"],
  ["suspended", "Suspended", "CirclePause", "text-attention"],
  ["revoked", "Revoked", "Ban", "text-danger"],
  ["expired", "Expired", "Clock", "text-ink-subtle"],
  ["unchecked", "Not tested", "CircleDashed", "text-ink-subtle"],
  ["bound", "Set up here", "CircleCheck", "text-success"],
  ["unbound", "Not set up here", "Unlink", "text-attention"],
  ["on", "On", "ToggleRight", "text-success"],
  ["off", "Off", "CircleOff", "text-ink-subtle"],
];

test.each(EXPECTED)("%s reads %s, with %s, in %s", (state, word, icon, tone) => {
  const [label, Icon, toneClass] = lookUp(state);
  expect(label).toBe(word);
  expect((Icon as { displayName?: string }).displayName).toBe(icon);
  expect(toneClass).toBe(tone);
});

test("canceled and skipped are told apart by more than their word", () => {
  expect(lookUp("canceled")[1]).not.toBe(lookUp("skipped")[1]);
});

test("every state has a word, and no two run states share an icon and a tone", () => {
  for (const state of STATE_NAMES) expect(lookUp(state)[0]).not.toBe("");
  const runs = [
    "queued",
    "running",
    "waiting_approval",
    "waiting_time",
    "succeeded",
    "failed",
    "canceled",
    "skipped",
  ];
  const marks = runs.map(
    (state) => `${(lookUp(state)[1] as { displayName?: string }).displayName}:${lookUp(state)[2]}`,
  );
  expect(new Set(marks).size).toBe(runs.length);
});

test("a state the console does not know is shown as the server wrote it", () => {
  render(<StatePill state="timed_out" />);
  expect(screen.getByText("timed_out")).toBeTruthy();
});

test("a run waiting for a time says until when", () => {
  render(<StatePill state="waiting_time" until="2026-11-16T15:30:00Z" />);
  expect(screen.getByText(/^Waiting until /)).toBeTruthy();
});

test("NARROW-1: a state never grows past its cell, and a health cell has no minimum width of its own", async () => {
  const { HealthCell } = await import("./health.tsx");
  const { container } = render(
    <>
      <StatePill state="waiting_approval" />
      <HealthCell
        health={{ ok: true, problem: null, latencyMs: 4, checkedAt: new Date().toISOString() }}
      />
    </>,
  );
  expect(container.querySelector("span.inline-flex")?.className).toContain("max-w-full");
  expect(container.querySelector("[data-health]")?.className).not.toContain("min-w-[");
});

test("R-last: a state of one word is not cut to a letter in a narrow row; a longer one still shortens", () => {
  const { container } = render(
    <>
      <StatePill state="allowed" />
      <StatePill state="waiting_approval" />
    </>,
  );
  const [one, many] = [...container.querySelectorAll("[data-cut]")];
  expect(one?.textContent).toBe("Allowed");
  expect(one?.className).toContain("whitespace-nowrap");
  expect(one?.className).not.toContain("truncate");
  expect(one?.parentElement?.className).not.toContain("min-w-0");
  expect(many?.className).toContain("truncate");
});

test("round 4: a status given as one word of text, with or without a detail, is never cut", () => {
  const { container } = render(
    <>
      <StatePill state="ok">Reached</StatePill>
      <StatePill state="failed" detail="tested 3 days ago">
        Failed
      </StatePill>
    </>,
  );
  const cuts = [...container.querySelectorAll("[data-cut]")] as HTMLElement[];
  for (const label of [cuts[0], cuts[1]]) {
    expect(label?.className).toContain("whitespace-nowrap");
    expect(label?.className).toContain("shrink-0");
    expect(label?.className).not.toContain("truncate");
  }
  // The detail is what gives way.
  expect(cuts[2]?.textContent).toBe("tested 3 days ago");
  expect(cuts[2]?.className).toContain("truncate");
  expect(cuts[1]?.parentElement?.className).toContain("min-w-0");
});
