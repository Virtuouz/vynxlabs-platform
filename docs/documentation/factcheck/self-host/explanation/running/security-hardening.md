# Fact-check: self-host/explanation/running/security-hardening.md

Written at commit `14f7d5b9`. Lines are those of that commit. Checked by: the writer; the second agent's column is open.

| Claim | Source (file:line) | Checked by | Result |
| --- | --- | --- | --- |
| Two rules: no tenant code in the control plane; named list behind an egress guard. | `SECURITY.md:11-14` | writer, 2026-11-23 | holds |
| The what-it-protects and does-not-protect lists. | `SECURITY.md` | writer, 2026-11-23 | copied in summary; each line is the policy's |
| Checklist item: Compose listens on `127.0.0.1:8080`. | `deploy/compose/compose.yaml` `VOLVEL_BIND:-127.0.0.1:8080` | writer, 2026-11-23 | holds |
| `METRICS_TOKEN` at least 32 characters. | `apps/control-plane/src/config.ts:270` | writer, 2026-11-23 | holds |
| Bootstrap settings removed after first start. | `apps/control-plane/src/kernel/bootstrap.ts:13-30` (does nothing once there is a member) | writer, 2026-11-23 | holds |
