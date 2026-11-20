# Polish: what the history predicts

Status: analysis and proposals. Nothing in the application, its tests or its processes was changed. Written 2026-11-20 on branch `polish-pattern-audit`, off `phase-21-docs-redesign` at `f54d4bc`.

After each phase, the owner looked at the work and asked for another round of corrections. This directory reads the whole git history (316 commits, phases 0 to 21) for what those corrections had in common. It turns that into rules, uses the rules to audit the current application, and proposes a gate so the next phase meets the rules before the owner does.

## Documents

| Document | Contents |
|---|---|
| [historical-polish-analysis.md](historical-polish-analysis.md) | 174 history rows, 124 distinct corrections, how and when each was found, 14 patterns, why they survive, and the full evidence tables |
| [polish-prevention-rules.md](polish-prevention-rules.md) | POLISH-001 to 015: for each, the history, the failure, how to find it, what complete looks like and how to check. A one-page checklist at the end |
| [predictive-ux-audit.md](predictive-ux-audit.md) | 84 findings across the console, the served docs site and apps, each linked to its rule. The runtime results, and the per-area tables |
| [polish-remediation-roadmap.md](polish-remediation-roadmap.md) | 13 quick wins, and 10 larger items grouped by the shared piece each builds, in order, with risks and checks |
| [milestone-polish-quality-gate.md](milestone-polish-quality-gate.md) | The seven-step gate, why each step, and where it could live in the repository (proposals) |

Start here, then read the rules, then the roadmap.

## Evidence labels

- **History rows** (`H0-…`, `H12-…`, `H18-…`) cite commits and phase-document lines. A fifth of the cited commits were checked again.
- **Audit findings** (`A1-…`, `A2-…`, `A3-…`, `R-…`) are labelled one of these:
  - **Confirmed:** seen in a browser, or by replaying the console's request on a throwaway instance seeded with Fernhill.
  - **Probable:** the code path is clear.
  - **Speculative.**
  - **Refuted.**

## Limits

- One author, nine days of history. "Owner-found" rests on the phase documents' words.
- The runtime pass used a throwaway local instance and one seeded tenant. The owner's instance and the Fly test instance were not touched.
- No screen reader was used.
- The served docs site was read, not walked.
