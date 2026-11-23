// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { notify } from "./ask.tsx";
import { OperatorMark, OperatorStrip, setOperatorAccess } from "./kit/OperatorStrip.tsx";
import { PageHeader } from "./kit/PageHeader.tsx";
import { loadPreferences, readPreference, resetPreferences } from "./prefs.ts";
import { show } from "./testing.tsx";

/**
 * The page's chrome (phase 16, P4-1): a list's description is shown on a
 * first visit and folded behind help after, and operator access is a strip
 * that can be hidden to a mark in the header and brought back.
 */

beforeEach(() => {
  localStorage.clear();
  resetPreferences();
  vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
});
afterEach(() => {
  cleanup();
  setOperatorAccess(null);
  vi.unstubAllGlobals();
});

const header = () => (
  <PageHeader title="Runs" description="Scripts and flows that ran here." helpKey="runs" oneRow />
);

test("a description shows on the first visit, and is behind help on the next", async () => {
  const first = show(header());
  expect(screen.getByText("Scripts and flows that ran here.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "About Runs" })).toBeNull();
  // Marked read at once, and still shown for the rest of this visit.
  expect(readPreference("seen:runs", false)).toBe(true);
  expect(screen.getByText("Scripts and flows that ran here.")).toBeTruthy();
  first.unmount();

  show(header());
  expect(screen.queryByText("Scripts and flows that ran here.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "About Runs" }));
  expect(await screen.findByText("Scripts and flows that ran here.")).toBeTruthy();
});

test("a description read in another browser is folded once the settings arrive, not shown again (P31)", async () => {
  // A new browser holds nothing; the server says the list was read. The page draws before the
  // settings arrive: the description is folded when they do, as on any later visit.
  let answer: (response: Response) => void = () => {};
  vi.stubGlobal("fetch", (address: string) =>
    String(address).endsWith("/me/preferences")
      ? new Promise<Response>((resolve) => {
          answer = resolve;
        })
      : Promise.resolve(new Response(null, { status: 204 })),
  );
  const loading = loadPreferences();
  show(header());
  await act(async () => {
    answer(Response.json({ items: [{ key: "seen:runs", value: true }] }));
    await loading;
  });
  expect(screen.queryByText("Scripts and flows that ran here.")).toBeNull();
  expect(screen.getByRole("button", { name: "About Runs" })).toBeTruthy();
});

test("operator access is a strip that hides to a mark, and comes back from it", async () => {
  const end = vi.fn(async () => {});
  show(
    <>
      <OperatorMark />
      <OperatorStrip />
    </>,
  );
  act(() =>
    setOperatorAccess({
      grant: {
        id: "g1",
        roleName: "tenant_admin",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        reason: "Ticket 1042",
      },
      end,
    }),
  );
  const strip = screen.getByRole("region", { name: "Operator access" });
  expect(strip.textContent).toContain("as tenant_admin until");
  expect(strip.textContent).toContain("Ticket 1042");
  fireEvent.click(screen.getByRole("button", { name: "End now" }));
  expect(end).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Hide" }));
  expect(screen.queryByRole("region", { name: "Operator access" })).toBeNull();
  const mark = screen.getByRole("button", { name: /Operator access as tenant_admin, ends in/ });
  fireEvent.click(mark);
  fireEvent.click(await screen.findByRole("menuitem", { name: "Show the notice" }));
  expect(await screen.findByRole("region", { name: "Operator access" })).toBeTruthy();
});

test("filters have a row of their own under the title and the description", () => {
  for (const oneRow of [true, false]) {
    const { unmount } = show(
      <PageHeader
        title="Audit log"
        description="Everything that changed here."
        helpKey="audit-m5"
        oneRow={oneRow}
        actions={<button type="button">CSV</button>}
        toolbar={
          <select aria-label="Area">
            <option>All</option>
          </select>
        }
      />,
    );
    const title = screen.getByRole("heading", { name: "Audit log" });
    const area = screen.getByRole("combobox", { name: "Area" });
    const sentence = screen.getByText("Everything that changed here.");
    const header = title.closest("header") as HTMLElement;
    const row = area.closest("[data-header-filters]") as HTMLElement;
    // A child of the header of its own, after the title and the description.
    expect(row.parentElement).toBe(header);
    expect(row.contains(title)).toBe(false);
    expect(title.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sentence.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    resetPreferences();
    localStorage.clear();
  }
});

test("ending operator access that fails says so, and the strip stays (INS-26)", async () => {
  const failure = vi.spyOn(notify, "error").mockImplementation(() => 0);
  const end = vi.fn(async () => {
    throw new Error("The grant could not be ended.");
  });
  show(<OperatorStrip />);
  act(() =>
    setOperatorAccess({
      grant: {
        id: "g1",
        roleName: "tenant_admin",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        reason: "Ticket 1042",
      },
      end,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "End now" }));
  await waitFor(() => expect(failure).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("region", { name: "Operator access" })).toBeTruthy();
});
