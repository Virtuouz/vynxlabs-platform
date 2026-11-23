# Run log: develop/how-to/apps/run-an-app-while-you-write-it.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin) in the Console at 1440 px, light theme, Playwright headless; the CLI is `packages/cli/dist/bin.js` built from the repository, with `VOLVEL_URL` and a key made for Maya. The scratch repository is outside the checkout, in the session's scratchpad; its dependencies are symlinks to the checkout's packages and Fernhill's `node_modules`, because the instance had no internet to install from.
- The workspace is my own, `apps-docs` (dev), in the Fernhill tenant. Nothing of Fernhill's was changed. No width other than 1440 and no dark theme was run.

## The steps as followed
- `volvel dev` with no name: "Say which app: board (interface), desk (files), guide (docs)." With `nope`: "This repository has no app at "nope". Its apps: board (interface), desk (files), guide (docs)." and the second line "volvel dev draws an app made of files, an interface and a docs site."
- `volvel dev desk ... --port 5181`: the three lines of output as on the page. The page loaded under the policy header (script-src with a nonce, connect-src with ws sources). A member signed in as Maya; a check-in through `runScript` added a row; `startFlow` and `useFlowRun` showed "Check-in succeeded".
- Port taken: starting on 5200 while 5200 was in use started on 5201. `--port 70000`: "--port is a whole number from 1 to 65535, not "70000"." `--no-strict` printed "The page is served without the platform's content policy (--no-strict), so it may do what a deployed app cannot."
- `volvel dev board` (interface): drawn with the CLI's own screens at first as a blank "Loading…" with the browser error "Cannot set properties of undefined (setting 'markup')": the screens the repository's `packages/cli/dist` carried were older than the instance's (`index-C7QICGrj.js` against `index-DW3vWMD9.js`). With `SCREENS_DIR` set to the instance's screens, the board drew the table with its three rows.
- `volvel dev guide` (docs): the page home, `/checking-in`, `/checking-in.md` (200, text/markdown, "# Checking in …"), `/_search?q=pet` (one result), the notice about what is not drawn. Appended a line to a page: the next request showed it. A syntax error in `src/index.ts` gave the problem page ("This app cannot be drawn yet", "src/index.ts:111: Unexpected ";"") with status 500, and the next request after the fix 200.
- Strict policy: a remote stylesheet in `index.html` was refused with the console text on the page. An inline `<script>` in `index.html` ran ("inline ran" became the title): Vite had put the run's nonce on it (see the report).
- Also seen: the console warning "contains an invalid source: 'ws://[::1]:*'".

## The page got wrong (and was corrected)
- The brief and the inventory said `volvel dev` serves code apps only; D64 is built, and the page covers all three kinds.

## Not run
- The page at 390 px, in dark, by keyboard (these are the developer's own pages).
- `volvel dev` against a production workspace.
