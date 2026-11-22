// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { show } from "../../testing.tsx";
import { MarkdownEditor } from "./MarkdownEditor.tsx";

afterEach(cleanup);

function Host({
  start = "A line.\n",
  profile = "page",
  seen,
}: {
  start?: string;
  profile?: "page" | "docs";
  seen?: (text: string) => void;
}) {
  const [text, setText] = useState(start);
  return (
    <MarkdownEditor
      profile={profile}
      label="Text of Heading"
      value={text}
      onChange={(next) => {
        setText(next);
        seen?.(next);
      }}
      height="10rem"
      initialMode="source"
    />
  );
}

const box = () => screen.findByLabelText("Text of Heading") as Promise<HTMLTextAreaElement>;

describe("the Markdown editor", () => {
  test("has a source and a preview, one shown at a time, the preview drawn as readers see it", async () => {
    show(<Host start={":::alert[Careful]{type=warning}\nMind it.\n:::\n"} />);
    const source = await box();
    expect(source.value).toContain(":::alert[Careful]");
    const sourceMode = screen.getByRole("button", { name: "Source" });
    const previewMode = screen.getByRole("button", { name: "Preview" });
    expect(sourceMode.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(previewMode);
    expect(previewMode.getAttribute("aria-pressed")).toBe("true");
    const shown = screen.getByRole("region", { name: "Preview of the text" });
    const note = await screen.findByRole("note", { name: "Careful" });
    expect(shown.contains(note)).toBe(true);
  });

  test("inserts a component of the page's profile where the cursor is", async () => {
    const seen: string[] = [];
    show(<Host seen={(text) => seen.push(text)} />);
    const source = await box();
    source.focus();
    source.setSelectionRange(8, 8);
    fireEvent.select(source);
    fireEvent.click(screen.getByRole("button", { name: /^Insert/ }));
    const find = await screen.findByLabelText("Find a component");
    // A page's text has the callout, steps, tabs and folds, and not what only a documentation page has.
    fireEvent.change(find, { target: { value: "steps" } });
    expect(screen.getByRole("button", { name: /Steps/ })).toBeTruthy();
    fireEvent.change(find, { target: { value: "pages in this folder" } });
    expect(await screen.findByText("Nothing is called that.")).toBeTruthy();
    fireEvent.change(find, { target: { value: "callout" } });
    fireEvent.keyDown(find, { key: "Enter" });
    await waitFor(() => expect(source.value).toContain(":::alert[Title]{type=info}"));
    expect(seen.at(-1)).toContain(":::alert[Title]{type=info}");
  });

  test("a documentation page is offered the pages of its folder too", async () => {
    show(<Host profile="docs" />);
    await box();
    fireEvent.click(screen.getByRole("button", { name: /^Insert/ }));
    const find = await screen.findByLabelText("Find a component");
    fireEvent.change(find, { target: { value: "pages in this folder" } });
    expect(await screen.findByRole("button", { name: /Pages in this folder/ })).toBeTruthy();
  });

  test("the toolbar formats the selection, and a shortcut does the same", async () => {
    show(<Host start="words" />);
    const source = await box();
    source.focus();
    source.setSelectionRange(0, 5);
    fireEvent.select(source);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    await waitFor(() => expect(source.value).toBe("**words**"));
    source.setSelectionRange(2, 7);
    fireEvent.select(source);
    fireEvent.keyDown(source, { key: "i", ctrlKey: true });
    await waitFor(() => expect(source.value).toBe("**_words_**"));
  });
});
