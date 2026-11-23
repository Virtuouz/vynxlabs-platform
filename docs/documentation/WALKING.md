# Walking: the rules of a browser walk in phase 29

The instance is `http://localhost:8091`, built from the phase branch in `~/.local/share/volvel-walk/tree29`, seeded with Fernhill. People's password is `fernhill-demo-2026` (sign-ins: `tree29/examples/fernhill/.platform/demo.json`). The operator is `admin@example.com`; the password is `BOOTSTRAP_ADMIN_PASSWORD` in `~/.local/share/volvel-walk/walk29.env`: never print it or write it.

- Use Playwright (it is in the repository; run scripts from `tree29`), headless. Screenshots go to `~/.local/share/volvel-walk/shots29/<your slice>/`, and you look at them.
- Walk each screen at 1440×900, 768 and 390 wide; light and dark; by keyboard (Tab, Enter, Esc, F1); with a reload and Back. Do what the fix is about, do not only look: fill, save, conflict from a second context, refuse, undo.
- Check: states (loading, empty, refused, waiting), copy (plain, American, says who can help), overflow and cut text, focus after a dialog closes, nothing said that is untrue.
- Others share the instance. Make your own tenant or workspace (in `sandbox` use names that start with your slice) for anything destructive. Never pause the instance, change operators other than ones you make, change its branding, delete Fernhill, restart or rebuild it. A disabled or suspended person you make yourself.
- Change nothing in the repository. No commit, no git stash, no request to the internet.

**Report**, in at most 350 words: per row, walked and right, or wrong with what you saw, the width and theme, a screenshot path, and the `file:line` you think is the cause. Say what you could not walk. "Found nothing" is an answer.
