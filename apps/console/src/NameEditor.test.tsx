// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { NameEditor } from "./screens/docs/Docs.tsx";

afterEach(cleanup);

test("the naming field keeps Enter and Escape to itself, and lets every other key reach the shortcuts", () => {
  const heard: string[] = [];
  const cancel = vi.fn();
  render(
    // biome-ignore lint/a11y/noStaticElementInteractions: stands for the page's shortcuts
    <div onKeyDown={(event) => heard.push(event.key)}>
      <NameEditor
        initialTitle="Intro"
        initialName="intro"
        suffix=".md"
        titleLabel="Page title"
        onSubmit={async () => undefined}
        onCancel={cancel}
      />
    </div>,
  );
  const field = screen.getByLabelText("Page title");
  fireEvent.keyDown(field, { key: "F1" });
  fireEvent.keyDown(field, { key: "k", metaKey: true });
  fireEvent.keyDown(field, { key: "a" });
  expect(heard).toEqual(["F1", "k", "a"]);
  fireEvent.keyDown(field, { key: "Enter" });
  fireEvent.keyDown(field, { key: "ArrowDown" });
  fireEvent.keyDown(field, { key: "Escape" });
  expect(heard).toEqual(["F1", "k", "a"]);
  expect(cancel).toHaveBeenCalledTimes(1);
});
