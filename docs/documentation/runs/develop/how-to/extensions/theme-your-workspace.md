# Run log: develop/how-to/extensions/theme-your-workspace.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` (branch phase-31-write-the-docs). Signed in as Maya Brooks (`maya.brooks@fernhill.example`, tenant admin), in Fernhill's Sandbox (dev) workspace, at 1440 px, light theme, Playwright headless. No other width or theme was run.
- The steps need a repository deploy, which was **not run** in the first pass: the example deploy replaces what the repository lacks in the workspace, so Fernhill was left as it is. The second check ran it on a dev workspace of its own (see below).
- What was run: `GET /api/v1/tenants/<tenant>/workspaces/<sandbox>/theme.css` for Fernhill's Sandbox, which carries the theme from `examples/fernhill/src/apps.ts`. It had three blocks (light, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]`), `--vx-action: #1f6f5c;`, `--vx-action-ink`, `--vx-action-soft` in the light block and `--vx-action: #6fd1b4;` in both dark ones, and the kit's values for every other token.

## Second check, 2026-11-23 (second agent)
- A dev workspace of my own in Fernhill, `ext31-dev` ("Ext31 dev"), and a scratch project outside the repository (`src/index.ts` exporting a `defineTheme` in `src/theme.ts`, the SDK linked from the working tree). The CLI was the built `packages/cli/dist/bin.js` with an API key made for the check (`p31-ext-theme-check`), signed in as Maya Brooks.
- `volvel deploy --tenant fernhill --workspace ext31-dev` printed `Deployed version 12 to ext31-dev (dev): 1 created, 0 updated, 0 deleted, 6 unchanged.` and `created  theme      theme`.
- `GET .../theme.css` for that workspace: 200 `text/css`; the light `:root` block had `--vx-action: #7a2e8a;`, `--vx-action-ink`, `--vx-radius-panel: 12px;` and `--vx-action-soft: #dcf0f7;` (not set by the theme: the tenant's branding value, as the page says); the `:root:not([data-theme="light"])` block inside `prefers-color-scheme: dark` and `:root[data-theme="dark"]` both had `--vx-action: #d9a0e6;` and `--vx-action-ink: #2b0f33;`.
- Refusals, each as printed after `The build failed:`: a second `defineTheme` with `path: "theme-two"` gave `theme-two (theme): a workspace can have one theme, and "theme" is already one.`; `action: "url(x)"` gave `theme (theme): /body/tokens/action must be a plain color, length or font list.`; `radius-panel: "var(--x)"` the same with `/body/tokens/radius-panel`; an unknown token `shiny` gave `theme (theme): /body/tokens must NOT have additional properties (shiny)`. The page's "unknown token" bullet was only a description and now has this text.
- Not run: 390 px and dark of an app that uses the stylesheet (the page is about code and a stylesheet, not a screen); keyboard does not apply.

## Phase 34, A7 run, 2026-11-24

Instance http://localhost:8712 (throwaway, lane a7's build, commit `d619bfbd` plus the working tree), Fernhill seeded. Terminal only.

- `examples/a7theme` deployed to `walk6`; the stylesheet read with the key; a file with `shiny: red` failed the build with the page's text.
