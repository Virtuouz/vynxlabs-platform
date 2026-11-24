// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ChoiceList } from "./kit/inspector/queryParts.tsx";

afterEach(cleanup);

test("w-data 2: a long hint gives way, so every row keeps its name", () => {
  render(
    <ChoiceList
      label="Where it reads from"
      value={undefined}
      onChange={() => {}}
      options={[
        {
          value: "vet",
          label: "Vet workload",
          hint: "A query over appointments joined to vets, grouped by week and clinic",
        },
      ]}
    />,
  );
  const name = screen.getByText("Vet workload");
  const hint = screen.getByText(/A query over appointments/);
  // The hint may not hold its full width (it shrinks and cuts with an ellipsis) and the name
  // keeps a share of the row, so neither pushes the other to nothing.
  expect(hint.className).not.toContain("shrink-0");
  expect(hint.className).toContain("truncate");
  expect(hint.className).toContain("max-w-[50%]");
  expect(name.className).toContain("min-w-[40%]");
  expect(hint.getAttribute("title")).toContain("grouped by week");
});

test("round 4: a name reads whole, wrapping where it must, and the row grows with it", () => {
  render(
    <ChoiceList
      label="Where it reads from"
      value={undefined}
      onChange={() => {}}
      options={[{ value: "t", label: "loans in library-loans-and-returns-archive" }]}
    />,
  );
  const name = screen.getByText("loans in library-loans-and-returns-archive");
  expect(name.className).not.toContain("truncate");
  expect(name.className).toContain("[overflow-wrap:anywhere]");
  expect(name.closest("label")?.className).toContain("min-h-9");
  expect(name.closest("label")?.className).not.toMatch(/(^| )h-9( |$)/);
});
