# Triage: the rules for whoever settles a slice

Read [README.md](README.md) (the row format) and your slice's file in [the inventory](../inventory/), whole. Its section E is the bug list. Its sections B, C and D hold more: claims that something is wrong, and gotchas that are really faults.

**Settle every item.** Reproduce it, prove it from the code, or refute it. The reports came from reading, and some are wrong. Check `docs/phases/` and `docs/evolution/decisions/` before calling something a bug: the owner may have decided it. Then list your slice's missing parts under the README's rule, and the owner's questions.

**How to reproduce**

- Scratch vitest files in the pinned, built tree `~/.local/share/volvel-walk/tree29` (`270e509`), named `triage-<prefix>*.test.ts(x)` beside similar tests. Run one at a time from that tree: `npx vitest run <file> --maxWorkers=1`. They use the development Postgres on port 54329, as existing tests do. Existing tests show how to make an instance in a test.
- Requests, or a Playwright script, against the throwaway instance `http://localhost:8091`, seeded with Fernhill. People's password is `fernhill-demo-2026`; sign-ins are in `tree29/examples/fernhill/.platform/demo.json`. The operator is `admin@example.com`, with the password in `~/.local/share/volvel-walk/walk29.env`: never print it or write it anywhere.
- Other agents share that instance. Make your own tenant or workspace for anything that changes data. Never pause it, change its branding or operators, delete Fernhill, restart it or rebuild it: use a scratch test with its own instance.
- Remove your scratch files when done.

**Rules**

- In the main repository write only your own `docs/documentation/findings/<slice>.md`. Change nothing else, and fix nothing.
- No commit, push, formatter, full test suite or image build. Do not touch port 8080.
- No request to the internet, of any kind.
- Never write the company's old name (the letters v-y-n-x together) in a file.
- Describe a security item by its class, never as a working exploit. Keep rows short.

**Report**, in at most 400 words: counts by outcome, each security and data item in a line, the owner's questions, and the number of missing parts with sizes.
