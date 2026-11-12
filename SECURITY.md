# Security

## Reporting a problem

Please report a suspected vulnerability privately, to the address in the repository's profile, and not in a public issue. Say what you found, how to reproduce it, and which version you tested. You will get an answer within five working days.

## What the platform protects, and how

| What | How |
| --- | --- |
| A tenant from another tenant | Every platform row carries its tenant's ID, and every request is checked against it by one authorization function. A request for another tenant's ID answers 404 |
| A tenant from the operator | An operator has no access inside a tenant by default. Access is a time-limited grant with a reason, which the tenant's admins can see and end, and everything done under it is audited |
| Secrets at rest | Each tenant has its own key, wrapped by the instance master key. Secret values, connection credentials, data source passwords and webhook tokens are encrypted with it, bound to the tenant, workspace and name they belong to |
| A person's rows from another person | Postgres row-level security on every custom table. Requests for rows run on a database sign-in that owns nothing and cannot become the role that does |
| What happened | Every change by a person or a key goes through one write path that records an audit entry in the same transaction. Audit entries cannot be changed or deleted |
| A tenant's exit | An export holds everything the tenant has. Its secrets stay encrypted, and the key travels wrapped with a passphrase that is not stored |

## What it does not protect against

- **Code a tenant deploys.** Scripts run with the permissions of the worker process. Sandboxing for code from authors the operator does not trust is not built. Run a tenant you do not trust on a worker of its own.
- **An operator with access to the database, the master key or the host.** Such a person can read everything. Use a dedicated instance where that matters.
- **A lost master key.** Nothing encrypted can be recovered without it.
- **SQL injection, as a second line of defence.** No route accepts SQL, and every statement on tenant data is built from checked names and bound values. Row-level security guards against mistakes in that code. Whoever could run their own SQL on the row connection could claim to be someone else.

## Defaults worth knowing

- The control plane listens on localhost and speaks plain HTTP. Put a TLS-terminating proxy in front of it.
- It makes no outbound call that was not configured: no telemetry, update check or license check.
- Binding a connection or a data source lets the control plane reach an address a tenant admin chose. On a shared instance, restrict what the control plane can reach at the network.
