// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { useBleeding, useBleedWhile } from "./workbench.ts";

afterEach(cleanup);

function Probe() {
  return <p>{useBleeding() ? "bleeding" : "page"}</p>;
}
function Editor({ on }: { on: boolean }) {
  useBleedWhile(on);
  return null;
}

test("a screen asks for the workbench frame only while it is being edited", () => {
  const shell = render(<Probe />);
  expect(shell.getByText("page")).toBeTruthy();
  const editor = render(<Editor on />);
  expect(shell.getByText("bleeding")).toBeTruthy();
  editor.rerender(<Editor on={false} />);
  expect(shell.getByText("page")).toBeTruthy();
  const again = render(<Editor on />);
  expect(shell.getByText("bleeding")).toBeTruthy();
  again.unmount();
  expect(shell.getByText("page")).toBeTruthy();
});
