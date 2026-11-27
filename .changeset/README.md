# Changesets

A pull request that changes something a person using Volvel would notice adds a changeset: a file
here that says how big the change is and what to tell people about it. `pnpm changeset` writes
one. A change nobody outside notices (tests, CI, a refactor) needs none.

```md
---
"@volvel/control-plane": minor
---

### For operators

- **A run that is waiting says why.** The run page names the slot, the tenant's share or the
  memory floor it is waiting for.
```

- **Which package.** Name any one of the packages the change touches. All of Volvel's packages
  share one version, so naming one moves them all.
- **How big.** Before 1.0, `minor` for something new or anything that breaks what worked, and
  `patch` for a fix. A breaking change says what to do about it.
- **What to say.** Write it for the person who reads the release notes, as the CHANGELOG is
  written: the difference they will see, and what they need to do. Group it under
  `### For operators` or `### For tenant developers` when it is for one of them. Anything else
  goes under "Changes".

When changesets reach `main`, a "chore: release" pull request gathers them into `CHANGELOG.md`
and gives every package the next version. Merging it tags `vX.Y.Z`, and the tag publishes the
release. The GitHub release shows these notes first, then every merged pull request grouped by
its label.
