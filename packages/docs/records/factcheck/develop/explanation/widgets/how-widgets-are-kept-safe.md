# Fact-check record: develop/explanation/widgets/how-widgets-are-kept-safe

Lines are current at lane b7 (branch p34-b7, after b1 to b6 and the b4r review, 2026-11-24). Written by the writer (B6); the rows marked (b4r) were re-checked against the merged code in b7. "Checked by" is for the second agent. The page's claims are the design of decision 0005 as built in phase 34.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The frame is `sandbox="allow-scripts"`, no `allow-same-origin`, `referrerPolicy="no-referrer"`, `allow=""`; no forms, popups, top navigation or modals. | `TenantWidgetHost.tsx:242-243` (literal `allow-scripts`, never built from data); `TenantWidgetHost.test.tsx` "its frame is a sandbox of scripts alone" (b4r) | writer, b7 | holds |
| The file's policy: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:; sandbox allow-scripts`. | `packages/manifest/src/app-policy.ts:36-37`; `front.ts:1524` and, on every answer under `/_widgets/` (404, 405, 429, 307) `front.ts:1610`; `widgets.test.ts` "no address under /_widgets is answered without the policy" (b4r) | writer, b7 | holds |
| No `connect-src`, so `default-src 'none'` leaves no network. | `packages/manifest/src/app-policy.ts:25-35`; `e2e/widget-frame.spec.ts` (fetch, XHR, other origin, window.open, navigation each fail) | writer | holds |
| The file is served without reading or setting a cookie, the same for everyone, immutable. | `apps/control-plane/src/kernel/apps/front.ts:1488-1530`; the type is said by the file name, `widgetFileType`, `front.ts:151,1523`; `widgets.test.ts` (no Set-Cookie; "what a file is served as is said by its name") (b4r) | writer, b7 | holds |
| The page believes a message only from its frame's own non-null window. | `TenantWidgetHost.tsx:149-152`; `TenantWidgetHost.test.tsx` "a message is believed from the frame's own window alone" (b4r) | writer, b7 | holds |
| The frame is given its own widget's props only. | `TenantWidgetHost.tsx:109-126` (props posted: config, plain data, state, size, theme) | b7 | holds |
| The build refuses an import from http(s) and any import(). | `packages/cli/src/widget-build.ts:54`; `build.test.ts` | writer | holds |
| 20 a second for 2 s removes the frame; 64 KB; height at most 4000 and at most the cell; 10 s to say ready. | `frameChannel.ts:17-25`; `TenantWidgetHost.tsx:59,207` (b4r). Added in b7: at most `requestsPerSecond` (4) requests for rows (`frameChannel.ts:22,116-124`) | writer, b7 | holds |
| The page checks the event name and the payload schema and drops the rest. | `frameChannel.ts:135-148` (`Object.hasOwn` for the name, JSON copy of the payload); `schema.ts:46-66` (`patternProblem`: repeated group, back reference, look-around, more than two open-ended repeats, 200 characters; 256-character string cap); `schema.ts:141,146` (`Object.hasOwn`) (b4r) | b7 | holds |
| Data is read by the server for the viewer; a view has no fetch. | `kernel/data/query/inputs.ts` (`readWidget`); the policy above | writer | holds |
| A deployed version's files never change. | `apps/control-plane/src/kernel/widgets.ts:103` | writer | holds |
| Deploying needs `deployment:write`. | `apps/control-plane/src/routes/authoring.ts:537`; `routes/widgets.ts:108` | writer | holds |
| The worst case sentences ("a frame that floods is removed, a loop that does not is not"). | design, not a code row: a processor loop in a frame is not limited by the page | writer | needs the second agent's judgment |
| Every page of the console is answered with `frame-src 'self'` and the instance's own two origins, so a frame cannot be sent elsewhere by `location.href` or a refresh tag. | `apps/control-plane/src/app.ts:426-437`; `console-files.test.ts` "p34-b4r the console's page lets a frame be only the instance's own" (b4r) | b7 | holds |
| A request for rows is answered only for a declared `rows` input, a column the rows have, at most four a second. | `frameChannel.ts:116-124`; `TenantWidgetHost.tsx:160-175`; `frameChannel.test.ts`, `TenantWidgetHost.test.tsx` (p34-b7) | b7 | holds |
