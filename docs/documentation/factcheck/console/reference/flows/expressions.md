# Fact-check record: console/reference/flows/expressions

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Gives line 400 ms, 160 chars | apps/console/src/screens/ExpressionField.tsx:7,9 | second agent, 2026-11-23 | checked: labels matched against the console source |

| Variables, limits, gotchas | packages/docs/generated/develop/reference/flows/expressions.md (generated from the code); packages/manifest/src/flow.ts:191-200 | second agent, 2026-11-23 | checked: labels matched against the console source |
| Gives line after 400 ms, cut at 160 | apps/console/src/screens/ExpressionField.tsx:7,9 | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- "Gives " (ExpressionField.tsx:136) and "Run a test to see its value." (routes/flows.ts:382) exist; limits as in kernel/flows/expressions.ts:29 (2000 nodes is the parser's, the 2000 characters is the schema's).
