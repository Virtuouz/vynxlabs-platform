# Phase 28: the third walk (draft)

For the integrator to fold into the phase document's Findings, and then delete.
Written 2026-11-22 by the N1 agent, on branch `p28-n1` (from `phase-28-the-boards` at 912f161, after the canvas fix).

Pictures: `/tmp/claude-1000/-home-gplascencia-repos-vynxlabs-platform/245bb64d-bb75-475b-b0b0-52fadfa941d4/scratchpad/n1/` (called `n1/` below). Instance: port 8110, database `walkn1`, seeded by `setup.mjs`. Everything below was opened as a picture or read as page text from the run; what is not listed as opened is not claimed.

## What was fixed

- **The columns a table, list or record draws when none are chosen** (`packages/widgets-core/views/cells.tsx`, `defaultColumns`). They came in the table's alphabetical order, so a new Invoices table began with "Appointment", the record sheet's title was the appointment code `C-1001` instead of `INV-9001`, and a starter Appointments table cut off Starts at and Status. The column that names a row (name, title, number, code…), then status and the date, now come first. The table's Display list lists what the page draws (it used to say "14 of 14 shown" and list Id, Created at and Updated at, which the page does not draw). Unit test `apps/console/src/default-columns.test.ts`.
- **A record detail with no record** said "Nothing is open." to a person (Jess Morgan, who has no client record) at the pet owners' portal. It says "There is nothing here for you yet."

## The five journeys

(Filled in below as walked.)

## Ranked list

(Filled in below.)
