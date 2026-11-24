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

test("R-last: a state is never cut: one word keeps its width, a longer label wraps at its spaces", () => {
  const { container } = render(
    <>
      <StatePill state="allowed" />
      <StatePill state="waiting_approval" />
    </>,
  );
  const [one, many] = [...container.querySelectorAll("[data-label]")];
  expect(one?.textContent).toBe("Allowed");
  expect(one?.className).toContain("whitespace-nowrap");
  expect(many?.className).not.toContain("whitespace-nowrap");
  for (const label of [one, many]) {
    expect(label?.className).not.toContain("truncate");
    expect(label?.className).toContain("break-words");
  }
});

test("round 4 and 5: a status is never cut, whatever its label or its detail", () => {
  const { container } = render(
    <>
      <StatePill state="ok">Reached</StatePill>
      <StatePill state="failed" detail="tested 3 days ago">
        Failed
      </StatePill>
      <StatePill state="unbound" detail="last seen 3 days ago">
        No worker online
      </StatePill>
      <StatePill state="ok" detail="40 ms · tested 3 days ago">
        Reached
      </StatePill>
    </>,
  );
  // Nothing in a pill is truncated or clipped: a label that is too long wraps, and the detail
  // wraps under the label, so a narrow cell shows all of it ("Reached" / "4…", "No worker o…").
  for (const part of container.querySelectorAll<HTMLElement>("[data-label], [data-detail]")) {
    expect(part.className, part.textContent ?? "").not.toMatch(
      /truncate|overflow-hidden|text-ellipsis/,
    );
    expect(part.className).toContain("min-w-0");
  }
  const pills = [...container.querySelectorAll<HTMLElement>("[data-state-pill]")];
  for (const pill of pills) expect(pill.className).toContain("flex-wrap");
  const labels = [...container.querySelectorAll<HTMLElement>("[data-label]")];
  expect(labels[0]?.className).toContain("whitespace-nowrap");
  expect(labels[2]?.className).not.toContain("whitespace-nowrap");
  expect(container.querySelectorAll("[data-detail]")).toHaveLength(3);
});
