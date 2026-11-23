# Run log: console/how-to/app-builder/set-the-phone-layout.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs) plus the working tree of the wave.
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox (dev) workspace, at 1440 px, light theme, Playwright headless. No other width or theme was run. Apps made for the runs are named `abapp …`.
- The steps were run in pieces (several scripts), then the page was written from what was seen. A single end-to-end run of the finished text was not made.

## The steps as followed
- **Phone** in the header: the page was drawn in the device frame; the line above it read "Phone layout is made from the desktop one."
- Table selected, **⋯ > Layout**, **Smaller screens**: Tablet and Phone each **Automatic / Custom**, **On narrow screens** Automatic, Keep, Full, Stack, Hide, with "A small widget shares a row with the next small one; another takes the row.".
- Phone **Custom**: fields Phone column, Phone row, Phone width, Phone height appeared; the line became "Phone layout is made from the desktop one. 1 widget changed by hand." with **All automatic**.
- **Hide**: the page showed "Appointments is hidden on phones". The publish check then listed the amber row "Phone layout hides 1 widget" with "Appointments, on Appointments".
- **All automatic**: the line went back to "Phone layout is made from the desktop one.".

## What the page got wrong, and the correction
- Nothing differed in the steps that were run. Whether **All automatic** also resets a **Hide** under **On narrow screens** was not looked at; the page says only that it takes back the places set by hand (the banner counts widgets with a place of their own).
- Not run: a drag on the phone, the question "Change the phone layout by hand?" (a drag is needed; its text is from `AppBuilder.tsx:288-298`), :kbd[↑] and :kbd[↓] on the phone, Tablet, and widths under 1024 px.
- Copy to report: that question says 'Go back to automatic' in its Layout undoes that, and the Layout panel has no control of that name (it has **Automatic**, and the banner has **All automatic**).
