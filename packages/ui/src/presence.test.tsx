// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Dialog } from "./Dialog.tsx";
import { Appear, Closing } from "./presence.tsx";
import { SideSheet } from "./SideSheet.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * A sheet or dialog put on the page already open is first told it is shut:
 * what is born open skips its opening motion, and this is what gives it one.
 */
test("a sheet and a dialog born open are opened after they are on the page", () => {
  // The first frame draws nothing; the one after has the dialog.
  let first: number | undefined;
  function Watch({ children }: { children: React.ReactNode }) {
    first ??= document.querySelectorAll('[role="dialog"]').length;
    return <>{children}</>;
  }
  render(
    <Watch>
      <SideSheet open onClose={() => {}} title="A sheet">
        in the sheet
      </SideSheet>
      <Dialog open onClose={() => {}} title="A dialog">
        in the dialog
      </Dialog>
    </Watch>,
  );
  expect(first).toBe(0);
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
});

test("what is opened for a subject stays while it closes, still showing the subject", () => {
  const seen: [string, boolean][] = [];
  const show = (subject: string | undefined) => (
    <Closing subject={subject}>
      {(subject, open) => {
        seen.push([subject, open]);
        return <p>{subject}</p>;
      }}
    </Closing>
  );
  const { rerender } = render(show(undefined));
  expect(seen).toEqual([]);
  rerender(show("a role"));
  expect(seen.at(-1)).toEqual(["a role", true]);
  rerender(show(undefined));
  // Still there, told it is shut, with what it was about.
  expect(seen.at(-1)).toEqual(["a role", false]);
  expect(screen.getByText("a role")).toBeTruthy();
  act(() => void vi.advanceTimersByTime(300));
  expect(screen.queryByText("a role")).toBeNull();
});

test("a panel drawn by hand starts and ends with the styles that move it", () => {
  const { rerender, container } = render(<Appear open>steps</Appear>);
  const panel = () => container.querySelector("[data-drawer]");
  expect(panel()?.hasAttribute("data-starting-style")).toBe(true);
  rerender(<Appear open={false}>steps</Appear>);
  expect(panel()?.hasAttribute("data-ending-style")).toBe(true);
  act(() => void vi.advanceTimersByTime(300));
  expect(panel()).toBeNull();
});
