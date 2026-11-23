# Phase 31: every screen and feature of Volvel is documented

Status: in progress, on branch `phase-31-write-the-docs`, off `phase-30-docs-system`.
Last updated: 2026-11-24

The owner asked for documentation of every screen and feature, the console and local development, with self-hosting and administration (2026-11-22). Phase 29 corrected the product, phase 30 built the system the pages live in (`/docs` on every instance, the help panel, the static export, Diátaxis types, generated reference). This phase writes the pages. The plan is `~/.claude/plans/i-would-like-to-fuzzy-meteor-of-45518b7f-b8fc-41f4-9613-9ba4253edadd.md`; the writers' briefs are `docs/documentation/inventory/*.md` (refreshed in phase 30 M0).

**Exit criterion.** On `examples/fernhill`, in a browser, at `/docs` and in F1:

- someone new signs in, follows Get started, and makes a first script, a first approval flow and a first app by its tutorials alone;
- every screen of the console has a reference page that F1 opens, every how-to the briefs list is there, and each tutorial and how-to was done on a throwaway instance as written;
- a developer installs the CLI as published (and from source), follows the Develop quickstart to a deployed repository, and finds every command, SDK export and API route in the reference;
- an administrator sets up members, groups, SSO and audit from Administer;
- an operator installs Volvel with Compose from Self-host, restores a backup and rotates the master key as written;
- `pnpm docs:check` passes with no stub, no warning beyond the ratchet, and every page carries a type.

## Owner decisions

| Area | Decision |
|---|---|
| Form | Diátaxis; five collections; Fernhill is the running example (2026-11-22) |
| Install steps | As published (npm `@volvel/*`, Docker `volvel/volvel`), plus a from-source page; publishing still needs the owner's word |
| Agents | Sonnet writers, up to 20 at once; a second agent checks each page against the code |
| Stops | After M1 (the Tables sample: look and voice), and at the end |

## Milestones

| # | Milestone |
|---|---|
| M0 | Style guide: voice, terminology, labels, the four page templates, what not to describe |
| M1 | Sample: Tables, as reference, how-tos, an explanation and a tutorial, with screenshots; stop for the owner |
| M2 | Get started |
| M3 | Console |
| M4 | Develop |
| M5 | Administer |
| M6 | Self-host |
| M7 | Retire the old guides; README, SECURITY.md, CHANGELOG |

## Findings
