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
import { NODE_TYPES } from "./nodeTypes.ts";

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
  allowSyntheticDefaultImports: true,
});
monaco.typescript.typescriptDefaults.addExtraLib(
  NODE_TYPES,
  "file:///node_modules/@types/node-subset/index.d.ts",
);
// The SDK's own declarations, as built, so the editor knows every export the SDK has.
const sdk = "file:///node_modules/@volvel/sdk";
const libraries: Record<string, string> = {
  "context.d.ts": contextTypes,
  "extensions.d.ts": extensionTypes,
  "http.d.ts": httpTypes,
  "index.d.ts": indexTypes,
  "oauth2.d.ts": oauth2Types,
  "smtp.d.ts": smtpTypes,
  "tables.d.ts": tableTypes,
  "package.json": '{"name":"@volvel/sdk","types":"./index.d.ts"}',
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

/** What a query can name, as the platform gives it: the tables a person may read, and the functions allowed. */
export interface SqlSchema {
  tables: {
    name: string;
    columns: {
      name: string;
      type: string;
      references: string | null;
      values?: { value: string }[];
    }[];
  }[];
  functions: string[];
}

let sqlSchema: SqlSchema = { tables: [], functions: [] };
let sqlRegistered = false;

/** A table's name as a query writes it: in double quotes when it is not a plain word. */
export const sqlName = (name: string) => (/^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name}"`);

const SQL_WORDS = [
  "select",
  "from",
  "where",
  "join",
  "left join",
  "inner join",
  "on",
  "group by",
  "order by",
  "having",
  "limit",
  "offset",
  "as",
  "and",
  "or",
  "not",
  "in",
  "is null",
  "is not null",
  "between",
  "like",
  "ilike",
  "case",
  "when",
  "then",
  "else",
  "end",
  "distinct",
  "with",
  "union all",
  "desc",
  "asc",
  "filter",
  "over",
  "partition by",
  "exists",
  "interval",
  "true",
  "false",
  "null",
];

/** The tables a query has named so far, by the name each goes by in the rest of it. */
function namedTables(text: string): Map<string, string> {
  const known = new Map<string, string>();
  const pattern =
    /\b(?:from|join)\s+("([^"]+)"|[a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi;
  for (const match of text.matchAll(pattern)) {
    const table = match[2] ?? (match[1] as string);
    const alias = match[3];
    const taken =
      alias &&
      !/^(on|where|join|left|inner|right|full|cross|group|order|limit|using)$/i.test(alias);
    known.set(taken ? (alias as string) : table, table);
  }
  return known;
}

/**
 * Tells the SQL editor what the workspace has, and makes it complete from it:
 * tables after FROM and JOIN, a table's columns after its name and a dot, a
 * join along a reference, an enum's values where its column is compared, and
 * the functions a query may call.
 */
export function setSqlSchema(schema: SqlSchema) {
  sqlSchema = schema;
  if (sqlRegistered) return;
  sqlRegistered = true;
  monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [".", " ", "'", '"'],
    provideCompletionItems(model, position, context) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const before = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: word.startColumn,
      });
      // A space opens the list only where a table comes next. Anywhere else it would be
      // in the way of every word typed.
      if (context.triggerCharacter === " " && !/\b(from|join)\s+$/i.test(before)) {
        return { suggestions: [] };
      }
      const whole = model.getValue();
      const named = namedTables(whole);
      const tableOf = (name: string) => sqlSchema.tables.find((table) => table.name === name);
      const Kind = monaco.languages.CompletionItemKind;
      const item = (
        label: string,
        kind: number,
        insertText: string,
        detail?: string,
        sortText?: string,
      ) => ({
        label,
        kind,
        insertText,
        range,
        ...(detail ? { detail } : {}),
        ...(sortText ? { sortText } : {}),
      });

      // After a name and a dot: that table's columns.
      const dotted = /("([^"]+)"|[a-z_][a-z0-9_]*)\.$/i.exec(before);
      if (dotted) {
        const name = dotted[2] ?? (dotted[1] as string);
        const table = tableOf(named.get(name) ?? name);
        return {
          suggestions: (table?.columns ?? []).map((column) =>
            item(column.name, Kind.Field, column.name, column.type),
          ),
        };
      }

      // Inside quotes after a comparison with an enum column: its values.
      const compared =
        /("([^"]+)"|[a-z_][a-z0-9_]*)\.?([a-z_][a-z0-9_]*)?\s*(?:=|<>|!=|in\s*\()\s*(?:'[^']*',\s*)*'[^']*$/i.exec(
          before,
        );
      if (compared) {
        const column = compared[3] ?? compared[2] ?? (compared[1] as string);
        const values = [...named.values()]
          .flatMap((name) => tableOf(name)?.columns ?? [])
          .find((one) => one.name === column && one.values)?.values;
        if (values) {
          return { suggestions: values.map((one) => item(one.value, Kind.EnumMember, one.value)) };
        }
      }

      // After FROM or JOIN: tables. After JOIN, the joins a reference gives come first.
      const afterJoin = /\bjoin\s+$/i.test(before);
      if (/\b(from|join)\s+$/i.test(before)) {
        const joins = afterJoin
          ? [...named.entries()].flatMap(([alias, name]) => {
              const here = tableOf(name);
              const outward = (here?.columns ?? [])
                .filter((column) => column.references)
                .map((column) => ({
                  to: column.references as string,
                  on: `${sqlName(alias)}.${column.name}`,
                  id: true,
                }));
              const inward = sqlSchema.tables.flatMap((other) =>
                other.columns
                  .filter((column) => column.references === name)
                  .map((column) => ({
                    to: other.name,
                    on: `${sqlName(alias)}.id`,
                    id: false,
                    by: column.name,
                  })),
              );
              return [
                ...outward.map((one) =>
                  item(
                    `${one.to} on ${one.on}`,
                    Kind.Reference,
                    `${sqlName(one.to)} on ${sqlName(one.to)}.id = ${one.on}`,
                    "Along a reference",
                    "0",
                  ),
                ),
                ...inward.map((one) =>
                  item(
                    `${one.to} on ${one.by}`,
                    Kind.Reference,
                    `${sqlName(one.to)} on ${sqlName(one.to)}.${one.by} = ${one.on}`,
                    "Rows that refer here",
                    "0",
                  ),
                ),
              ];
            })
          : [];
        return {
          suggestions: [
            ...joins,
            ...sqlSchema.tables.map((table) =>
              item(table.name, Kind.Struct, sqlName(table.name), "Table", "1"),
            ),
          ],
        };
      }

      // Anywhere else: the columns of the tables named, then tables, functions and words.
      const columns = [...named.entries()].flatMap(([alias, name]) =>
        (tableOf(name)?.columns ?? []).map((column) =>
          item(column.name, Kind.Field, column.name, `${alias} · ${column.type}`, "0"),
        ),
      );
      return {
        suggestions: [
          ...columns,
          ...sqlSchema.tables.map((table) =>
            item(table.name, Kind.Struct, sqlName(table.name), "Table", "1"),
          ),
          ...sqlSchema.functions
            .map((name) => item(name, Kind.Function, `${name}($0)`, "Function", "2"))
            .map((one) => ({
              ...one,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            })),
          ...SQL_WORDS.map((one) => item(one, Kind.Keyword, one, undefined, "3")),
        ],
      };
    },
  });
}

export { monaco };
