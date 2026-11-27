<!-- The title is a conventional commit: `feat(console): …`, `fix(worker): …`, `docs: …`. It becomes the squashed commit and the changelog line. -->

## What it does

## Related issue

Closes #

## Checks

- [ ] `pnpm typecheck` and the unit tests of what it touched
- [ ] A changed contract (manifest schema, bundle, worker protocol, tenant export) is updated in the same PR, and old bundles and workers still work
- [ ] A change a person would notice has a changeset (`pnpm changeset`), written for the release notes
- [ ] A breaking change is marked with `!` in the title, and its changeset says what to do about it

## Polish gate

<!-- For anything a person sees. Answer each step of docs/engineering/milestone-polish-quality-gate.md, or say "not applicable: no screen changed". -->

- Walk (Fernhill, 1440 / 768 / 390, light and dark, keyboard, reload):
- What the walk found:
