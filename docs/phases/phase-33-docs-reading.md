# Phase 33: the documentation reads well at every size, and a site keeps a changelog

Status: in progress, on branch `phase-33-docs-reading`, off `phase-32-faster-suite`.
Last updated: 2026-11-24

The owner (2026-11-23): "Heading scales need to be enlarged as they blend in with normal text very quickly … deploy fluid typography that scales with screen size up to a max of 20px … Provide the same treatment for headings, and allow more heading sizes with auto indent on the 'On this page' and if a user highlights over the heading it should reveal an anchor that when clicked it copies the url to that heading. The reveal can be done with just css. The docs app should also have a theme switcher … I also really like how vellum does its change log … a component that can be placed on any page and it just works." Also from phase 31's end: no page explains how to seed Fernhill, though 43 assume it. The plan is `~/.claude/plans/i-would-like-to-fuzzy-meteor-of-45518b7f-b8fc-41f4-9613-9ba4253edadd.md` (phase 33).

**Exit criterion.** On a throwaway instance seeded with Fernhill, in a browser, at `/docs`, on a tenant's docs site and in the static export:

- a reader on a phone reads 16px body text and on a 2560px monitor 20px, with headings h2 to h6 each plainly a heading and plainly a level of its own;
- "On this page" lists the page's headings to three levels, each indented under its parent, on the side and in the phone's bar;
- a reader hovers a heading (or tabs to it), sees its "#", clicks it, and the heading's address is copied and the page goes there;
- a reader chooses Light, Dark or System; the choice holds across pages and a reload, and the page never flashes the other look first;
- a tenant writes `changelog/2026-11-24-new-intake.md`, puts `::changelog` on a page, and readers see the newest entries with their dates and bodies, and an RSS feed at `changelog.xml`; `/docs` has "What's new" from the repository's `CHANGELOG.md`;
- someone with the repository follows "Set up the Fernhill example" on a fresh instance and has Fernhill.

## Owner decisions

| Area | Decision |
|---|---|
| Changelog entries | A page in a folder named `changelog`, or with the subject `changelog`; dated by `date:`, else a date that begins or ends its file name, else its last update (2026-11-23) |
| Volvel's own changelog | Generated from `CHANGELOG.md` |
| Reach | Every docs site (`/docs`, tenant sites, the export); the help panel and the editor preview get the heading scale at their own size |
| Fernhill | A "Set up the Fernhill example" how-to, linked from every page that assumes Fernhill |
| Stops | After M3 (the look), and at the end |

## Milestones

| # | Milestone |
|---|---|
| M1 | Fluid type and a distinct heading scale |
| M2 | Heading anchors (CSS reveal, copy on click) and a deeper, indented "On this page" |
| M3 | A theme switcher on every docs site, applied before the first paint; stop for the owner |
| M4 | The changelog: entries, `date:`, `::changelog`, RSS, the editor's "Changelog entry", `/docs` "What's new" from `CHANGELOG.md` |
| M5 | Pages: the changelog how-tos and reference, the style guide, "Set up the Fernhill example" |

## Findings

(none yet)

## Polish gate

(answered at the end)
