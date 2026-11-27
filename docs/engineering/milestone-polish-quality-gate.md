# The polish gate

A change to anything a person sees in the console, an app or the documentation site is not done until it has passed this gate. It moves the look that used to find corrections after a change was called built, missing states, screens that do the same job drifting apart, lifecycles that stop at create, layouts sized for sample data, to before it.

An audit of 124 such corrections gave the rules in [polish-prevention-rules.md](polish-prevention-rules.md), POLISH-001 to 015. The gate is how they are applied.

## Where the answers go

- **The issue** holds step 1: its acceptance criteria name the rules the work touches. The *Milestone task* issue form has the checklist.
- **The pull request** holds steps 2 to 7, under **Polish gate** in its description. Each answer is a `file:line`, a screenshot, or "not applicable because …".

## The gate

1. **Before building, read the rules that apply.**
   - Name which of [POLISH-001 to 015](polish-prevention-rules.md) the work touches.
   - For each, add one line to the acceptance criteria. For example: "every new list has loading, empty, error and filtered-empty states (POLISH-001)"; "a table, its columns and its rows can be renamed where they are shown (POLISH-003)".
2. **Name the siblings (POLISH-002, 013).**
   - List the existing screens that do the same job: the other builder, the other list, the other preview, the other surface (console, served site, code app, MCP).
   - Build on their shared piece, or write down why not.
   - When fixing something, fix it in the shared piece and list the other places that use it.
3. **Fill in the lifecycle (POLISH-003).**
   - For each kind of object shown, list create, open, edit, rename or title, move, duplicate, delete or remove, undo and redo, clear a field, and bulk.
   - Mark each built, left out on purpose (and why), or missing.
   - Compare it with what the API offers for that kind.
4. **List the states (POLISH-001, 012).** For each new screen, say where loading, empty, filtered-empty, stale, failed, forbidden, waiting and live are drawn. Say what a slow save and a failed save look like.
5. **Walk it in a browser, on Fernhill, before asking for review (POLISH-014).**
   - Seeded instance: `examples/fernhill/setup/setup.mjs` against a throwaway instance, never one people use.
   - Widths: 1440×900, 1440×640, 768 and 390.
   - Themes: light and dark.
   - Keyboard: F1, ⌘K, `/`, Esc, Tab.
   - Navigation: reload, Back, and a shared link.
   - Content: the longest real values.
   - Network: with it throttled once.
   - Write what the walk found into the pull request, including "found nothing".
6. **Run the guards, and extend them.**
   - For each change, a typecheck and the unit tests of what it touched. The full `pnpm test` and `pnpm e2e` run once at the end of a milestone.
   - Add every new screen to `e2e/polish-setup.ts`'s measured list, or to its `NOT_MEASURED` with the reason. `apps/console/src/enforce.test.ts` checks this.
   - A served surface goes under the `e2e/test.ts` motion fixture.
   - A new primitive that can be misused gets an `enforce.test.ts` rule.
7. **Raise what is left out (POLISH-015).** Anything trimmed from the owner's decisions or the acceptance criteria is asked about before the work is presented. A "not built" list at the bottom is not enough.

Work that cannot pass a step says so in its pull request, and is not presented as finished.

## Why each step

| Step | What it prevents |
|---|---|
| 1 | Acceptance criteria that name a capability ("folders are supported") and miss the lifecycle and states a person needs |
| 2 | A correction made at one call site and repeated later at the others. Thirteen of the audit's findings were of this kind |
| 3 | Objects that can be made but not renamed, moved, duplicated or removed where they are shown |
| 4 | Screens with no empty, failed or waiting state, and saves that say they saved when they did not |
| 5 | Faults that only show in a browser, at a phone's width, in dark, or by keyboard. About half of the audit's findings were found only this way |
| 6 | Recurrences. Guards stop them only where they reach |
| 7 | Work trimmed quietly and asked for again as soon as it is seen |

## When a new kind of fault keeps appearing

It becomes POLISH-016 in [the rules](polish-prevention-rules.md), with a guard where one can be written.
