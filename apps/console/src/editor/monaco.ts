/**
 * Monaco, set up once. This module is large and is only ever loaded on demand,
 * by `CodeEditor`, so that the console's first script stays small.
 */
// The whole editor: the plain API module leaves out services its own features need.
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";
import contextTypes from "../../../../packages/sdk/dist/context.d.ts?raw";
import extensionTypes from "../../../../packages/sdk/dist/extensions.d.ts?raw";
import httpTypes from "../../../../packages/sdk/dist/http.d.ts?raw";
import tableTypes from "../../../../packages/sdk/dist/tables.d.ts?raw";

(globalThis as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === "typescript" || label === "javascript") return new TsWorker();
    if (label === "json") return new JsonWorker();
    return new EditorWorker();
  },
};

// What code written in the console may import: the SDK's types for what a script is given.
monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ESNext,
  module: monaco.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  strict: true,
  noEmit: true,
  allowNonTsExtensions: true,
  lib: ["es2023"],
});
const sdk = "file:///node_modules/@vynxlabs/sdk";
const libraries: Record<string, string> = {
  "context.d.ts": contextTypes,
  "extensions.d.ts": extensionTypes,
  "http.d.ts": httpTypes,
  "tables.d.ts": tableTypes,
  "index.d.ts":
    'export * from "./context.js";\nexport * from "./http.js";\nexport * from "./tables.js";\n' +
    'export * from "./extensions.js";\nexport declare const SDK_VERSION: string;\n',
  "package.json": '{"name":"@vynxlabs/sdk","types":"./index.d.ts"}',
};
for (const [name, content] of Object.entries(libraries)) {
  monaco.typescript.typescriptDefaults.addExtraLib(content, `${sdk}/${name}`);
}

/** The editor's colours, read from the kit's tokens so that it follows the theme and a tenant's branding. */
export function applyTheme() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(`--vx-${name}`).trim();
  const dark = style.colorScheme.includes("dark");
  monaco.editor.defineTheme("vx", {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": token("sunken"),
      "editor.foreground": token("ink"),
      "editorLineNumber.foreground": token("ink-muted"),
      "editorCursor.foreground": token("action"),
      "editor.lineHighlightBackground": token("surface"),
      "editorWidget.background": token("surface"),
      "editorWidget.border": token("line"),
      "editorGutter.background": token("sunken"),
    },
  });
  monaco.editor.setTheme("vx");
}

export { monaco };
