// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RetentionSettings } from "./screens/Retention.tsx";
import { answer, show } from "./testing.tsx";

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
  // Nothing differs, so there is nothing to save.
  expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();

  // Longer than now: nothing is removed, so nothing is asked.
  fireEvent.change(runs, { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent).toEqual([{ runsDays: 90 }]));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a shorter period asks first, naming each kind with its old and new days", async () => {
  show(<RetentionSettings base={base} />);
  fireEvent.change(await screen.findByLabelText(/Runs \(days\)/), { target: { value: "7" } });
  fireEvent.change(screen.getByLabelText(/Events \(days\)/), { target: { value: "60" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const said = await answer("Cancel");
  expect(said).toContain("Keep runs for less time?");
  expect(said).toContain("Runs: from 30 days to 7.");
  // Events get longer: they are not among what is shortened.
  expect(said).not.toContain("Events");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(sent).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await answer("Save and remove older history");
  await waitFor(() => expect(sent).toEqual([{ runsDays: 7, eventsDays: 60 }]));
});

test("emptying a field that is longer than the default asks too", async () => {
  show(<RetentionSettings base={base} />);
  const runs = (await screen.findByLabelText(/Runs \(days\)/)) as HTMLInputElement;
  fireEvent.change(runs, { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(sent).toEqual([{ runsDays: 90 }]));
  await waitFor(() => expect(runs.value).toBe("90"));
  fireEvent.change(runs, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await answer("Save and remove older history")).toContain("Runs: from 90 days to 30.");
  await waitFor(() => expect(sent).toEqual([{ runsDays: 90 }, { runsDays: null }]));
});

test("a period outside the bounds is refused before anything is sent", async () => {
  show(<RetentionSettings base={base} />);
  fireEvent.change(await screen.findByLabelText(/Audit log \(days\)/), {
    target: { value: "30" },
  });
  expect(screen.getByText("A whole number of days from 90 to 3650.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(sent).toEqual([]);
});

test("GOV-11: shortening the audit log says it also deletes the files that rows replaced or were deleted with", async () => {
  show(<RetentionSettings base={base} />);
  expect(await screen.findByText(/Files that rows replaced or were deleted with/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Audit log \(days\)/), { target: { value: "120" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const said = await answer("Cancel");
  expect(said).toContain("Audit log: from 400 days to 120.");
  expect(said).toContain("files that rows replaced, or were deleted with");
  // Another kind shortened does not say it.
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.change(screen.getByLabelText(/Audit log \(days\)/), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText(/Runs \(days\)/), { target: { value: "7" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await answer("Cancel")).not.toContain("files that rows replaced");
});
