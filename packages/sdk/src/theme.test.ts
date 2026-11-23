import { expect, test } from "vitest";
import { defineTheme, THEME_TOKENS } from "./index.js";

test("EXT-15: every token the manifest accepts can be set, as a type and as a value", () => {
  // Fails to compile when `ThemeToken` lacks one of these.
  const theme = defineTheme({
    tokens: { focus: "#000", "line-strong": "#111", raised: "#fff", "code-bg": "#eee" },
    dark: { structure: "#222", selected: "#333", "line-control": "#444", "ink-subtle": "#555" },
  });
  expect(theme.kind).toBe("theme");
  expect(THEME_TOKENS).toHaveLength(27);
});
