# Fact-check record: develop/explanation/flows/webhook-address-and-key

Code as of branch `phase-31-write-the-docs`, 2026-11-23. Written by the page's writer. Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Address follows key or step name; deploy lists a breaking change | packages/manifest/src/flow.ts:176; kernel/execution/triggers.ts:285; deploy.ts:455-470 | second agent, 2026-11-23 | checked: labels matched against the console source |

## Second check, 2026-11-23

Checked by: second agent, 2026-11-23. Every label and quoted string was searched for in `apps/console/src` and the manifest source by script; the ones below were read in the code or run on the instance (http://localhost:8091, own workspace `flows-check` and own flows `flows-…`).

- Read against the editor's rename message and the deploy's breaking-change text; the key's behavior is as in the page's records.
