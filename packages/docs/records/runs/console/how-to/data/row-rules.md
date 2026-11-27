# Run log: console/how-to/data/row-rules.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `be324f78` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, with Playwright headless. No width or theme other than that was run.
- Tables made for this run are named `thow-...`. Rows that the page does not ask the reader to type (the seed of 11 rows) were put in by the API (`POST rows/<table>`, as the same signed-in person) to save typing.
- The steps were run in pieces, then the page was written from what was seen and corrected where it differed (listed under "The page got wrong"). A single end-to-end run of the finished text was not made.

## Setup
`thow-notes` (columns `note`, `clinic`, `client_code`, all Text) made with **Create table**; 7 rows put in by the API: two for each of northside, riverside, hilltop (clinic holds the group's key), and one with no clinic; `client_code` C-1001 to C-1007. In the seed, Jess Morgan (end user, groups Front desk and northside) and George Lewis (end user, attribute `client_id` C-1001) exist.

## The steps as followed
1. **Definition** tab, **Who sees rows**: the select offered "Everyone with access sees every row", "Each person sees their own rows", "Rules decide". Chose **Rules decide**: the text "A person sees a row when any rule lets them, and changes it when a rule that says "read and change" does. People who hold the "all rows" permission see every row." and a first rule headed "Everyone with access may read the row."
2. Rule 1: **Who** A group named in a column, **Column** clinic, **May** Read and change; the heading read "People in the group named in clinic may read and change the row." **Add a rule**; rule 2: People with a matching attribute, Column client_code, **Attribute** client_id, May Read; heading "People whose client_id is in client_code may read the row." Column options were note, clinic, client_code.
3. **Save who sees rows**. The table list then read "By 2 rules". **See it as** and **See it as a group** appeared under the button. The line "Saved. It applies from the next request." did NOT appear after this save (see Findings).
4. **See it as**: typed `jess`: one option, "jess.morgan@fernhill.example", hint "In Front desk, northside". Chose it: the list showed "Prefers morning visits, northside, C-1001" and "Allergic to penicillin, northside, C-1002". Typed `george.l`, chose George Lewis: one row, C-1001.
5. **See it as a group**: the options were Front desk, hilltop, northside, riverside (each "Group of end users") and Billing, Practice managers (each "Group of members"). Chose riverside: "Someone in this group would see 2 rows in all." and the two rows.
6. On `thow-scratch`: **Each person sees their own rows** showed "The column that holds each row's owner" with "Choose a column" and `note` (Text) and the hint "It holds the person's ID. A row added with none is given to whoever added it."; chose `note`, **Save who sees rows**: "Saved. It applies from the next request." appeared; the list said "Each person sees their own rows (note)".

## The page got wrong (and was corrected)
- It first named `group:read` as what lists groups. Groups of end users need `end_user_group:read` and groups of members `group:read` (`endusers.ts:548`, `tenants.ts:889`).
- It first said an unsaved rule is kept by Undo; the inventory and the code say rules are saved by their button, and once saved are one step of undo.

## Not run
Reading as a person without `data_all` (the page's claim that a rule gives them only their rows rests on the code and the Fernhill portal); rule limit 20; "The groups could not be read..." (needs a person without group permissions); a table with an owner column and a row added by a person.

## Findings for the product (not written as working in the page)
- With **Rules decide**, **Save who sees rows** saves, but the text "Saved. It applies from the next request." does not stay on screen (it does in the owner mode). The editor seems to start afresh after the reload, as the policy comes back with a shape that differs from what was sent. Not investigated further.

## Second check (second agent, 2026-11-23)
- Instance `http://localhost:8091`, Maya Brooks, 1440 px, light. Table `chk-notes2` made with **Create table** (columns note, clinic, client_code) and five rows added with **Add row**.
- Followed steps 1 to 5 of "Give a group its rows and a client theirs" and the three steps of "Check it as a person or a group" as written: headings "People in the group named in clinic may read and change the row." and "People whose client_id is in client_code may read the row."; after **Save who sees rows** the list said "By 2 rules"; **See it as** `jess` showed the two northside rows; `george` offered two end users (george.lewis and george.green), choosing George Lewis showed the one C-1001 row; **See it as a group** `riverside`: "Someone in this group would see 2 rows in all."
- Undo, as the brief said: with rules set and not saved, **Undo** is off; after **Save who sees rows**, **Undo** reads "Undo the change to who sees rows" and puts the select back to "Everyone with access sees every row"; **Redo** puts the two rules back. Confirmed.
- "Saved. It applies from the next request." does not stay after a save in the Rules decide mode (the writer's finding): confirmed again, not quoted by the page.
- Not run: a person without `data_all:read`, the 20-rule limit, the "groups could not be read" message, 768 and 390 px, dark, keyboard only.
