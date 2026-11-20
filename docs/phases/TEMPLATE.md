# Phase N: what a person can do at the end of it

Status: planned | in progress | built, on branch `phase-N-short-name`, off `<the branch it starts from>`.
Last updated: YYYY-MM-DD

What the phase is for, and where the ask came from: the owner's words, a drawing in `temp/`, a finding of an earlier phase.

**Exit criterion.** On `examples/fernhill`, in a browser:

- one line per thing a person does, said as a journey, not a capability ("a folder is made, renamed, moved and deleted without opening a page", not "folders are supported");
- each line names the screen it happens on.

## Owner decisions

| Area | Decision |
|---|---|
| | Asked of the owner before the milestone that needs it. Anything trimmed later is asked again (POLISH-015) |

## Milestones

| # | Milestone |
|---|---|
| M1 | |

## M1: what is true when it is done

**Built.** What was built, with `path:line` for the pieces that matter.

**Tests.** Which tests, and what each proves.

**Findings.** What building it found, including what the browser walk found. "The walk found nothing" is a finding.

**Polish gate.** Required before a milestone that changes anything a person sees is marked Built. See [the gate](../polish/milestone-polish-quality-gate.md) and [the rules](../polish/polish-prevention-rules.md). Answer each with a `file:line`, a screenshot path, or "not applicable because …".

1. **Rules.** The POLISH rules this milestone touches, each as a line in its acceptance criteria.
2. **Siblings.** The screens that do the same job (another builder, list, preview or surface), and the shared piece used. A fix lists every other place the shared piece is used.
3. **Lifecycle.** For each kind of object shown: create, open, edit, rename, move, duplicate, remove, undo and redo, clear a field, bulk. Each is built, left out on purpose (why), or missing. Compared with what the API offers.
4. **States.** For each new screen, where loading, empty, filtered-empty, stale, failed, forbidden, waiting and live are drawn. What a slow save and a failed save look like.
5. **Walk.** On a throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, never the owner's own. At 1440×900, 1440×640, 768 and 390 px; light and dark; F1, ⌘K, `/`, Esc and Tab; reload, Back and a shared link; the longest real values; the network throttled once. Screenshots and what was found.
6. **Guards.** A typecheck and the unit tests of what the milestone touched, and its browser walk. The full `pnpm test` and `pnpm e2e` run once, at the end of the phase, before it is presented as built. New screens are measured in `e2e/polish.spec.ts` (or listed in its `NOT_MEASURED`, with why). A served surface is under the `e2e/test.ts` motion fixture. A primitive that can be misused has an `enforce.test.ts` rule.
7. **Left out.** What was trimmed from the decisions or the exit criterion, and when the owner was asked.

## Findings

What the phase as a whole found.

## After the owner's first look

What the owner asked for after seeing it, and what was done. This section is what the polish gate is meant to keep short.
