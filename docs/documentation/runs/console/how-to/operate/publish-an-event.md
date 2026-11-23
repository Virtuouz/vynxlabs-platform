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

## Not run by the writer
A production workspace's confirmation, a payload the server refuses, **Publish it** on an event's own page, a person without `event:write`, the JSON tab.

## Second check (2026-11-23)

- Instance: http://localhost:8091, the throwaway instance (MAIL_CAPTURE_DIR set, so mail is read from its folder). Everything below ran in a workspace of my own: Operate check (a dev workspace) and Operate check live (a production workspace linked to it), in Fernhill's tenant, with scripts, flows, triggers, a secret and an HTTP connection of mine (deployed by the CLI from a repository of my own; the connection pointed to a listener of mine on localhost). Signed in as Maya Brooks, and as Devi Shah (not in the Practice managers group) where a second person was needed. Playwright, headless.

- Declared `opchk/pinged` and an event trigger; the dialog listed it with its description; **Fields** showed **Who** and **Count**, required; **JSON** showed "As JSON"; `{"who":"x","count":"nope"}` was refused with "/count: Enter a number."; a good payload: "Published. It started 1 run."
- The event's own page (`events/opchk/pinged`): **Publish it** and **Change its declaration**.
- In the production workspace: the dialog said "This is production. Publishing starts what listens for the event, with the payload given here."; **Publish** asked "Publish opchk/pinged in production?" with "Every trigger that listens for it starts its work now, with real data.", **Do not publish**, **Publish in production**; published, one run.
- Devi Shah (a member with event:write) saw the button enabled; a member without event:write was not available to try.
- 390 px dark: the dialog fits; no horizontal scroll.
