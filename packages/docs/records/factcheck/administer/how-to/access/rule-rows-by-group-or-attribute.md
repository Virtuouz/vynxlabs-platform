# Fact-check: administer/how-to/access/rule-rows-by-group-or-attribute

Commit: 5ebf1c80 plus the working tree, 2026-11-23. Written by the access writer.

Checked by: second agent, 2026-11-23.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Group values: id, key, name | `apps/control-plane/src/kernel/data/rows.ts:176-182` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Rule options | `packages/docs/content/console/reference/screens/data/tables.md:185-195` | writer, 2026-11-23; second agent, 2026-11-23 | holds as read |
| Who sees rows: Rules decide, A group named in a column, People with a matching attribute, May, Save who sees rows, See it as | `apps/console/src/screens/` (table Definition); run | second agent, 2026-11-23 | holds; run with a table acc2_notes, a group and an end-user attribute |
| Fernhill example wording | table rule headings on screen | second agent, 2026-11-23 | corrected to the screen's rule headings |
| A group change takes effect at once | See it as after Take out, run | second agent, 2026-11-23 | confirmed on the instance |
