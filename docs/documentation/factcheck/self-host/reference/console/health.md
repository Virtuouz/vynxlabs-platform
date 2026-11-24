# Fact-check record: self-host/reference/console/health

Code as of commit `14f7d5b9` (branch `phase-31-write-the-docs`), 2026-11-23. Written by the page's writer. Every line was found by searching the file for the claim's own words. Checked by: not yet; the second agent fills the column and result.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Title and description | `apps/console/src/screens/InstanceHealth.tsx:392` | writer, run | |
| Check again button; asked every 15 s | `apps/console/src/screens/InstanceHealth.tsx:76` | writer, run | |
| Ready / Not ready texts | `apps/console/src/screens/InstanceHealth.tsx:132` | writer, run (Ready) | |
| Answers / Down pills, latency ms, Takes no writes tag | `apps/console/src/screens/InstanceHealth.tsx:96` | writer, run (Answers, 5 ms) | |
| Read-only notice text | `apps/console/src/screens/InstanceHealth.tsx:139` | writer, code | |
| Object store line has no latency | `apps/console/src/screens/InstanceHealth.tsx:93` | writer, run | |
| Version and Migration level | `apps/console/src/screens/InstanceHealth.tsx:148` | writer, run | |
| The instance did not answer. | `apps/console/src/screens/InstanceHealth.tsx:71` | writer, code | |
| Each check 3 s, timed out | `apps/control-plane/src/routes/health.ts:24` | writer, code | |
| A database that takes no writes is still ready (200, readOnly) | `apps/control-plane/src/routes/health.ts:88` | writer, code | |
| healthz 200, public, not traced | `apps/control-plane/src/routes/health.ts:52` | writer, code | |
| /instance public: version, level, apps address, mail, publicUrl | `apps/control-plane/src/routes/instance.ts:29` | writer, code | |
| Read-only strip every 30 s and words | `apps/console/src/kit/ReadOnly.tsx:18` | writer, code | |
| Create dialogs disabled while read only | `apps/console/src/ListScreen.tsx:269` | writer, code | |
| 503 read_only retry-after 30 | `apps/control-plane/src/kernel/errors.ts:61` | writer, code | |
| Master key lines and fingerprint text | `apps/console/src/screens/InstanceHealth.tsx:184` | writer, run | |
| No second key notice | `apps/console/src/screens/InstanceHealth.tsx:189` | writer, run | |
| Still sealed notice with rekey | `apps/console/src/screens/InstanceHealth.tsx:201` | writer, code | |
| Removable notice | `apps/console/src/screens/InstanceHealth.tsx:196` | writer, code | |
| Unopened values listed, first 20 | `apps/console/src/screens/InstanceHealth.tsx:214` | writer, code | |
| Rekey exits 1 for a value neither key opens | `apps/control-plane/src/commands.ts:12` | writer, code | |
| Settings section lines and their words | `apps/console/src/screens/InstanceHealth.tsx:260` | writer, run | |
| Not set: worked out from this machine | `apps/console/src/screens/InstanceHealth.tsx:232` | writer, run | |
| Database pools line | `apps/console/src/screens/InstanceHealth.tsx:268` | writer, run | |
| Time limits, Schedule backlog | `apps/console/src/screens/InstanceHealth.tsx:283` | writer, run | |
| Triggers line is the environment only | `apps/console/src/screens/InstanceHealth.tsx:289` | writer, run | |
| Kept: runs / events / refusals / audit log | `apps/console/src/screens/InstanceHealth.tsx:300` | writer, run | |
| Apps, Mail, Reachable networks, Proxies lines | `apps/console/src/screens/InstanceHealth.tsx:329` | writer, run | |
| Metrics section text and lines | `apps/console/src/screens/InstanceHealth.tsx:370` | writer, run | |
| Permissions instance:read for master-key and settings | `apps/control-plane/src/routes/master-key.ts:15` | writer, code | |

Checked by: second agent, 2026-11-23. Instance http://localhost:8091 as the operator `admin@example.com`, Playwright headless: 1440 px light (text of every screen compared with the page), 390 px dark (no horizontal scroll on any instance screen; keyboard Tab order reaches the page's controls with a visible focus ring on each), and the controls named below. Tenants, members, a database and a database location made for the check were deleted afterwards (`instance-chk2`, `instance-chk3`, `inst-chk-db`, the throwaway database `instchk_loc`); the member `inst-chk@example.com` stays (a member cannot be deleted). Seen: **Health** section (Ready, "This replica takes requests.", Database 3 ms, Object store, Version 0.5.0, Migration level), **Master key** (fingerprint, "Not set", the fingerprint sentence, "No second key is set, so no rotation is under way."), **This replica's settings** (Workers, Run slots, Memory floor, Most workers alive, "10 for the platform, 10 for rows", "15 s for a data operation, 15 s for a query", Schedule backlog "A schedule skips its time past 200 queued runs", Triggers, Kept: runs 30 days). The Not ready, read-only and rotating states are from the code (`InstanceHealth.tsx`), not run. Note: the settings line says "for the platform" (Volvel's word is instance): quoted as the screen words it; fault fixed (fc 18): the line now reads "for Volvel's own work", confirmed in the code (InstanceHealth.tsx:268); the page quotes it.
