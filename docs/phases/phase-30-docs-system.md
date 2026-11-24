# Phase 30: Volvel's documentation is served, typed and generated like a tenant's docs site

Status: built, not merged; at the owner's end-of-phase look, on branch `phase-30-docs-system`, off `phase-29-correct-the-product`.
Last updated: 2026-11-24

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

- **Built, M0 to M11, each in a lane with its write-up in `docs/documentation/fixed/p30-*.md`.** The 20 writers' briefs were refreshed against the code (M0). `@volvel/docs-site` draws tenant sites, `/docs`, the help panel's pages and the static export from one `SiteView` (M1); golden pages prove untyped tenant sites unchanged except the changes listed below. `volvel dev` draws interface and docs apps from local files, and the packed CLI carries the interface runtime (M1b, D64). Product profile, highlighting, a smaller search index (M2); Diátaxis types, subjects, eyebrows, type cards, related pages and the "instance may be older" hint (M3); redirects, `paths.lock`, `names.lock`, the `volvel-` reserve and the asked-topics check (M4); `/docs` on every instance (M5); the five collections with redirects from every old path (M6); the help panel's breadcrumbs, pager, related, "Open in documentation" and server search (M7); types and subjects in the docs editor, product terms and `::field` on tenant sites with a leak test (M8); the API reference without a database and every kind field described, coverage 1.0, typed registries of audit actions, platform events and metrics (M9); screenshots from a manifest in light and dark (M10); the static export with a crawl test (M11).
- **Walks** (`docs/documentation/walks/p30-*.md`, on a throwaway Fernhill instance at :8091): five walks found 29 faults, a re-walk found 6 more, a third found one; all are fixed and confirmed in the browser (p30-r-last, p30-r-explain). Not walkable yet: diagrams, dark screenshots and related pages on /docs, since no page has a diagram or subjects and the local build takes no screenshots (CI does); the Repository page's "Set in volvel.yaml" state needs a remote repository.
- **Two lanes drew the same thing two ways** (dark screenshots; previous/next): kept one each, by the page's own look and by the whole navigation.
- **Visible on existing tenant sites** (not only typed ones): tab titles "page · folder · site", a breadcrumb on collection pages, previous/next within a collection. Asked of the owner.
- **Full suites, once at the end.** `pnpm test`: 4763 of 4769 passed; the 2 failures were tests out of date with this phase (the metrics guide test now reads the typed metric list; nothing under /help but its files), fixed. `pnpm e2e`: 162 of 183 passed, 19 failed. 16 had one cause, found by the e2e and by no unit test: Prism's language files ran before its core in the bundled app runtime, so every published app stopped at "Loading the app" (fixed by putting the core on the global first, `packages/markup/src/prism-global.ts`, with a test that holds the import order). The other three: the help's search ranked generated reference above the written screen pages, since M6 moved those under `reference` (generated pages now rank after written ones; the server answers as many as the panel shows); a record's Fields list lost the heading column after TAB-30 reordered columns (the heading and status stay listed, hidden); and one spec's selector. Every failed spec was rerun and passes.
- **Highlighting** (D67): Prism on the server, classes only, with `diff-<lang>` and marked lines; light token colors raised so every token keeps 4.5:1, on a marked line too.

## Asked of the owner at the stop after M8 (answered 2026-11-23, D66 to D69)

1. Reset links: from a tenant, a member who also belongs to another tenant or holds an instance role is refused; only an operator makes theirs.
2. Code highlighting: the small built-in highlighter (no new dependency, since none could be installed offline), or `lowlight` later.
3. Tenant docs names starting `volvel-` are refused at deploy, so the product's help never takes a tenant's name.
4. `@volvel/docs-site` is marked publishable (nothing publishes until releases are switched on).
5. The visible changes on existing tenant sites above.
