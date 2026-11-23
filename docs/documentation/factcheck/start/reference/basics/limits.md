# Fact-check record: start/reference/basics/limits.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks (or the operator admin where said), 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Session 7 days. | `apps/control-plane/src/config.ts:125`; `kernel/auth.ts:98` | writer | holds |
| Password at least 12 characters. | `config.ts:122`; `screens/Account.tsx:105-107` | writer | holds |
| 20 sign-in attempts a minute from one address, also for changing a password. | `kernel/auth.ts:24-48` | writer | holds |
| A reset link works once, runs out in 2 hours; a new one stops the old. | `kit/MemberResetLink.tsx:35` | writer | holds |
| 10 recovery codes. | `kernel/sso/recovery.ts:6` | writer | holds |
| Key expiry Never, 30, 90 days, a year. | `kit/expiry.ts:8-14`; run | writer, run | holds as run |
| A name on Account at most 200 characters. | `screens/Account.tsx:285` (`maxLength={200}`) | writer | holds |
| 20 palette results (1 to 50); 200 characters of text. | `routes/search.ts:95-111` | writer | holds |
| Pinned 12; Recent 20 kept, 8 shown; 12 screens. | `kit/CommandPalette.tsx:260,702-705`; `routes/search.ts:320,425` | writer | holds |
| Palette search 150 ms after typing. | `kit/CommandPalette.tsx:330` | writer | holds |
| Tenant list pages of 50; Runs 100; table rows 50. | `kit/ListCollection.tsx:111`; `screens/Runs.tsx:243`; `screens/Data.tsx:71` | writer | holds |
| Batch 100 per request, sent in groups. | `kit/BatchResult.tsx:21-40` | writer | holds |
| 50 views per list, name up to 80, state up to 16 KB. | `routes/preferences.ts:23-29` | writer | holds |
| Inspector 288 to 720 px. | `kit/layout.tsx:360-361` | writer | holds |
| 200 settings, 4 KB each; allowed kinds. | `routes/preferences.ts:17-22` | writer | holds |
| A setting is sent 400 ms after it changes. | `prefs.ts:19` | writer | holds |
| Notice 5 s, 10 s with a link or button; failures stay; 3 visible. | `packages/ui/src/Toast.tsx:48,68,160-165` | writer | holds |
| Reconnecting after 3 s, offline after 30 s. | `stream.ts:36-38` | writer | holds |
| Streams 5 per person per replica, 2 for own runs. | `kernel/stream.ts:67-69` | writer | holds |
| Read-only check every 30 s. | `kit/ReadOnly.tsx:19` | writer | holds |
| 20 s without a worker, the screen says why. | `tasks.ts:11` | writer | holds |
