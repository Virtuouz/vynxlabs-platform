# Fact-check record: develop/how-to/extensions/theme-your-workspace

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs), 2026-11-23. Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. `Au` = `screens/Authoring.tsx`, `CS` = `screens/CodeSettings.tsx`. Written by the writer; "Checked by" is for the second agent. Run log: `docs/documentation/runs/develop/how-to/extensions/theme-your-workspace.md`.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| defineTheme({ tokens, dark }), path default "theme", tokens not set keep the tenant's. | `packages/sdk/src/index.ts:1157-1176` | writer | holds |
| 27 tokens, THEME_TOKENS exported, ThemeToken derived. | `packages/sdk/src/index.ts:1124-1155`; `packages/manifest/src/kinds.ts:1608-1636` | writer | holds |
| What each token sets (table). | `packages/manifest/src/kinds.ts:1639-1670` | writer | holds (paraphrased) |
| Value pattern and forbidden words. | `packages/manifest/src/kinds.ts:1675-1685` | writer | holds |
| Values checked at bundle check; message. | `packages/manifest/src/bundle-check.ts:462-474` | writer | holds |
| One theme per workspace; message. | `packages/manifest/src/bundle-check.ts:454-460` | writer | holds |
| Order: kit, tenant's, workspace's; dark colors fall back to the kit's dark, not the light override. | `apps/control-plane/src/kernel/apps/theme.ts:97-125` | writer | holds |
| Stylesheet at /tenants/<t>/workspaces/<w>/theme.css, three blocks. | `apps/control-plane/src/routes/apps.ts:624-640`; `theme.ts:128-138`; run | writer, run | holds as run |
| Served apps link the workspace stylesheet. | `apps/control-plane/src/kernel/apps/front.ts:193-203` | writer | holds |
| Derived values: field, hover, ring, track, scrim, shadows, control height. | `packages/ui/src/tokens.css:159-214` | writer | holds for field, hover, ring, track, scrim; shadows and control height not re-read |
| Console branding set by the operator; tenant Branding screen. | `nav.ts:206, 285`; `apps/control-plane/src/routes/branding.ts` | writer | holds |
| Fernhill's theme values. | `examples/fernhill/src/apps.ts:1228-1236` | writer | holds |

Checked by: second agent, 2026-11-23. Run on a dev workspace of my own (`ext31-dev`): the deploy, `theme.css` (all three blocks, `action-soft` kept from the tenant's branding), the second-theme, `url(`, `var(` and unknown-token refusals; the unknown-token text corrected on the page. The 27 tokens and their words checked against `packages/manifest/src/kinds.ts:1608-1636` (THEME_TOKENS, 27 entries, order differs from the page's table, which groups them; every name is in the table).
