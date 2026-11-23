import { expect, test } from "vitest";
import { exportChanged } from "./code-slices.js";

const built = (greeting: string, other = "1") => `import x from "y";
var helper = () => ${other};
var greet = {
  execute: async () => {
    return { greeting: "${greeting}" };
  }
};
var sneaky = { execute: async () => helper() };
export {
  greet,
  sneaky as quiet
};
`;

test("only the export whose own text changed is changed", () => {
  expect(exportChanged(built("Hello"), built("Hello"), "greet")).toBe(false);
  expect(exportChanged(built("Hello"), built("Hi"), "greet")).toBe(true);
  expect(exportChanged(built("Hello"), built("Hi"), "quiet")).toBe(false);
  expect(exportChanged("export const a = { x: 1 };\n", "export const a = { x: 2 };\n", "a")).toBe(
    true,
  );
});

test("an export that cannot be found counts as changed when the code differs", () => {
  expect(exportChanged("export default 1;\n", "export default 2;\n", "greet")).toBe(true);
});
