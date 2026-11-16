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
import indexTypes from "../../../../packages/sdk/dist/index.d.ts?raw";
import oauth2Types from "../../../../packages/sdk/dist/oauth2.d.ts?raw";
import smtpTypes from "../../../../packages/sdk/dist/smtp.d.ts?raw";
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
  // A script runs in Node, which has the globals a web worker has (fetch, URL, AbortSignal,
  // crypto…) and none of a page's (window, document).
  lib: ["es2023", "webworker"],
});
// The SDK's own declarations, as built, so the editor knows every export the SDK has.
const sdk = "file:///node_modules/@vynxlabs/sdk";
const libraries: Record<string, string> = {
  "context.d.ts": contextTypes,
  "extensions.d.ts": extensionTypes,
  "http.d.ts": httpTypes,
  "index.d.ts": indexTypes,
  "oauth2.d.ts": oauth2Types,
  "smtp.d.ts": smtpTypes,
  "tables.d.ts": tableTypes,
  "package.json": '{"name":"@vynxlabs/sdk","types":"./index.d.ts"}',
};
for (const [name, content] of Object.entries(libraries)) {
  monaco.typescript.typescriptDefaults.addExtraLib(content, `${sdk}/${name}`);
}

// The SDK hands scripts zod as `z`, so its types come too.
const zodRoot = "../../../../packages/sdk/node_modules/zod/";
const zodTypes = import.meta.glob<string>(
  [
    "../../../../packages/sdk/node_modules/zod/index.d.ts",
    "../../../../packages/sdk/node_modules/zod/v4/{classic,core,locales}/*.d.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);
for (const [file, content] of Object.entries(zodTypes)) {
  monaco.typescript.typescriptDefaults.addExtraLib(
    content,
    `file:///node_modules/zod/${file.slice(zodRoot.length)}`,
  );
}
monaco.typescript.typescriptDefaults.addExtraLib(
  '{"name":"zod","types":"./index.d.ts"}',
  "file:///node_modules/zod/package.json",
);

/** The editor's colors, read from the kit's tokens so that it follows the theme and a tenant's branding. */
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
