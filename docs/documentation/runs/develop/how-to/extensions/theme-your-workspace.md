# Run log: develop/how-to/extensions/theme-your-workspace.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs). Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox (dev) workspace, at 1440 px, light theme, Playwright headless. No other width or theme was run.
- The steps need a repository deploy, which was **not run**: the example deploy replaces what the repository lacks in the workspace (see the walk notes), so Fernhill was left as it is.
- What was run: `GET /api/v1/tenants/<tenant>/workspaces/<sandbox>/theme.css` for Fernhill's Sandbox, which carries the theme from `examples/fernhill/src/apps.ts`. It had three blocks (light, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]`), `--vx-action: #1f6f5c;`, `--vx-action-ink`, `--vx-action-soft` in the light block and `--vx-action: #6fd1b4;` in both dark ones, and the kit's values for every other token.
- Not run: the two refusals, an unknown token, and a second theme.
