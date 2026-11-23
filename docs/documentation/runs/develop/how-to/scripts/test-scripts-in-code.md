# Run log: develop/how-to/scripts/test-scripts-in-code.md

- Commit `5ebf1c80`. No instance was used.
- The example script and test of the page were run with Vitest in `packages/sdk` as a temporary file (`src/zz-scripts-doc.test.ts`, deleted afterwards), importing `./index.js` and `./testing.js` for the page's `@volvel/sdk` and `@volvel/sdk/testing`. The test passed: output `{ count: 2, cents: 5000 }`; an input of the wrong type threw "The script's input does not match its schema"; a table with no stand-in threw 'The table "invoices" has no stand-in in this test…'.
- The `logs` assertion on the page (one info line with fields `clinic` and `count`) was not in that test; the SDK's own `testing.test.ts` asserts the same shape of record.
- `volvel run` was not run for this page; the statements come from `packages/cli/src/local.ts`.

## Not run
The page's test file as written, from a separate repository with the SDK installed; `volvel run`; the remote form.
