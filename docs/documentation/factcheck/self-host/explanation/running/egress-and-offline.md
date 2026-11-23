# Fact-check: self-host/explanation/running/egress-and-offline.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| The control plane's list: IdP metadata, Git remote, data source, OAuth token address, hostname check. | `SECURITY.md` rule 2; `apps/control-plane/src/kernel/egress.ts` | writer, 2026-11-23 | holds |
| The guard refuses loopback, private, link-local, shared and reserved addresses, checked on the connected address and each redirect; 10 s, 5 redirects. | `SECURITY.md`; `kernel/egress.ts` | writer, 2026-11-23 | guard holds; the 10 s and 5 carried from the earlier reading |
| `EGRESS_ALLOW` lists networks and names; a name is allowed whatever it resolves to. | generated settings (Network); `docs/self-hosting.md` | writer, 2026-11-23 | holds |
| `WORKER_EGRESS_ALLOW` is for the worker host, empty by default, needs NET_ADMIN. | `deploy/compose/compose.yaml` worker-host environment; `config-vars.ts` WORKER_VARS | writer, 2026-11-23 | holds |
| The OAuth callback is `<PUBLIC_URL>/api/v1/oauth/connections/callback`. | `docs/self-hosting.md`; console wizard | writer, 2026-11-23 | carried; not re-read |
| No telemetry, update check or license check; mail only with `SMTP_URL`. | `SECURITY.md` "Defaults worth knowing" | writer, 2026-11-23 | holds as policy |
