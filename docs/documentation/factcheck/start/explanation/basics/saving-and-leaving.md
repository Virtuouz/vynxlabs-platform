# Fact-check record: start/explanation/basics/saving-and-leaving.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks (or the operator admin where said), 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The script editor saves a draft 3 seconds after a change. | `screens/Authoring.tsx:484-494` | writer | holds |
| The flow editor says Saving…, Draft saved {time}, Could not save. Trying again…, Could not save., and the clash text. | `screens/FlowEditor.tsx:883-900,1690-1706` | writer | holds (not run) |
| App Builder and dashboard editors say Saving… and "Not saved: {why}". | `screens/builder/EditorShell.tsx:21-30` | writer | holds |
| A draft is not live until deployed. | `apps/control-plane/src/kernel/authoring.ts:75-90` | writer | holds |
| Settings screens use the Unsaved changes bar with Discard and Save and Ctrl+S; Save off while read-only. | `kit/SaveBar.tsx:20-102`; `screens/Branding.tsx`; run ("Unsaved changes to this tenant's branding.") | writer, run | holds as run |
| Screens using the bar: Branding, SSO, Provisioning, Retention, Workspace settings, instance branding, Component kit. | grep of `<SaveBar` in `screens/` | writer | holds |
| Leave dialog "Leave without saving?" with Stay, Leave; sentence "Your changes to {what} are not saved."; tab close uses the browser. | `ask.tsx:25-31`; `kit/SaveBar.tsx:33`; `router.tsx:53-58`; run | writer, run | holds as run |
| Sign out asks first; a failure keeps you signed in. | `App.tsx:177-190` | writer | holds |
| Sign out clears this browser's settings, pins, reads. | `clearSession.ts` | writer | holds |
| Your session ended dialog; same person resumes, another reloads. | `SessionSheet.tsx:14-35,64` | writer | holds (not run) |
| Notices: 5 s, 10 s, failures stay, hover or focus holds, Esc closes, 3 visible; failure "What does this mean?". | `packages/ui/src/Toast.tsx`; `ask.tsx:90,130` | writer | holds |
| Undo and redo in the flow editor, App Builder, dashboards. | `screens/FlowEditor.tsx:1609`; `screens/builder/EditorShell.tsx:136`; `screens/Dashboards.tsx:409` | writer | holds |
| Table row changes are made at once. | `screens/Data.tsx`; see `factcheck/console/how-to/data/table-rows.md` | writer | holds |
| Which settings are kept and sent to the instance. | `apps/control-plane/src/routes/preferences.ts:17-22`; `prefs.ts:1-20` | writer | holds |
| Preferences belong to a member, not an API key; no audit entry. | `routes/preferences.ts:44-52` | writer | holds |
| Recent and the last place are kept only where you are a member. | `routes/search.ts:373-410`; `routes/identity.ts` (`/me/recent`) | writer | holds |
