# Fact-check record: console/reference/screens/build/app-builder

Code as of commit `5ebf1c80` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Items marked "run" were also seen on the throwaway instance (`docs/documentation/runs/console/how-to/app-builder/make-an-app.md` and its siblings). "Checked by" is left for the second agent. Paths are under `apps/console/src/` unless they start with `packages/` or `apps/control-plane`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title App Builder and the description line | `screens/Interfaces.tsx:57-60` | writer (read, run) | |
| Production: notice "Apps are built in a dev workspace and promoted. Here they can be opened."; no Make an app, Rename, Remove; name is plain text | `Interfaces.tsx:45-54,63-67,86-92,149-213` | writer (read) | |
| Columns App, Pages ("reads" tables), State, Address, then actions | `Interfaces.tsx:82-148` | writer (read, run) | |
| State tags: Published vN (tooltip), Not published (tooltip), Being removed, Edits not published, edited ago | `Interfaces.tsx:114-131` | writer (read, run) | |
| Address: URL link in new tab, "Once it is published", "No app serves it" | `Interfaces.tsx:136-147` | writer (read, run) | |
| Empty state text | `Interfaces.tsx:76-80` | writer (read) | |
| Make an app needs resource:write or interface:write alone; disabled with tooltip; line under the description | `Interfaces.tsx:39-54,62`; `kit/Can.tsx:176-191,238-262` | writer (read) | |
| Dialog description text | `Interfaces.tsx:223-228` | writer (read, run) | |
| Name: required, 100 characters, count shown; Address hint; address is lower-case letters, digits and dashes, 40 characters, filled from the name until typed in | `Interfaces.tsx:274-297`; `screens/builder/data.ts:27-43`; `screens/builder/names.ts:49` | writer (read, run) | |
| Make the app is off while the address is empty; saves interface `screens/<address>` with one page `main` titled by the name, and app `<address>` with `interface:`; opens the builder | `Interfaces.tsx:237-262,301-303` | writer (read, run) | |
| Taken address: "Something already exists at this path. Choose another, or open that one."; the interface draft is removed again if the app's save fails | `ask.tsx:114-117`; `Interfaces.tsx:263-268` | writer (read) | |
| Rename dialog text, field, "The address stays", Save as a draft off until the name differs; changes interface and app title in one batch; toast "A draft renames X to Y." with Review and deploy | `Interfaces.tsx:324-436` | writer (read) | |
| Rename disabled for a repository app with the tooltip | `Interfaces.tsx:155-177`; `screens/ResourceIdentity.tsx:27-37` | writer (read) | |
| Discard draft beside Remove for a deployed app with edits; Remove text includes the replace sentence | `Interfaces.tsx:176-210` | writer (read) | |
| Remove / Discard draft / Keep this app: titles, texts, buttons and actions | `kit/RemoveDraftButton.tsx:18-35,80-123` | writer (read) | |
| A never-deployed app shows Discard draft in place of Remove | `Interfaces.tsx:196-204`; `RemoveDraftButton.tsx:19,28-34` | writer (read, run) | |
| Repository app: text "Managed in the repository: the app is removed there.", no button | `RemoveDraftButton.tsx:73-79` | writer (read, run) | |
| List needs resource:read, or interface:read alone | `apps/control-plane/src/routes/interfaces.ts:100-101` | writer (read) | |
| Write needs resource:write, or interface:write alone | `apps/control-plane/src/routes/authoring.ts:582,592-594` | writer (read) | |
| App maintainer holds interface:*, data:read, data:write, app:read | `builtinRoles.ts:8-17` | writer (read) | |
| Help topic build-screens; editor topic build-screens-editor | `nav.ts:125,317` | writer (read) | |
