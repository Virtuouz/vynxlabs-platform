# Security

## Reporting a problem

Please report a suspected vulnerability privately, and not in a public issue. Say what you found, how to reproduce it, and which version you tested.

The address to write to, and how quickly a report is answered, are to be set by the owner before the first public release.

## What the platform protects, and how

| What | How |
| --- | --- |
| A tenant from another tenant | Every platform row carries its tenant's ID, and every request is checked against it by one authorization function. A request for another tenant's ID answers 404 |
| A tenant from the operator | An operator has no access inside a tenant by default. Access is a time-limited grant with a reason, which the tenant's admins can see and end, and everything done under it is audited |
| Secrets at rest | Each tenant has its own key, wrapped by the instance master key. Secret values, connection credentials, data source passwords and webhook tokens are encrypted with it, bound to the tenant, workspace and name they belong to |
| A person's rows from another person | Postgres row-level security on every custom table. Requests for rows run on a database sign-in that owns nothing and cannot become the role that does |
| The console from a tenant's app | A member's console session counts only at the instance's own address. At an app's own address a member has a separate sign-in, good for that tenant and for what apps use, and nothing else |
| A tenant's staff from its customers | End users are a pool of each tenant's own. Whatever role an end user is bound to, the authorization check gives them only the kinds of permission apps use |
| A change from another site | A request that arrives with a cookie and changes something must come from a page of the address it was sent to |
| What happened | Every change by a person or a key goes through one write path that records an audit entry in the same transaction. Audit entries cannot be changed or deleted |
| A tenant's exit | An export holds everything the tenant has. Its secrets stay encrypted, and the key travels wrapped with a passphrase that is not stored |

## What it does not protect against

- **Code a tenant deploys.** Scripts run with the permissions of the worker process. Sandboxing for code from authors the operator does not trust is not built. Run a tenant you do not trust on a worker of its own.
- **An operator with access to the database, the master key or the host.** Such a person can read everything. Use a dedicated instance where that matters.
- **A lost master key.** Nothing encrypted can be recovered without it.
- **A tenant's app, where it shares the console's address.** Without `APPS_URL`, an app is served at the instance's own address and runs as whoever opens it there, with their console session. That is the trust model: everyone who writes code works for the operator. An instance with tenants that must not trust each other's code sets `APPS_URL`.
- **Files, between end users.** A file has no owner. Whoever may read files in a workspace may read all of them. The built-in role for end users does not include files.
- **A flood from many addresses.** Guests are limited by address, in each replica's own memory. Put a proxy with its own limits in front of a public app.
- **SQL injection, as a second line of defence.** No route accepts SQL, and every statement on tenant data is built from checked names and bound values. Row-level security guards against mistakes in that code. Whoever could run their own SQL on the row connection could claim to be someone else.

## Defaults worth knowing

- The control plane listens on localhost and speaks plain HTTP. Put a TLS-terminating proxy in front of it.
- It makes no outbound call that was not configured: no telemetry, update check or license check.
- It sends mail only when `SMTP_URL` is set, and then only invitations and password resets for end users.
- Checking a registered hostname looks up one DNS record and asks that hostname for one fixed address on this instance. The answer is compared and never shown.
- End users cannot create their own accounts until a tenant turns that on.
- An app's pages are served with a content security policy that allows no inline script and nothing from another site. The platform's own sign-in pages have no script at all.
- Passwords of members and end users are hashed with scrypt. Session and link tokens are stored as SHA-256 hashes.
- Binding a connection or a data source lets the control plane reach an address a tenant admin chose. On a shared instance, restrict what the control plane can reach at the network.
