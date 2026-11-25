// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { CodeEditor, type CodeEditorHandle, TabHint } from "./CodeEditor.tsx";

afterEach(cleanup);

test("p31 fc: the editor says how to leave it with the keyboard, while it has focus", () => {
  const { container } = render(<TabHint />);
  const hint = container.querySelector("[data-tab-hint]");
  expect(hint?.textContent).toContain("Ctrl+M");
  expect(hint?.className).toContain("focus-within");
});

// A stand-in for Monaco, with only what the editor component touches, so that the path a real
// browser takes can be run: the unit tests otherwise use the plain text box.
const fake = vi.hoisted(() => {
  const state = { focused: 0 };
  const model = {
    text: "",
    getValue() {
      return this.text;
    },
    setValue(next: string) {
      this.text = next;
    },
    getPositionAt: () => ({ lineNumber: 1, column: 1 }),
    getOffsetAt: () => 0,
    getLineCount: () => 1,
    getLineMaxColumn: () => 1,
    getLineContent: () => "",
    canUndo: () => false,
    canRedo: () => false,
    pushStackElement() {},
    pushEditOperations(_s: unknown, ops: { text: string }[]) {
      this.text = ops[0]?.text ?? "";
    },
    dispose() {},
  };
  const none = { dispose() {} };
  const created = {
    focus() {
      state.focused++;
    },
    hasTextFocus: () => false,
    getValue: () => model.text,
    setValue: (t: string) => model.setValue(t),
    updateOptions() {},
    addCommand() {},
    getSelections: () => [],
    getSelection: () => null,
    onDidChangeCursorPosition: () => none,
    onDidChangeModelContent: () => none,
    createDecorationsCollection: () => ({ set() {}, clear() {} }),
    dispose() {},
  };
  const monaco = {
    Uri: { parse: (s: string) => ({ toString: () => s }) },
    KeyMod: { CtrlCmd: 1 },
    KeyCode: { Enter: 1, KeyS: 2, KeyK: 3, F1: 4 },
    Range: class {},
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
    languages: { registerFoldingRangeProvider: () => none },
    editor: {
      getModel: () => null,
      createModel: (text: string) => {
        model.text = text;
        return model;
      },
      create: () => created,
      onDidChangeMarkers: () => none,
      getModelMarkers: () => [],
      setModelMarkers() {},
    },
  };
  return { state, monaco };
});
vi.mock("./monaco.ts", () => ({
  monaco: fake.monaco,
  applyTheme: () => {},
  setEnvTypes: () => {},
}));

test("a change made from a field beside the editor does not take the focus from the field", async () => {
  (globalThis as { __VOLVEL_PLAIN_EDITOR__?: boolean }).__VOLVEL_PLAIN_EDITOR__ = false;
  try {
    const handle: RefObject<CodeEditorHandle | null> = { current: null };
    const { getByLabelText, getByRole } = render(
      <>
        <input aria-label="Title" />
        <button type="button">Bold</button>
        <CodeEditor label="Source" value="a" language="markdown" path="p.md" handle={handle} />
      </>,
    );
    await waitFor(() => expect(handle.current).not.toBeNull());
    const field = getByLabelText("Title");
    field.focus();
    handle.current?.apply("ab");
    handle.current?.apply("abc");
    expect(document.activeElement).toBe(field);
    expect(fake.state.focused).toBe(0);
    // A toolbar button is not a place to type: the editor takes the focus back for it.
    getByRole("button", { name: "Bold" }).focus();
    handle.current?.apply("abcd");
    expect(fake.state.focused).toBe(1);
  } finally {
    (globalThis as { __VOLVEL_PLAIN_EDITOR__?: boolean }).__VOLVEL_PLAIN_EDITOR__ = true;
  }
});
