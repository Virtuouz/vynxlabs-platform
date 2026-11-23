# Fact-check record: develop/how-to/cli/run-a-script-on-the-instance.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `packages/cli/src` unless they start with `apps/`, `packages/`, `examples/` or `docs/`. Written by the writer; the second agent fills "Checked by" anew.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| `run <path> --remote` builds, uploads a preview bundle, posts `test-runs`, follows, prints `Output:`; text of the first line. | `cli/cli.ts:1113-1185`; run | writer, run on the instance 2026-11-23 | holds as run |
| A production workspace is refused: `... is a production workspace. A local build is tried in a dev workspace.` | `cli/cli.ts:1131-1135`; run | writer, run on the instance 2026-11-23 | holds as run |
| `There is no script or flow "x" in this build. It has: hello (script).`; `both a script and a flow` text. | `cli/cli.ts:1146-1166`; run for the first | writer, run on the instance 2026-11-23 | holds as run |
| Permissions: `run:write` on the route, `code:write` with the tenant's console-code switch, `flow_run:write` for a flow, `bundle:write` for the upload. | `apps/control-plane/src/routes/authoring.ts:1274-1290,1355-1380`; `routes/execution.ts:558` (bundles); `routes/authoring.ts:210-227` | writer, read from the code 2026-11-23 (not run) | holds as read |
| 403 `console_code_off` and its text; the switch is **Code in the console** on the Repository page. | `routes/authoring.ts:220-226`; `apps/console/src/screens/Git.tsx:280-296` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `volvel runs` lists 20 runs, flow runs among them, `--script` leaves flows out; columns. | `cli/cli.ts:992-1058`; run | writer, run on the instance 2026-11-23 | holds as run |
| `volvel runs <id>` prints script, status, attempt, bundle version, input, output, log lines. | `cli/cli.ts:1060-1080`; run | writer, run on the instance 2026-11-23 | holds as run |
| `logs` without `-f` exits 0 even when the run has not ended; with `-f` follows; Ctrl+C prints `Stopped following...` and exits 130. | `cli/follow.ts:157,272,335,348-351`; `cli/cli.ts:1082-1110`; the `-f` of an ended run run | writer, run on the instance 2026-11-23 | holds as run |
| Exit codes 0, 1, 3 for succeeded, failed, canceled. | `cli/follow.ts:157` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `runs cancel` flags and output texts. | `cli/cli.ts:951-990` | writer, read from the code 2026-11-23 (not run) | holds as read |
| Preview bundles are removed after 7 days unless deployed or uploaded. | `apps/control-plane/src/kernel/execution/bundles.ts:194-210` | writer, read from the code 2026-11-23 (not run) | holds as read |
| `The API key was not accepted.` | `cli/cli.ts:136-139` | writer, read from the code 2026-11-23 (not run) | holds as read |
