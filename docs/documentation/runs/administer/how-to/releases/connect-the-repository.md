# Run log: administer/how-to/releases/connect-the-repository.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `14f7d5b9` (branch phase-31-write-the-docs). Playwright, headless, 1440 px, light theme. No other width or theme was run.
- Names made for this run start with `rel`: workspaces Rel dev (slug `rel-dev`, later renamed Rel dev two and back) and Rel prod (`rel-prod`, production, the target of Rel dev), a clone `rel-clone` (deleted again), variables `rel-greeting`, `rel-farewell`, `rel-region` and a connection `rel-courier`. Fernhill was not changed.
- Signed in as Maya Brooks.

## What was run
- **Tenant**, **Repository** with no repository: the form with every field, the hints, and the section "Code in the console": "Writing code in the console is on." with the button **Turn off code in the console**. The button was read, not pressed (it would change the tenant for other writers).
- **Connect** with `http://example.com/repo.git` and a token: "The repository's address must start with https:// and carry no user name or token."
- **Connect** with `https://git.invalid/acme/platform.git`: "The repository could not be reached: fetch failed" after a few seconds. Nothing was saved.

## Not run: no remote repository
A remote Git repository cannot be connected without the internet. The success message, **Check the connection**, **Save**, **Disconnect**, the read-only Folder, the paused notice and every message from the host (refused token, not found, empty repository, missing branch) were described from the code. The page is not presented as finished until a walk against a git server (local over http on 127.0.0.1 would do) has run.
