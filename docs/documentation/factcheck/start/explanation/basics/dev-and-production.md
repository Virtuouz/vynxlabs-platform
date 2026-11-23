# Fact-check record: start/explanation/basics/dev-and-production.md

Lines are current at commit `5ebf1c80` (branch phase-31-write-the-docs). Paths are under `apps/console/src` unless they start with `apps/control-plane` or `packages`. Written by the writer; "Checked by" is for the second agent. "run" means seen on the throwaway instance, 2026-11-24, Maya Brooks (or the operator admin where said), 1440 px, light.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The type is fixed at creation. | `apps/control-plane/src/routes/workspaces.ts:262-268` | writer | holds |
| A dev workspace starts with triggers paused. | `routes/workspaces.ts:268,296`; `screens/Overview.tsx` (paused row) | writer | holds |
| Only a dev workspace can link; the link must end. | `routes/workspaces.ts:177-200` | writer | holds |
| Production takes no drafts; editors read only; direct write refused except by `promotion:write` for a console-made resource. | `kernel/authoring.ts:75-130` | writer | holds |
| Production tag and amber rule; "promotes to". | `Shell.tsx:1314,1170-1190` | writer | holds |
| Deploy in dev, Versions in production; buttons. | `nav.ts:112-114` | writer | holds (button names from the style guide) |
| Version numbers belong to a workspace; the bundle's digest is shared. | `routes/summary.ts:228-250` (`same` by digest) | writer | holds |
| Missing bindings refuse production and promotion, only warn in dev. | `kernel/execution/deploy.ts:628-645` | writer | holds |
| The words "The workspace is missing something this bundle needs. Set up each one, then {deploy|promote} again." | `deploy.ts:636-645` | writer | holds |
| What is checked: connections, secrets, variables, data sources. | `deploy.ts:32-90` | writer | holds |
| Table rows and files are the workspace's data. | The Tables screen's text "The data this workspace keeps."; bundles carry manifests | writer | holds; the page says "Table rows and files ... are the data this workspace keeps" |
| The overview's "runs the same bundle" / "a different bundle" sentences. | `screens/Overview.tsx:560-568` | writer | holds |
