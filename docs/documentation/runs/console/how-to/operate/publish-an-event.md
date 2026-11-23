# Run log: console/how-to/operate/publish-an-event.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs).
- Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox workspace, at 1440 px, light theme, Playwright headless. No other width, no dark theme, no keyboard-only pass, no reload test.
- Other writers share the Sandbox, so its Runs list holds runs that are not mine.

## The steps as followed
1. **Operate**, **Events**: the header has **Publish an event**. It opened **Publish an event** with the field **Event**.
2. The **Event** list gave appointments/checked-in, appointments/completed, inventory/low, invoices/paid, registrations/received, each with its description.
3. Chose appointments/checked-in: **How to give it** with **Fields** and **JSON**, and fields **Pet**, **Clinic**, **Appointment**, each marked required. Filled them (op-pet, northside, op-appt) and pressed **Publish**.
4. The first row of the list: just now, appointments/checked-in, **The API**, "Nothing listens". Choosing it: **Published by** The API, **Listening** 0 triggers, an Event ID, "No flow or script listens for appointments/checked-in here." and **Payload** as published.
5. Existing rows from inventory/check read "Listeners are paused" (the Sandbox's triggers are paused).

## The page got wrong (and was corrected)
- No correction was needed from the run.

## Not run
A production workspace's confirmation, a payload the server refuses, **Publish it** on an event's own page, a person without `event:write`, the JSON tab.
