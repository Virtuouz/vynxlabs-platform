# Run log: start/tutorials/your-first-script

- Instance: the walk instance, `http://localhost:8091` (managed workers), commit `5ebf1c80` on `phase-31-write-the-docs`, 2026-11-23. Signed in as the operator admin `admin@example.com`. Headless Chromium through Playwright, 1440 x 900, light theme.
- Tenant `tut-first`, workspace `dev`, script `tut-totals`: the names the page uses.
- Pass 1 explored the screens and followed steps 1 to 13. The tenant was then deleted (`POST /tenants/{id}/deletion`). Pass 2 followed steps 1 to 10 again on a new tenant with the page's clicks. Steps 11 to 13 were run only on pass 1's tenant.

## Seen

1. **Create tenant** on the Instance list. Dialog fields Name, Slug, Database location, "Make me a member, as tenant admin" (checked). The tenant opened with Workspaces 0, Members 1, "Nothing needs you".
2. "No workspaces yet. Create one" went to `.../workspaces`; **Create workspace** dialog: Name, Slug, Type (Choose…, Production, Dev), Promotes to (Nothing). The list showed `Dev`, `dev`, DEV.
3. The workspace overview: "Dev", DEV, "Triggers paused", **First steps** "1 of 4 done", with "A worker to run code" done.
4. **New script** in First steps went to `.../scripts/new`, with **Not saved**.
5. **Total some numbers** filled the editor; the `Path` field was empty until typed.
6. Path `tut-totals`.
7. Ctrl+Enter in the editor: **Test pane** read Succeeded, "waited 854 ms · ran 327 ms", log `Added up {"count":3,"total":49.75}`. The URL became `.../scripts/edit/tut-totals`.
8. The Test pane's sub-tabs are **Logs**, **Input and output**, **Details**. Output `{"count":3,"total":49.75,"average":16.583333333333332}`.
9. Overview: First steps "3 of 4 done". **Deploy** went to `.../release`: Review draft "1 change", Deploy to dev, `tut-totals` **NEW**.
10. "What changed" `First script`, **Deploy 1 change**: "0 changes", VERSIONS OF DEV showed v2 "First script" (the number was 2, not 1; the page does not state a number).
11. Build > Scripts: `tut-totals`, Uses "Nothing outside", Source CONSOLE; the script page listed the test run as "test".
12. **Run**: dialog Start (Now, Later), Priority, input form; **Run** opened the run page: Succeeded, "By hand", "version 2", output as above.
13. Overview: First steps was gone; "Running v2".

## What the page got wrong, and was corrected

- Step 8 first said a **Result** tab shows the output. The tab is a result strip; the output is under **Input and output**.
- The Build menu is reached from the rail button, as the other tutorial says.

## Not run

768 and 390 px, dark theme, keyboard-only. On a Mac the shortcut is Command-Return; only Ctrl+Enter was pressed.

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Second pass 2026-11-23, one pass 1-13 on a new tenant tut-first (old one deleted), 1440 light; then 390 and dark of the editor (no horizontal scroll, code area 462 px at 390, pane under the code). Keyboard: Ctrl+Enter. Steps 11-13 now run on the same tenant.
