# Milestone polish quality gate

Status: adopted on 2026-11-20 in three places, the owner's choice of 1, 3 and 4 below:
- [docs/phases/TEMPLATE.md](../phases/TEMPLATE.md) and a "Phases" section in `CONTRIBUTING.md`;
- the root `CLAUDE.md`;
- a rule in `apps/console/src/enforce.test.ts` that every navigation section is measured by `e2e/polish.spec.ts` or listed in its `NOT_MEASURED`.

The other tests in place 4 come in phase 22, each with the fix that makes it pass. Written 2026-11-20.

Over phases 0 to 21, 124 corrections were made after a milestone had been called built ([historical-polish-analysis.md](historical-polish-analysis.md)). About 60 of them were found only in a browser, on an instance, or by the owner. In phases 18 to 21 the owner found most of them, within hours of each phase. This gate moves that look to before "built".

## The gate

An implementing agent works through these before a milestone that changes anything a person sees is marked **Built** in its phase document. The answers go into the milestone's section of the phase document, under a heading **Polish gate**. Each answer is a `file:line`, a screenshot path, or "not applicable because …".

1. **Before building, read the rules that apply.**
   - Name which of [POLISH-001 to 015](polish-prevention-rules.md) the milestone touches.
   - For each, add one line to the milestone's acceptance criteria. For example: "every new list has loading, empty, error and filtered-empty states (POLISH-001)"; "a table, its columns and its rows can be renamed where they are shown (POLISH-003)".
2. **Name the siblings (POLISH-002, 013).**
   - List the existing screens that do the same job: the other builder, the other list, the other preview, the other surface (console, served site, code app, MCP).
   - Build on their shared piece, or write down why not.
   - When fixing something, fix it in the shared piece and list the other places that use it.
3. **Fill in the lifecycle matrix (POLISH-003).**
   - For each kind of object the milestone shows, list create, open, edit, rename or title, move, duplicate, delete or remove, undo and redo, clear a field, and bulk.
   - Mark each built, left out on purpose (and why), or missing.
   - Compare it with what the API offers for that kind.
4. **List the states (POLISH-001, 012).** For each new screen, say where loading, empty, filtered-empty, stale, failed, forbidden, waiting and live are drawn. Say what a slow save and a failed save look like.
5. **Walk it in a browser, on Fernhill, before the commit (POLISH-014).**
   - Seeded instance: `examples/fernhill/setup/setup.mjs` against a throwaway instance, never the owner's own.
   - Widths: 1440×900, 1440×640, 768 and 390.
   - Themes: light and dark.
   - Keyboard: F1, ⌘K, `/`, Esc, Tab.
   - Navigation: reload, Back, and a shared link.
   - Content: the longest real values.
   - Network: with it throttled once.
   - Write what the walk found into the milestone's Findings, including "found nothing".
6. **Run the guards, and extend them.**
   - Run `pnpm test` and the full `pnpm e2e`, not one spec.
   - Add every new screen to `e2e/polish.spec.ts`'s measured list.
   - A served surface goes under the `e2e/test.ts` motion fixture.
   - A new primitive that can be misused gets an `enforce.test.ts` rule.
7. **Raise what is left out (POLISH-015).** Anything trimmed from the owner's decisions table or exit criterion is asked about before the phase is presented. Leaving it in a "Not built" list at the bottom of the milestone is not enough.

A milestone that cannot pass a step says so in its Findings, as phase 21 did with its walk-through (`docs/phases/phase-21-docs-redesign.md:59`). The phase is then not presented as finished.

## Why each step

| Step | The history it answers |
|---|---|
| 1 | Exit criteria name capabilities (`phase-21-docs-redesign.md:7-13`). Lifecycle and state gaps were then found by the owner (H18-22, H18-27, H18-28) |
| 2 | Thirteen of the audit's findings repeat a correction made at one call site (`maxLength` three times: H0-26, H0-64, A2-10). Motion was fixed in the console and missing on the served site (H18-34) |
| 3 | 14 lifecycle corrections (H0-20, H0-58, H12-48, H18-06, H18-22, H18-27). The audit still finds 14 more |
| 4 | 18 state corrections. The audit finds 12 more and 10 latency ones, including R-03, where ⌘S saved stale text and said it saved |
| 5 | About 60 corrections found only this way. Phase 20 M8 and M9 were "not seen in a browser" (`phase-20-documentation.md:413,452`), and two defects showed within an hour of the first look |
| 6 | Guards stop recurrences only where they reach. The phase 16 layout measures do not cover the data screens (A2-31) |
| 7 | Draft preview, page dragging and the frontmatter form were each trimmed in phase 20 M9 and asked for again within hours (H18-25, H18-27, H18-28) |

## Where it lives

These were listed for the owner to choose from. 1, 3 and 4 were adopted, and 2 came with 1, since there was no template file to point to. Of 4:
- the `nav.ts` coverage check is in, as a static rule in `enforce.test.ts` over the spec's list, so it runs in `pnpm test` without an instance;
- the `ListScreen`, key and `SchemaForm` rules and the served-site motion fixture come in phase 22, each with the fix that makes it pass;
- 5 is not adopted.

1. **The phase-document template.** Every phase document already has, for each milestone, "Built", "Tests" and "Findings" (`docs/phases/phase-19-dashboards-motion.md:29-50`). Add a fourth, **Polish gate**, holding the seven answers. This is the smallest change and fits how phases are already written.
2. **A pointer in `CONTRIBUTING.md`** to `docs/polish/polish-prevention-rules.md` and this gate, under how a phase is built.
3. **The agent's standing instructions.** A short `CLAUDE.md` at the repository root, or an entry in the agent's memory for this project, saying that a milestone that changes UI is not "built" until its Polish gate section is filled in and its browser walk has run on Fernhill. Today, the owner's rule that a redesign is responsive lives only in the agent's memory.
4. **Tests that enforce parts of the gate.**
   - `e2e/polish.spec.ts` reads its list of screens from `nav.ts`, so a new section is measured without anyone adding it.
   - `enforce.test.ts` refuses a nested `ListScreen` without `as="section"` (R-01's class), and a key handler that stops propagation of keys it does not handle (H18-24, A3-08).
   - A `SchemaForm` test renders every connector's schema (A2-10's class).
   - The `e2e/test.ts` motion fixture covers the served docs site and code apps.
5. **A rule-tagged walk.** One e2e spec per phase walks the exit criterion as the walk-throughs already do. It is tagged with the POLISH rules it checks, so a recurrence fails a named rule.

The recommended combination is 1, 3 and 4. The template makes the gate part of writing a phase. The standing instruction makes the agent fill it in. The tests catch whichever recurrences can be caught without a person.

## Measuring whether it works

After the next two phases, count the owner's corrections as this analysis did (the phase document's "after the first look" items and the commits that make them). Compare with phases 18 to 21, where there were 26 owner-found items over four phases. The rules have worked if the count falls and those that remain fall outside POLISH-001 to 015. If a new kind keeps appearing, it becomes POLISH-016.
