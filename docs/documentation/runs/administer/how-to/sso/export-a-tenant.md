# Run log: administer/how-to/sso/export-a-tenant.md

- Instance: http://localhost:8091, the throwaway instance seeded by `examples/fernhill/setup/setup.mjs`, commit `5ebf1c80` plus the uncommitted work of this wave (branch phase-31-write-the-docs).
- Tenant of my own: `sso-wave` (name "SSO Wave"), made as the operator admin with `addCreator`, so the operator admin is its tenant admin. A first tenant `sso-docs` was made by mistake without a creator, and could not be entered or deleted; it is left empty. No Fernhill person or resource was touched.
- Browser: Playwright headless, 1440 px wide, light theme, signed in as the operator admin. Identity provider: the dev stack's Keycloak 26.4, realm `acme` (people `ada`, `ben`), at http://localhost:8180, with two clients of my own made through its admin API (`sso-docs-oidc` for OIDC, with a groups mapper, and one SAML client made from the instance's own metadata, with email, name and groups mappers). The shared `volvel` client was not changed.
- Only 1440 px and light were run. A script drove the screens; no page was followed by a person reading it.

## The steps as followed
1. **Tenant > Export**: **Passphrase** "short" showed "Use at least 12 characters." Different second passphrase showed "The two do not match."
2. A matching passphrase of 24 characters, **Leave it out**, **Export tenant**: the browser downloaded `sso-wave-2026-11-23.tar` (72,704 bytes) and the page said "The export was downloaded. API keys and worker credentials are never in an export: make new ones wherever the tenant goes."
3. `tar tf` listed `key.json`, `members.0001.jsonl`, `platform/...` (including `identity_provider`, `identity_domain`, `identity_link`, `identity_group_map`, `scim_user`, `worker_pool`, `tenant_retention`, `audit_entry`) and `manifest.json` last. The manifest said `formatVersion` 2, `history` false, and `notCarried` listed 19 lines (API keys, worker credentials, operator grants, hostnames, provisioning tokens, retention cut of the audit log, and the others the page names).

## What the run could not do
- **Include it** (history) was not run in the console; the command line was not run either, and `volvel` was not installed here.
- The file was not imported anywhere.
- The size of memory the browser uses for a large tenant is from the code and the screen's own advice.

## Second check, 2026-11-23 (second agent)
- Run now: `volvel tenant export --tenant sso-wave --out a.tar` with `VOLVEL_URL` and `VOLVEL_TOKEN` (an API key of the operator admin) and the CLI built from this tree: unset passphrase: "Set VOLVEL_EXPORT_PASSPHRASE to the passphrase for the export file. ..."; a 5-character one: "Could not export sso-wave. The request body is not valid." and "must NOT have fewer than 12 characters"; a good one: "Exported sso-wave to ... (0.1 MB)", "Run, flow and event history is not in it. Add --history to include it."; with `--history`: "It includes run, flow and event history." The archive lists `key.json`, `members.0001.jsonl`, `platform/...` and `manifest.json` last; the manifest says format 2, `coreVersion` 0.5.0.
- Console at 390 px in dark: the **Export** screen, the two passphrase errors, a download `sso-wave-2026-11-23.tar`, the notice about API keys. With nothing typed **Export tenant** is not disabled and does nothing; the page now says so.
- Not run: **Include it** in the console (the same request as the CLI's `--history`); an import of the file.
