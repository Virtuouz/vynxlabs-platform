// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { show } from "../../testing.tsx";
import { TextOnPage } from "./TextOnPage.tsx";

afterEach(cleanup);

const open = (text = "Hello.\n") => {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  show(
    <>
      <div data-widget-cell="w1" />
      <TextOnPage widget="w1" title="Heading" text={text} onDone={onDone} onCancel={onCancel} />
    </>,
  );
  return { onDone, onCancel };
};

describe("a Text widget written on the page", () => {
  test("opens over the widget with the editor, and Done gives what was written, once", async () => {
    const { onDone, onCancel } = open();
    expect(screen.getByRole("dialog", { name: "Edit Heading on the page" })).toBeTruthy();
    const box = (await screen.findByLabelText("Text of Heading")) as HTMLTextAreaElement;
    expect(box.value).toBe("Hello.\n");
    fireEvent.change(box, { target: { value: "Hello, there.\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("Hello, there.\n");
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("Esc, or Cancel, leaves text that was not changed", async () => {
    const { onDone, onCancel } = open();
    const box = await screen.findByLabelText("Text of Heading");
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onDone).not.toHaveBeenCalled();
  });

  test("Esc over typed text asks before it throws the text away", async () => {
    const { onDone, onCancel } = open();
    const box = await screen.findByLabelText("Text of Heading");
    fireEvent.change(box, { target: { value: "Changed.\n" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(await screen.findByText("Leave without keeping what you wrote?")).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep writing" }));
    expect(screen.queryByText("Leave without keeping what you wrote?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  test("shows the text as readers will see it", async () => {
    open(":::alert[Heads up]{type=warning}\nMind it.\n:::\n");
    await screen.findByLabelText("Text of Heading");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("note", { name: "Heads up" })).toBeTruthy();
  });
});
