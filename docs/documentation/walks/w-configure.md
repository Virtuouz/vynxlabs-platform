# Walk: w-configure (phase 29)

Instance localhost:8091; own workspaces `wcfg dev`/`wcfg prod` in Fernhill, own tenant `wcfg tenant` (operator, for the code switch). Shots: ~/.local/share/volvel-walk/shots29/w-configure/. Widths 1440/768/390, light/dark, keyboard, reload.

## Right
- CFG-20/EXT-16 name with `_` saves; "My CRM" refused on Save, naming underscores (nm-bad.png, 390 dark).
- CFG-21 kinds failing: error plus Try again, recovers (kf2-390.png).
- CFG-24 stored line returns after Save, in the wizard and on a secret's page (reload keeps it).
- CFG-MP5 Remove credential: pending state, Keep, save, "None"; Esc returns focus to Change.
- CFG-MP1 Unbind on a connection's page: confirm, Esc focus, "Not set up here", survives reload.
- CFG-MP3/CFG-23 variable Set/Change sheet (prefilled, multi-line, empty = "Empty"), page "Change value", reload.
- EXT-12 connector Problems list, line jump by Enter (390); production notice names kind (connector, trigger source).
- EXT-10 code switch: confirm both ways, reload, reader text, save refused with who can turn it on.
- CFG-26 reader (Amara): variable/secret/connection pages offer nothing; lists show the note, controls greyed (fieldset disabled), not removed.
- CFG-MP4 run limit saves, survives reload. Repository fields render at 390.

## Wrong
1. Connections list squeezed at 768 and 390, light and dark: Health ("tested 12s ago") overlaps Used by/Kind; "Draft, never deployed" overlaps next column (list-390-d.png, list-768-d.png). Cause: `kit/DataTable.tsx:427` table-fixed with `kit/health.tsx:21` `min-w-[9rem]`.
2. Variables list at 390: path `wcfg/region` overlaps "Nothing deployed uses it", Use default touches value (vars-390-l.png, vs-saved.png). Same cause.
3. Secrets list at 390: "by maya.brooks@fernhill.example" runs under Delete (secrets-390.png).
4. Replace on a secret page: focus drops to BODY, field not focused (keyboard) (sec-replace-dlg.png). `kit/SecretField.tsx` has no focus handling.
5. Workspace settings at 390: bad run limit leaves Save enabled and a click does nothing, error is below the fold (set-2000-click.png). `Environments.tsx:247` `if (blank) return;`.
6. CFG-26 left disabled controls rather than none (New secret, Set variable, Delete greyed): differs from "no create button".
7. Minor: "Last changed/Last set 21:09:58" has no date; "Unbind? Scripts that use it will fail" shown when nothing uses it; header says "Reconnecting…" on editors.

## Not walked
Connection bound before 200 newer uploads (sweep-cols, needs 205 uploads), Tables/retired table, apps list, Git history/branches, Check the connection (no internet), script Settings, data-source credential removal. Group connections.
