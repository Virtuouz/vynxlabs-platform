# Fact-check record: console/reference/screens/operate/events.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Description, Publish an event button, Exact event name placeholder, Show, Show every event. | apps/console/src/screens/Operate.tsx:826-860 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Columns When, Event, From (A script, The API, The platform), Started texts. | apps/console/src/screens/Operate.tsx:791-795,871-905 | writer, run on the instance 2026-11-23 ('Nothing listens', 'Listeners are paused', 'The API'); second agent, 2026-11-23 (see the second check below) | holds as run |
| Inspector: Published by, Listening wording, Event ID, notices, What it started, Payload. | apps/console/src/screens/Operate.tsx:781-789,941-997 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Event not found text. | apps/console/src/screens/Operate.tsx:929-940 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Footer 'Showing the first N events.', Load more, Try again. | apps/console/src/kit/paged.tsx:189-215 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Empty state texts. | apps/console/src/screens/Operate.tsx:924-927 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Publish dialog: titles, Event list, none-declared notice, fields/JSON, production confirm texts, success notices. | apps/console/src/screens/PublishEvent.tsx:35-130 | writer, run on the instance 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as run |
| Platform names refused with the quoted text. | apps/control-plane/src/routes/flows.ts:2075-2076 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Depth 10 chain; paused workspace stores and starts nothing. | apps/control-plane/src/kernel/flows/events.ts:13,79-97 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| event:read to list, event:write to publish. | apps/control-plane/src/routes/flows.ts:1934,2062 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |
| Refusals kept 7 days, events 30. | apps/control-plane/src/config.ts:320-322 | writer, read from the code 2026-11-23; second agent, 2026-11-23 (see the second check below) | holds as read |

## Second check (2026-11-23)

Checked by: second agent, 2026-11-23. Method: every label and quoted text searched in the console source; run on the instance in my own dev and production workspaces. The platform-events page that duplicated the generated one was removed (decision of this check): what only it said (a platform event is stored only when an enabled, unpaused event trigger listens; a step of a flow and a trigger source's run publish run events; deployment-created also for a promotion; row-changed and cascades; `cancelled`) is now in this page's section on platform events, and its listening example is in the failure alerts explanation. Sources of those sentences: kernel/flows/events.ts:183-214; kernel/execution/runs.ts:596-690; the removed record's rows, read again.

| Claim | Source | Result |
| --- | --- | --- |
| Publish an event: Event list with each description; fields (Who, Count, required marked); Fields / JSON; Publish. | PublishEvent.tsx; run | holds as run |
| JSON view with a wrong value: "/count: Enter a number." above the buttons. | run | corrected on the how-to |
| "Published. It started 1 run." and the row "just now, opchk/pinged, The API, 1 run". | run | holds as run |
| An event's own page (events/opchk/pinged): Publish it, Change its declaration, who listens. | ObjectPages.tsx:395-425; run | holds as run |
| In production: "This is production. Publishing starts what listens…" and the question "Publish opchk/pinged in production?" with "Every trigger that listens for it starts its work now, with real data.", Do not publish, Publish in production. | run | holds as run |
| Links to the platform events point to the generated page develop/reference/platform-events. | docs:check | done |
