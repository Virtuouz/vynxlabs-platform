# Working in this repository

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/master-spec.md](docs/master-spec.md) first.

## Where the work is

- The work is in GitHub issues and milestones on `volveldev/volvel`, not in files. Start from the issue: `gh issue view <n>`, and its milestone's tracking issue for the context around it.
- Branch per issue or milestone. A pull request says `Closes #<n>`, and its title is a conventional commit (`feat(console): …`, `fix(worker): …`, `!` for a breaking change): it becomes the squashed commit.
- A change a person would notice adds a changeset (`pnpm changeset`, or a file in `.changeset/`): the bump, and what to tell people, written as the CHANGELOG is, under `### For operators` or `### For tenant developers`. These words are the release notes, so they are written for the reader, not as a commit message. See `.changeset/README.md`.
- What a walk or a build found goes in the pull request's description, or a comment on the issue. Not in a file in `docs/`.
- A decision later work must follow is a new record in `docs/adr/`.
- The history of phases 0–35, the polish audit and the UI/UX audits are in the private repository `volveldev/volvel-internal`. Read it from `../volvel-internal` when it is cloned beside this one and a task needs the history.

## The polish gate

After each phase, the owner used to find a round of corrections within hours: states missing or untrue, equivalent screens drifting apart, lifecycles that stop at create, layouts sized for sample data, phone width, keyboard, copy. An audit of 124 of them gave the rules in [docs/engineering/](docs/engineering/polish-prevention-rules.md).

- A change to anything a person sees is **not built** until the **Polish gate** of its pull request is answered (the checklist is in the *Milestone task* issue form and the pull request template). The steps are in [the gate](docs/engineering/milestone-polish-quality-gate.md).
- Before building, read the rules in [polish-prevention-rules.md](docs/engineering/polish-prevention-rules.md) that the issue touches, and add each one to its acceptance criteria.
- Walk every changed screen in a browser before calling it built:
  - on a throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, never the owner's own instance or the live test instance;
  - at 1440, 768 and 390 px;
  - in light and dark;
  - by keyboard;
  - with a reload.
  
  Write what the walk found into the pull request. A walk that could not be run is said there, and the work is not presented as finished.
- Fix in the shared piece, and list the other places that use it (POLISH-013). Thirteen of the audit's findings were earlier fixes made only at one call site.
- Anything trimmed from the owner's decisions or the acceptance criteria is asked about before the work is presented, not left in a "not built" list (POLISH-015).
- A new navigation section is measured in `e2e/polish-setup.ts` (`screens()`, shared by the `e2e/polish-*.spec.ts` files), or listed in its `NOT_MEASURED` with the reason. `enforce.test.ts` checks this.

## Care

- `temp/` holds the owner's design files and is not in git. Never run a formatter with `--write` over the repository root.
- After each issue: a typecheck, the unit tests of what it touched, and its browser walk. The full `pnpm test` and `pnpm e2e` run once, at the end of a milestone, before it is called done (the e2e takes about ten minutes). After that run, rerun only the specs that failed.
- A pull request's CI is the fast lane (CONTRIBUTING, "How CI runs"): it runs the unit tests a change reaches and no browser tests unless `e2e/` changed. Label a pull request `full-ci` when its reach is wider than its imports show, and say in the pull request which lane it ran. Watch `main`'s runs after a merge: an issue titled "main is failing" is fixed before new work.
