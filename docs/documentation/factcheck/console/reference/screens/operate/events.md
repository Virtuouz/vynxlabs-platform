# Fact-check record: console/reference/screens/operate/events.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under the repository root. Written by the writer; "Checked by" is for the second agent.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Description, Publish an event button, Exact event name placeholder, Show, Show every event. | apps/console/src/screens/Operate.tsx:826-860 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Columns When, Event, From (A script, The API, The platform), Started texts. | apps/console/src/screens/Operate.tsx:791-795,871-905 | writer, run on the instance 2026-11-23 ('Nothing listens', 'Listeners are paused', 'The API'); second agent: pending | holds as run |
| Inspector: Published by, Listening wording, Event ID, notices, What it started, Payload. | apps/console/src/screens/Operate.tsx:781-789,941-997 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Event not found text. | apps/console/src/screens/Operate.tsx:929-940 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Footer 'Showing the first N events.', Load more, Try again. | apps/console/src/kit/paged.tsx:189-215 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Empty state texts. | apps/console/src/screens/Operate.tsx:924-927 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Publish dialog: titles, Event list, none-declared notice, fields/JSON, production confirm texts, success notices. | apps/console/src/screens/PublishEvent.tsx:35-130 | writer, run on the instance 2026-11-23; second agent: pending | holds as run |
| Platform names refused with the quoted text. | apps/control-plane/src/routes/flows.ts:2075-2076 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Depth 10 chain; paused workspace stores and starts nothing. | apps/control-plane/src/kernel/flows/events.ts:13,79-97 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| event:read to list, event:write to publish. | apps/control-plane/src/routes/flows.ts:1934,2062 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
| Refusals kept 7 days, events 30. | apps/control-plane/src/config.ts:320-322 | writer, read from the code 2026-11-23; second agent: pending | holds as read |
