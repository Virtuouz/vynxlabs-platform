// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { definitionProblems, WidgetRegistry } from "@volvel/widgets";
import { afterEach, expect, test } from "vitest";
import { labsPack } from "../views/index.ts";
import { LABS_WIDGETS, probe } from "./index.ts";

afterEach(cleanup);

test("the labs pack is a sound pack written against the contract alone", () => {
  expect(definitionProblems(probe)).toEqual([]);
  expect(new WidgetRegistry(LABS_WIDGETS).get("labs/probe")).toBe(probe);
  for (const definition of labsPack.definitions)
    expect(labsPack.views[definition.type]).toBeDefined();
});

test("its view draws its words", () => {
  const View = labsPack.views["labs/probe"] as NonNullable<(typeof labsPack.views)[string]>;
  render(
    <View
      config={{ words: "Hello" }}
      data={{}}
      size={{ w: 3, h: 1, narrow: false }}
      emit={() => {}}
      building={false}
    />,
  );
  expect(screen.getByText("Hello")).toBeTruthy();
});
