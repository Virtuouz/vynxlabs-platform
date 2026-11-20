# Working in this repository

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/master-spec.md](docs/master-spec.md) first.

## The polish gate

After each phase, the owner used to find a round of corrections within hours: states missing or untrue, equivalent screens drifting apart, lifecycles that stop at create, layouts sized for sample data, phone width, keyboard, copy. [docs/polish/](docs/polish/README.md) records 124 of them and the rules they give.

- A milestone that changes anything a person sees is **not built** until the **Polish gate** section of its phase document is answered. The section's shape is in [docs/phases/TEMPLATE.md](docs/phases/TEMPLATE.md), and the steps are in [the gate](docs/polish/milestone-polish-quality-gate.md).
- Before building, read the rules in [polish-prevention-rules.md](docs/polish/polish-prevention-rules.md) that the milestone touches, and add each one to its acceptance criteria.
- Walk every changed screen in a browser before calling it built:
  - on a throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, never the owner's own instance or the live test instance;
  - at 1440, 768 and 390 px;
  - in light and dark;
  - by keyboard;
  - with a reload.
  
  Write what the walk found into the milestone's Findings. A walk that could not be run is said there, and the phase is not presented as finished.
- Fix in the shared piece, and list the other places that use it (POLISH-013). Thirteen of the audit's findings were earlier fixes made only at one call site.
- Anything trimmed from the owner's decisions or exit criterion is asked about before the phase is presented, not left in a "not built" list (POLISH-015).
- A new navigation section is measured in `e2e/polish.spec.ts`, or listed in its `NOT_MEASURED` with the reason. `enforce.test.ts` checks this.

## Care

- `temp/` holds the owner's design files and is not in git. Never run a formatter with `--write` over the repository root.
- Run the full `pnpm test` and `pnpm e2e`, not one spec, before calling a phase done.
