# Run log: console/how-to/app-builder/make-an-app.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs) plus the working tree of the wave.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox (dev) workspace, at 1440 px, light theme, Playwright headless. No other width or theme was run. Apps made for the runs are named `abapp …`.
- The steps were run in pieces (several scripts), then the page was written from what was seen. A single end-to-end run of the finished text was not made.

## The steps as followed
1. **Build > App Builder**: the list (Front desk board not published, Clinic operations, My Fernhill account and Clinic performance published and managed in the repository, plus other writers' apps).
2. **Make an app**: dialog "Make an app" with the text "It starts with one empty page. Other builders of this workspace see the draft; people who use the app see nothing until you publish it.", **Name** (counter "12 of 100" for "abapp Visits"), **Address** with the hint, **Cancel**, **Make the app**.
3. Name `abapp Clinic`: **Address** filled `abapp-clinic`. **Make the app** opened the workbench at `screens/screens/abapp-clinic`, one page named after the app, status "Saved. Not published yet.".
4. **Add a page**: dialog "Add a page" with **Start from** A blank page / A list of Api-visits / An Api-visit record page (the first table in alphabetical order was Api-visits, from another writer). Choosing the list radio showed a **Table** select; choosing `appointments` renamed the choice **A list of Appointments** and the name field "Appointments". **Add the page** made pages Appointments (Page), Appointment detail (Side sheet), New appointment (Modal). The page showed 25 rows ("Showing 25 of 3,708").
5. First page chosen, **⋯ > Remove page**: "Remove the page abapp Clinic?", "Its widgets go with it. Nothing in any table is touched.", **Remove the page**. The page list then read Appointments, Appointment detail, New appointment.

## What the page got wrong, and the correction
- It first said to choose the table "if it says another table". The table select appears only after the list start is chosen and starts on the first table alphabetically; the step now says to choose Appointments.
- The notice after a start is not text I could read in the run (it is a toast); the wording comes from `starters.ts:155-159`.
- Not run: a taken address, the 20-page limit, a read-only user.
