# Running the platform yourself

This guide moved to the documentation, which every instance serves at `/docs`, under **Self-host** (and **Administer** for the tenant's side). This file stays as a list of where each section went. The page paths below are under `/docs/`.

| Old section | Now |
| --- | --- |
| What an instance is | `/docs/self-host/explanation/running/architecture` |
| Installing on one machine | `/docs/self-host/how-to/running/install-with-compose`; requirements: `/docs/self-host/reference/running/requirements` |
| Before anyone else can reach it | `/docs/self-host/how-to/running/put-a-proxy-in-front` |
| Using your own Postgres or object store | `/docs/self-host/how-to/running/use-your-own-postgres`, `/docs/self-host/how-to/running/use-your-own-object-store` |
| Installing where there is no internet | `/docs/self-host/how-to/running/install-offline` |
| It never calls home | `/docs/self-host/explanation/running/egress-and-offline` |
| Backups | `/docs/self-host/how-to/running/back-up-an-instance` |
| Restoring an instance | `/docs/self-host/how-to/running/restore-an-instance` |
| Changing `AUTH_SECRET` | `/docs/self-host/how-to/running/change-auth-secret` |
| Upgrading Postgres to a newer major version | `/docs/self-host/how-to/running/upgrade-postgres` |
| Rotating the master key | `/docs/self-host/how-to/running/rotate-the-master-key`; keys: `/docs/self-host/explanation/running/keys-and-secrets` |
| Retention, the audit log | `/docs/self-host/reference/running/retention`, `/docs/self-host/reference/console/audit-log` |
| Upgrading | `/docs/self-host/how-to/running/upgrade-an-instance`; supported versions: `/docs/self-host/reference/running/versions-and-support` |
| A database of a tenant's own | `/docs/self-host/how-to/running/give-a-tenant-its-own-database`, `/docs/self-host/reference/console/databases` |
| Workers in another network | `/docs/self-host/how-to/running/run-a-standalone-worker` |
| Workers the instance starts; sizing; when work piles up | `/docs/self-host/explanation/running/managed-workers-and-isolation`, `/docs/self-host/explanation/running/sizing-and-scaling`, `/docs/self-host/how-to/running/stop-triggers-and-clear-a-backlog` |
| When the database takes no writes | `/docs/self-host/how-to/running/run-on-a-read-only-database` |
| What the instance reaches for a tenant; OAuth connections | `/docs/self-host/explanation/running/egress-and-offline` |
| Moving a tenant (export, import, promotion) | `/docs/self-host/how-to/instance/moving-a-tenant`, `/docs/self-host/reference/console/import`, `/docs/administer/how-to/sso/export-a-tenant` |
| Apps, and the addresses they are served at | `/docs/administer/how-to/apps/give-an-app-a-hostname`, `/docs/self-host/how-to/running/put-a-proxy-in-front` |
| End users; groups, attributes and row rules | `/docs/administer/how-to/access/invite-end-users`, `/docs/administer/how-to/access/rule-rows-by-group-or-attribute` |
| Approval mail | `/docs/self-host/how-to/running/set-up-mail` |
| Single sign-on, provisioning (SCIM) | `/docs/self-host/how-to/sso/connect-an-identity-provider-for-operators`, `/docs/administer/how-to/sso/provision-people-with-scim` |
| Branding | `/docs/self-host/reference/console/branding` |
| Help and documentation (`DOCS_URL`) | `/docs/self-host/reference/running/configuration` |
| Metrics | `/docs/self-host/how-to/running/monitor-an-instance` |
| OpenTelemetry | `/docs/self-host/how-to/running/send-opentelemetry` |
| When something is wrong | `/docs/self-host/reference/running/troubleshooting` |

Sections with no page of their own: "Apps made in the console", "Mail, forms and webhooks that tenants run" and "Environments inside a tenant" are covered where the console documents them, under `/docs/console/`.
