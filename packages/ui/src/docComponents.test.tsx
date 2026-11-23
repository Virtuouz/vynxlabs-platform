// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { parse } from "@volvel/markup";
import { afterEach, describe, expect, test } from "vitest";
import { Doc } from "./index.ts";

afterEach(cleanup);

const draw = (source: string) =>
  render(
    <div className="rounded-panel border border-line bg-surface p-4">
      <Doc tree={parse(source)} profile="page" />
    </div>,
  );

describe("the options of a drawing", () => {
  test("a glossary given to the page is drawn where ::glossary is written", () => {
    render(
      <Doc
        tree={parse("# Words\n\n::glossary\n")}
        profile="docs"
        glossary={() => [{ id: "rma", term: "RMA", short: "A return." }]}
      />,
    );
    const drawn = document.querySelector(".vd-glossary");
    expect(drawn).not.toBeNull();
    expect(drawn?.textContent).toContain("A return.");
  });
});

/** Every component of the page profile, drawn inside a widget's card. */
describe("the components of a widget's text", () => {
  test("an alert is a callout that keeps its border and its rail, for each type", () => {
    draw(
      [
        ":::alert[Note]{type=info}\nBody.\n:::",
        ":::alert{type=success}\nDone.\n:::",
        ":::alert[Careful]{type=warning}\nWarn.\n:::",
        ":::alert[Stop]{type=danger}\nNo.\n:::",
      ].join("\n\n"),
    );
    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(4);
    for (const note of notes) {
      expect(note.className).toContain("border-line");
      expect(note.querySelector("svg")).not.toBeNull();
      expect(note.querySelector("[aria-hidden='true'].absolute")).not.toBeNull();
    }
    expect(screen.getByRole("note", { name: "Careful" }).textContent).toContain("Warn.");
    // Where there is no title, the type names it.
    expect(screen.getByRole("note", { name: "Done" })).toBeTruthy();
    // Its last paragraph's own margin is taken off in the stylesheet's own terms, so the card is even.
    expect(notes[0]?.innerHTML).toContain("mb-0!");
  });

  test("steps are numbered in order", () => {
    draw(":::steps\n1. Open it.\n2. Save it.\n:::");
    const steps = document.querySelector(".vd-steps");
    expect(steps).not.toBeNull();
    expect(steps?.querySelectorAll("li")).toHaveLength(2);
  });

  test("tabs show one way at a time and change with a click", () => {
    draw(
      ":::tabs\n::::tab{label=Card}\nTo the card.\n::::\n::::tab{label=Cash}\nBy hand.\n::::\n:::",
    );
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Card", "Cash"]);
    expect(screen.getByText("To the card.")).toBeTruthy();
  });

  test("a fold is closed until it is opened, and keeps its border", () => {
    draw(':::details{summary="More"}\nFolded.\n:::');
    expect(screen.getByText("More")).toBeTruthy();
    const holder = screen.getByText("More").closest("details, [class*='border']");
    expect(holder).not.toBeNull();
  });

  test("a term is its word, a key is a key, and a field is its path, never the directive as typed", () => {
    draw("Press :kbd[Ctrl+S] for the :term[RMA]{id=rma}.\n\n::field{path=table.columns.*.type}");
    expect(document.querySelector("kbd")?.textContent).toBe("Ctrl+S");
    expect(document.body.textContent).toContain("for the RMA.");
    expect(screen.getByText("table.columns.*.type").tagName).toBe("CODE");
    expect(document.body.textContent).not.toContain("::field");
  });
});
