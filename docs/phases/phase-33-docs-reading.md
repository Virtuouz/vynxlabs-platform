# Phase 33: the documentation reads well at every size, and a site keeps a changelog

Status: built, at the owner's stop, on branch `phase-33-docs-reading`, off `phase-32-faster-suite`. Nothing merged or pushed.
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
| Theme control (2026-11-24) | On a phone, one button at the foot of the side navigation, not in the top bar; on a wide screen the three; on `/docs` a signed-in member's choice is kept with their settings |
| Changelog content | Left as it is: to be cut down before the public launch |

## Milestones

| # | Milestone |
|---|---|
| M1 | Fluid type and a distinct heading scale |
| M2 | Heading anchors (CSS reveal, copy on click) and a deeper, indented "On this page" |
| M3 | A theme switcher on every docs site, applied before the first paint; stop for the owner |
| M4 | The changelog: entries, `date:`, `::changelog`, RSS, the editor's "Changelog entry", `/docs` "What's new" from `CHANGELOG.md` |
| M5 | Pages: the changelog how-tos and reference, the style guide, "Set up the Fernhill example" |

## Findings

- **M1 to M3, the look** (lane d1, `docs/documentation/fixed/p33-d1.md`):
  - **Body type** is fluid, measured at 16.2 px at 390, 17.9 at 768 and 20 from 1440 up. Its bounds are in px, so a tenant theme's root size cannot push it past 20 (lane d4).
  - **Headings:** h2 to h6 each distinct, from h2 at 2em with a rule to h6 in small caps.
  - **Anchors:** every heading has an anchor, revealed by CSS on hover or focus and always shown on touch screens; Enter or a click copies the address.
  - **"On this page"** lists three levels.
  - **Theme:** chosen before the first paint by a hashed platform asset, and the content policy is unchanged.
- **Heading levels, one rule everywhere** (lane d4): the walk found `/docs` drawing a written `##` as h3, the flow reference going from h1 to h4, and the editor preview disagreeing with the site. Now the highest level an author used is drawn as h2 (or h3 where a title sits above, as in the help panel), with no level skipped. The same rule serves served sites, the export, the editor preview, the help panel and the kit.
- **M4, the changelog** (lanes d2 and d4):
  - **Entries:** a page in a `changelog` folder or with the subject `changelog`, dated by `date:`, by a date that begins or ends its name, or by its last update.
  - **The component:** `::changelog{limit folder subject}`, in the Insert list and the editor's preview.
  - **The feed:** RSS at `changelog.xml`, served by tenant sites, `/docs` and `volvel dev`, and written by the export.
  - **Order:** newest first in the navigation and Previous/Next too.
  - **The folder's own page** lists its entries when it has no index, in the export as well.
  - **In the editor:** "Changelog entry" in New page, and a Date field in Page details.
  - **Volvel's own changelog:** `/docs` "What's new" is generated from `CHANGELOG.md`. Only the Unreleased entry says it is unreleased.
- **M5, pages** (all checked by a second agent, the how-tos done from nothing):
  - "Set up the Fernhill example", run on an empty instance in about 40 s and linked from 39 pages that assume Fernhill;
  - two "Keep a changelog" how-tos, in the console and in a repository;
  - the pages on reading a docs site, the editor's screen reference, and the style guide.
- **Found by deploying:** the image's build did not copy `CHANGELOG.md`, so every image build failed once the generator needed it. Fixed in the Dockerfile.
- **The theme control after the owner's look** (2026-11-24): on a phone, one button at the foot of the drawer that goes System, Light, Dark and says which is in force; the top bar gives the site's name its room back. On `/docs` a signed-in member's choice is also sent to their settings, so the console keeps it.
- **Full suites at the end.**
  - `pnpm e2e`: 264 passed and 3 failed in one run beside the unit suite (12.3 min under that load). Two of the failures pass alone (`phase-26`, `run-logs`). The third was the component kit's reviewed picture, which the new heading scale changed: looked at side by side (the sample page's heading is larger, the rest 12 px lower), then updated, and it passes twice in a row.
  - `pnpm test`: 5047 of 5059 passed. The failures were timing tests under the same load, and all 171 tests of their four files pass alone.

## Polish gate

1. **Rules.** Typography and headings (POLISH-002 hierarchy), navigation at every width (POLISH-004), states with scripts off and before the first paint (POLISH-009), the shared piece (POLISH-013). Each fix names the piece: `packages/markup/src/style.ts` and `headingTop` (markup), `packages/docs-site/src/{css,render,script,assets}.ts`, `docs-engine/src/changelog.ts`.
2. **Siblings.**
   - One heading rule serves every surface that draws a document: served sites, the export, the console's `Doc` (help panel, editor preview, kit) and the Markdown editor.
   - The theme control is one piece, in the side foot, the drawer and the home bar.
   - The changelog's order is one function, used by the component, the navigation and Previous/Next.
3. **Lifecycle.** A changelog entry is created (New page), dated, edited, listed, fed and removed like any page. The theme choice is made, changed, kept across reloads, and cleared to System.
4. **States.**
   - Scripts off: the control is hidden and the system look applies.
   - Before the first paint: the theme is set with the stylesheet held back.
   - An empty changelog: the component says so.
   - An undated entry, an unreleased one, and a folder without an index all have a page.
5. **Walk** (`docs/documentation/walks/p33.md`):
   - Where: a throwaway Fernhill instance, on `/docs`, Fernhill's handbook, the help panel and the editor.
   - Widths and looks: 390, 768, 1440 and 2560, in light and dark, each theme with a reload.
   - Ways in: by keyboard (anchors, the control, the drawer), with scripts off, and on touch.
   - It found six faults; they and the writer's six are fixed in lane d4 and looked at again.
   - Not walked: the console at 2560, and network throttling.
6. **Guards.** Golden pages for the anchors, levels and control; tests of the heading rule, the type bounds, the changelog's rule, dates, order and feed, the control's states and the save to a member's settings; `docs:check` with the changelog generator's staleness check; the full suites above.
7. **Left out.** Nothing of the owner's decisions. The changelog's content is left as it is, by the owner's choice.
