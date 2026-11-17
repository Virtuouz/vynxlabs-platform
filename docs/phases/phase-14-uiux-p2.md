# Phase 14: design-system consistency and information architecture (UI/UX audit P2)

Status: Milestone 0 (plan) on branch `phase-14-uiux-p2`, off `phase-13-uiux-p1`.
Last updated: 2026-11-16

The UI/UX audit ranks thirteen items as P2 in [09-prioritized-uiux-roadmap.md](../uiux/09-prioritized-uiux-roadmap.md). Phase 13 already built two of them: P2-2, one `DataTable` for every list, and P2-6, URL state on every screen. This phase does the other eleven. Each was re-checked against `phase-13-uiux-p1`.

| What fails | What it looks like | Cause |
| --- | --- | --- |
| Tokens (P2-1) | About 194 arbitrary type sizes, 46 hard-coded 4 px corners, unnamed shadows and z-index values | No spacing, elevation, layer, icon or motion tokens; nine type roles |
| Page headers (P2-3) | Eight header variants and seven kinds of back link. The shell names the section only to screen readers | Each screen draws its own |
| Load states (P2-4) | 40 bare "Loading…" lines. 82 error notices without Try again. Request IDs dropped. A proxy's HTML 502 breaks the client | No shared load state; `ApiError` keeps no request ID |
| Status (P2-5) | About 33 Badges show lifecycle state. Canceled and skipped share an icon. Five local state maps | No domain states in the one map |
| Forms (P2-7) | Field errors aren't linked to their fields. No required marks. Pages mix save models. Large configuration lives in modals. A mistyped secret name makes a new secret | Fields render errors as loose text; no SaveBar or SecretField |
| Feedback (P2-8) | About 90–100 of 170 writes confirm nothing. Pause and resume wait for the server | No toast title or link; no Button loading state |
| Data grid (P2-9) | Every cell is a tab stop. No sticky header, batch delete or CSV. Offset paging shifts | `Grid` predates the grid pattern |
| App Builder and Dashboards (P2-10) | One 2,118-line file. The canvas sits under 200 px of chrome. No undo. The device preview doesn't narrow the layout. Dashboards save differently | Two shells around one editor; viewport breakpoints in the renderer |
| Admin (P2-11) | Giving access starts from a role, not a person. A service account is spread over two pages. Audit search sees only loaded rows | No principal search; audit filters too narrow |
| Enforcement (P2-12) | Screenshots are taken but never compared. No axe. One lint rule | — |
| First run (P2-13) | An operator can't see inside the tenant they just made. A new workspace says "Nothing needs you here". Never-deployed scripts are missing from the scripts list | Grant-only access; no checklist; scripts route ignores drafts |

**Exit criterion:** the Acceptance rows of P2-1, 3, 4, 5, 7, 8, 9, 10, 11, 12 and 13 in the roadmap pass.

## Owner decisions

| Area | Decision |
| --- | --- |
| Shape | One branch, `phase-14-uiux-p2`, with thirteen milestones built one after another, one commit each |
| Tokens and tenant apps | They move together. The kit's new defaults reach tenant apps; a screenshot baseline is taken first, so each visible change is a reviewed diff. The changelog says what moved |
| Tenant creator | Creating a tenant offers "Make me a member, as tenant admin", checked by default |
| Docs and hints | Out of scope: no "Learn more" links, new concept hints or just-in-time help. A later phase does documentation. Empty states offer the console action only |
| Dashboards | Autosave like apps, with a visible Saved state and undo and redo. Sharing is the dashboard's publishing step |

## Milestones

| # | Milestone | Audit |
| --- | --- | --- |
| 0 | Branch and this document | |
| 1 | Baselines: compared screenshots of the console and tenant apps, axe | P2-12 |
| 2 | Token foundation v2, and the call sites moved onto it | P2-1 |
| 3 | Status system | P2-5 |
| 4 | LoadState and request IDs | P2-4 |
| 5 | One PageHeader and a breadcrumb | P2-3 |
| 6 | Feedback: Toast v2, Button loading, every write confirms, optimistic pause | P2-8 |
| 7 | Forms: linked errors, required marks, SecretField, one save model per page, configuration out of modals | P2-7 |
| 8 | Data grid | P2-9 |
| 9 | App Builder and Dashboards: split, one editor shell, undo and redo, publish summary, container queries | P2-10 |
| 10 | Admin: give access from the person, one service-account page, audit search | P2-11 |
| 11 | First run and empty states | P2-13 |
| 12 | Enforcement rules, axe everywhere, keyboard journeys, kit sheet | P2-12 |
| 13 | Changelog, docs, the whole e2e suite | |

Findings are recorded under each milestone as it lands.
