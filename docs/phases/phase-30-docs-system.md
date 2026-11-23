# Phase 30: Volvel's documentation is served, typed and generated like a tenant's docs site

Status: in progress, on branch `phase-30-docs-system`, off `phase-29-correct-the-product`.
Last updated: 2026-11-23

The owner asked for documentation of every screen and feature, the console and local development, with self-hosting and administration (2026-11-22). Phase 29 corrected the product first. This phase builds the system the pages live in; phase 31 writes them. The plan is `~/.claude/plans/i-would-like-to-fuzzy-meteor-of-45518b7f-b8fc-41f4-9613-9ba4253edadd.md`; the design is [docs-platform-design](../documentation/inventory/docs-platform-design.md).

**Exit criterion.** On `examples/fernhill`, in a browser:

- someone not signed in opens `/docs` on the instance, finds the five collections (Get started, Console, Develop, Administer, Self-host), searches, filters by type, and follows a page to its related pages of other types;
- in the console, F1 opens the same page in the help panel, with breadcrumbs, previous and next, and "Open in documentation";
- a tenant's docs writer gives a page a type and subjects in Page details, makes a new page from a type's template, and the served site shows the eyebrow, the type cards and the related pages; an untyped tenant site looks as it did;
- a developer runs `volvel dev` for an interface app and a docs app and sees them drawn from local files;
- the static export is crawled under a base path with no broken link.

## Owner decisions

| Area | Decision |
|---|---|
| Form | Looks like, and is generated like, a tenant's docs app; one collection per audience; Diátaxis; tenant docs apps get every enhancement, compatibly (2026-11-22) |
| Served | `/docs` on every instance, no sign-in, offline, console branding; and a static export (2026-11-22) |
| `volvel dev` | Interface and docs apps drawn locally with the instance's packages (D64) |
| Agents | Sonnet, up to 20 at once |

## Milestones

| # | Milestone |
|---|---|
| M0 | Refresh the writers' briefs with phase 29's changes |
| M1 | Shared renderer `packages/docs-site`; `describeApi()` spike |
| M1b | `volvel dev` for interface and docs apps |
| M2 | Gaps: product profile, highlighting, search index |
| M3 | Diátaxis engine |
| M4 | Moves and names |
| M5 | `/docs` on every instance |
| M6 | Content layout |
| M7 | Help panel |
| M8 | Tenant side |
| M9 | Generators |
| M10 | Screenshots |
| M11 | Static export |

## Findings

- **D4 was decided but not built for members** (found by M0). Lane reset built it: a one-time link a tenant admin or operator makes. Its own rule, to confirm with the owner: from a tenant, a member who also belongs to another tenant or holds an instance role is refused (only an operator makes it).
- **Five table findings were triaged real and never given to a lane** (TAB-30, 33, 34, 36, 37), found by M0's tables brief; with other untruths the briefs found, they go to lane truth.
