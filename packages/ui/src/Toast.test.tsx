// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Button } from "./Button.tsx";
import { ToastProvider, type Toasts, useToast } from "./Toast.tsx";

afterEach(cleanup);

function Grab({ into }: { into: { toasts?: Toasts } }) {
  into.toasts = useToast();
  return null;
}
const mount = (navigate?: (href: string) => void) => {
  const into: { toasts?: Toasts } = {};
  render(
    <ToastProvider {...(navigate ? { navigate } : {})}>
      <Grab into={into} />
    </ToastProvider>,
  );
  return into.toasts as Toasts;
};

test("a toast names what was done, and links to the result through the app's router", () => {
  const navigate = vi.fn();
  const toasts = mount(navigate);
  act(() => {
    toasts.success("orders/sync is version 4.", {
      title: "Deployed",
      link: { label: "Open orders/sync", href: "/t/1/flows/orders/sync" },
    });
  });
  expect(screen.getByText("Deployed")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Open orders/sync" }));
  expect(navigate).toHaveBeenCalledWith("/t/1/flows/orders/sync");
  expect(screen.queryByText("Deployed")).toBeNull();
});

test("three are on screen at once; the next waits its turn", () => {
  const toasts = mount();
  act(() => {
    for (const n of [1, 2, 3, 4]) toasts.info(`Message ${n}`);
  });
  expect(screen.queryByText("Message 4")).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0] as HTMLElement);
  expect(screen.getByText("Message 4")).toBeTruthy();
});

test("Esc dismisses the message that has focus", () => {
  const toasts = mount();
  act(() => {
    toasts.danger("It could not be saved.");
  });
  const dismiss = screen.getByRole("button", { name: "Dismiss" });
  dismiss.focus();
  fireEvent.keyDown(dismiss, { key: "Escape" });
  expect(screen.queryByText("It could not be saved.")).toBeNull();
});

test("a loading button keeps its label, says it is busy, and cannot be pressed again", () => {
  const press = vi.fn();
  render(
    <Button loading onClick={press}>
      Save draft
    </Button>,
  );
  const button = screen.getByRole("button", { name: "Save draft" });
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(button.getAttribute("aria-disabled")).toBe("true");
  // It is not disabled, so the focus a person had on it stays (NARROW-3).
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  expect(press).not.toHaveBeenCalled();
});

test("WLK-12f: the messages' right edge keeps clear of a panel that says how much room it takes", () => {
  mount();
  const holder = document.querySelector<HTMLElement>(".layer-toast");
  expect(holder?.style.right).toBe("calc(1rem + var(--vx-toast-inset, 0px))");
});

test("p31 fc: a success is a status message a reader and a test can find, apart from any other status on the page", () => {
  const toasts = mount();
  act(() => {
    toasts.success("Saved.");
  });
  expect(screen.getByRole("status").textContent).toContain("Saved.");
  expect(screen.getByRole("status").closest("[aria-live=polite]")).not.toBeNull();
});
