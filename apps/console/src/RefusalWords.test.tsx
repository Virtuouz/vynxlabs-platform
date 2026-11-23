// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { RefusalList } from "./kit/RefusalList.tsx";
import { inWords } from "./kit/refusalWords.ts";
import { manifestProblems } from "./screens/FlowEditor.tsx";

afterEach(cleanup);

test("WLK-15: a refused deploy names a step, not an address in the manifest", () => {
  render(
    <RefusalList
      errors={[
        { path: "orders/sync (flow)", message: "/body/nodes/mail no trigger leads to this node" },
        { path: "orders/sync (flow)", message: '/body/edges/1 there is no node "x"' },
      ]}
    />,
  );
  expect(document.body.textContent).not.toContain("/body/");
  expect(screen.getByText(/mail: no trigger leads to this node/)).toBeTruthy();
  expect(screen.getByText(/Connection 2: there is no node/)).toBeTruthy();
  expect(inWords("Nothing arrives.")).toBe("Nothing arrives.");
});

test("WLK-15: the editor's list names what a deploy would refuse, in the same words", () => {
  const nodes = {
    start: { type: "trigger", trigger: { type: "manual" } },
    a: { type: "set", values: {} },
    b: { type: "set", values: {} },
  } as never;
  const edges = [
    { from: "start", to: "a" },
    { from: "a", to: "b" },
    { from: "b", to: "a" },
  ];
  const found = manifestProblems(nodes, edges, []);
  expect(found.length).toBeGreaterThan(0);
  expect(found.every((one) => !one.message.includes("/body/"))).toBe(true);
  // A step the editor already names is not said twice.
  expect(
    manifestProblems(nodes, edges, [
      { message: "x", node: "a" },
      { message: "y", node: "b" },
    ]),
  ).toEqual([]);
});
