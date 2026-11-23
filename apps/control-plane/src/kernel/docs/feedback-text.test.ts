import { FEEDBACK_COLUMNS } from "@volvel/docs-engine";
import { appKind } from "@volvel/manifest";
import { expect, test } from "vitest";

test("DOC-06 the app kind's text names every column a deploy requires of the feedback table, and how", () => {
  const properties = (appKind.body as { properties: Record<string, { description?: string }> })
    .properties;
  const text = properties.feedback?.description ?? "";
  for (const [name, column] of Object.entries(FEEDBACK_COLUMNS)) {
    const said = new RegExp(
      `\`${name}\` \\(${column.type}${column.required ? ", (?:boolean, )?required" : ""}\\)`,
    );
    expect(text, name).toMatch(said);
  }
});
