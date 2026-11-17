// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, expect, test } from "vitest";
import { Button, LogViewer, Notice, SelectField, TextField } from "./index.ts";

afterEach(cleanup);

/** Serious and critical violations inside `container`, as axe finds them. */
async function violations(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, {
    // happy-dom does not lay anything out, so colour and size rules cannot be judged here.
    rules: { "color-contrast": { enabled: false }, "target-size": { enabled: false } },
  });
  return result.violations
    .filter((one) => one.impact === "serious" || one.impact === "critical")
    .map((one) => `${one.id}: ${one.help}`);
}

test("the kit's fields, buttons, notices and log have no serious accessibility problems", async () => {
  const { container } = render(
    <main>
      <TextField name="name" label="Name" value="" onChange={() => {}} error="Give it a name." />
      <SelectField
        name="kind"
        label="Kind"
        value="a"
        onChange={() => {}}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />
      <Button>Save</Button>
      <Notice tone="danger">It could not be saved.</Notice>
      <LogViewer
        lines={[{ seq: 1, time: "2026-11-16T10:00:00Z", level: "info", message: "Started" }]}
      />
    </main>,
  );
  expect(await violations(container)).toEqual([]);
});
