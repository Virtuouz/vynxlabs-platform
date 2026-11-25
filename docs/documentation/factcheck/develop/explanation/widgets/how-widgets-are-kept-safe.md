# Fact-check record: develop/explanation/widgets/how-widgets-are-kept-safe

Lines are current at commit `aabf96af` (branch p34-b6) plus the docs of this lane, 2026-11-24. Written by the writer (B6); "Checked by" is for the second agent. Lane b4r reviews the frame host and the widget route at the same time: re-check the rows marked (b4r) after it merges. The page's claims are the design of decision 0005 as built in phase 34 (B1 to B5). Every row marked (b4r) is being reviewed while this is written.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The frame is `sandbox="allow-scripts"`, no `allow-same-origin`, `referrerPolicy="no-referrer"`, `allow=""`; no forms, popups, top navigation or modals. | `packages/screens/src/TenantWidgetHost.tsx:20,192-194` (b4r) | writer | holds |
| The file's policy: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data: blob:; sandbox allow-scripts`. | `packages/manifest/src/app-policy.ts:36-37`; `front.ts:1508` (b4r) | writer | holds |
| No `connect-src`, so `default-src 'none'` leaves no network. | `packages/manifest/src/app-policy.ts:25-35`; `e2e/widget-frame.spec.ts` (fetch, XHR, other origin, window.open, navigation each fail) | writer | holds |
| The file is served without reading or setting a cookie, the same for everyone, immutable. | `apps/control-plane/src/kernel/apps/front.ts:1475-1513`; `apps/control-plane/src/widgets.test.ts` (no Set-Cookie) (b4r) | writer | holds |
| The page believes a message only from its frame's own non-null window. | `TenantWidgetHost.tsx:114-118` (b4r) | writer | holds |
| The frame is given its own widget's props only. | `TenantWidgetHost.tsx:85-108` | writer | holds |
| The build refuses an import from http(s) and any import(). | `packages/cli/src/widget-build.ts:54`; `build.test.ts` | writer | holds |
| 20 a second for 2 s removes the frame; 64 KB; height at most 4000 and at most the cell; 10 s to say ready. | `frameChannel.ts:12-18`; `TenantWidgetHost.tsx:47,225` (b4r) | writer | holds |
| The page checks the event name and the payload schema and drops the rest. | `frameChannel.ts:118-126` | writer | holds |
| Data is read by the server for the viewer; a view has no fetch. | `kernel/data/query/inputs.ts` (`readWidget`); the policy above | writer | holds |
| A deployed version's files never change. | `apps/control-plane/src/kernel/widgets.ts:103` | writer | holds |
| Deploying needs `deployment:write`. | `apps/control-plane/src/routes/authoring.ts:537`; `routes/widgets.ts:108` | writer | holds |
| The worst case sentences ("a frame that floods is removed, a loop that does not is not"). | design, not a code row: a processor loop in a frame is not limited by the page | writer | needs the second agent's judgment |
