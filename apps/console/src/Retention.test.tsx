// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RetentionSettings } from "./screens/Retention.tsx";
import { show } from "./testing.tsx";

const base = "/tenants/t1";
let sent: unknown[];

const policy = (runsDays: number | null) => ({
  runsDays,
  eventsDays: null,
  refusalsDays: null,
  auditDays: null,
  effective: { runsDays: runsDays ?? 30, eventsDays: 30, refusalsDays: 7, auditDays: 400 },
  defaults: { runsDays: 30, eventsDays: 30, refusalsDays: 7, auditDays: 400 },
  bounds: {
    runsDays: { min: 1, max: 3650 },
    eventsDays: { min: 1, max: 3650 },
    refusalsDays: { min: 1, max: 3650 },
    auditDays: { min: 90, max: 3650 },
  },
});

beforeEach(() => {
  sent = [];
  let current = policy(null);
  vi.stubGlobal("fetch", async (_address: string, init: RequestInit = {}) => {
    if (init.method === "PUT") {
      const body = JSON.parse(init.body as string);
      sent.push(body);
      current = policy(body.runsDays ?? null);
    }
    return Response.json(current);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("each kind shows the instance's default, and only what changed is sent", async () => {
  show(<RetentionSettings base={base} />);
  const runs = (await screen.findByLabelText(/Runs \(days\)/)) as HTMLInputElement;
  expect(runs.placeholder).toBe("30, the instance's default");
  expect(screen.getByText(/Now 400 days\./)).toBeTruthy();
  const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);

  fireEvent.change(runs, { target: { value: "90" } });
  fireEvent.click(save);
  await waitFor(() => expect(sent).toEqual([{ runsDays: 90 }]));
});

test("a period outside the bounds is refused before anything is sent", async () => {
  show(<RetentionSettings base={base} />);
  fireEvent.change(await screen.findByLabelText(/Audit log \(days\)/), {
    target: { value: "30" },
  });
  expect(screen.getByText("A whole number of days from 90 to 3650.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  expect(sent).toEqual([]);
});
