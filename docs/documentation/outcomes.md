# Phase 29 outcomes: every row of findings/ against fixed/, walks/, remaining.md, backlog.md and decisions.md

Made by a script (`scratchpad/c.py`, `d.py`, `e.py`) that collects every row id from `findings/*.md` (headings `### ID` and table rows `| ID`), expands ranges ("VOC-28..30"), and lists every id named in `fixed/*.md` and `walks/*.md`. The script finds 605 rows, not 519: the extra are table rows of the vocabulary file, missing-part rows (`WID-M1`, `ACC-MP7`), and grouping headings ("Settled as they are", "Gotchas that stay"). Read as a gate: the rows below are the ones the script could not settle, and each was checked by hand against the code.

## Summary

| Outcome | Rows | How known |
|---|---|---|
| Named in a lane's write-up (fixed, already fixed, refuted, or left with the reason) | 545 | an id in `fixed/` or `walks/`; the write-up was not re-read for each one |
| Not named in `fixed/`, settled by the finding's own outcome ("not a bug", or "keep"/"no change" in vocabulary) | 27 | the row says why |
| Not named; settled by an owner decision (decisions.md) | 8 | D34 (FLW-35), D50 (API-16), D55 (API-17), D56 (API-18), D58 (API-22), D18 (SHL-16 with GOV-12), D54 (VOC-42, 43, 53, 46) |
| Not named; settled as phase 30 (docs generator, M9) | 8 | API-01..05, API-14, API-23 (Milestone: phase 30 M9) |
| No outcome, or unclear | 17 | the table below |

Not named in `fixed/` at all, by area (60 of 605): API 12, VOC 14, WID 6, EXT 5, INS 4, APP 3, DOC 3, BLD 2, FLW 2, SCR 2, and one each in CFG, CLI, HOST, MP-1, SHL, TAB, WLK. ACC, DAT, GOV, OPS and REL: every row is named.

Left on purpose, with the reason written in the lane's file, and so not "no outcome": `WID-M10` (visual `joins`, not started), `CLI-MP7` (`volvel dev` for file apps; asked, no answer in decisions.md), Git sync ignoring `entry`/`resources` (owner to say which wins), the `console_code` CLI command, a retired table's description, "not containing" in the filter language, a field-by-field manual-start schema form, chart `x`/`y`/`sort` (part of `WID-M6`), GOV-P4 (by D7), the audit-area test for template actions (phase 30 M9). Open questions to the owner that no decision answers: CLI-MP7, Git sync `volvel.yaml` precedence, `ACC-27`.

## Rows with no outcome, or an unclear one

| ID | Title | Where it should have been | What the code does now |
|---|---|---|---|
| WID-27 | A Goal is always a button | `fixed/` (milestone M5, lane bldwid or sweep-console); `remaining.md` | Not done. `packages/widgets-core/views/goal.tsx:60` always draws `<button onClick={emit("click")}>`; no `listensTo`/`press` (Stat has them). |
| WID-28 | Legend "Always" is "Automatic"; Colors does nothing for a heatmap | same | Not done. `chartDrawer.tsx:532-533` still offers "Automatic" and "Always". |
| WID-29 | No heading means no Download | same; only `backlog.md` says the lane bldwid was working it, with D36 | No fixed entry. Not checked further: the code was not traced for Download without a heading. Needs a one-line outcome. |
| WID-30 | Action group position picker: columns do nothing with Right or Spread | same | Not done as written. `actionsDrawer.tsx:228-289` still has the 3x3 `place` picker beside Left/Right/Spread "Line up". |
| WID-31 | Editable detail field is a `div role="button"` | same | Not done. `packages/widgets-core/views/detail.tsx:404` still sets `role: "button"` on the element. |
| API-07 | Library `auth/*` routes have no summary | `fixed/api2.md` says "still listed without summary (API-07, M9)" | Left to M9 in words, but the row carries no phase 30 line. |
| API-13 | Webhook, upload, MCP, SSE bodies untyped in OpenAPI | `fixed/api2.md` | Half done. `routes/stream.ts` says `text/event-stream` in its description; no `content` type is declared on the hooks or MCP routes. The M9 link half is phase 30. Not named in any lane file. |
| API-16 | No event for a cancelled run | `fixed/api2.md` (D50) | `backlog.md` lists it with D50; no `fixed/` entry says what was built. Not traced. |
| SHL-16 | A wrong password spends a recovery code | `fixed/gov2.md` covers GOV-12/D18 | Same fault; settled by D18 through GOV-12 (`gov2.md`), but SHL-16 is written "not a bug (deliberate)" and says so the opposite way. The two rows disagree. |
| VOC-19 | Icon key `workflow` | n/a | "no change" (a stored name). Settled by its row; no lane names it. |
| VOC-31 | British spelling in the help panel and docs | `fixed/voc-spell.md` names VOC-32, 33 only | `walks/w-words.md` still reports "colours" in the Branding help line. Unclear whether `packages/docs/content` was cleared. |
| VOC-35, 36, 38, 39, 44, 48, 54, 58 | "keep" / "no change" vocabulary rows | `backlog.md` line 393 lists 19, 36, 38, 39, 44, 48, 54, 58 as left "keep" | Settled by their own text; VOC-35 (remove with VOC-34) has no lane line. |
| VOC-21 | `${n} queued run(s) cancelled` | `fixed/voc-spell.md` says "VOC-20, 21: Runs.tsx already said canceled" | Settled; the console now says "Cancel N queued runs?". |
| MP-1 | Script Settings: what the kind takes and the editor cannot say | `fixed/scr2.md:43` calls it "tier 3" | `fixed/t3-config.md` (SCR-08 and the Settings tab) built the read-only half. Console Settings still lack memory, concurrency, pool, `onFailure` as editable. Not closed in a lane file. |
| WLK-17 | Connections, drafts and releases walk | `fixed/t2-walk-shell.md` has 17a to 17h | 17a-17h have write-ups; `remaining.md` still lists "WLK-17 items that t2-walk-* lanes do not finish" and `fixed/` has no closing line. |
| ACC-27 | "others' operator grants" | `fixed/sweep-server.md` | "The row does not say what is wrong; unchanged." Not refuted, not fixed. |
| WID-M10 | Visual `joins` control | `fixed/t3-widgets.md`, `sweep-console.md` | Not started (stated). No decision or phase named. Trims the phase's missing-part list (POLISH-015): needs an owner answer. |
| CLI-MP7 | `volvel dev` for file apps, interfaces, docs | `fixed/t3-cli-docs.md`, `sweep-server.md` | Not built; asked; no answer in decisions.md. Same POLISH-015 point. |

Other rows that `remaining.md` still lists as not built have a line in a `sweep-*` or `t3-*` file saying so (they are decided or asked, not missing): WID-M4, M6 (partly), M11 are built; `INS-28` is built (D47); `SCR-16`, `EXT-10`, `REL-18` (`console_code`) are built in the control plane and not in the CLI.
