// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NewScheduleSheet, WhenFields } from "./screens/ScheduleForm.tsx";
import { show } from "./testing.tsx";

const root = "/tenants/t1/workspaces/w1";
const link = "/t/t1/workspaces/w1";
let sent: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  sent = [];
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal("fetch", async (address: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const url = address.replace("/api/v1", "");
    if (method !== "GET")
      sent.push({ method, url, body: JSON.parse((init.body as string) ?? "null") });
    const path = url.split("?")[0];
    const value =
      path === root
        ? { id: "w1", name: "Dev", type: "dev", timeZone: "Europe/Berlin" }
        : path === `${root}/scripts`
          ? { items: [{ path: "orders/sync", inputSchema: { type: "object" } }] }
          : path === `${root}/schedule-preview`
            ? { times: ["2026-11-17T08:00:00.000Z"] }
            : method === "PUT"
              ? { revision: 1 }
              : { items: [] };
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a schedule made from a script's page starts it, in the workspace's zone, in two presses", async () => {
  show(
    <NewScheduleSheet
      root={root}
      link={link}
      open
      onClose={() => {}}
      target={{ kind: "script", path: "orders/sync" }}
    />,
  );
  // The path and the script are filled in; the zone is the workspace's, and said so.
  expect((screen.getByLabelText("Path") as HTMLInputElement).value).toBe("orders/sync-schedule");
  expect(await screen.findByText("This workspace's zone.")).toBeTruthy();
  expect(await screen.findByText(/Next times, in Europe\/Berlin/)).toBeTruthy();
  const save = screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement;
  await waitFor(() => expect(save.disabled).toBe(false));
  fireEvent.click(save);
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({
    method: "PUT",
    url: `${root}/drafts/orders/sync-schedule`,
    body: {
      kind: "schedule",
      body: { script: "orders/sync", cron: "0 9 * * *", timezone: "Europe/Berlin" },
    },
  });
});

function Existing({ overlapDefault }: { overlapDefault: "allow" | "skip" }) {
  const [value, setValue] = useState<{
    cron?: string;
    timezone?: string;
    overlap?: "allow" | "skip";
  }>({
    cron: "0 2 * * *",
  });
  return (
    <>
      <WhenFields
        root={root}
        value={value}
        change={(next) => setValue((before) => ({ ...before, ...next }))}
        readOnly={false}
        overlapDefault={overlapDefault}
      />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}

test("a schedule that exists keeps its zone, and overlap follows its kind's own default", async () => {
  show(<Existing overlapDefault="skip" />);
  // Made before the workspace had a zone: it stays in UTC, and that is shown.
  expect(await screen.findByText(/Next times, in UTC/)).toBeTruthy();
  expect(await screen.findByText("This workspace's zone is Europe/Berlin.")).toBeTruthy();
  // A flow's schedule skips by default: the box is on, and turning it off says so.
  const overlap = screen.getByLabelText(/Skip a time/) as HTMLInputElement;
  expect(overlap.checked).toBe(true);
  fireEvent.click(overlap);
  expect(document.querySelector("output")?.textContent).toBe(
    JSON.stringify({ cron: "0 2 * * *", overlap: "allow" }),
  );
});
