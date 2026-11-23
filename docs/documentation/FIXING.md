# Fixing: the rules of a lane in phase 29

You work alone in one worktree on its own branch, on the rows you are given. Read, in this order: `CLAUDE.md`, `CONTRIBUTING.md`, the rules in `docs/polish/polish-prevention-rules.md` that your rows touch, [findings/README.md](findings/README.md), your rows in `findings/`, and [decisions.md](decisions.md), which is the owner's and wins over a row's own recommendation.

**A row is done when**

1. A test failed for the reason the row gives, before the fix. A row settled only "by code" is tested too. If it cannot be made to fail, stop: write `refuted` with what you ran, and change nothing for it.
2. The fix is in the shared piece, and every other place that uses the piece was looked at and is listed (POLISH-013).
3. The touched tests and a typecheck pass.
4. The row's entry is in `docs/documentation/fixed/<lane>.md` in your worktree: the row, the commit, what changed with `file:line`, the test's name, siblings looked at, what a person now sees differently, and anything left out with why. For a row a person sees, also the screens to walk and the Polish gate's answers for states, lifecycle, keyboard and copy.

**How**

- One commit for each row, or for rows with one cause: `Phase 29: <what is true now> (<ROW>)`, ending with the two attribution lines below. Never push, merge, rebase, or touch another branch or worktree.
- Match the code around you. Copy is plain, in American spelling, says what is missing and who can give it, and says "flow", never "workflow". No "simply", "easily", "just". Never write the letters v-y-n-x together.
- `ctx.mutate` for every change, audited. Every route has an access rule and schemas. Migrations go forward only: at most **one** for the lane, named `0086_<lane>_<what>.sql`, not locked. The integrator renumbers and locks it. Data continuity of development instances need not be kept, but a migration must run on any earlier database.
- A change to a kind's schema, the bundle format or a worker route is a contract: update `schemas/` (`pnpm emit:schemas`) and `docs/contracts/` in the same commit, and keep old bundles and workers working.
- Do not edit `packages/docs/content` or `CHANGELOG.md`. Put the lines they need in your `fixed/` file.
- **Never use `git stash`.** Stashes are shared by every worktree, and one lane has already popped another's. To see a test fail without the fix, use `git diff > <scratch file>` and `git apply -R`, or write the test first.
- Do not fix rows that are not yours. A new fault you find is a row in your `fixed/` file under "Found".

**Running things.** The machine is shared. Run every build, typecheck and test through a slot: `~/.local/share/volvel-walk/slot npx vitest run <file> --maxWorkers=1`, `~/.local/share/volvel-walk/slot pnpm exec tsc -b`. `tsc -b` alone misses the React packages: also `-p` on `packages/ui`, `packages/screens`, `apps/console` when you touch them. Tests read built `dist`, so build what you changed first. Lint only your files: `pnpm exec biome check <files>`. Never `--write` over the root. No full `pnpm test` or `pnpm e2e`. No server on ports 8080 or 8091. No request to the internet, and no image pulled or built.

**Attribution lines for every commit**

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qigawEemeHyLtPPSDxr8t
```

**Report**, in at most 300 words: rows done, refuted and left, with why; the test files; whether you made a migration; shared files you changed that another lane is likely to touch; what is new under "Found"; screens to walk.
